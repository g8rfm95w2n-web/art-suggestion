// Connecteur : Minneapolis Institute of Art (Mia)
// Documentation : https://github.com/artsmia/collection-search (moteur de recherche public)
//
// Points clés de l'API :
//  - https://search.artsmia.org/<requête> : un moteur Elasticsearch ouvert, sans clé ;
//  - la requête suit la syntaxe Lucene : champ:valeur, AND, NOT, plages [a TO b] ;
//  - une seule requête renvoie les fiches complètes (pas d'étape « détail ») ;
//  - rights_type:"Public Domain" garde les œuvres libres de droits ;
//  - images construites à partir de l'identifiant : 400 px (avec CORS, pour la
//    grille et l'analyse), 800 px (fiche) et original (haute définition).

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';
import { searchBySupport, keywordsFor, paintedType } from './shared.js';

const API = 'https://search.artsmia.org';
const IMAGES = 'https://1.api.artsmia.org';
const MAX_RESULTS = 10000; // limite de pagination d'Elasticsearch

export const id = 'mia';
export const label = 'Minneapolis Institute of Art';

const BASE = ['rights_type:"Public Domain"', 'image:valid', 'public_access:1'];

// Conditions par « sorte » d'œuvre. Pastels et aquarelles sont classés parmi
// les dessins ; la règle de shared.js les retire ensuite des dessins.
const KIND_CONDITIONS = {
  peinture: ['classification:Paintings'],
  pastel: ['classification:Drawings', 'medium:pastel'],
  aquarelle: ['classification:Drawings', '(medium:watercolor OR medium:gouache OR medium:tempera)'],
  dessin: ['classification:Drawings'],
};

/** Requête Lucene pour UNE sorte d'œuvre. Fonction pure → testable. */
export function buildQuery(criteria, kind) {
  const parts = [...BASE, ...KIND_CONDITIONS[kind]];
  if (criteria.epoque) {
    // « dated » est un texte (« c. 1665 », « 1868–69 ») : la plage porte sur
    // les nombres qu'il contient, ce qui suffit pour des années à 4 chiffres.
    const [from, to] = EPOQUES[criteria.epoque].range;
    parts.push(`dated:[${from} TO ${to}]`);
  }
  // Mots-clés anglais (thème, envie) : chacun doit être présent.
  parts.push(...keywordsFor(criteria, THEMES).split(' ').filter(Boolean));
  return parts.join(' AND ');
}

export function buildSearchUrl(criteria, kind, offset, limit) {
  return `${API}/${encodeURIComponent(buildQuery(criteria, kind))}?size=${limit}&from=${offset}`;
}

function typeFromRaw(raw) {
  if (raw.classification === 'Paintings') return 'peinture';
  if (raw.classification === 'Drawings') return 'dessin';
  return 'autre';
}

/**
 * Convertit une fiche brute du Mia au format commun.
 * Renvoie null si l'œuvre n'est pas libre de droits ou n'a pas d'image.
 */
export function normalize(raw) {
  if (!raw || raw.rights_type !== 'Public Domain' || raw.image !== 'valid') return null;
  const year = parseInt((raw.dated || '').match(/\d{3,4}/)?.[0], 10);
  const medium = raw.medium || '';
  return {
    id: `${id}:${raw.id}`,
    source: id,
    sourceLabel: label,
    title: raw.title || 'Sans titre',
    artist: raw.artist || 'Artiste inconnu',
    date: raw.dated || '',
    year: Number.isFinite(year) ? year : null,
    medium,
    type: paintedType(typeFromRaw(raw), medium),
    thumbUrl: `${IMAGES}/${raw.id}.jpg`,      // 400 px
    imageUrl: `${IMAGES}/800/${raw.id}.jpg`,  // 800 px
    hdUrl: `${IMAGES}/full/${raw.id}.jpg`,    // original, plusieurs Mo
    pageUrl: `https://collections.artsmia.org/art/${raw.id}`,
    tags: raw.style ? [raw.style.toLowerCase()] : [],
  };
}

/** Recherche paginée → { total, items } */
export function search(criteria, page, perPage) {
  return searchBySupport(criteria, page, perPage, async (kind, offset, limit) => {
    const data = await fetchJson(buildSearchUrl(criteria, kind, offset, limit));
    const hits = data?.hits;
    return {
      total: hits?.total?.value ?? 0,
      items: (hits?.hits || []).map((h) => normalize(h._source)).filter(Boolean),
    };
  }, MAX_RESULTS);
}

/** Une œuvre par son identifiant Mia (la partie après « mia: »). */
export async function getById(localId) {
  if (!/^\d+$/.test(localId)) return null;
  return normalize(await fetchJson(`${API}/id/${localId}`));
}
