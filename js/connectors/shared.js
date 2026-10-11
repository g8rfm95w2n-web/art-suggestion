// Outils communs à plusieurs connecteurs.

import { SUPPORTS } from '../filters.js';
import { interleave } from '../utils.js';

/**
 * Les musées rangent souvent les pastels parmi les dessins. Ici, on les
 * considère comme de la peinture : toute œuvre dont la technique mentionne
 * « pastel » (ou « pastelkridt » en danois) est de type « peinture ».
 */
export function isPastel(medium) {
  return /pastel/i.test(medium || '');
}

/** Applique la règle ci-dessus à un type déjà déterminé. */
export function withPastelRule(type, medium) {
  return isPastel(medium) ? 'peinture' : type;
}

// Sous-recherches nécessaires pour chaque support du site :
//  - peinture = peintures + pastels (cherchés à part, car classés ailleurs) ;
//  - dessin   = dessins, pastels exclus.
// Le poids règle la part de chaque sous-recherche dans une page : les pastels,
// bien moins nombreux, en occupent moins que les peintures.
const KINDS = { peinture: ['peinture', 'pastel'], dessin: ['dessin'] };
const WEIGHTS = { peinture: 2, pastel: 1, dessin: 2 };

/** Garde-fou : chaque sous-recherche ne garde que ce qui lui correspond. */
function keepFor(kind, art) {
  if (kind === 'pastel') return isPastel(art.medium);
  if (kind === 'dessin') return !isPastel(art.medium);
  return true;
}

/**
 * Pour les API qui ne savent chercher qu'UN type d'œuvre à la fois (Met, SMK) :
 * une recherche par « sorte » d'œuvre (peinture, pastel, dessin), puis on
 * mélange les résultats.
 *
 * @param {(kind: 'peinture'|'pastel'|'dessin', offset: number, limit: number) => Promise<{total, items}>} fetchOne
 */
export async function searchBySupport(criteria, page, perPage, fetchOne, maxResults = 10000) {
  const supports = criteria.support ? [criteria.support] : Object.keys(SUPPORTS);
  const kinds = supports.flatMap((s) => KINDS[s]);
  const totalWeight = kinds.reduce((sum, k) => sum + WEIGHTS[k], 0);

  const results = await Promise.all(kinds.map(async (kind) => {
    const share = Math.max(1, Math.round((perPage * WEIGHTS[kind]) / totalWeight));
    const offset = page * share;
    if (offset + share > maxResults) return { total: 0, items: [] };
    const r = await fetchOne(kind, offset, share);
    return { total: Math.min(r.total, maxResults), items: r.items.filter((a) => keepFor(kind, a)) };
  }));
  return {
    total: results.reduce((sum, r) => sum + r.total, 0),
    items: interleave(results.map((r) => r.items)),
  };
}

/** Liste de mots pour les API où plusieurs mots = « tous ces mots » (ET). */
export function keywordsFor(criteria, themes, extra = '') {
  return [criteria.theme && themes[criteria.theme].query, criteria.motcle, extra].filter(Boolean).join(' ');
}
