// Orchestration : interroge toutes les sources et fusionne leurs résultats.
// Ce module ne connaît que l'interface commune des connecteurs : il ne sait
// rien de l'AIC ni du Met.

import { connectors, getConnector } from './connectors/index.js';
import { SUPPORTS } from './filters.js';
import { interleave, pick, randomInt } from './utils.js';

export const PER_PAGE = 12; // œuvres par page, toutes sources confondues

/**
 * Recherche dans toutes les sources en parallèle.
 * Si une source tombe en panne, on affiche quand même les autres
 * (Promise.allSettled ne s'arrête pas à la première erreur, contrairement à Promise.all).
 * @returns {Promise<{items, total, hasMore, errors: string[]}>}
 */
export async function searchAll(criteria, page) {
  const perSource = Math.ceil(PER_PAGE / connectors.length);
  const settled = await Promise.allSettled(
    connectors.map((c) => c.search(criteria, page, perSource)),
  );

  const lists = [];
  const errors = [];
  let total = 0;
  let hasMore = false;
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      lists.push(result.value.items);
      total += result.value.total;
      if ((page + 1) * perSource < result.value.total) hasMore = true;
    } else {
      console.warn(connectors[i].id, result.reason);
      errors.push(connectors[i].label);
    }
  });
  // On alterne les sources pour mélanger les musées dans la grille.
  return { items: interleave(lists), total, hasMore, errors };
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
