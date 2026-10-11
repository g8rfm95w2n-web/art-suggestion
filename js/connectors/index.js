// Registre des sources de données.
//
// Chaque connecteur est un module qui exporte :
//   id        : identifiant court ('met', 'smk'…), préfixe des identifiants d'œuvres
//   label     : nom affiché
//   search(criteria, page, perPage) → Promise<{ total, items: Artwork[] }>
//   getById(localId)                → Promise<Artwork | null>
//   normalize(raw)                  → Artwork | null   (pure, testée)
//   imagesAnalysable (facultatif)   : false si le serveur d'images refuse la
//                                     lecture des pixels (pas de palette ni de difficulté)
//
// Format commun « Artwork » renvoyé par tous les connecteurs :
//   { id: 'met:436535', source, sourceLabel, title, artist, date, year,
//     medium, type: 'peinture'|'dessin'|'autre',
//     thumbUrl, imageUrl, hdUrl, pageUrl, tags: string[] }
//
// Ajouter une source = écrire js/connectors/xxx.js puis l'ajouter ci-dessous.

import * as met from './met.js';
import * as smk from './smk.js';
import * as mia from './mia.js';
import * as rijks from './rijksmuseum.js';
import * as cleveland from './cleveland.js';

export const connectors = [met, smk, mia, rijks, cleveland];

export function getConnector(sourceId) {
  return connectors.find((c) => c.id === sourceId);
}

/** Le musée autorise-t-il l'analyse de ses images (palette, difficulté) ? */
export function canAnalyze(art) {
  return getConnector(art.source)?.imagesAnalysable !== false;
}
