// Connecteur : Metropolitan Museum of Art (New York)
// Documentation : https://metmuseum.github.io/
//
// Points clés de l'API :
//  - /v1.1/search ne renvoie QUE des identifiants (objectIDs), paginés par
//    offset/limit (l'ancien /v1/search a été retiré le 1er octobre 2026) ;
//  - il faut ensuite une requête /v1/objects/{id} par œuvre pour avoir le détail
//    → on garde des pages petites et tout est mis en cache ;
//  - on ne peut pas filtrer « domaine public » dans la recherche : on le vérifie
//    sur le détail (isPublicDomain), et on écarte les autres ;
//  - le filtre `medium` combiné avec « | » donne des résultats incohérents,
//    donc on fait une recherche par support quand aucun n'est choisi ;
//  - limite demandée : 80 requêtes/seconde (on en fait au plus 4 à la fois).

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';
import { searchBySupport, keywordsFor, paintedType } from './shared.js';

const API = 'https://collectionapi.metmuseum.org/public/collection';
const MAX_RESULTS = 10000; // offset + limit ne peut pas dépasser 10 000

export const id = 'met';
export const label = 'The Metropolitan Museum of Art';

// Valeurs du filtre `medium` du Met (sensibles à la casse).
// Le Met a des catégories à part pour les pastels et les aquarelles,
// comptés ici comme peinture.
const MEDIUMS = { peinture: 'Paintings', pastel: 'Pastels', aquarelle: 'Watercolors', dessin: 'Drawings' };

/** URL de recherche pour UN support donné. Fonction pure → testable. */
export function buildSearchUrl(criteria, medium, offset, limit) {
  const qs = new URLSearchParams({
    hasImages: 'true',
    medium,
    // `q` est obligatoire ; « * » signifie « tout ». Plusieurs mots = ET.
    q: keywordsFor(criteria, THEMES) || '*',
    offset: String(offset),
    limit: String(limit),
  });
  if (criteria.epoque) {
    const [from, to] = EPOQUES[criteria.epoque].range;
    qs.set('dateBegin', String(from)); // la doc impose dateBegin ET dateEnd
    qs.set('dateEnd', String(to));
  }
  return `${API}/v1.1/search?${qs}`;
}

function typeFromRaw(raw) {
  const text = `${raw.classification} ${raw.objectName}`.toLowerCase();
  if (text.includes('painting') || text.includes('pastel') || text.includes('watercolor')) return 'peinture';
  if (text.includes('drawing')) return 'dessin';
  return 'autre';
}

/**
 * Convertit un objet brut du Met au format commun.
 * Renvoie null si l'œuvre n'est pas utilisable (pas d'image ou pas libre de droits).
 */
export function normalize(raw) {
  if (!raw || !raw.isPublicDomain || !raw.primaryImageSmall) return null;
  const tags = (raw.tags || []).map((t) => t.term.toLowerCase());

  return {
    id: `met:${raw.objectID}`,
    source: id,
    sourceLabel: label,
    title: raw.title || 'Sans titre',
    artist: raw.artistDisplayName || raw.culture || 'Artiste inconnu',
    date: raw.objectDate || '',
    // objectBeginDate vaut 0 quand la date est inconnue
    year: raw.objectDate && Number.isFinite(raw.objectBeginDate) ? raw.objectBeginDate : null,
    medium: raw.medium || '',
    type: paintedType(typeFromRaw(raw), raw.medium),
    thumbUrl: raw.primaryImageSmall,
    imageUrl: raw.primaryImageSmall,
    hdUrl: raw.primaryImage || raw.primaryImageSmall, // fichier original, parfois > 10 Mo
    pageUrl: raw.objectURL || `https://www.metmuseum.org/art/collection/search/${raw.objectID}`,
    tags: [...new Set(tags)],
  };
}

/** Recherche paginée → { total, items } */
export function search(criteria, page, perPage) {
  return searchBySupport(criteria, page, perPage, async (kind, offset, limit) => {
    const result = await fetchJson(buildSearchUrl(criteria, MEDIUMS[kind], offset, limit));
    // Une requête par œuvre (limitées et mises en cache par fetchJson).
    const objects = await Promise.all(
      (result?.objectIDs || []).map((oid) => fetchJson(`${API}/v1/objects/${oid}`)),
    );
    const items = objects
      .map(normalize)
      .filter(Boolean)
      // Fiche ambiguë (ex. aquarelle classée « Paintings ») : on sait par quel support on l'a trouvée.
      .map((a) => (a.type === 'autre' ? { ...a, type: kind === 'dessin' ? 'dessin' : 'peinture' } : a));
    return { total: result?.total || 0, items };
  }, MAX_RESULTS);
}

/** Une œuvre par son identifiant Met (la partie après « met: »). */
export async function getById(localId) {
  return normalize(await fetchJson(`${API}/v1/objects/${localId}`));
}
