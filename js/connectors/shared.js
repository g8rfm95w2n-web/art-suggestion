// Outils communs à plusieurs connecteurs.

import { SUPPORTS } from '../filters.js';
import { interleave } from '../utils.js';

// Les musées rangent parmi les « dessins » tout ce qui est fait sur papier,
// y compris des œuvres entièrement en couleur : pastels, aquarelles, gouaches.
// Pour qui peint, ce sont des peintures. Règle du site : une œuvre dont la
// technique mentionne une matière colorée (pastel, aquarelle, gouache,
// détrempe, huile, acrylique…) est une « peinture », en anglais, français,
// danois ou néerlandais.

/** Pastel (« pastelkridt » en danois). */
export function isPastel(medium) {
  return /pastel/i.test(medium || '');
}

const PAINT_MEDIA = /aquarel|watercolou?r|akvarel|vandfarve|waterverf|gouache|dekverf|d[æe]kfarve|tempera|d[ée]trempe|limfarve|opaque colou?r|\boil\b|olie|huile|acryl|(penseel|pinceau|brush)\s+(in|en)\s+(kleuren|couleurs|colou?rs)/i;

// Exception : des rehauts de gouache BLANCHE ne servent qu'à marquer les
// lumières d'un dessin (« lavis brun, rehauts de gouache blanche ») : on
// retire ces mentions avant de chercher une matière colorée.
const WHITE_HIGHLIGHTS = /(white|hvid|wit)\s+(gouache|bodycolou?r|watercolou?r|dækfarve|dekverf)|(gouache|aquarelle)\s+blanche|dekwit/gi;

/** Aquarelle, gouache, huile… (hors simples rehauts blancs). */
export function isPainted(medium) {
  return PAINT_MEDIA.test((medium || '').replace(WHITE_HIGHLIGHTS, ''));
}

/** Matière colorée : pastel ou peinture. */
export function isColourMedium(medium) {
  return isPastel(medium) || isPainted(medium);
}

/** Applique la règle à un type déjà déterminé (par le classement du musée). */
export function paintedType(type, medium) {
  return isColourMedium(medium) ? 'peinture' : type;
}

// Sous-recherches nécessaires pour chaque support du site :
//  - peinture = peintures + pastels + aquarelles/gouaches (cherchés à part,
//    car classés parmi les dessins par les musées) ;
//  - dessin   = dessins, œuvres en couleur exclues.
// Le poids règle la part de chaque sous-recherche dans une page.
const KINDS = { peinture: ['peinture', 'pastel', 'aquarelle'], dessin: ['dessin'] };
const WEIGHTS = { peinture: 2, pastel: 1, aquarelle: 1, dessin: 2 };

/** Garde-fou : chaque sous-recherche ne garde que ce qui lui correspond. */
function keepFor(kind, art) {
  if (kind === 'pastel') return isPastel(art.medium);
  if (kind === 'aquarelle') return isPainted(art.medium);
  if (kind === 'dessin') return !isColourMedium(art.medium);
  return true;
}

/**
 * Une recherche par « sorte » d'œuvre (peinture, pastel, aquarelle, dessin),
 * puis on mélange les résultats.
 *
 * @param {(kind: 'peinture'|'pastel'|'aquarelle'|'dessin', offset: number, limit: number) => Promise<{total, items}>} fetchOne
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
