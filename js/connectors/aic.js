// Connecteur : Art Institute of Chicago
// Documentation : https://api.artic.edu/docs/
//
// Points clés de l'API :
//  - /artworks/search accepte une requête Elasticsearch complète, passée en
//    JSON dans le paramètre `params` (on peut ainsi combiner filtres et mots-clés) ;
//  - `fields=` limite la réponse aux champs utiles (recommandé par la doc) ;
//  - les images ne sont pas dans l'API : on construit leur URL IIIF à partir
//    de `image_id` (taille 843 px recommandée par la doc, car souvent en cache) ;
//  - la pagination s'arrête à 10 000 résultats.

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';

const API = 'https://api.artic.edu/api/v1';
const IIIF = 'https://www.artic.edu/iiif/2';
const MAX_RESULTS = 10000;

export const id = 'aic';
export const label = 'Art Institute of Chicago';

// Identifiants internes de l'AIC (cf. /api/v1/artwork-types).
const TYPE_IDS = { peinture: 1, dessin: 14 }; // 14 = « Drawing and Watercolor »

const FIELDS = [
  'id', 'title', 'artist_title', 'artist_display', 'date_display', 'date_start',
  'medium_display', 'image_id', 'artwork_type_id', 'subject_titles',
  'style_title', 'is_public_domain', 'thumbnail',
].join(',');

/**
 * Construit l'URL de recherche. Fonction pure (pas de réseau) → testable.
 * @param {{theme:string, epoque:string, support:string}} criteria
 * @param {number} page   numéro de page, à partir de 0
 * @param {number} perPage
 */
export function buildSearchUrl(criteria, page, perPage) {
  const filter = [
    { term: { is_public_domain: true } },
    { exists: { field: 'image_id' } },
    criteria.support
      ? { term: { artwork_type_id: TYPE_IDS[criteria.support] } }
      : { terms: { artwork_type_id: Object.values(TYPE_IDS) } },
  ];
  if (criteria.epoque) {
    const [from, to] = EPOQUES[criteria.epoque].range;
    filter.push({ range: { date_start: { gte: from, lte: to } } });
  }

  const must = [];
  if (criteria.theme) {
    const { query, synonyms = '' } = THEMES[criteria.theme];
    must.push({
      multi_match: {
        // Plusieurs mots → l'AIC trouve les œuvres contenant l'UN d'entre eux.
        query: `${query} ${synonyms}`.trim(),
        // ^3 = un mot-clé trouvé dans les sujets compte 3 fois plus que dans le titre
        fields: ['subject_titles^3', 'term_titles^2', 'title'],
      },
    });
  }

  if (criteria.motcle) {
    must.push({
      multi_match: {
        query: criteria.motcle,
        fields: ['subject_titles^3', 'term_titles^2', 'title'],
        operator: 'and', // comme au Met : tous les mots doivent être présents
      },
    });
  }

  // `should` ne filtre pas : il fait remonter en tête les œuvres que le musée
  // met en avant (is_boosted), souvent plus connues et mieux photographiées.
  const should = [{ term: { is_boosted: true } }];

  const params = { query: { bool: { filter, must, should } } };
  const qs = new URLSearchParams({
    params: JSON.stringify(params),
    fields: FIELDS,
    limit: String(perPage),
    page: String(page + 1), // l'API numérote les pages à partir de 1
  });
  return `${API}/artworks/search?${qs}`;
}

/** Première ligne d'un texte (« Georges Seurat\nFrench, 1859–1891 » → « Georges Seurat »). */
function firstLine(text) {
  return (text || '').split('\n')[0].trim();
}

function typeFromId(typeId) {
  if (typeId === TYPE_IDS.peinture) return 'peinture';
  if (typeId === TYPE_IDS.dessin) return 'dessin';
  return 'autre';
}

/**
 * Convertit une œuvre brute de l'AIC au format commun.
 * Renvoie null si l'œuvre n'est pas utilisable (pas d'image ou pas libre de droits).
 */
export function normalize(raw, iiifUrl = IIIF) {
  if (!raw || !raw.is_public_domain || !raw.image_id) return null;
  const image = (size) => `${iiifUrl}/${raw.image_id}/full/${size},/0/default.jpg`;
  const tags = [...(raw.subject_titles || []), raw.style_title]
    .filter(Boolean)
    .map((t) => t.toLowerCase());

  return {
    id: `aic:${raw.id}`,
    source: id,
    sourceLabel: label,
    title: raw.title || 'Sans titre',
    artist: raw.artist_title || firstLine(raw.artist_display) || 'Artiste inconnu',
    date: raw.date_display || '',
    year: Number.isFinite(raw.date_start) ? raw.date_start : null,
    medium: raw.medium_display || '',
    type: typeFromId(raw.artwork_type_id),
    thumbUrl: image(400),
    imageUrl: image(843),
    hdUrl: image(1686),
    pageUrl: `https://www.artic.edu/artworks/${raw.id}`,
    tags: [...new Set(tags)], // Set = dédoublonnage, comme set() en Python
  };
}

/** Recherche paginée → { total, items } */
export async function search(criteria, page, perPage) {
  if ((page + 1) * perPage > MAX_RESULTS) return { total: MAX_RESULTS, items: [] };
  const data = await fetchJson(buildSearchUrl(criteria, page, perPage));
  const iiif = data.config?.iiif_url || IIIF;
  return {
    total: Math.min(data.pagination.total, MAX_RESULTS),
    items: data.data.map((raw) => normalize(raw, iiif)).filter(Boolean),
  };
}

/** Une œuvre par son identifiant AIC (la partie après « aic: »). */
export async function getById(localId) {
  const data = await fetchJson(`${API}/artworks/${localId}?fields=${FIELDS}`);
  return data ? normalize(data.data, data.config?.iiif_url || IIIF) : null;
}
