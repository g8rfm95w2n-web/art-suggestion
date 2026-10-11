// Connecteur : SMK – Statens Museum for Kunst (Galerie nationale du Danemark)
// Documentation : https://api.smk.dk/api/v1/docs/
//
// Points clés de l'API :
//  - /art/search/ renvoie les œuvres complètes ; `keys` (mots-clés) est
//    obligatoire, « * » = tout ; plusieurs mots = tous requis ;
//  - les mots-clés anglais fonctionnent (les titres sont souvent traduits) ;
//  - filtres sous la forme [champ:valeur], séparés par des virgules ;
//    object_names vaut « maleri » (peinture) ou « tegning » (dessin) ;
//  - époque : range=[production_dates_start:{début;fin}] (dates ISO) ;
//  - les données sont en danois : titre en français quand il existe, sinon le
//    titre du musée ; la technique est traduite avec un petit dictionnaire.

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';
import { searchBySupport, keywordsFor, paintedType } from './shared.js';

const API = 'https://api.smk.dk/api/v1';

export const id = 'smk';
export const label = 'SMK – Galerie nationale du Danemark';

// Le SMK a des catégories « pastel » et « akvarel », comptées ici comme peinture.
const OBJECT_NAMES = { peinture: 'maleri', pastel: 'pastel', aquarelle: 'akvarel', dessin: 'tegning' };
// Champs demandés (réponse plus légère). Attention : « frontend_url » est
// calculé par l'API et provoque une erreur 500 si on le demande ici.
const FIELDS = [
  'object_number', 'titles', 'production', 'production_date', 'techniques',
  'object_names', 'image_thumbnail', 'image_native', 'public_domain', 'content_subject',
].join(',');

/** URL de recherche pour UNE sorte d'œuvre (peinture, pastel, dessin). Pure → testable. */
export function buildSearchUrl(criteria, kind, offset, limit) {
  const filters = ['[public_domain:true]', '[has_image:true]', `[object_names:${OBJECT_NAMES[kind]}]`];
  const qs = new URLSearchParams({
    keys: keywordsFor(criteria, THEMES) || '*',
    filters: filters.join(','),
    offset: String(offset),
    rows: String(limit),
    fields: FIELDS,
  });
  if (criteria.epoque) {
    const [from, to] = EPOQUES[criteria.epoque].range;
    const iso = (year, end) => `${String(year).padStart(4, '0')}-${end ? '12-31T23:59:59' : '01-01T00:00:00'}Z`;
    qs.set('range', `[production_dates_start:{${iso(from)};${iso(to, true)}}]`);
  }
  return `${API}/art/search/?${qs}`;
}

// ---------------------------------------------------------------- Traduction des techniques

// Danois → français, mot à mot. Couvre les techniques les plus fréquentes
// (« olie på lærred », « pen og brunt blæk »…) ; un mot inconnu reste en danois.
const DA_FR = {
  olie: 'huile', 'på': 'sur', 'lærred': 'toile', pap: 'carton', karton: 'carton', 'træ': 'bois',
  'egetræ': 'chêne', papir: 'papier', kobber: 'cuivre', metal: 'métal', blik: 'fer-blanc',
  'finér': 'placage', 'krydsfinér': 'contreplaqué', 'elfenben': 'ivoire', pergament: 'parchemin',
  tempera: 'tempera', kaseintempera: 'tempera à la caséine', limfarve: 'détrempe', gouache: 'gouache',
  pastelkridt: 'pastel', blyant: 'crayon', blygriffel: 'mine de plomb', kul: 'fusain', sortkridt: 'pierre noire',
  'rødkridt': 'sanguine', kridt: 'craie', pen: 'plume', pensel: 'pinceau', 'blæk': 'encre',
  tusch: 'encre de Chine', akvarel: 'aquarelle', vandfarve: 'aquarelle', lavering: 'lavis',
  sort: 'noire', sorte: 'noire', brunt: 'brune', brun: 'brun', 'mørkebrunt': 'brun foncé',
  'gråt': 'grise', 'grå': 'gris', hvidt: 'blanc', hvid: 'blanc', og: 'et', over: 'sur',
  opsat: 'monté', 'klæbet': 'collé', 'opklæbet': 'contrecollé', med: 'avec',
};

// Expressions dont l'ordre des mots change en français, traduites en premier.
const DA_FR_PHRASES = {
  'mørkebrunt blæk': 'encre brun foncé', 'brunt blæk': 'encre brune', 'sort blæk': 'encre noire',
  'gråt blæk': 'encre grise', 'grå lavering': 'lavis gris', 'brun lavering': 'lavis brun',
};

/** Garde la majuscule initiale du mot d'origine. */
const sameCase = (original, translated) =>
  original[0] === original[0].toUpperCase() ? translated[0].toUpperCase() + translated.slice(1) : translated;

/** « Olie på papir, klæbet på lærred » → « Huile sur papier, collé sur toile » */
export function translateTechnique(text = '') {
  let result = text;
  for (const [da, fr] of Object.entries(DA_FR_PHRASES)) {
    result = result.replace(new RegExp(da, 'gi'), (found) => sameCase(found, fr));
  }
  // \p{L} = n'importe quelle lettre, accents et æ/ø/å compris
  return result.replace(/\p{L}+/gu, (word) => {
    const fr = DA_FR[word.toLowerCase()];
    return fr ? sameCase(word, fr) : word;
  });
}

// ---------------------------------------------------------------- Normalisation

function pickTitle(titles = []) {
  const french = titles.find((t) => t.language === 'fransk');
  return (french || titles[0])?.title || 'Sans titre';
}

function artistName(production = []) {
  const p = production[0];
  if (!p) return 'Artiste inconnu';
  // « Derain, André » → « André Derain »
  if (p.creator_forename && p.creator_surname) return `${p.creator_forename} ${p.creator_surname}`;
  return p.creator || 'Artiste inconnu';
}

function typeFromRaw(raw) {
  const name = (raw.object_names?.[0]?.name || '').toLowerCase();
  if (name === 'maleri' || name === 'pastel' || name === 'akvarel' || name === 'gouache') return 'peinture';
  if (name === 'tegning') return 'dessin';
  return 'autre';
}

/** Vignette plus légère : les URL IIIF « !1024, » acceptent d'autres tailles. */
function smaller(url) {
  return url.includes('/full/!1024,/') ? url.replace('/full/!1024,/', '/full/!400,/') : url;
}

/**
 * Convertit une œuvre brute du SMK au format commun.
 * Renvoie null si l'œuvre n'est pas utilisable (pas d'image ou pas libre de droits).
 */
export function normalize(raw) {
  if (!raw || !raw.public_domain || !raw.image_thumbnail) return null;
  const date = raw.production_date?.[0];
  const year = date?.start ? parseInt(date.start.slice(0, 4), 10) : NaN;
  const tags = (raw.content_subject || []).map((t) => String(t).toLowerCase());
  return {
    id: `${id}:${raw.object_number}`,
    source: id,
    sourceLabel: label,
    title: pickTitle(raw.titles),
    artist: artistName(raw.production),
    date: date?.period || '',
    year: Number.isFinite(year) ? year : null,
    medium: translateTechnique(raw.techniques?.[0]),
    type: paintedType(typeFromRaw(raw), raw.techniques?.[0]),
    thumbUrl: smaller(raw.image_thumbnail),
    imageUrl: raw.image_thumbnail, // ~1024 px
    hdUrl: raw.image_native || raw.image_thumbnail,
    pageUrl: raw.frontend_url || `https://open.smk.dk/artwork/image/${encodeURIComponent(raw.object_number)}`,
    tags: [...new Set(tags)],
  };
}

/** Recherche paginée → { total, items } */
export function search(criteria, page, perPage) {
  return searchBySupport(criteria, page, perPage, async (kind, offset, limit) => {
    const data = await fetchJson(buildSearchUrl(criteria, kind, offset, limit));
    // Sans résultat, l'API répond parfois « false » au lieu d'une liste vide.
    if (!data || typeof data !== 'object') return { total: 0, items: [] };
    return { total: data.found || 0, items: (data.items || []).map(normalize).filter(Boolean) };
  });
}

/** Une œuvre par son numéro d'inventaire (la partie après « smk: », ex. KMS3672). */
export async function getById(localId) {
  const data = await fetchJson(`${API}/art/?object_number=${encodeURIComponent(localId)}`);
  return normalize(data?.items?.[0]);
}
