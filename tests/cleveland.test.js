// Tests du connecteur Cleveland Museum of Art, sur de vraies réponses enregistrées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as cma from '../js/connectors/cleveland.js';
import { cleanCriteria } from '../js/filters.js';

const [cmaPainting, cmaDrawing] = JSON.parse(
  readFileSync(new URL('./fixtures/cma-artworks.json', import.meta.url), 'utf8'),
);

// ------------------------------------------------------------ Cleveland

test('Cleveland : peinture normalisée', () => {
  const art = cma.normalize(cmaPainting);
  assert.equal(art.id, 'cma:147016');
  assert.equal(art.title, 'Virgin and Child in a Landscape');
  assert.equal(art.artist, 'Jan Gossaert'); // nationalité et dates retirées
  assert.equal(art.year, 1531);
  assert.equal(art.medium, 'oil on wood');
  assert.equal(art.type, 'peinture');
  assert.match(art.thumbUrl, /_web\.jpg$/);
  assert.match(art.hdUrl, /_print\.jpg$/);
  assert.equal(art.pageUrl, 'https://clevelandart.org/art/1972.47');
});

test('Cleveland : un pastel classé « Drawing » devient une peinture', () => {
  assert.equal(cmaDrawing.type, 'Drawing');
  assert.equal(cmaDrawing.technique, 'pastel on gray wove paper');
  assert.equal(cma.normalize(cmaDrawing).type, 'peinture');
  assert.equal(cma.normalize({ ...cmaDrawing, technique: 'red chalk' }).type, 'dessin');
});

test('Cleveland : sous-recherche « aquarelle » = dessins contenant le mot watercolor', () => {
  const url = new URL(cma.buildSearchUrl(cleanCriteria(), 'aquarelle', 0, 2));
  assert.equal(url.searchParams.get('type'), 'Drawing');
  assert.equal(url.searchParams.get('q'), 'watercolor');
});

test('Cleveland : sous-recherche « pastel » = dessins contenant le mot pastel', () => {
  const url = new URL(cma.buildSearchUrl({ ...cleanCriteria(), theme: 'portrait' }, 'pastel', 0, 2));
  assert.equal(url.searchParams.get('type'), 'Drawing');
  assert.equal(url.searchParams.get('q'), 'portrait pastel');
});

test('Cleveland : œuvres sous droits écartées', () => {
  assert.equal(cma.normalize({ ...cmaPainting, share_license_status: 'Copyrighted' }), null);
  assert.equal(cma.normalize({ ...cmaPainting, images: null }), null);
});

test('Cleveland : URL de recherche', () => {
  const url = new URL(cma.buildSearchUrl({ ...cleanCriteria(), theme: 'paysage', epoque: 'baroque' }, 'dessin', 8, 4));
  assert.equal(url.searchParams.get('type'), 'Drawing');
  assert.equal(url.searchParams.get('cc0'), '1');
  assert.equal(url.searchParams.get('q'), 'landscape');
  assert.equal(url.searchParams.get('skip'), '8');
  assert.equal(url.searchParams.get('created_after'), '1600');
  assert.equal(url.searchParams.get('created_before'), '1749');
});

