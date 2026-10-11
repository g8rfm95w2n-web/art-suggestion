// Tests du connecteur SMK, sur de vraies réponses enregistrées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as smk from '../js/connectors/smk.js';
import { cleanCriteria } from '../js/filters.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const [smkPainting, smkDrawing] = fixture('smk-artworks.json');

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
