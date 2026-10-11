// Tests des calculs d'image (palette, difficulté) sur des images synthétiques.
// On fabrique les pixels à la main : pas besoin de navigateur ni de canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  kmeans, distinctPalette, toPoints, toHex,
  colorComplexity, edgeDensity, difficultyFrom,
} from '../js/analysis.js';

/** Image width×height dont chaque pixel vaut colorAt(x, y) = [r, g, b]. */
function makeImage(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      [data[i], data[i + 1], data[i + 2]] = colorAt(x, y);
      data[i + 3] = 255;
    }
  }
  return data;
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const RED = [200, 30, 30];

test('kmeans retrouve les couleurs et leurs proportions', () => {
  // 3/4 blanc, 1/4 rouge
  const data = makeImage(40, 40, (x) => (x < 30 ? WHITE : RED));
  const palette = kmeans(toPoints(data), 4);
  assert.deepEqual(palette[0].rgb, WHITE);
  assert.equal(palette[0].share, 0.75);
  assert.deepEqual(palette[1].rgb, RED);
  assert.equal(palette[1].share, 0.25);
});

test('kmeans est déterministe (même image → même palette)', () => {
  const data = makeImage(30, 30, (x, y) => [x * 8, y * 8, 100]);
  assert.deepEqual(kmeans(toPoints(data), 6), kmeans(toPoints(data), 6));
});

test('distinctPalette fusionne les teintes quasi identiques', () => {
  const clusters = [
    { rgb: [240, 225, 205], share: 0.5 }, // papier
    { rgb: [235, 220, 200], share: 0.3 }, // presque le même papier
    { rgb: [60, 50, 40], share: 0.2 },    // trait
  ];
  const result = distinctPalette(clusters);
  assert.equal(result.length, 2);
  assert.equal(result[0].share, 0.8);
  assert.deepEqual(result[1].rgb, [60, 50, 40]);
});

test('distinctPalette ne dépasse pas le maximum et garde 100 %', () => {
  const clusters = Array.from({ length: 10 }, (_, i) => ({ rgb: [i * 25, 0, 255 - i * 25], share: 0.1 }));
  const result = distinctPalette(clusters, 6);
  assert.equal(result.length, 6);
  const total = result.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('toHex', () => {
  assert.equal(toHex([255, 8, 0]), '#ff0800');
});

test('colorComplexity : image unie = 1, dégradé = beaucoup', () => {
  assert.equal(colorComplexity(makeImage(20, 20, () => RED)), 1);
  const gradient = makeImage(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2]);
  assert.ok(colorComplexity(gradient) > 30);
});

test('edgeDensity : aucune arête sur une image unie, partout sur des rayures fines', () => {
  assert.equal(edgeDensity(makeImage(20, 20, () => WHITE), 20, 20), 0);
  // Rayures noires et blanches de 2 px : chaque pixel touche une transition.
  // (Un damier de 1 px ne marcherait pas : le filtre de Sobel s'y annule par symétrie.)
  const stripes = makeImage(20, 20, (x) => (x % 4 < 2 ? WHITE : BLACK));
  assert.ok(edgeDensity(stripes, 20, 20) > 0.9);
  // Une seule ligne verticale noire : peu de contours
  const line = makeImage(40, 40, (x) => (x === 20 ? BLACK : WHITE));
  const d = edgeDensity(line, 40, 40);
  assert.ok(d > 0 && d < 0.1);
});

test('difficultyFrom : niveaux selon les mesures', () => {
  assert.equal(difficultyFrom({ colors: 2, edges: 0.05 }).level, 'debutant');
  assert.equal(difficultyFrom({ colors: 2, edges: 0.05 }).score, 0);
  assert.equal(difficultyFrom({ colors: 10, edges: 0.2 }).level, 'intermediaire');
  assert.equal(difficultyFrom({ colors: 40, edges: 0.7 }).level, 'avance');
  assert.equal(difficultyFrom({ colors: 40, edges: 0.7 }).score, 1); // borné à 1
});
