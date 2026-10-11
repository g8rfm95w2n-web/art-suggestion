// Recherche par « envie » : un texte libre (« quelque chose de paisible avec
// de l'eau ») est traduit en filtres grâce à un dictionnaire local.
// Aucune intelligence artificielle ni API : de simples correspondances
// mot → effet, faciles à lire et à compléter.
//
// Chaque entrée du dictionnaire :
//   mots  : expressions françaises reconnues (sans accents, au singulier) ;
//   effet : ce qu'elles déclenchent, parmi
//           theme / epoque / support (clés de filters.js),
//           niveau (clé de LEVELS dans analysis.js),
//           motcle (UN mot anglais envoyé aux API des musées).
// Pour enrichir le site : ajouter une ligne ici, rien d'autre.

export const ENVIES = [
  // Ambiances
  { mots: ['paisible', 'calme', 'serein', 'tranquille', 'repos', 'zen', 'doux', 'douceur', 'apaisant'], effet: { motcle: 'calm' } },
  { mots: ['dramatique', 'clair obscur', 'clair-obscur', 'theatral', 'intense'], effet: { epoque: 'baroque' } },
  { mots: ['orage', 'tempete', 'tourmente', 'menacant'], effet: { motcle: 'storm' } },
  { mots: ['lumiere chaude', 'coucher de soleil', 'soleil couchant', 'crepuscule', 'dore', 'golden'], effet: { motcle: 'sunset' } },
  { mots: ['lumiere', 'lumineux', 'soleil', 'ensoleille', 'eclatant'], effet: { motcle: 'sunlight' } },
  { mots: ['nuit', 'nocturne', 'lune', 'clair de lune'], effet: { motcle: 'moonlight' } },
  { mots: ['brume', 'brouillard', 'vaporeux'], effet: { motcle: 'mist' } },
  // Saisons
  { mots: ['hiver', 'neige', 'givre', 'froid', 'enneige'], effet: { motcle: 'winter' } },
  { mots: ['printemps'], effet: { motcle: 'spring' } },
  { mots: ['ete', 'estival'], effet: { motcle: 'summer' } },
  { mots: ['automne', 'automnal'], effet: { motcle: 'autumn' } },
  // Sujets → thèmes
  { mots: ['mer', 'ocean', 'vague', 'plage', 'cote', 'port', 'bateau', 'voilier', 'marine', 'falaise'], effet: { theme: 'marine' } },
  { mots: ['eau', 'riviere', 'fleuve', 'lac', 'etang', 'reflet', 'cascade', 'ruisseau'], effet: { motcle: 'water' } },
  { mots: ['paysage', 'campagne', 'champ', 'colline', 'prairie', 'nature'], effet: { theme: 'paysage' } },
  { mots: ['montagne', 'alpe', 'sommet'], effet: { theme: 'paysage', motcle: 'mountains' } },
  { mots: ['arbre', 'foret', 'bois', 'feuillage'], effet: { theme: 'arbres' } },
  { mots: ['fleur', 'bouquet', 'rose', 'tulipe', 'iris'], effet: { theme: 'fleurs' } },
  { mots: ['jardin', 'parc'], effet: { motcle: 'garden' } },
  { mots: ['nature morte', 'fruit', 'pomme', 'raisin', 'vase', 'table', 'repas'], effet: { theme: 'nature-morte' } },
  { mots: ['portrait', 'visage', 'tete', 'figure'], effet: { theme: 'portrait' } },
  { mots: ['femme', 'dame', 'jeune fille'], effet: { theme: 'portrait', motcle: 'woman' } },
  { mots: ['homme', 'vieillard'], effet: { theme: 'portrait', motcle: 'man' } },
  { mots: ['enfant', 'bebe', 'garcon', 'fillette'], effet: { motcle: 'child' } },
  { mots: ['animal', 'animaux', 'bete'], effet: { theme: 'animaux' } },
  { mots: ['chien'], effet: { theme: 'animaux', motcle: 'dog' } },
  { mots: ['chat'], effet: { theme: 'animaux', motcle: 'cat' } },
  { mots: ['cheval', 'chevaux'], effet: { theme: 'animaux', motcle: 'horse' } },
  { mots: ['oiseau'], effet: { theme: 'animaux', motcle: 'bird' } },
  { mots: ['ville', 'rue', 'urbain', 'architecture', 'batiment', 'pont', 'eglise'], effet: { theme: 'ville' } },
  { mots: ['interieur', 'maison', 'chambre', 'cuisine', 'salon'], effet: { theme: 'interieur' } },
  // Support
  { mots: ['dessin', 'dessiner', 'croquis', 'esquisse', 'crayon', 'fusain', 'sanguine', 'encre', 'trait', 'etude'], effet: { support: 'dessin' } },
  { mots: ['peinture', 'peindre', 'huile', 'tableau', 'couleur', 'colore'], effet: { support: 'peinture' } },
  // Difficulté
  // Les tournures négatives sont des expressions entières : « pas trop dur » → débutant.
  { mots: ['simple', 'facile', 'debutant', 'rapide', 'minimaliste', 'epure', 'sobre',
    'pas trop dur', 'pas dur', 'pas trop difficile', 'pas difficile', 'pas complique', 'pas trop complique'], effet: { niveau: 'debutant' } },
  { mots: ['intermediaire', 'moyen'], effet: { niveau: 'intermediaire' } },
  { mots: ['difficile', 'dur', 'complique', 'complexe', 'detaille', 'defi', 'ambitieux', 'avance', 'minutieux'], effet: { niveau: 'avance' } },
  // Époques et styles
  { mots: ['medieval', 'moyen age', 'gothique'], effet: { epoque: 'moyen-age' } },
  { mots: ['renaissance'], effet: { epoque: 'renaissance' } },
  { mots: ['baroque', 'caravage', 'rembrandt'], effet: { epoque: 'baroque' } },
  { mots: ['romantique', 'romantisme', 'neoclassique'], effet: { epoque: 'xviiie-xixe' } },
  { mots: ['impressionniste', 'impressionnisme', 'monet', 'renoir', 'realiste'], effet: { epoque: 'impressionnisme' } },
  { mots: ['moderne', 'xxe'], effet: { epoque: 'moderne' } },
];

// Mots à ignorer silencieusement (articles, verbes d'envie…).
const STOPWORDS = new Set((
  'je j veux voudrais aimerais aime envie de d du des un une le la l les avec et ou ' +
  'quelque chose chose truc a au aux en pour sur dans un peu tres plutot pas trop ' +
  'qui que sans faire copier copie modele oeuvre me m mon ma mes ai est c ce cette ca qu'
).split(' '));

const MAX_KEYWORDS = 2; // le Met exige TOUS les mots (ET) : au-delà, plus aucun résultat

/** « Lumière CHAUDE, l'été ! » → « lumiere chaude l ete » */
export function normalize(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ') // ponctuation et apostrophes → espaces
    .trim();
}

// Index : expression normalisée → entrée du dictionnaire.
const INDEX = new Map();
for (const entry of ENVIES) for (const mot of entry.mots) INDEX.set(normalize(mot), entry);
// Les expressions de plusieurs mots sont cherchées d'abord, les plus longues en premier.
const PHRASES = [...INDEX.keys()].filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);

/** Cherche un mot seul, en essayant aussi sans le « s » ou « x » final (pluriel). */
function lookup(word) {
  if (INDEX.has(word)) return INDEX.get(word);
  if (word.length > 3 && /[sx]$/.test(word)) return INDEX.get(word.slice(0, -1));
  return undefined;
}

/**
 * Traduit une envie en filtres.
 * @returns {{
 *   criteria: {theme, epoque, support, motcle},
 *   niveau: string,
 *   understood: {mot: string, effet: object}[],  // pour expliquer à l'utilisateur
 *   unknown: string[],                           // mots non reconnus
 * }}
 */
export function parseEnvie(text) {
  let rest = ` ${normalize(text)} `;
  const found = []; // [mot reconnu, entrée]

  for (const phrase of PHRASES) {
    if (rest.includes(` ${phrase} `)) {
      found.push([phrase, INDEX.get(phrase)]);
      rest = rest.replaceAll(` ${phrase} `, ' ');
    }
  }
  const unknown = [];
  for (const word of rest.split(' ').filter(Boolean)) {
    const entry = lookup(word);
    if (entry) found.push([word, entry]);
    else if (!STOPWORDS.has(word) && !/^\d+$/.test(word)) unknown.push(word);
  }

  // Combinaison : pour theme/epoque/support/niveau, le premier mot reconnu
  // l'emporte ; les mots-clés s'additionnent (dans la limite de MAX_KEYWORDS).
  const criteria = { theme: '', epoque: '', support: '', motcle: '' };
  let niveau = '';
  const keywords = [];
  const understood = [];
  for (const [mot, { effet }] of found) {
    const applied = {};
    for (const [key, value] of Object.entries(effet)) {
      if (key === 'motcle') {
        if (!keywords.includes(value) && keywords.length < MAX_KEYWORDS) {
          keywords.push(value);
          applied.motcle = value;
        }
      } else if (key === 'niveau') {
        if (!niveau) niveau = applied.niveau = value;
      } else if (!criteria[key]) {
        criteria[key] = applied[key] = value;
      }
    }
    if (Object.keys(applied).length) understood.push({ mot, effet: applied });
  }
  criteria.motcle = keywords.join(' ');
  return { criteria, niveau, understood, unknown };
}
