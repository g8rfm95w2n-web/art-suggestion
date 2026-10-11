// Point d'entrée : navigation entre la grille, la page détail et le tableau.
//
// Navigation par « hash » (la partie de l'URL après #) :
//   #/?theme=paysage&support=dessin        → grille de résultats filtrés
//   #/oeuvre/met:436535?theme=paysage      → détail d'une œuvre
//   #/copie/met:436535                     → mode copie (grille, gris, zoom)
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
import { searchAll, getArtwork, surprise, PER_PAGE } from './search.js';
import { esc } from './utils.js';
import { analyze, LEVELS } from './analysis.js';
import { STATUSES, getFavorite, listFavorites } from './favorites.js';
import { appendCards, showLevels, applyLevelFilter } from './ui/grid.js';
import { canAnalyze } from './connectors/index.js';
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
const results = {
  key: null, criteria: null, page: 0, items: [], total: 0, hasMore: false, errors: [], scrollY: 0, loading: false,
  perPage: PER_PAGE,
};
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

// La grille se remplit progressivement : chaque musée ajoute ses œuvres dès
// qu'il répond. L'état est dans `results` ; l'affichage est recalculé à partir
// de lui (renderGrid pour tout, updateGridStatus pour le bas de page).

// Défilement continu : quand le bas de la grille approche de l'écran (à
// 800 px près), la page suivante se charge toute seule. Le bouton « Voir plus »
// reste affiché en secours. On écoute le défilement (et non un
// IntersectionObserver, qui ne réagit qu'à l'entrée dans l'écran : si le bas
// de grille y est déjà, il ne relancerait plus rien).
let scrollScheduled = false;
function onScroll() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => { // au plus une vérification par image affichée
    scrollScheduled = false;
    if (document.body.dataset.section === 'search' && footerNearScreen()) loadNextIfNeeded();
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);

function footerNearScreen() {
  const footer = view.querySelector('.grid-footer');
  return Boolean(footer) && footer.getBoundingClientRect().top < window.innerHeight + 800;
}

function loadNextIfNeeded() {
  if (results.loading || !results.hasMore || !view.querySelector('.grid')) return;
  runPage(results.page + 1);
}

/**
 * Nombre d'œuvres par page : assez pour remplir ~3 lignes de la grille
 * (6 colonnes sur grand écran → 18 œuvres), jamais moins de PER_PAGE.
 */
function pageSizeFor(grid) {
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  return Math.max(PER_PAGE, columns * 3);
}

/** Dessine la grille complète à partir de l'état `results`. */
function renderGrid() {
  view.innerHTML = `
    ${envieBanner()}
    <div class="grid-errors"></div>
    <p class="count"></p>
    <div class="grid"></div>
    <div class="grid-footer"></div>`;
  const grid = view.querySelector('.grid');
  appendCards(grid, results.items);
  updateGridStatus();
  showLevels(grid, results.items, updateCount);
}

/** Met à jour les messages d'erreur, le compteur et le bas de grille. */
function updateGridStatus() {
  const errors = view.querySelector('.grid-errors');
  const footer = view.querySelector('.grid-footer');
  if (!errors || !footer) return; // la grille n'est pas affichée

  errors.innerHTML = results.errors.length
    ? message(`${[...new Set(results.errors)].join(', ')} ne répond pas pour le moment.`, 'notice warn')
    : '';
  if (results.loading) {
    footer.innerHTML = message('Recherche en cours…', 'notice loading');
  } else if (!results.items.length) {
    footer.innerHTML = message('Aucune œuvre trouvée. Essaie d’élargir les filtres.');
  } else if (results.hasMore) {
    footer.innerHTML = '<button type="button" class="btn more">Voir plus</button>';
    footer.querySelector('.more').addEventListener('click', () => runPage(results.page + 1));
  } else {
    footer.innerHTML = '';
  }
  updateCount();
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
  const grid = view.querySelector('.grid');
  if (!el || !grid) return;
  const visible = applyLevelFilter(grid, difficulty);
  el.hidden = !results.items.length;
  const total = `Environ ${results.total.toLocaleString('fr-FR')} œuvres`;
  if (!difficulty) { el.textContent = total; return; }
  const pending = grid.querySelectorAll('.card:not([data-level])').length;
  el.textContent = `${total} · ${visible} affichée${visible > 1 ? 's' : ''} au niveau « ${LEVELS[difficulty]} »`
    + (pending ? ` (analyse de ${pending} image${pending > 1 ? 's' : ''}…)` : '');
}

/**
 * Charge une page de résultats, musée par musée.
 * `autoPages` compte les pages chargées automatiquement pour le filtre de difficulté.
 */
async function runPage(page, autoPages = 0) {
  if (results.loading && page > 0) return; // une page est déjà en cours
  const key = results.key;
  const before = results.items.length;
  results.loading = true;
  results.hasMore = false; // recalculé d'après les réponses de cette page
  updateGridStatus();

  const analyses = [];
  await searchAll(results.criteria, page, (part) => {
    if (key !== results.key) return; // l'utilisateur a lancé une autre recherche
    results.items.push(...part.items);
    if (page === 0) results.total += part.total; // le total ne change pas d'une page à l'autre
    results.hasMore ||= part.hasMore;
    if (part.error) results.errors.push(part.error);
    part.items.forEach((a) => known.set(a.id, a));
    // La grille peut être absente (on regarde une œuvre) : les œuvres sont
    // gardées dans `results` et s'afficheront au retour.
    const grid = view.querySelector('.grid');
    if (grid) {
      appendCards(grid, part.items);
      analyses.push(showLevels(grid, part.items, updateCount));
    }
    updateGridStatus();
  }, results.perPage);
  if (key !== results.key) return;

  results.page = page;
  results.loading = false;
  updateGridStatus();
  // Écran pas encore rempli (grand écran, page maigre) : on continue, sauf si
  // cette page n'a rien apporté (évite d'enchaîner des pages vides).
  if (results.items.length > before && footerNearScreen()) loadNextIfNeeded();
  await Promise.all(analyses);
  if (key === results.key) autoFill(autoPages);
}

/** Filtre de difficulté : si trop peu d'œuvres correspondent, charge la page suivante. */
function autoFill(autoPages = 0) {
  const grid = view.querySelector('.grid');
  if (!difficulty || !grid || results.loading) return;
  const visible = grid.querySelectorAll('.card:not([hidden])').length;
  if (visible < MIN_VISIBLE && results.hasMore && autoPages < MAX_AUTO_PAGES) {
    runPage(results.page + 1, autoPages + 1);
  }
}

function showGrid(criteria) {
  setSection('search');
  document.title = APP_TITLE;
  const key = JSON.stringify(criteria);

  if (results.key === key) { // même recherche qu'avant : on réaffiche tel quel
    renderGrid();
    window.scrollTo(0, results.scrollY);
    return;
  }

  Object.assign(results, {
    key, criteria, page: 0, scrollY: 0, items: [], total: 0, hasMore: false, errors: [], loading: true,
  });
  renderGrid();
  // Taille de page fixée au début de la recherche, d'après la largeur de l'écran.
  results.perPage = pageSizeFor(view.querySelector('.grid'));
  runPage(0);
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
    if (!level || (canAnalyze(candidate) && (await analyze(candidate))?.level === level)) art = candidate;
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
    autoFill();
  } else {
    showGrid(criteria);
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
