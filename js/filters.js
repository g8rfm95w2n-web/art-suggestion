// Vocabulaire des filtres : ce que l'utilisateur voit (en français) et
// les termes envoyés aux API (en anglais, langue des données des musées).
//
// Les connecteurs lisent ces tables pour construire leurs requêtes.
// Pour ajouter un thème : une ligne ici, rien d'autre à toucher.

/**
 * Thèmes : clé → libellé affiché + termes de recherche (anglais).
 *  - query    : terme principal, envoyé tel quel (le Met cherche l'expression exacte) ;
 *  - synonyms : mots supplémentaires, utilisés par les sources qui savent
 *               chercher « l'un OU l'autre de ces mots » (AIC).
 */
export const THEMES = {
  paysage:        { label: 'Paysage',           query: 'landscape',  synonyms: 'landscapes countryside' },
  portrait:       { label: 'Portrait',          query: 'portrait',   synonyms: 'portraits' },
  'nature-morte': { label: 'Nature morte',      query: 'still life', synonyms: 'still-life' },
  marine:         { label: 'Marine',            query: 'seascape',   synonyms: 'sea ocean coast harbor boats marine' },
  animaux:        { label: 'Animaux',           query: 'animals',    synonyms: 'animal horses dogs cats birds' },
  fleurs:         { label: 'Fleurs',            query: 'flowers',    synonyms: 'flower bouquet' },
  ville:          { label: 'Ville',             query: 'city',       synonyms: 'cityscape cityscapes street urban' },
  interieur:      { label: 'Scène d’intérieur', query: 'interior',   synonyms: 'interiors domestic' },
  arbres:         { label: 'Arbres',            query: 'trees',      synonyms: 'tree forest woods' },
};

/**
 * Époques : plages d'années [début, fin] (incluses).
 * Volontairement larges : les dates des musées sont souvent approximatives.
 */
export const EPOQUES = {
  'moyen-age':     { label: 'Moyen Âge (avant 1400)',           range: [1000, 1399] },
  renaissance:     { label: 'Renaissance (1400–1599)',          range: [1400, 1599] },
  baroque:         { label: 'Baroque (1600–1749)',              range: [1600, 1749] },
  'xviiie-xixe':   { label: 'Néoclassicisme, romantisme (1750–1849)', range: [1750, 1849] },
  impressionnisme: { label: 'Réalisme, impressionnisme (1850–1899)', range: [1850, 1899] },
  moderne:         { label: 'Début XXe siècle (1900–1950)',     range: [1900, 1950] },
};

/** Supports : peinture ou dessin. */
export const SUPPORTS = {
  peinture: { label: 'Peinture et pastel' }, // les pastels comptent comme peinture
  dessin:   { label: 'Dessin' },
};

/**
 * Nettoie des critères venus de l'URL : toute valeur inconnue est ignorée.
 * Renvoie toujours un objet { theme, epoque, support, motcle } (chaînes, éventuellement vides).
 * `motcle` : mots anglais libres (issus de la recherche par envie), envoyés tels quels aux API.
 */
export function cleanCriteria({ theme = '', epoque = '', support = '', motcle = '' } = {}) {
  return {
    theme: theme in THEMES ? theme : '',
    epoque: epoque in EPOQUES ? epoque : '',
    support: support in SUPPORTS ? support : '',
    motcle: /^[a-z ]{1,40}$/.test(motcle) ? motcle.trim() : '',
  };
}
