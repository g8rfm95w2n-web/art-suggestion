// Tests de l'import/export du tableau d'inspiration (fonctions pures).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateEntry, parseExport, mergeFavorites } from '../js/favorites.js';

const art = (id) => ({ id, title: 'Titre', thumbUrl: 'https://example.org/img.jpg' });
const entry = (id, extra = {}) => ({ art: art(id), status: 'a-faire', notes: '', addedAt: 1, updatedAt: 1, ...extra });

test('validateEntry nettoie les valeurs douteuses', () => {
  const clean = validateEntry({ art: art('met:1'), status: 'n-importe', notes: 42 });
  assert.equal(clean.status, 'a-faire');
  assert.equal(clean.notes, '');
});

test('validateEntry rejette les entrées sans œuvre valide', () => {
  assert.equal(validateEntry(null), null);
  assert.equal(validateEntry({ art: { id: 'pas un id' } }), null);
  assert.equal(validateEntry({ art: { ...art('met:1'), thumbUrl: 'javascript:alert(1)' } }), null);
});

test('parseExport lit un export et ignore les entrées invalides', () => {
  const text = JSON.stringify({ version: 1, favoris: { a: entry('met:1'), b: { art: {} } } });
  assert.deepEqual(Object.keys(parseExport(text)), ['met:1']);
});

test('parseExport : messages clairs pour un mauvais fichier', () => {
  assert.throws(() => parseExport('pas du json'), /JSON valide/);
  assert.throws(() => parseExport('{"autre": 1}'), /export/);
});

test('mergeFavorites garde la version la plus récente de chaque œuvre', () => {
  const current = { 'met:1': entry('met:1', { notes: 'ancienne', updatedAt: 10 }), 'aic:2': entry('aic:2') };
  const incoming = { 'met:1': entry('met:1', { notes: 'nouvelle', updatedAt: 20 }), 'aic:3': entry('aic:3') };
  const merged = mergeFavorites(current, incoming);
  assert.equal(merged['met:1'].notes, 'nouvelle');
  assert.deepEqual(Object.keys(merged).sort(), ['aic:2', 'aic:3', 'met:1']);
  // Une version plus ancienne n'écrase pas la locale
  assert.equal(mergeFavorites(merged, { 'met:1': entry('met:1', { notes: 'vieux', updatedAt: 5 }) })['met:1'].notes, 'nouvelle');
});
