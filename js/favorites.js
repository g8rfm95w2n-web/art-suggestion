// Tableau d'inspiration : œuvres favorites avec statut et notes.
//
// Stockage : localStorage (texte JSON). Pourquoi pas IndexedDB comme le cache ?
// Les favoris sont peu nombreux (quelques Ko), et localStorage est synchrone
// et simple : lire = JSON.parse, écrire = JSON.stringify.
// Attention : ces données vivent dans CE navigateur. D'où l'export/import JSON,
// pour les sauvegarder ou les passer de l'ordinateur à la tablette.
//
// On enregistre une copie complète de l'œuvre (titre, image…) : le tableau
// s'affiche sans aucune requête aux musées.

const STORAGE_KEY = 'art-suggestion:favoris';
const FORMAT_VERSION = 1;

export const STATUSES = {
  'a-faire': 'À faire',
  'en-cours': 'En cours',
  termine: 'Terminé',
};

// ---------------------------------------------------------------- Fonctions pures (testées)

/** Vérifie qu'une entrée importée a la bonne forme ; renvoie l'entrée nettoyée ou null. */
export function validateEntry(entry) {
  const art = entry?.art;
  // Identifiant « source:numéro » ; le numéro peut contenir / ou espace (SMK).
  if (!art || typeof art.id !== 'string' || !/^[a-z]+:\S.{0,100}$/.test(art.id)) return null;
  if (typeof art.thumbUrl !== 'string' || !art.thumbUrl.startsWith('https://')) return null;
  return {
    art,
    status: entry.status in STATUSES ? entry.status : 'a-faire',
    notes: typeof entry.notes === 'string' ? entry.notes : '',
    addedAt: Number(entry.addedAt) || Date.now(),
    updatedAt: Number(entry.updatedAt) || Date.now(),
  };
}

/**
 * Lit un fichier d'export (texte JSON) → dictionnaire { id: entrée }.
 * Lève une erreur au message lisible si le fichier n'est pas valide.
 */
export function parseExport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas du JSON valide.');
  }
  if (!data || typeof data.favoris !== 'object' || Array.isArray(data.favoris)) {
    throw new Error('Ce fichier ne ressemble pas à un export de « Modèles à copier ».');
  }
  const result = {};
  for (const entry of Object.values(data.favoris)) {
    const clean = validateEntry(entry);
    if (clean) result[clean.art.id] = clean;
  }
  return result;
}

/**
 * Fusionne deux tableaux : pour une même œuvre, la version modifiée
 * le plus récemment l'emporte. Rien n'est supprimé.
 */
export function mergeFavorites(current, incoming) {
  const merged = { ...current };
  for (const [id, entry] of Object.entries(incoming)) {
    if (!merged[id] || entry.updatedAt > merged[id].updatedAt) merged[id] = entry;
  }
  return merged;
}

// ---------------------------------------------------------------- Stockage

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return data.favoris || {};
  } catch {
    return {}; // stockage indisponible ou corrompu : tableau vide
  }
}

function save(favoris) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, favoris }));
    // Prévient le reste de la page (ex. le compteur « Mon tableau » de l'en-tête).
    window.dispatchEvent(new Event('favoris-change'));
  } catch (err) {
    alert('Impossible d’enregistrer le tableau dans ce navigateur (stockage plein ou désactivé).');
    throw err;
  }
}

/** Liste des favoris, du plus récemment ajouté au plus ancien. */
export function listFavorites() {
  return Object.values(load()).sort((a, b) => b.addedAt - a.addedAt);
}

export function getFavorite(id) {
  return load()[id] || null;
}

export function addFavorite(art) {
  const favoris = load();
  if (!favoris[art.id]) {
    const now = Date.now();
    favoris[art.id] = { art, status: 'a-faire', notes: '', addedAt: now, updatedAt: now };
    save(favoris);
  }
  return favoris[art.id];
}

export function removeFavorite(id) {
  const favoris = load();
  delete favoris[id];
  save(favoris);
}

/** Modifie le statut et/ou les notes : updateFavorite(id, { notes: '…' }). */
export function updateFavorite(id, changes) {
  const favoris = load();
  if (!favoris[id]) return null;
  favoris[id] = { ...favoris[id], ...changes, updatedAt: Date.now() };
  save(favoris);
  return favoris[id];
}

/** Texte JSON à télécharger (sauvegarde). */
export function exportJson() {
  return JSON.stringify(
    { app: 'modeles-a-copier', version: FORMAT_VERSION, exportedAt: new Date().toISOString(), favoris: load() },
    null,
    2,
  );
}

/** Importe un export en le fusionnant avec le tableau actuel. Renvoie le nombre d'œuvres importées. */
export function importJson(text) {
  const incoming = parseExport(text);
  save(mergeFavorites(load(), incoming));
  return Object.keys(incoming).length;
}
