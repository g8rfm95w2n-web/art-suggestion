// Tests des connecteurs Cleveland et SMK, sur de vraies réponses enregistrées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as cma from '../js/connectors/cleveland.js';
import * as smk from '../js/connectors/smk.js';
import { cleanCriteria } from '../js/filters.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const [cmaPainting, cmaDrawing] = fixture('cma-artworks.json');
const [smkPainting, smkDrawing] = fixture('smk-artworks.json');

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

// ------------------------------------------------------------ SMK

test('SMK : peinture normalisée, titre français préféré', () => {
  const art = smk.normalize(smkPainting);
  assert.equal(art.id, 'smk:KMSr27');
  assert.equal(art.title, 'Portrait de Madame Derain');
  assert.equal(art.artist, 'André Derain'); // « Derain, André » remis dans l'ordre
  assert.equal(art.year, 1923);
  assert.equal(art.medium, 'Huile sur toile'); // traduit du danois
  assert.equal(art.type, 'peinture');
  assert.match(art.thumbUrl, /\/full\/!400,\//); // vignette plus légère
  assert.match(art.imageUrl, /\/full\/!1024,\//);
});

test('SMK : dessin avec un numéro contenant « / »', () => {
  const art = smk.normalize(smkDrawing);
  assert.equal(art.id, 'smk:KKSgb6775/3');
  assert.equal(art.type, 'dessin');
  assert.equal(art.title, 'Den hollandske flåde på Københavns Red 1658'); // pas de titre français
  assert.match(art.pageUrl, /KKSgb6775%2F3$/);
});

test('SMK : œuvres sous droits ou sans image écartées', () => {
  assert.equal(smk.normalize({ ...smkPainting, public_domain: false }), null);
  assert.equal(smk.normalize({ ...smkPainting, image_thumbnail: null }), null);
});

test('SMK : traduction des techniques mot à mot', () => {
  assert.equal(smk.translateTechnique('olie på papir, klæbet på lærred'), 'huile sur papier, collé sur toile');
  assert.equal(smk.translateTechnique('Pen og brunt blæk'), 'Plume et encre brune'); // expression d'abord
  assert.equal(smk.translateTechnique('Pensel og tusch'), 'Pinceau et encre de Chine');
  assert.equal(smk.translateTechnique('mot inconnu'), 'mot inconnu');
});

test('SMK : URL de recherche (filtres, plage de dates)', () => {
  const url = new URL(smk.buildSearchUrl({ ...cleanCriteria(), epoque: 'renaissance' }, 'peinture', 0, 4));
  assert.equal(url.searchParams.get('keys'), '*');
  assert.equal(url.searchParams.get('filters'), '[public_domain:true],[has_image:true],[object_names:maleri]');
  assert.equal(url.searchParams.get('range'), '[production_dates_start:{1400-01-01T00:00:00Z;1599-12-31T23:59:59Z}]');
  assert.ok(!url.searchParams.get('fields').includes('frontend_url'), 'champ qui provoque une erreur 500');
});
