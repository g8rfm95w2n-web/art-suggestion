// Toutes les requêtes réseau passent par fetchJson() :
//  1. on regarde d'abord dans le cache (aucune requête si déjà vu) ;
//  2. sinon on attend une « place libre » auprès du limiteur de l'hôte,
//     pour ne jamais envoyer trop de requêtes en même temps au même musée ;
//  3. on met la réponse en cache.
// Deux appels identiques simultanés partagent la même requête (inFlight).

import { cacheGet, cacheSet } from './cache.js';

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TTL = 7 * DAY; // les collections changent peu : 7 jours suffisent

// Nombre maximal de requêtes simultanées par hôte.
const MAX_PARALLEL = 4;
// Au-delà, on abandonne : un musée qui ne répond pas ne doit pas bloquer l'autre.
const TIMEOUT_MS = 12000;
const queues = new Map(); // hôte → { active, waiting: [] }
const inFlight = new Map(); // url → Promise

// Petit sémaphore : équivalent de asyncio.Semaphore en Python.
async function acquire(host) {
  if (!queues.has(host)) queues.set(host, { active: 0, waiting: [] });
  const q = queues.get(host);
  if (q.active >= MAX_PARALLEL) {
    await new Promise((resolve) => q.waiting.push(resolve));
  }
  q.active++;
  return () => {
    q.active--;
    const next = q.waiting.shift();
    if (next) next();
  };
}

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} pour ${url}`);
    this.status = status;
  }
}

/**
 * fetch() avec un second essai en cas d'échec réseau ou CORS (TypeError).
 * Cas réel : certains serveurs (Cleveland) mémorisent la première réponse
 * faite à une URL, en-têtes compris ; si ce premier appel venait d'un outil
 * sans navigateur, la réponse mémorisée n'a pas l'autorisation CORS et le
 * navigateur la refuse ensuite. Un paramètre en plus (_r=…) donne une URL
 * neuve, donc une réponse correcte. Pas de second essai après un délai
 * dépassé : le serveur est simplement lent ou injoignable.
 */
async function fetchWithRetry(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err.name !== 'TypeError') throw err;
    const retryUrl = `${url}${url.includes('?') ? '&' : '?'}_r=${Date.now()}`;
    return fetch(retryUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
}

/**
 * Récupère une URL JSON, avec cache et limitation de débit.
 * @param {string} url
 * @param {{ttl?: number}} [options]
 */
export async function fetchJson(url, { ttl = DEFAULT_TTL } = {}) {
  const cached = await cacheGet(url);
  if (cached !== undefined) return cached;
  if (inFlight.has(url)) return inFlight.get(url);

  const promise = (async () => {
    const release = await acquire(new URL(url).host);
    try {
      const res = await fetchWithRetry(url);
      // 404 = objet supprimé du musée : on le mémorise aussi (valeur null)
      // pour ne pas le redemander à chaque fois.
      if (res.status === 404) {
        await cacheSet(url, null, ttl);
        return null;
      }
      if (!res.ok) throw new HttpError(res.status, url);
      const data = await res.json();
      await cacheSet(url, data, ttl);
      return data;
    } finally {
      release();
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, promise);
  return promise;
}
