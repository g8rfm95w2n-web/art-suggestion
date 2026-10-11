// Connecteur : Rijksmuseum (Amsterdam)
// Documentation : https://data.rijksmuseum.nl/docs/search
//
// Points clés de l'API (sans clé, CORS autorisé) :
//  - /search/collection?type=painting&title=…&creationDate=18?? renvoie des pages
//    de 100 identifiants, chaînées par un « pageToken » (pas de saut direct à
//    la page N : on suit la chaîne, et on la mémorise) ;
//  - chaque identifiant est une fiche au format « Linked Art » (JSON-LD), riche
//    mais verbeuse : titre anglais, artiste, date, technique ;
//  - l'image demande deux étapes de plus : fiche → « VisualItem » (qui porte la
//    licence) → « DigitalObject » (qui donne l'adresse IIIF de l'image) ;
//    soit 3 requêtes par œuvre, mises en cache comme toutes les autres ;
//  - images IIIF (iiif.micr.io), CORS autorisé, toutes tailles disponibles.

import { fetchJson } from '../net.js';
import { THEMES, EPOQUES } from '../filters.js';
import { searchBySupport, withPastelRule } from './shared.js';

const API = 'https://data.rijksmuseum.nl/search/collection';
const PAGE_SIZE = 100; // taille fixe des pages de l'API

export const id = 'rijks';
export const label = 'Rijksmuseum';

// Vocabulaire Getty (AAT) utilisé dans les fiches Linked Art.
const AAT = {
  english: 'http://vocab.getty.edu/aat/300388277',
  dutch: 'http://vocab.getty.edu/aat/300388256',
  material: 'http://vocab.getty.edu/aat/300435429', // « matériaux et technique »
  creatorStatement: 'http://vocab.getty.edu/aat/300435416', // « mention de l'auteur »
};

/**
 * Époques → motif de date accepté par l'API (un siècle : « 18?? »).
 * L'API ne sait pas chercher une plage : on prend le siècle principal,
 * puis on retire les œuvres hors de la plage exacte (filtre `inRange`).
 */
const EPOQUE_PATTERNS = {
  'moyen-age': '13??',
  renaissance: '15??',
  baroque: '16??',
  'xviiie-xixe': '18??',
  impressionnisme: '18??',
  moderne: '19??',
};

/** URL de recherche (sans pageToken) pour UNE sorte d'œuvre. Fonction pure → testable. */
export function buildSearchUrl(criteria, kind) {
  const qs = new URLSearchParams({ imageAvailable: 'true', type: kind === 'peinture' ? 'painting' : 'drawing' });
  if (kind === 'pastel') qs.set('material', 'pastel');
  if (criteria.theme) qs.set('title', THEMES[criteria.theme].query);
  if (criteria.motcle) qs.set('description', criteria.motcle);
  if (criteria.epoque) qs.set('creationDate', EPOQUE_PATTERNS[criteria.epoque]);
  return `${API}?${qs}`;
}

// ---------------------------------------------------------------- Lecture d'une fiche Linked Art

const hasLanguage = (entry, lang) => (entry.language || []).some((l) => l.id === lang);
const isClassified = (entry, type) => (entry.classified_as || []).some((c) => c.id === type);

/** Texte dans la langue voulue (anglais, sinon néerlandais, sinon le premier). */
function pick(entries, filter = () => true) {
  const list = (entries || []).filter((e) => e.content && filter(e));
  return (list.find((e) => hasLanguage(e, AAT.english))
    || list.find((e) => hasLanguage(e, AAT.dutch))
    || list[0])?.content || '';
}

function artistName(producedBy = {}) {
  const parts = producedBy.part?.length ? producedBy.part : [producedBy];
  const person = parts.flatMap((p) => p.carried_out_by || [])[0];
  const notes = person?.notation || [];
  const name = (notes.find((n) => n['@language'] === 'en') || notes[0])?.['@value'] || person?._label;
  // Œuvre attribuée (pas d'auteur certain) : la fiche le mentionne en toutes lettres,
  // ex. « Aert van der Neer (mentioned on object) ».
  return name || pick(producedBy.referred_to_by, (e) => isClassified(e, AAT.creatorStatement)) || 'Artiste inconnu';
}

// Techniques souvent seulement en néerlandais : petit dictionnaire, mot à mot.
// Un mot inconnu reste tel quel.
const NL_FR_PHRASES = {
  'rood krijt': 'sanguine', 'zwart krijt': 'pierre noire', 'wit krijt': 'craie blanche',
  // Attention : la traduction ne doit pas contenir de mot néerlandais du
  // dictionnaire ci-dessous (« en » serait retraduit en « et »).
  'pastel in kleuren': 'pastel coloré',
};
const NL_FR = {
  olieverf: 'huile', op: 'sur', doek: 'toile', paneel: 'panneau', koper: 'cuivre', papier: 'papier',
  karton: 'carton', perkament: 'parchemin', hout: 'bois', potlood: 'crayon', krijt: 'craie',
  houtskool: 'fusain', pen: 'plume', penseel: 'pinceau', inkt: 'encre', waterverf: 'aquarelle',
  dekverf: 'gouache', gouache: 'gouache', pastel: 'pastel', in: 'en', en: 'et', met: 'avec',
  grijs: 'gris', bruin: 'brun', zwart: 'noir', wit: 'blanc', rood: 'rouge', blauw: 'bleu',
  kleuren: 'couleurs', gewassen: 'lavis',
};

/** « olieverf op koper » → « huile sur cuivre » */
export function translateMedium(text = '') {
  let result = text;
  for (const [nl, fr] of Object.entries(NL_FR_PHRASES)) result = result.replace(new RegExp(nl, 'gi'), fr);
  return result.replace(/\p{L}+/gu, (word) => NL_FR[word.toLowerCase()] ?? word);
}

/**
 * Convertit une fiche Linked Art (+ adresse IIIF de son image) au format commun.
 * `kind` : la sorte d'œuvre cherchée ('peinture' | 'pastel' | 'dessin').
 * Renvoie null si l'image n'est pas dans le domaine public.
 */
export function normalize(object, image, kind = 'peinture') {
  if (!object || !image?.iiif || !image.publicDomain) return null;
  const producedBy = object.produced_by || {};
  const begin = producedBy.timespan?.begin_of_the_begin;
  const year = begin ? parseInt(begin.slice(0, 4), 10) : NaN;
  const objectNumber = (object.identified_by || []).find((x) => x.type === 'Identifier')?.content;
  const english = (object.referred_to_by || []).find((e) => isClassified(e, AAT.material) && hasLanguage(e, AAT.english));
  const medium = english?.content || translateMedium(pick(object.referred_to_by, (e) => isClassified(e, AAT.material)));
  const type = kind === 'dessin' ? 'dessin' : 'peinture';

  return {
    id: `${id}:${object.id.split('/').pop()}`,
    source: id,
    sourceLabel: label,
    title: pick((object.identified_by || []).filter((x) => x.type === 'Name')) || 'Sans titre',
    artist: artistName(producedBy),
    date: pick(producedBy.timespan?.identified_by),
    year: Number.isFinite(year) ? year : null,
    medium,
    type: withPastelRule(type, medium),
    thumbUrl: `${image.iiif}/full/400,/0/default.jpg`,
    imageUrl: `${image.iiif}/full/1200,/0/default.jpg`,
    hdUrl: `${image.iiif}/full/max/0/default.jpg`,
    pageUrl: objectNumber
      ? `https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(objectNumber)}`
      : object.id,
    tags: [],
  };
}

/** Image d'une fiche : fiche → VisualItem (licence) → DigitalObject (adresse IIIF). */
async function imageOf(object) {
  const visual = await fetchJson(object.shows?.[0]?.id);
  const rights = JSON.stringify(visual?.subject_to || '');
  const digitalId = visual?.digitally_shown_by?.[0]?.id;
  const digital = digitalId ? await fetchJson(digitalId) : null;
  const accessPoint = digital?.access_point?.[0]?.id || '';
  return {
    iiif: accessPoint.replace(/\/full\/.*$/, ''), // base IIIF, sans la taille
    publicDomain: /publicdomain|Public Domain/i.test(rights),
  };
}

async function artwork(objectId, kind) {
  const object = await fetchJson(objectId);
  if (!object?.shows?.length) return null;
  return normalize(object, await imageOf(object), kind);
}

// ---------------------------------------------------------------- Pagination par jetons

const tokens = new Map(); // URL de recherche → jetons des pages [null, jeton page 1, …]

/** Page n°`index` (de 100 identifiants) d'une recherche, en suivant la chaîne des jetons. */
async function apiPage(searchUrl, index) {
  if (!tokens.has(searchUrl)) tokens.set(searchUrl, [null]);
  const chain = tokens.get(searchUrl);
  const urlFor = (i) => (chain[i] ? `${searchUrl}&pageToken=${chain[i]}` : searchUrl);
  while (chain.length <= index) {
    const previous = await fetchJson(urlFor(chain.length - 1));
    const next = previous?.next?.id;
    if (!next) return null; // pas autant de pages
    chain.push(new URL(next).searchParams.get('pageToken'));
  }
  return fetchJson(urlFor(index));
}

/** Identifiants n°`offset` à `offset + limit` d'une recherche, à cheval sur deux pages si besoin. */
async function idsAt(searchUrl, offset, limit) {
  const ids = [];
  let total = 0;
  for (let i = offset; i < offset + limit;) {
    const page = await apiPage(searchUrl, Math.floor(i / PAGE_SIZE));
    if (!page) break;
    total = page.partOf?.totalItems ?? total;
    const start = i % PAGE_SIZE;
    const slice = (page.orderedItems || []).slice(start, start + (offset + limit - i)).map((x) => x.id);
    if (!slice.length) break;
    ids.push(...slice);
    i += slice.length;
  }
  if (!total) total = (await apiPage(searchUrl, 0))?.partOf?.totalItems ?? 0;
  return { ids, total };
}

const inRange = (criteria) => (art) => {
  if (!criteria.epoque || art.year === null) return true;
  const [from, to] = EPOQUES[criteria.epoque].range;
  return art.year >= from && art.year <= to;
};

// ---------------------------------------------------------------- Appels

/** Recherche paginée → { total, items } */
export function search(criteria, page, perPage) {
  return searchBySupport(criteria, page, perPage, async (kind, offset, limit) => {
    const { ids, total } = await idsAt(buildSearchUrl(criteria, kind), offset, limit);
    const items = await Promise.all(ids.map((objectId) => artwork(objectId, kind).catch(() => null)));
    return { total, items: items.filter(Boolean).filter(inRange(criteria)) };
  });
}

/** Une œuvre par son identifiant (la partie après « rijks: »). */
export async function getById(localId) {
  if (!/^\d+$/.test(localId)) return null;
  const art = await artwork(`https://id.rijksmuseum.nl/${localId}`);
  // Ouverte par un lien direct, on ne sait pas par quelle recherche l'œuvre a
  // été trouvée : on devine le type d'après sa technique.
  if (art && !/oil|olieverf|huile|tempera|pastel/i.test(art.medium)) art.type = 'dessin';
  return art;
}
