// Connecteur : Cleveland Museum of Art
// Documentation : https://openaccess-api.clevelandart.org/
//
// Points clés de l'API :
//  - une seule requête renvoie les œuvres complètes (pas d'étape « détail ») ;
//  - cc0=1 : seulement les œuvres libres de droits ; has_image=1 : avec image ;
//  - type=Painting ou type=Drawing, un seul à la fois (« Painting,Drawing » ne
//    renvoie rien), d'où searchBySupport ;
//  - created_after / created_before : années, pour les époques ;
//  - pagination par skip / limit.
// Limite : le serveur d'images (openaccess-cdn) n'autorise pas la lecture des
// pixels depuis une autre page (pas d'en-tête CORS). Les images s'affichent,
// mais la palette et la difficulté ne peuvent pas être calculées pour ce musée.

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';
import { searchBySupport, keywordsFor, withPastelRule } from './shared.js';

const API = 'https://openaccess-api.clevelandart.org/api/artworks';

export const id = 'cma';
export const label = 'Cleveland Museum of Art';

const TYPES = { peinture: 'Painting', dessin: 'Drawing' };
// Les pastels sont rangés parmi les dessins : on les cherche avec le mot « pastel ».
const KIND_QUERY = {
  peinture: { type: 'Painting', extra: '' },
  pastel: { type: 'Drawing', extra: 'pastel' },
  dessin: { type: 'Drawing', extra: '' },
};
const FIELDS = [
  'id', 'accession_number', 'title', 'creators', 'culture', 'creation_date',
  'creation_date_earliest', 'technique', 'type', 'images', 'url', 'share_license_status',
].join(',');

/** URL de recherche pour UNE sorte d'œuvre (peinture, pastel, dessin). Pure → testable. */
export function buildSearchUrl(criteria, kind, offset, limit) {
  const { type, extra } = KIND_QUERY[kind];
  const qs = new URLSearchParams({
    cc0: '1',
    has_image: '1',
    type,
    skip: String(offset),
    limit: String(limit),
    fields: FIELDS,
  });
  const q = keywordsFor(criteria, THEMES, extra); // plusieurs mots = tous requis
  if (q) qs.set('q', q);
  if (criteria.epoque) {
    const [from, to] = EPOQUES[criteria.epoque].range;
    qs.set('created_after', String(from));
    qs.set('created_before', String(to));
  }
  return `${API}/?${qs}`;
}

/** « Jan Gossaert (Flemish, c. 1475/78–1532) » → « Jan Gossaert » */
function artistName(raw) {
  const description = raw.creators?.[0]?.description || '';
  return description.replace(/\s*\(.*\)\s*$/, '').trim() || raw.culture?.[0] || 'Artiste inconnu';
}

function typeFromRaw(raw) {
  if (raw.type === TYPES.peinture) return 'peinture';
  if (raw.type === TYPES.dessin) return 'dessin';
  return 'autre';
}

/**
 * Convertit une œuvre brute de Cleveland au format commun.
 * Renvoie null si l'œuvre n'est pas utilisable (pas d'image ou pas libre de droits).
 */
export function normalize(raw) {
  const web = raw?.images?.web?.url;
  if (!raw || raw.share_license_status !== 'CC0' || !web) return null;
  return {
    id: `${id}:${raw.id}`,
    source: id,
    sourceLabel: label,
    title: raw.title || 'Sans titre',
    artist: artistName(raw),
    date: raw.creation_date || '',
    year: Number.isFinite(raw.creation_date_earliest) ? raw.creation_date_earliest : null,
    medium: raw.technique || '',
    type: withPastelRule(typeFromRaw(raw), raw.technique),
    thumbUrl: web,   // ~900 px
    imageUrl: web,
    hdUrl: raw.images.print?.url || web, // ~3400 px, quelques Mo
    pageUrl: raw.url || `https://www.clevelandart.org/art/${raw.accession_number}`,
    tags: [],        // l'API ne fournit pas de mots-clés de sujet
  };
}

/** Recherche paginée → { total, items } */
export function search(criteria, page, perPage) {
  return searchBySupport(criteria, page, perPage, async (kind, offset, limit) => {
    const data = await fetchJson(buildSearchUrl(criteria, kind, offset, limit));
    return { total: data.info.total, items: data.data.map(normalize).filter(Boolean) };
  });
}

/** Une œuvre par son identifiant Cleveland (la partie après « cma: »). */
export async function getById(localId) {
  const data = await fetchJson(`${API}/${encodeURIComponent(localId)}?fields=${FIELDS}`);
  return data ? normalize(data.data) : null;
}
