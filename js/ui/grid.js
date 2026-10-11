// Affichage de la grille de résultats.

import { esc } from '../utils.js';

/** HTML d'une vignette. `qs` = filtres courants, gardés dans le lien du détail. */
function cardHtml(art, qs) {
  return `
    <a class="card" href="#/oeuvre/${esc(art.id)}${esc(qs)}">
      <div class="card-thumb">
        <img src="${esc(art.thumbUrl)}" alt="${esc(art.title)}" loading="lazy" decoding="async">
      </div>
      <div class="card-meta">
        <span class="card-title">${esc(art.title)}</span>
        <span class="card-sub">${esc(art.artist)}${art.date ? ' · ' + esc(art.date) : ''}</span>
      </div>
    </a>`;
}

/**
 * Ajoute des vignettes à une grille existante (ou la crée).
 * On ajoute plutôt que de tout redessiner : le bouton « Voir plus »
 * ne fait pas sauter la page.
 */
export function appendCards(grid, items, qs = '') {
  grid.insertAdjacentHTML('beforeend', items.map((art) => cardHtml(art, qs)).join(''));
  // Image cassée (retirée par le musée…) → on masque la vignette.
  grid.querySelectorAll('img:not([data-watched])').forEach((img) => {
    img.dataset.watched = '1';
    img.addEventListener('error', () => img.closest('.card')?.remove(), { once: true });
  });
}
