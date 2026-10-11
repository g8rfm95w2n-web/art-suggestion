// Registre des sources de données.
//
// Chaque connecteur est un module qui exporte :
//   id        : identifiant court ('met', 'smk'…), préfixe des identifiants d'œuvres
//   label     : nom affiché
//   search(criteria, page, perPage) → Promise<{ total, items: Artwork[] }>
//   getById(localId)                → Promise<Artwork | null>
//   normalize(raw)                  → Artwork | null   (pure, testée)
//
// Format commun « Artwork » renvoyé par tous les connecteurs :
//   { id: 'met:436535', source, sourceLabel, title, artist, date, year,
//     medium, type: 'peinture'|'dessin'|'autre',
//     thumbUrl, imageUrl, hdUrl, pageUrl, tags: string[] }
//
// Ajouter une source = écrire js/connectors/xxx.js puis l'ajouter ci-dessous.

import * as met from './met.js';
import * as smk from './smk.js';

export const connectors = [met, smk];

export function getConnector(sourceId) {
  return connectors.find((c) => c.id === sourceId);
}
