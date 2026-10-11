// Mode copie : l'œuvre en plein écran avec des aides au report sur le support.
//  - grille superposable (cases carrées ou N × N), opacité et couleur réglables ;
//  - niveaux de gris et « valeurs simplifiées » (3 ou 5 tons) pour lire les
//    ombres et lumières sans être distrait par la couleur ;
//  - zoom et déplacement : pincer/glisser au doigt, molette ou boutons.
// Les réglages sont mémorisés dans le navigateur d'une séance à l'autre.

import { esc } from '../utils.js';

const SETTINGS_KEY = 'art-suggestion:copie';
const DEFAULTS = {
  grid: true,
  cells: 4,          // nombre de cases sur la largeur
  shape: 'carree',   // 'carree' : cases carrées ; 'egale' : N × N (s'étire avec l'image)
  opacity: 0.7,
  color: 'clair',    // 'clair' | 'sombre'
  tone: 'couleur',   // 'couleur' | 'gris' | 'valeurs3' | 'valeurs5'
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* sans gravité */ }
}

/**
 * Lignes de la grille, en coordonnées de l'image (pure, testable).
 * @returns {{xs: number[], ys: number[]}} positions des lignes verticales et horizontales
 */
export function gridLines(width, height, cells, shape) {
  const xs = [];
  const ys = [];
  const stepX = width / cells;
  const stepY = shape === 'carree' ? stepX : height / cells;
  for (let x = stepX; x < width - 0.5; x += stepX) xs.push(x);
  for (let y = stepY; y < height - 0.5; y += stepY) ys.push(y);
  return { xs, ys };
}

// Filtres SVG pour les « valeurs simplifiées » : on passe en gris, puis on
// arrondit chaque pixel au palier le plus proche (comme une affiche « posterisée »).
// Ils s'appliquent à une <img> ordinaire, sans lire les pixels (donc sans CORS).
const SVG_FILTERS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    ${[3, 5].map((n) => {
      const table = Array.from({ length: n }, (_, i) => (i / (n - 1)).toFixed(2)).join(' ');
      return `
      <filter id="valeurs${n}" color-interpolation-filters="sRGB">
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="${table}"/>
          <feFuncG type="discrete" tableValues="${table}"/>
          <feFuncB type="discrete" tableValues="${table}"/>
        </feComponentTransfer>
      </filter>`;
    }).join('')}
  </svg>`;

const TONE_FILTERS = {
  couleur: 'none',
  gris: 'grayscale(1)',
  valeurs3: 'url(#valeurs3)',
  valeurs5: 'url(#valeurs5)',
};

/**
 * Affiche le mode copie. Renvoie une fonction de nettoyage, à appeler en
 * quittant la page (elle retire les écouteurs globaux et libère l'écran).
 */
export function renderCopy(container, art, { backHref }) {
  const settings = loadSettings();

  container.innerHTML = `
    ${SVG_FILTERS}
    <div class="copy">
      <div class="copy-toolbar" role="toolbar" aria-label="Aides à la copie">
        <a class="btn" href="${esc(backHref)}" title="Retour à la fiche">←</a>

        <div class="tool-group">
          <button type="button" class="btn toggle" data-toggle="grid" title="Afficher la grille (G)">▦ Grille</button>
          <label class="tool" title="Nombre de cases sur la largeur">
            <input type="range" min="2" max="16" step="1" data-set="cells">
            <output data-show="cells"></output>
          </label>
          <select data-set="shape" aria-label="Forme des cases">
            <option value="carree">cases carrées</option>
            <option value="egale">N × N</option>
          </select>
          <label class="tool" title="Opacité de la grille">
            <span aria-hidden="true">◐</span>
            <input type="range" min="0.2" max="1" step="0.1" data-set="opacity" aria-label="Opacité">
          </label>
          <button type="button" class="btn" data-cycle="color" title="Couleur des lignes"></button>
        </div>

        <div class="tool-group">
          <select data-set="tone" aria-label="Couleurs ou valeurs" title="Touche N pour passer en gris">
            <option value="couleur">Couleurs</option>
            <option value="gris">Niveaux de gris</option>
            <option value="valeurs5">Valeurs : 5 tons</option>
            <option value="valeurs3">Valeurs : 3 tons</option>
          </select>
        </div>

        <div class="tool-group">
          <button type="button" class="btn" data-zoom="out" title="Dézoomer (−)">−</button>
          <button type="button" class="btn zoom-level" data-zoom="fit" title="Ajuster à l'écran (0)">100 %</button>
          <button type="button" class="btn" data-zoom="in" title="Zoomer (+)">+</button>
          <button type="button" class="btn" data-action="hd" title="Charger l'image haute définition (plus nette au zoom, plus lourde)">HD</button>
        </div>
        <span class="wake muted" hidden title="L'écran ne se mettra pas en veille">☀︎ écran allumé</span>
      </div>

      <div class="stage" aria-label="${esc(art.title)}">
        <div class="canvas">
          <img alt="${esc(art.title)}" draggable="false">
          <svg class="grid-overlay" preserveAspectRatio="none" aria-hidden="true"></svg>
        </div>
      </div>
    </div>`;

  const root = container.querySelector('.copy');
  const stage = root.querySelector('.stage');
  const canvas = root.querySelector('.canvas');
  const img = canvas.querySelector('img');
  const overlay = canvas.querySelector('.grid-overlay');
  const zoomLabel = root.querySelector('.zoom-level');

  // Taille de référence de l'image (celle de la 1re image chargée) : la grille
  // et le zoom sont exprimés dans cette unité, même après passage en HD.
  let base = null;
  // Vue : translation (tx, ty) en pixels écran + échelle.
  const view = { tx: 0, ty: 0, scale: 1, fit: 1 };

  // ------------------------------------------------------------ Réglages

  function applySettings() {
    root.querySelector('[data-toggle="grid"]').classList.toggle('is-on', settings.grid);
    root.querySelectorAll('[data-set]').forEach((input) => { input.value = settings[input.dataset.set]; });
    root.querySelector('[data-show="cells"]').textContent = settings.cells;
    root.querySelector('[data-cycle="color"]').textContent = settings.color === 'clair' ? '◻︎ lignes claires' : '◼︎ lignes sombres';
    img.style.filter = TONE_FILTERS[settings.tone] || 'none';
    drawGrid();
    saveSettings(settings);
  }

  function drawGrid() {
    if (!base) return;
    overlay.hidden = !settings.grid;
    const { xs, ys } = gridLines(base.w, base.h, Number(settings.cells), settings.shape);
    const stroke = settings.color === 'clair' ? '#ffffff' : '#000000';
    const halo = settings.color === 'clair' ? '#000000' : '#ffffff';
    // Chaque ligne est doublée d'un halo fin de couleur opposée : elle reste
    // visible sur les zones claires comme sombres. vector-effect garde une
    // épaisseur constante quel que soit le zoom.
    const line = (x1, y1, x2, y2) => `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${halo}" stroke-opacity=".35" stroke-width="3" vector-effect="non-scaling-stroke"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    overlay.setAttribute('viewBox', `0 0 ${base.w} ${base.h}`);
    overlay.style.opacity = settings.opacity;
    overlay.innerHTML = [
      ...xs.map((x) => line(x, 0, x, base.h)),
      ...ys.map((y) => line(0, y, base.w, y)),
    ].join('');
  }

  root.querySelector('.copy-toolbar').addEventListener('input', (e) => {
    const key = e.target.dataset.set;
    if (!key) return;
    settings[key] = key === 'cells' || key === 'opacity' ? Number(e.target.value) : e.target.value;
    applySettings();
  });
  root.querySelector('.copy-toolbar').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.toggle) settings[button.dataset.toggle] = !settings[button.dataset.toggle];
    if (button.dataset.cycle === 'color') settings.color = settings.color === 'clair' ? 'sombre' : 'clair';
    if (button.dataset.zoom === 'in') zoomAt(centerOfStage(), 1.25);
    if (button.dataset.zoom === 'out') zoomAt(centerOfStage(), 0.8);
    if (button.dataset.zoom === 'fit') fitToStage();
    if (button.dataset.action === 'hd') loadHd(button);
    applySettings();
  });

  // ------------------------------------------------------------ Zoom et déplacement

  function render() {
    canvas.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    zoomLabel.textContent = `${Math.round((view.scale / view.fit) * 100)} %`;
  }

  function fitToStage() {
    if (!base) return;
    const { width, height } = stage.getBoundingClientRect();
    view.fit = Math.min(width / base.w, height / base.h);
    view.scale = view.fit;
    view.tx = (width - base.w * view.scale) / 2;
    view.ty = (height - base.h * view.scale) / 2;
    render();
  }

  function centerOfStage() {
    const { width, height } = stage.getBoundingClientRect();
    return { x: width / 2, y: height / 2 };
  }

  /** Zoome d'un facteur en gardant le point `p` (coordonnées dans la scène) immobile. */
  function zoomAt(p, factor) {
    const scale = Math.min(view.fit * 12, Math.max(view.fit * 0.5, view.scale * factor));
    const k = scale / view.scale;
    view.tx = p.x - (p.x - view.tx) * k;
    view.ty = p.y - (p.y - view.ty) * k;
    view.scale = scale;
    render();
  }

  // Événements « pointer » : souris, doigt et stylet avec le même code.
  // Un doigt : déplacer. Deux doigts : pincer pour zoomer.
  const pointers = new Map();
  let last = null; // dernière position (1 doigt) ou {mid, dist} (2 doigts)

  function relative(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function gesture() {
    const [a, b] = [...pointers.values()];
    if (!b) return { mid: a, dist: 0 };
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, relative(e));
    last = gesture();
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, relative(e));
    const now = gesture();
    view.tx += now.mid.x - last.mid.x;
    view.ty += now.mid.y - last.mid.y;
    if (now.dist && last.dist) zoomAt(now.mid, now.dist / last.dist);
    else render();
    last = now;
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    last = pointers.size ? gesture() : null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault(); // sinon la page défile
    zoomAt(relative(e), Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => {
    if (view.scale > view.fit * 1.05) fitToStage();
    else zoomAt(relative(e), 2.5);
  });

  // ------------------------------------------------------------ Image

  img.addEventListener('load', () => {
    if (base) return; // passage en HD : la taille de référence ne change pas
    base = { w: img.naturalWidth, h: img.naturalHeight };
    canvas.style.width = `${base.w}px`;
    canvas.style.height = `${base.h}px`;
    fitToStage();
    drawGrid();
  });
  img.addEventListener('error', () => {
    if (!base) stage.innerHTML = '<p class="notice">Image indisponible pour le moment.</p>';
  });
  img.src = art.imageUrl;

  function loadHd(button) {
    if (art.hdUrl === art.imageUrl || button.disabled) return;
    button.disabled = true;
    button.textContent = 'HD…';
    const hd = new Image();
    hd.onload = () => { img.src = art.hdUrl; button.textContent = 'HD ✓'; };
    hd.onerror = () => { button.textContent = 'HD ✗'; };
    hd.src = art.hdUrl;
  }

  // ------------------------------------------------------------ Clavier, écran, nettoyage

  function onKey(e) {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === '+' || e.key === '=') zoomAt(centerOfStage(), 1.25);
    else if (e.key === '-') zoomAt(centerOfStage(), 0.8);
    else if (e.key === '0') fitToStage();
    else if (e.key === 'g') { settings.grid = !settings.grid; applySettings(); }
    else if (e.key === 'n') { settings.tone = settings.tone === 'couleur' ? 'gris' : 'couleur'; applySettings(); }
  }

  // Wake Lock : empêche la tablette de se mettre en veille pendant qu'on peint.
  // (API récente : si le navigateur ne la connaît pas, on s'en passe.)
  let wakeLock = null;
  const wakeBadge = root.querySelector('.wake');
  async function keepAwake() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeBadge.hidden = !wakeLock;
    } catch {
      wakeBadge.hidden = true;
    }
  }
  // Le verrou est perdu quand on change d'onglet : on le reprend au retour.
  function onVisibility() { if (document.visibilityState === 'visible') keepAwake(); }

  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', fitToStage);
  document.addEventListener('visibilitychange', onVisibility);
  keepAwake();
  applySettings();

  return function cleanup() {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fitToStage);
    document.removeEventListener('visibilitychange', onVisibility);
    wakeLock?.release().catch(() => {});
  };
}
