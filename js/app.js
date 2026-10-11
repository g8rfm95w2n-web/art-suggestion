// Point d'entrée : navigation entre la grille, la page détail et le tableau.
//
// Navigation par « hash » (la partie de l'URL après #) :
//   #/?theme=paysage&support=dessin        → grille de résultats filtrés
//   #/oeuvre/aic:27992?theme=paysage       → détail d'une œuvre
//   #/tableau?statut=en-cours              → mon tableau d'inspiration
// Avantages : aucun serveur nécessaire (GitHub Pages ne sert que des fichiers),
// le bouton « retour » du navigateur fonctionne, et chaque recherche a une URL
// qu'on peut mettre en favori.
//
// Deux sortes de filtres :
//  - criteria (thème, époque, support) : envoyés aux API des musées ;
//  - difficulte : calculée dans le navigateur, appliquée sur les résultats
//    déjà chargés (la changer ne relance donc pas de recherche).

import { THEMES, EPOQUES, SUPPORTS, cleanCriteria } from './filters.js';
import { searchAll, getArtwork, surprise } from './search.js';
import { analyze, LEVELS } from './analysis.js';
import { STATUSES, getFavorite, listFavorites } from './favorites.js';
import { appendCards, showLevels, applyLevelFilter } from './ui/grid.js';
import { renderDetail } from './ui/detail.js';
import { renderBoard } from './ui/board.js';

const view = document.getElementById('view');
const form = document.getElementById('filters');
const surpriseBtn = document.getElementById('surprise');
const APP_TITLE = document.title;

// Mémoire de la recherche en cours : revenir du détail ne relance rien.
const results = { key: null, criteria: null, page: 0, items: [], total: 0, hasMore: false, errors: [], scrollY: 0 };
const known = new Map(); // id → œuvre déjà chargée (évite de la redemander)
let difficulty = ''; // filtre de difficulté courant
let lastGridHash = '#/'; // dernière recherche affichée, pour le bouton « ← Résultats »

// Avec un filtre de difficulté, une page peut se retrouver presque vide :
// on charge alors automatiquement les pages suivantes, dans cette limite.
const MIN_VISIBLE = 6;
const MAX_AUTO_PAGES = 3;

// Chaque navigation reçoit un numéro ; une réponse réseau qui arrive après
// une navigation plus récente est ignorée (sinon l'affichage « saute »).
let navToken = 0;

// ---------------------------------------------------------------- URL ↔ filtres

function queryString(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const gridHash = (criteria, level) => `#/${queryString({ ...criteria, difficulte: level })}`;
const detailHash = (id, criteria, fromSurprise = false) =>
  `#/oeuvre/${id}${queryString({ ...criteria, difficulte: difficulty, hasard: fromSurprise ? '1' : '' })}`;

function parseHash() {
  const hash = location.hash.slice(1) || '/'; // retire le « # »
  const [path, qs = ''] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs));
  const level = params.difficulte in LEVELS ? params.difficulte : '';
  return { path, params, criteria: cleanCriteria(params), level };
}

// ---------------------------------------------------------------- Formulaire et en-tête

function fillSelect(select, entries) {
  for (const [value, label] of entries) select.add(new Option(label, value));
}
const labels = (table) => Object.entries(table).map(([k, v]) => [k, v.label]);
fillSelect(form.theme, labels(THEMES));
fillSelect(form.epoque, labels(EPOQUES));
fillSelect(form.support, labels(SUPPORTS));
fillSelect(form.difficulte, Object.entries(LEVELS));

function readForm() {
  const values = Object.fromEntries(new FormData(form));
  return { criteria: cleanCriteria(values), level: values.difficulte in LEVELS ? values.difficulte : '' };
}

function syncForm(criteria, level) {
  for (const [k, v] of Object.entries(criteria)) form[k].value = v;
  form.difficulte.value = level;
}

// Changer un filtre relance la recherche immédiatement (pratique sur tablette).
form.addEventListener('change', () => {
  const { criteria, level } = readForm();
  location.hash = gridHash(criteria, level);
});
surpriseBtn.addEventListener('click', () => {
  const { criteria, level } = readForm();
  doSurprise(criteria, level);
});

function updateBoardCount() {
  document.getElementById('board-count').textContent = listFavorites().length;
}
window.addEventListener('favoris-change', updateBoardCount);
updateBoardCount();

function setSection(name) { // 'search' | 'detail' | 'board'
  document.body.dataset.section = name;
  document.getElementById('nav-search').classList.toggle('is-on', name === 'search');
  document.getElementById('nav-board').classList.toggle('is-on', name === 'board');
}

// ---------------------------------------------------------------- Grille

const message = (text, cls = 'notice') => `<p class="${cls}">${text}</p>`;
const LOADING = message('Recherche en cours…', 'notice loading');

function renderGrid() {
  const { items, hasMore, errors } = results;
  const parts = [];
  if (errors.length) parts.push(message(`${errors.join(', ')} ne répond pas pour le moment.`, 'notice warn'));
  if (!items.length) parts.push(message('Aucune œuvre trouvée. Essaie d’élargir les filtres.'));
  else parts.push('<p class="count"></p>');
  parts.push('<div class="grid"></div>');
  if (hasMore) parts.push('<button type="button" class="btn more" id="more">Voir plus</button>');
  view.innerHTML = parts.join('');

  const grid = view.querySelector('.grid');
  appendCards(grid, items);
  updateCount();
  view.querySelector('#more')?.addEventListener('click', () => loadMore());
  analyzeAndFill(items);
}

function updateCount() {
  const el = view.querySelector('.count');
  if (!el) return;
  const total = `Environ ${results.total.toLocaleString('fr-FR')} œuvres`;
  const grid = view.querySelector('.grid');
  const visible = applyLevelFilter(grid, difficulty);
  if (!difficulty) { el.textContent = total; return; }
  const pending = grid.querySelectorAll('.card:not([data-level])').length;
  el.textContent = `${total} · ${visible} affichée${visible > 1 ? 's' : ''} au niveau « ${LEVELS[difficulty]} »`
    + (pending ? ` (analyse de ${pending} image${pending > 1 ? 's' : ''}…)` : '');
}

/** Analyse les vignettes ; si trop peu correspondent au filtre, charge la page suivante. */
async function analyzeAndFill(items, autoPages = 0) {
  const grid = view.querySelector('.grid');
  const key = results.key;
  await showLevels(grid, items, updateCount);
  if (!difficulty) return;
  if (key !== results.key || !grid.isConnected) return;
  updateCount();
  const visible = grid.querySelectorAll('.card:not([hidden])').length;
  if (visible < MIN_VISIBLE && results.hasMore && autoPages < MAX_AUTO_PAGES) {
    await loadMore(autoPages + 1);
  }
}

async function showGrid(criteria, token) {
  setSection('search');
  document.title = APP_TITLE;
  const key = JSON.stringify(criteria);

  if (results.key === key) { // même recherche qu'avant : on réaffiche tel quel
    renderGrid();
    window.scrollTo(0, results.scrollY);
    return;
  }

  view.innerHTML = LOADING;
  const r = await searchAll(criteria, 0);
  if (token !== navToken) return;
  Object.assign(results, { key, criteria, page: 0, scrollY: 0, ...r });
  r.items.forEach((a) => known.set(a.id, a));
  renderGrid();
}

async function loadMore(autoPages = 0) {
  const button = view.querySelector('#more');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = 'Chargement…';
  const key = results.key;
  const r = await searchAll(results.criteria, results.page + 1);
  if (key !== results.key || !button.isConnected) return; // on a changé de page entre-temps

  results.page += 1;
  results.items.push(...r.items);
  results.hasMore = r.hasMore;
  r.items.forEach((a) => known.set(a.id, a));
  appendCards(view.querySelector('.grid'), r.items);
  if (r.hasMore) {
    button.disabled = false;
    button.textContent = 'Voir plus';
  } else {
    button.remove();
  }
  updateCount();
  await analyzeAndFill(r.items, autoPages);
}

// ---------------------------------------------------------------- Détail et tableau

async function showDetail(id, criteria, params, token) {
  setSection('detail');
  window.scrollTo(0, 0);

  // Ordre de recherche : déjà en mémoire → copie dans le tableau → API du musée.
  let art = known.get(id) || getFavorite(id)?.art;
  if (!art) {
    view.innerHTML = LOADING;
    art = await getArtwork(id).catch(() => null);
    if (token !== navToken) return;
  }
  const fromBoard = params.from === 'tableau';
  const backHref = fromBoard ? '#/tableau' : lastGridHash;
  if (!art) {
    view.innerHTML = message(`Œuvre introuvable. <a href="${backHref}">Retour</a>`);
    return;
  }
  known.set(art.id, art);
  document.title = `${art.title} — ${APP_TITLE}`;
  renderDetail(view, art, {
    backHref,
    backLabel: fromBoard ? 'Mon tableau' : 'Résultats',
    onSurprise: params.hasard === '1' ? () => doSurprise(criteria, difficulty) : null,
  });
}

function showBoard(params) {
  setSection('board');
  document.title = `Mon tableau — ${APP_TITLE}`;
  renderBoard(view, params.statut in STATUSES ? params.statut : '');
}

// ---------------------------------------------------------------- Surprends-moi

async function doSurprise(criteria, level) {
  surpriseBtn.disabled = true;
  view.querySelector('#again')?.setAttribute('disabled', '');
  view.querySelector('.surprise-msg')?.remove();
  view.insertAdjacentHTML('afterbegin', message('Je tire une œuvre au hasard…', 'notice loading surprise-msg'));

  // Avec un filtre de difficulté, on tire jusqu'à tomber sur le bon niveau.
  let art = null;
  for (let i = 0; i < (level ? 8 : 1) && !art; i++) {
    const candidate = await surprise(criteria);
    if (!candidate) break;
    if (!level || (await analyze(candidate))?.level === level) art = candidate;
  }
  surpriseBtn.disabled = false;
  view.querySelector('.surprise-msg')?.remove();

  if (!art) {
    view.querySelector('#again')?.removeAttribute('disabled');
    view.insertAdjacentHTML('afterbegin', message('Aucune œuvre trouvée avec ces filtres.', 'notice warn surprise-msg'));
    return;
  }
  difficulty = level;
  known.set(art.id, art);
  location.hash = detailHash(art.id, criteria, true);
}

// ---------------------------------------------------------------- Routeur

function route() {
  const token = ++navToken;
  const { path, params, criteria, level } = parseHash();
  if (path === '/tableau') return showBoard(params);

  syncForm(criteria, level);
  if (!path.startsWith('/oeuvre/')) lastGridHash = location.hash || '#/';
  const levelChanged = level !== difficulty;
  difficulty = level;
  if (path.startsWith('/oeuvre/')) {
    showDetail(decodeURIComponent(path.slice('/oeuvre/'.length)), criteria, params, token);
  } else if (levelChanged && results.key === JSON.stringify(criteria) && view.querySelector('.grid')) {
    // Seule la difficulté a changé : on filtre sans relancer de recherche.
    updateCount();
    analyzeAndFill([]);
  } else {
    showGrid(criteria, token);
  }
}

// Mémorise la position dans la grille avant d'ouvrir une œuvre.
view.addEventListener('click', (e) => {
  if (document.body.dataset.section === 'search' && e.target.closest('.card')) {
    results.scrollY = window.scrollY;
  }
});

window.addEventListener('hashchange', route);
route();
