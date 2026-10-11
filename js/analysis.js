// Analyse d'image dans le navigateur : palette dominante et score de difficulté.
//
// Principe : on télécharge la miniature, on la réduit à ~160 px de côté et on
// lit ses pixels avec un <canvas>. Tout est calculé localement, sans API.
//
// Les fonctions de calcul (kmeans, colorComplexity, edgeDensity, difficultyFrom)
// sont « pures » : elles prennent un tableau de pixels et renvoient un résultat,
// ce qui permet de les tester dans Node sans navigateur.
//
// Format des pixels : celui de canvas.getImageData(), un tableau plat
// [r, g, b, a, r, g, b, a, …] d'entiers 0–255 (comme un tableau numpy aplati).

import { cacheGet, cacheSet } from './cache.js';

const ANALYSIS_SIZE = 160; // côté max de l'image analysée, en pixels
const CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // le résultat ne change pas : 1 an
const VERSION = 2; // à incrémenter si l'algorithme change (invalide le cache)

// ---------------------------------------------------------------- Palette

/** Générateur pseudo-aléatoire à graine (mulberry32) : même image → même palette. */
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Extrait les pixels opaques sous forme de liste [[r,g,b], …]. */
export function toPoints(data) {
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) points.push([data[i], data[i + 1], data[i + 2]]);
  }
  return points;
}

/**
 * Regroupe les couleurs en k groupes (algorithme des k-moyennes, « k-means ») :
 *  1. on choisit k couleurs de départ (méthode k-means++ : bien espacées) ;
 *  2. chaque pixel rejoint la couleur de départ la plus proche ;
 *  3. chaque couleur devient la moyenne de ses pixels ; on répète 2–3.
 * Renvoie [{ rgb: [r,g,b], share: 0..1 }] trié du plus au moins présent.
 */
export function kmeans(points, k = 6, iterations = 12) {
  if (!points.length) return [];
  const random = seededRandom(points.length);
  k = Math.min(k, points.length);

  // k-means++ : chaque nouveau centre est tiré avec une probabilité
  // proportionnelle à sa distance aux centres déjà choisis.
  const centers = [points[Math.floor(random() * points.length)]];
  const nearest = points.map((p) => dist2(p, centers[0]));
  while (centers.length < k) {
    const total = nearest.reduce((s, d) => s + d, 0);
    if (total === 0) break; // image unie : inutile de chercher plus
    let r = random() * total;
    let idx = 0;
    while (r > nearest[idx] && idx < points.length - 1) r -= nearest[idx++];
    centers.push(points[idx]);
    points.forEach((p, i) => { nearest[i] = Math.min(nearest[i], dist2(p, points[idx])); });
  }

  const assignment = new Array(points.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    // Étape 2 : affectation au centre le plus proche
    points.forEach((p, i) => {
      let best = 0;
      for (let c = 1; c < centers.length; c++) {
        if (dist2(p, centers[c]) < dist2(p, centers[best])) best = c;
      }
      assignment[i] = best;
    });
    // Étape 3 : recalcul des centres (moyennes)
    const sums = centers.map(() => [0, 0, 0, 0]);
    points.forEach((p, i) => {
      const s = sums[assignment[i]];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }

  const counts = centers.map(() => 0);
  assignment.forEach((c) => counts[c]++);
  return centers
    .map((rgb, c) => ({ rgb: rgb.map(Math.round), share: counts[c] / points.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

/**
 * Rend une palette utile : les k-moyennes découpent souvent une grande zone
 * (le papier d'un dessin) en plusieurs teintes quasi identiques. On fusionne
 * donc les couleurs trop proches (distance < minDist) dans la plus présente,
 * ce qui laisse de la place aux couleurs minoritaires mais distinctes (le trait).
 */
export function distinctPalette(clusters, max = 6, minDist = 32) {
  const kept = [];
  for (const c of clusters) { // déjà triés du plus au moins présent
    const near = kept.find((k) => Math.sqrt(dist2(k.rgb, c.rgb)) < minDist);
    if (near) near.share += c.share;
    else if (kept.length < max) kept.push({ ...c });
    else {
      // Palette pleine : la part va à la couleur gardée la plus proche.
      kept.reduce((a, b) => (dist2(a.rgb, c.rgb) < dist2(b.rgb, c.rgb) ? a : b)).share += c.share;
    }
  }
  return kept.sort((a, b) => b.share - a.share);
}

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- Difficulté

/**
 * Complexité des couleurs : on range chaque pixel dans une « case » de couleur
 * (8 niveaux par canal → 512 cases) et on compte combien de cases il faut pour
 * couvrir 90 % de l'image. Un dessin à la sanguine : ~5 cases ;
 * une scène colorée très nuancée : 100 et plus.
 */
export function colorComplexity(data, coverage = 0.9) {
  const bins = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    bins.set(key, (bins.get(key) || 0) + 1);
    total++;
  }
  const sorted = [...bins.values()].sort((a, b) => b - a);
  let covered = 0;
  let count = 0;
  for (const n of sorted) {
    if (covered >= coverage * total) break;
    covered += n;
    count++;
  }
  return count;
}

/**
 * Densité de contours : part des pixels situés sur un contour net.
 * On passe l'image en niveaux de gris, puis on applique le filtre de Sobel,
 * qui mesure la variation de luminosité autour de chaque pixel. Un pixel
 * est « contour » si cette variation dépasse un seuil.
 * Beaucoup de contours = beaucoup de détails à reproduire.
 */
export function edgeDensity(data, width, height, threshold = 100) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    // Luminance perçue (l'œil est plus sensible au vert)
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let edges = 0;
  let counted = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = (dx, dy) => gray[(y + dy) * width + (x + dx)];
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      if (Math.hypot(gx, gy) > threshold) edges++;
      counted++;
    }
  }
  return counted ? edges / counted : 0;
}

export const LEVELS = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Combine les mesures en un score 0..1 puis en niveau.
 * Chaque mesure est ramenée entre 0 (simple) et 1 (complexe) à partir de
 * bornes observées, puis on fait une moyenne pondérée.
 *
 * Calibration (octobre 2026) sur 35 œuvres du Met de tous types :
 *  - cases couleur : de 2 (croquis au graphite) à 28 (paysage coloré) ;
 *  - contours : de 0,03 (intérieur sombre et flou) à 0,63 (église gothique).
 * Les contours pèsent plus (60 %) : c'est ce qui sépare le mieux une étude
 * dépouillée d'une gravure fourmillante de détails.
 * Limite connue : une peinture très sombre et fondue (ex. Kalf) sort
 * « débutant » alors que ses nuances subtiles sont difficiles.
 */
export const CALIBRATION = {
  colors: { simple: 2, complex: 25, weight: 0.4 }, // cases couleur couvrant 90 %
  edges: { simple: 0.05, complex: 0.4, weight: 0.6 }, // part de pixels-contours
  levels: { intermediaire: 0.25, avance: 0.5 },
};

export function difficultyFrom({ colors, edges }, cal = CALIBRATION) {
  const c = clamp01((colors - cal.colors.simple) / (cal.colors.complex - cal.colors.simple));
  const e = clamp01((edges - cal.edges.simple) / (cal.edges.complex - cal.edges.simple));
  const score = c * cal.colors.weight + e * cal.edges.weight;
  const level = score >= cal.levels.avance ? 'avance'
    : score >= cal.levels.intermediaire ? 'intermediaire'
    : 'debutant';
  return { score: Math.round(score * 100) / 100, level };
}

// ---------------------------------------------------------------- Navigateur

/**
 * Télécharge une image et renvoie ses pixels réduits.
 * On passe par fetch() en mode CORS : sans l'autorisation du serveur
 * (Access-Control-Allow-Origin), le navigateur interdirait de lire les pixels.
 *
 * Piège : si la même URL a déjà été affichée par un <img> ordinaire, le
 * navigateur réutilise cette copie en cache, qui n'est pas « autorisée CORS »,
 * et la lecture échoue. On ajoute donc un paramètre (?cors=1) : l'analyse a sa
 * propre copie, toujours téléchargée en mode CORS. Les musées l'ignorent.
 */
async function loadPixels(url) {
  const corsUrl = url + (url.includes('?') ? '&' : '?') + 'cors=1';
  const res = await fetch(corsUrl, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** Analyse complète, sans cache. */
export async function analyzeUrl(url) {
  const { data, width, height } = await loadPixels(url);
  const metrics = {
    colors: colorComplexity(data),
    edges: Math.round(edgeDensity(data, width, height) * 1000) / 1000,
  };
  // 12 groupes, puis fusion des teintes proches → 6 couleurs au plus.
  const palette = distinctPalette(kmeans(toPoints(data), 12))
    .map((c) => ({ hex: toHex(c.rgb), share: c.share }));
  return { palette, metrics, ...difficultyFrom(metrics) };
}

// File d'attente : 3 analyses à la fois au plus, pour ne pas figer la page.
const MAX_PARALLEL = 3;
let running = 0;
const waiting = [];
const pending = new Map(); // id → Promise (évite deux analyses de la même œuvre)

async function withSlot(fn) {
  if (running >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/**
 * Analyse une œuvre (palette + difficulté), avec cache IndexedDB.
 * Renvoie null si l'image est illisible (réseau, CORS…).
 */
export function analyze(art) {
  if (pending.has(art.id)) return pending.get(art.id);
  const key = `analysis:v${VERSION}:${art.id}`;
  const promise = (async () => {
    const cached = await cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const result = await withSlot(() => analyzeUrl(art.thumbUrl));
      await cacheSet(key, result, CACHE_TTL);
      return result;
    } catch (err) {
      console.warn('analyse impossible', art.id, err);
      return null;
    }
  })();
  pending.set(art.id, promise);
  promise.finally(() => pending.delete(art.id));
  return promise;
}
