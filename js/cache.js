// Cache clé → valeur persistant dans le navigateur, avec date d'expiration.
//
// Pourquoi IndexedDB plutôt que localStorage ?
//  - localStorage est limité à ~5 Mo et bloque la page à chaque lecture/écriture ;
//  - IndexedDB accepte des centaines de Mo et stocke directement des objets JS.
// L'API native d'IndexedDB est verbeuse (à base d'événements) : on l'enveloppe
// ici dans deux fonctions async, cacheGet() et cacheSet(), comme un dict Python.
//
// Si IndexedDB est indisponible (navigation privée sur certains navigateurs,
// ou Node.js pendant les tests), on se rabat sur un simple Map en mémoire.

const DB_NAME = 'art-suggestion';
const STORE = 'kv';
const memory = new Map(); // repli si IndexedDB est absent

let dbPromise = null; // ouverte une seule fois, à la première utilisation

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      // Appelé à la première ouverture : on crée la « table ».
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// Exécute une opération sur le store et renvoie son résultat via une Promise.
async function withStore(mode, operation) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const req = operation(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

/** Renvoie la valeur en cache, ou undefined si absente ou expirée. */
export async function cacheGet(key) {
  const entry = memory.get(key) ?? (await withStore('readonly', (s) => s.get(key)));
  if (!entry) return undefined;
  if (entry.expires < Date.now()) return undefined;
  return entry.value;
}

/** Stocke une valeur pour `ttlMs` millisecondes. */
export async function cacheSet(key, value, ttlMs) {
  const entry = { value, expires: Date.now() + ttlMs };
  const db = await openDb();
  if (db) await withStore('readwrite', (s) => s.put(entry, key));
  else memory.set(key, entry);
}
