// Orchestration : interroge toutes les sources et fusionne leurs résultats.
// Ce module ne connaît que l'interface commune des connecteurs : il ne sait
// rien de l'AIC ni du Met.

import { connectors, getConnector } from './connectors/index.js';
import { SUPPORTS } from './filters.js';
import { pick, randomInt } from './utils.js';

export const PER_PAGE = 12; // œuvres par page, toutes sources confondues

// Une source qui vient d'échouer est mise de côté quelques minutes : inutile
// de lui laisser 12 s de délai à chaque page si elle est en panne.
const PAUSE_AFTER_ERROR = 5 * 60 * 1000;
const pausedUntil = new Map(); // id de la source → date de reprise

/**
 * Recherche dans toutes les sources en parallèle, avec affichage progressif :
 * `onPart` est appelée dès qu'UNE source répond, sans attendre les autres.
 * Un musée lent ou en panne ne retarde donc plus l'affichage des autres.
 *
 * @param {(part: {items, total, hasMore, error: string|null}) => void} [onPart]
 * @returns {Promise<{items, total, hasMore, errors: string[]}>} le bilan, une fois toutes les sources terminées
 */
export async function searchAll(criteria, page, onPart = () => {}) {
  const perSource = Math.ceil(PER_PAGE / connectors.length);
  const summary = { items: [], total: 0, hasMore: false, errors: [] };

  await Promise.all(connectors.map(async (connector) => {
    let part;
    if (pausedUntil.get(connector.id) > Date.now()) {
      part = { items: [], total: 0, hasMore: false, error: connector.label };
    } else {
      try {
        const r = await connector.search(criteria, page, perSource);
        part = { items: r.items, total: r.total, hasMore: (page + 1) * perSource < r.total, error: null };
      } catch (err) {
        // Source en panne : on le signale, les autres continuent.
        console.warn(connector.id, err);
        pausedUntil.set(connector.id, Date.now() + PAUSE_AFTER_ERROR);
        part = { items: [], total: 0, hasMore: false, error: connector.label };
      }
    }
    summary.items.push(...part.items);
    summary.total += part.total;
    summary.hasMore ||= part.hasMore;
    if (part.error) summary.errors.push(part.error);
    onPart(part);
  }));
  return summary;
}

/** Une œuvre par son identifiant complet, ex. « aic:27992 ». */
export async function getArtwork(fullId) {
  const [sourceId, localId] = fullId.split(':');
  const connector = getConnector(sourceId);
  return connector ? connector.getById(localId) : null;
}

/**
 * « Surprends-moi » : une œuvre au hasard respectant les filtres.
 * Principe : choisir une source au hasard, demander combien d'œuvres
 * correspondent (total), puis demander la n-ième avec n au hasard.
 * Quelques essais sont prévus car une œuvre tirée peut être inutilisable
 * (au Met, le droit d'usage n'est vérifiable qu'après coup).
 */
export async function surprise(criteria, attempts = 6) {
  let available = [...connectors];
  for (let i = 0; i < attempts && available.length; i++) {
    // Si aucun support n'est choisi, on en tire un (le Met cherche par support).
    const c = { ...criteria, support: criteria.support || pick(Object.keys(SUPPORTS)) };
    const connector = pick(available);
    try {
      const { total } = await connector.search(c, 0, 1);
      if (!total) continue;
      const { items } = await connector.search(c, randomInt(total), 1);
      if (items[0]) return items[0];
    } catch (err) {
      // Source indisponible : on ne la retente pas pendant ce tirage.
      console.warn(connector.id, err);
      available = available.filter((x) => x !== connector);
    }
  }
  return null;
}
