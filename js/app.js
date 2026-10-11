// Point d'entrée : navigation entre la grille et la page détail.
//
// Navigation par « hash » (la partie de l'URL après #) :
//   #/?theme=paysage&support=dessin        → grille de résultats filtrés
//   #/oeuvre/aic:27992?theme=paysage       → détail d'une œuvre
// Avantages : aucun serveur nécessaire (GitHub Pages ne sert que des fichiers),
// le bouton « retour » du navigateur fonctionne, et chaque recherche a une URL
// qu'on peut mettre en favori.

import { THEMES, EPOQUES, SUPPORTS, cleanCriteria } from './filters.js';
import { searchAll, getArtwork, surprise } from './search.js';
import { appendCards } from './ui/grid.js';
import { renderDetail } from './ui/detail.js';

const view = document.getElementById('view');
const form = document.getElementById('filters');
const surpriseBtn = document.getElementById('surprise');
const APP_TITLE = document.title;

// Mémoire de la recherche en cours : revenir du détail ne relance rien.
const results = { key: null, criteria: null, page: 0, items: [], total: 0, hasMore: false, errors: [], scrollY: 0 };
const known = new Map(); // id → œuvre déjà chargée (évite de la redemander)

// Chaque navigation reçoit un numéro ; une réponse réseau qui arrive après
// une navigation plus récente est ignorée (sinon l'affichage « saute »).
let navToken = 0;

// ---------------------------------------------------------------- URL ↔ critères

function queryString(criteria, extra = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...criteria, ...extra })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const gridHash = (criteria) => `#/${queryString(criteria)}`;
const detailHash = (id, criteria, fromSurprise = false) =>
  `#/oeuvre/${id}${queryString(criteria, { hasard: fromSurprise ? '1' : '' })}`;

function parseHash() {
  const hash = location.hash.slice(1) || '/'; // retire le « # »
  const [path, qs = ''] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs));
  return { path, params, criteria: cleanCriteria(params) };
}

// ---------------------------------------------------------------- Formulaire

function fillSelect(select, table) {
  for (const [value, { label }] of Object.entries(table)) {
    select.add(new Option(label, value));
  }
}
fillSelect(form.theme, THEMES);
fillSelect(form.epoque, EPOQUES);
fillSelect(form.support, SUPPORTS);

const readForm = () => cleanCriteria(Object.fromEntries(new FormData(form)));

function syncForm(criteria) {
  for (const [k, v] of Object.entries(criteria)) form[k].value = v;
}

// Changer un filtre relance la recherche immédiatement (pratique sur tablette).
form.addEventListener('change', () => { location.hash = gridHash(readForm()); });
surpriseBtn.addEventListener('click', () => doSurprise(readForm()));

// ---------------------------------------------------------------- Vues

const message = (text, cls = 'notice') => `<p class="${cls}">${text}</p>`;
const LOADING = message('Recherche en cours…', 'notice loading');

function renderGrid() {
  const { items, total, hasMore, errors, criteria } = results;
  const parts = [];
  if (errors.length) parts.push(message(`${errors.join(', ')} ne répond pas pour le moment.`, 'notice warn'));
  if (!items.length) {
    parts.push(message('Aucune œuvre trouvée. Essaie d’élargir les filtres.'));
  } else {
    parts.push(`<p class="count">Environ ${total.toLocaleString('fr-FR')} œuvres</p>`);
  }
  parts.push('<div class="grid"></div>');
  if (hasMore) parts.push('<button type="button" class="btn more" id="more">Voir plus</button>');
  view.innerHTML = parts.join('');

  appendCards(view.querySelector('.grid'), items, queryString(criteria));
  view.querySelector('#more')?.addEventListener('click', loadMore);
}

async function showGrid(criteria, token) {
  document.body.classList.remove('is-detail');
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

async function loadMore(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Chargement…';
  const key = results.key;
  const r = await searchAll(results.criteria, results.page + 1);
  if (key !== results.key) return; // l'utilisateur a changé de recherche entre-temps

  results.page += 1;
  results.items.push(...r.items);
  results.hasMore = r.hasMore;
  r.items.forEach((a) => known.set(a.id, a));
  appendCards(view.querySelector('.grid'), r.items, queryString(results.criteria));
  if (r.hasMore) {
    button.disabled = false;
    button.textContent = 'Voir plus';
  } else {
    button.remove();
  }
}

async function showDetail(id, criteria, fromSurprise, token) {
  document.body.classList.add('is-detail');
  window.scrollTo(0, 0);

  let art = known.get(id);
  if (!art) {
    view.innerHTML = LOADING;
    art = await getArtwork(id).catch(() => null);
    if (token !== navToken) return;
  }
  if (!art) {
    view.innerHTML = message(`Œuvre introuvable. <a href="${gridHash(criteria)}">Retour aux résultats</a>`);
    return;
  }
  known.set(art.id, art);
  document.title = `${art.title} — ${APP_TITLE}`;
  renderDetail(view, art, {
    backHref: gridHash(criteria),
    onSurprise: fromSurprise ? () => doSurprise(criteria) : null,
  });
}

async function doSurprise(criteria) {
  surpriseBtn.disabled = true;
  view.querySelector('#again')?.setAttribute('disabled', '');
  view.insertAdjacentHTML('afterbegin', message('Je tire une œuvre au hasard…', 'notice loading'));
  const art = await surprise(criteria);
  surpriseBtn.disabled = false;

  if (!art) {
    view.querySelector('.loading')?.remove();
    view.insertAdjacentHTML('afterbegin', message('Aucune œuvre trouvée avec ces filtres.', 'notice warn'));
    return;
  }
  known.set(art.id, art);
  location.hash = detailHash(art.id, criteria, true);
}

// ---------------------------------------------------------------- Routeur

function route() {
  const token = ++navToken;
  const { path, params, criteria } = parseHash();
  syncForm(criteria);
  if (path.startsWith('/oeuvre/')) {
    showDetail(decodeURIComponent(path.slice('/oeuvre/'.length)), criteria, params.hasard === '1', token);
  } else {
    showGrid(criteria, token);
  }
}

// Mémorise la position dans la grille avant d'ouvrir une œuvre.
view.addEventListener('click', (e) => {
  if (e.target.closest('.card')) results.scrollY = window.scrollY;
});

window.addEventListener('hashchange', route);
route();
