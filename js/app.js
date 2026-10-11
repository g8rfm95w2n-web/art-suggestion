// Point d'entrée : navigation entre la grille, la page détail et le tableau.
//
// Navigation par « hash » (la partie de l'URL après #) :
//   #/?theme=paysage&support=dessin        → grille de résultats filtrés
//   #/oeuvre/aic:27992?theme=paysage       → détail d'une œuvre
//   #/copie/aic:27992                      → mode copie (grille, gris, zoom)
//   #/tableau?statut=en-cours              → mon tableau d'inspiration
//   #/?theme=marine&motcle=calm&envie=…    → résultats d'une recherche par envie
// Avantages : aucun serveur nécessaire (GitHub Pages ne sert que des fichiers),
// le bouton « retour » du navigateur fonctionne, et chaque recherche a une URL
// qu'on peut mettre en favori.
//
// Deux sortes de filtres :
//  - criteria (thème, époque, support) : envoyés aux API des musées ;
//  - difficulte : calculée dans le navigateur, appliquée sur les résultats
//    déjà chargés (la changer ne relance donc pas de recherche).

import { THEMES, EPOQUES, SUPPORTS, cleanCriteria } from './filters.js';
import { parseEnvie } from './envies.js';
import { searchAll, getArtwork, surprise } from './search.js';
import { esc } from './utils.js';
import { analyze, LEVELS } from './analysis.js';
import { STATUSES, getFavorite, listFavorites } from './favorites.js';
import { appendCards, showLevels, applyLevelFilter } from './ui/grid.js';
import { renderDetail } from './ui/detail.js';
import { renderBoard } from './ui/board.js';
import { renderCopy } from './ui/copy.js';

const view = document.getElementById('view');
const form = document.getElementById('filters');
const surpriseBtn = document.getElementById('surprise');
const envieForm = document.getElementById('envie');
const envieInput = document.getElementById('envie-text');
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
// Fonction de nettoyage de la vue courante (le mode copie écoute le clavier,
// la taille de la fenêtre… : il faut tout retirer en le quittant).
let cleanupView = null;

// ---------------------------------------------------------------- URL ↔ filtres

function queryString(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const gridHash = (criteria, level) => `#/${queryString({ ...criteria, difficulte: level })}`;
const detailHash = (id, criteria, fromSurprise = false) =>
  `#/oeuvre/${encodeURIComponent(id)}${queryString({ ...criteria, difficulte: difficulty, hasard: fromSurprise ? '1' : '' })}`;

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
  // Le mot-clé ne vient pas des listes mais de la recherche par envie : on le garde.
  values.motcle = parseHash().criteria.motcle;
  return { criteria: cleanCriteria(values), level: values.difficulte in LEVELS ? values.difficulte : '' };
}

function syncForm(criteria, level, envie = '') {
  for (const k of ['theme', 'epoque', 'support']) form[k].value = criteria[k];
  form.difficulte.value = level;
  envieInput.value = envie;
}

// Recherche par envie : le texte est traduit en filtres, puis on affiche la grille.
// Le texte reste dans l'URL (envie=…) pour pouvoir expliquer l'interprétation.
envieForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = envieInput.value.trim();
  if (!text) return;
  envieInput.blur(); // referme le clavier sur tablette
  const { criteria, niveau } = parseEnvie(text);
  location.hash = `#/${queryString({ ...criteria, difficulte: niveau, envie: text })}`;
});

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
  const parts = [envieBanner()];
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

const EFFECT_LABELS = {
  theme: (v) => `thème ${THEMES[v].label}`,
  epoque: (v) => EPOQUES[v].label,
  support: (v) => SUPPORTS[v].label,
  niveau: (v) => `niveau ${LEVELS[v]}`,
  motcle: (v) => `mot-clé « ${v} »`,
};

/** Explique comment l'envie a été comprise, ou affiche le mot-clé actif. */
function envieBanner() {
  const { params, criteria } = parseHash();
  if (params.envie) {
    const { understood, unknown } = parseEnvie(params.envie);
    const items = understood.map(({ mot, effet }) =>
      `<li><strong>${esc(mot)}</strong> → ${Object.entries(effet).map(([k, v]) => EFFECT_LABELS[k](v)).join(', ')}</li>`);
    return `<div class="notice envie-result">
      ${items.length
        ? `<p>J’ai compris :</p><ul>${items.join('')}</ul>`
        : '<p>Je n’ai reconnu aucun mot de ton envie : voici une sélection sans filtre.</p>'}
      ${unknown.length ? `<p class="muted">Mots non reconnus : ${unknown.map(esc).join(', ')}</p>` : ''}
    </div>`;
  }
  if (criteria.motcle) {
    const without = gridHash({ ...criteria, motcle: '' }, difficulty);
    return `<p class="chips">Mot-clé : <span class="chip-tag">${esc(criteria.motcle)}
      <a href="${without}" aria-label="Retirer le mot-clé">✕</a></span></p>`;
  }
  return '';
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

  if (!known.has(id) && !getFavorite(id)) view.innerHTML = LOADING;
  const art = await findArtwork(id);
  if (token !== navToken) return;
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
    copyHref: `#/copie/${encodeURIComponent(art.id)}${queryString(params)}`,
    backLabel: fromBoard ? 'Mon tableau' : 'Résultats',
    onSurprise: params.hasard === '1' ? () => doSurprise(criteria, difficulty) : null,
  });
}

/** Ordre de recherche : déjà en mémoire → copie dans le tableau → API du musée. */
async function findArtwork(id) {
  return known.get(id) || getFavorite(id)?.art || getArtwork(id).catch(() => null);
}

async function showCopy(id, params, token) {
  setSection('copy');
  const art = await findArtwork(id);
  if (token !== navToken) return;
  if (!art) {
    view.innerHTML = message('Œuvre introuvable. <a href="#/">Retour</a>');
    return;
  }
  known.set(art.id, art);
  document.title = `Copie : ${art.title} — ${APP_TITLE}`;
  cleanupView = renderCopy(view, art, { backHref: `#/oeuvre/${encodeURIComponent(art.id)}${queryString(params)}` });
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
  cleanupView?.();
  cleanupView = null;
  const { path, params, criteria, level } = parseHash();
  if (path === '/tableau') return showBoard(params);
  if (path.startsWith('/copie/')) {
    return showCopy(decodeURIComponent(path.slice('/copie/'.length)), params, token);
  }

  syncForm(criteria, level, params.envie);
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
