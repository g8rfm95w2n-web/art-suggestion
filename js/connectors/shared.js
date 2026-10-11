// Outils communs à plusieurs connecteurs.

import { SUPPORTS } from '../filters.js';
import { interleave } from '../utils.js';

/**
 * Pour les API qui ne savent chercher qu'UN type d'œuvre à la fois (Met,
 * Cleveland, SMK) : si aucun support n'est choisi, on fait une recherche par
 * support et on mélange les résultats, chacun fournissant sa part de la page.
 *
 * @param {object} criteria
 * @param {number} page
 * @param {number} perPage
 * @param {(support: string, offset: number, limit: number) => Promise<{total, items}>} fetchOne
 *        recherche pour un support donné ('peinture' | 'dessin')
 */
export async function searchBySupport(criteria, page, perPage, fetchOne, maxResults = 10000) {
  const supports = criteria.support ? [criteria.support] : Object.keys(SUPPORTS);
  const share = Math.ceil(perPage / supports.length);
  const offset = page * share;
  if (offset + share > maxResults) return { total: maxResults, items: [] };

  const results = await Promise.all(supports.map((s) => fetchOne(s, offset, share)));
  return {
    total: results.reduce((sum, r) => sum + Math.min(r.total, maxResults), 0),
    items: interleave(results.map((r) => r.items)),
  };
}

/** Liste de mots pour les API où plusieurs mots = « tous ces mots » (ET). */
export function keywordsFor(criteria, themes) {
  return [criteria.theme && themes[criteria.theme].query, criteria.motcle].filter(Boolean).join(' ');
}
