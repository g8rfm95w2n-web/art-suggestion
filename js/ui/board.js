// Vue « Mon tableau » : favoris classés par statut, export et import JSON.

import { esc } from '../utils.js';
import { STATUSES, listFavorites, exportJson, importJson } from '../favorites.js';

/**
 * @param {HTMLElement} container
 * @param {string} status  statut affiché ('' = tous)
 */
export function renderBoard(container, status) {
  const all = listFavorites();
  const shown = status ? all.filter((f) => f.status === status) : all;
  const count = (s) => all.filter((f) => f.status === s).length;

  const tabs = [['', 'Tous', all.length], ...Object.entries(STATUSES).map(([k, label]) => [k, label, count(k)])]
    .map(([k, label, n]) => `
      <a class="tab ${k === status ? 'is-on' : ''}" href="#/tableau${k ? `?statut=${k}` : ''}">
        ${label} <span class="tab-count">${n}</span>
      </a>`).join('');

  const cards = shown.map(({ art, status: s, notes }) => `
    <a class="card" href="#/oeuvre/${esc(art.id)}?from=tableau">
      <div class="card-thumb">
        <img src="${esc(art.thumbUrl)}" alt="${esc(art.title)}" loading="lazy">
        <span class="status status-${s}">${STATUSES[s]}</span>
      </div>
      <div class="card-meta">
        <span class="card-title">${esc(art.title)}</span>
        <span class="card-sub">${esc(art.artist)}</span>
        ${notes ? `<span class="card-notes">${esc(notes)}</span>` : ''}
      </div>
    </a>`).join('');

  container.innerHTML = `
    <div class="board-head">
      <h1>Mon tableau</h1>
      <div class="board-actions">
        <button type="button" class="btn" id="export" ${all.length ? '' : 'disabled'}>Exporter (JSON)</button>
        <label class="btn">Importer…<input type="file" id="import" accept=".json,application/json" hidden></label>
      </div>
    </div>
    <nav class="tabs" aria-label="Filtrer par statut">${tabs}</nav>
    <div id="board-message"></div>
    ${shown.length
      ? `<div class="grid">${cards}</div>`
      : `<p class="notice">${all.length
        ? 'Aucune œuvre avec ce statut.'
        : 'Ton tableau est vide. Sur la page d’une œuvre, touche « ☆ Ajouter à mon tableau ».'}</p>`}`;

  container.querySelector('#export').addEventListener('click', downloadExport);
  container.querySelector('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = importJson(await file.text());
      renderBoard(container, status);
      showMessage(container, `${n} œuvre${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}.`);
    } catch (err) {
      showMessage(container, esc(err.message), 'warn');
    }
  });
}

function showMessage(container, html, cls = '') {
  container.querySelector('#board-message').innerHTML = `<p class="notice ${cls}">${html}</p>`;
}

/** Fait télécharger le JSON : on crée un lien invisible vers un « Blob » et on le clique. */
function downloadExport() {
  const blob = new Blob([exportJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `modeles-a-copier-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); // Safari a besoin d'un délai
}
