// Tests du calcul de la grille du mode copie.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gridLines } from '../js/ui/copy.js';

test('cases carrées : la hauteur suit le pas de la largeur', () => {
  // 400 × 300, 4 cases en largeur → pas de 100 : 3 verticales, 2 horizontales
  assert.deepEqual(gridLines(400, 300, 4, 'carree'), { xs: [100, 200, 300], ys: [100, 200] });
});

test('N × N : même nombre de cases dans les deux sens', () => {
  assert.deepEqual(gridLines(400, 300, 3, 'egale').ys, [100, 200]);
  assert.equal(gridLines(400, 300, 3, 'egale').xs.length, 2);
});

test('pas de ligne collée au bord, même avec des arrondis', () => {
  const { xs } = gridLines(1000, 700, 3, 'carree');
  assert.equal(xs.length, 2);
  assert.ok(xs.every((x) => x < 1000));
});
