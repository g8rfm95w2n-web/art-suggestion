// Affichage de la grille de résultats.

import { esc } from '../utils.js';
import { analyze, LEVELS } from '../analysis.js';
import { getFavorite } from '../favorites.js';

/** HTML d'une vignette. */
function cardHtml(art) {
  const fav = getFavorite(art.id) ? '<span class="card-fav" title="Dans mon tableau">★</span>' : '';
  return `
    <a class="card" href="#/oeuvre/${esc(art.id)}" data-id="${esc(art.id)}">
      <div class="card-thumb">
        <img src="${esc(art.thumbUrl)}" alt="${esc(art.title)}" loading="lazy" decoding="async">
        ${fav}
        <span class="level card-level" hidden></span>
      </div>
      <div class="card-meta">
        <span class="card-title">${esc(art.title)}</span>
        <span class="card-sub">${esc(art.artist)}${art.date ? ' · ' + esc(art.date) : ''}</span>
      </div>
    </a>`;
}

/**
 * Ajoute des vignettes à une grille existante.
 * On ajoute plutôt que de tout redessiner : le bouton « Voir plus »
 * ne fait pas sauter la page.
 */
export function appendCards(grid, items) {
  grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));
  // Image cassée (retirée par le musée…) → on masque la vignette.
  grid.querySelectorAll('img:not([data-watched])').forEach((img) => {
    img.dataset.watched = '1';
    img.addEventListener('error', () => img.closest('.card')?.remove(), { once: true });
  });
}

/**
 * Lance l'analyse de difficulté des œuvres et affiche le badge sur chaque vignette.
 * `onEach` est appelée après chaque analyse (pour mettre à jour filtre et compteur).
 * Renvoie une Promise résolue quand toutes les analyses sont finies.
 */
export function showLevels(grid, items, onEach) {
  return Promise.all(items.map(async (art) => {
    const result = await analyze(art);
    const card = grid.querySelector(`.card[data-id="${CSS.escape(art.id)}"]`);
    if (!card) return;
    card.dataset.level = result ? result.level : 'inconnu';
    const badge = card.querySelector('.card-level');
    if (result) {
      badge.textContent = LEVELS[result.level];
      badge.classList.add(`level-${result.level}`);
      badge.hidden = false;
    }
    onEach?.();
  }));
}

/** Masque les vignettes qui ne correspondent pas au niveau choisi ('' = tout afficher). */
export function applyLevelFilter(grid, level) {
  grid.querySelectorAll('.card').forEach((card) => {
    // Tant que l'analyse n'est pas finie, on masque (on ne sait pas encore).
    card.hidden = Boolean(level) && card.dataset.level !== level;
  });
  return grid.querySelectorAll('.card:not([hidden])').length;
}
