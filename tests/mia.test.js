// Tests du connecteur Minneapolis Institute of Art, sur de vraies fiches enregistrées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as mia from '../js/connectors/mia.js';
import { cleanCriteria } from '../js/filters.js';

const [painting, pastel, drawing] = JSON.parse(
  readFileSync(new URL('./fixtures/mia-objects.json', import.meta.url), 'utf8'),
);

test('Mia : peinture normalisée', () => {
  const art = mia.normalize(painting);
  assert.equal(art.id, 'mia:5747');
  assert.equal(art.title, 'Pastoral Landscape');
  assert.equal(art.artist, 'Claude Gellée (called Le Lorrain)');
  assert.equal(art.year, 1638);
  assert.equal(art.type, 'peinture');
  assert.equal(art.thumbUrl, 'https://1.api.artsmia.org/5747.jpg');
  assert.equal(art.imageUrl, 'https://1.api.artsmia.org/800/5747.jpg');
  assert.equal(art.hdUrl, 'https://1.api.artsmia.org/full/5747.jpg');
  assert.equal(art.pageUrl, 'https://collections.artsmia.org/art/5747');
});

test('Mia : un pastel classé « Drawings » devient une peinture', () => {
  assert.equal(pastel.classification, 'Drawings');
  const art = mia.normalize(pastel);
  assert.equal(art.type, 'peinture');
  assert.equal(art.year, 1868); // « 1868–69 » → 1868
});

test('Mia : miniature « Opaque colors on paper » classée Drawings = peinture, date approximative', () => {
  assert.equal(drawing.classification, 'Drawings');
  const art = mia.normalize(drawing);
  assert.equal(art.type, 'peinture'); // gouache opaque : une peinture sur papier
  assert.equal(art.year, 1720); // « c. 1720 »
});

test('Mia : un vrai dessin reste un dessin', () => {
  assert.equal(mia.normalize({ ...drawing, medium: 'Black chalk on paper' }).type, 'dessin');
});

test('Mia : œuvres sous droits ou sans image écartées', () => {
  assert.equal(mia.normalize({ ...painting, rights_type: 'In Copyright' }), null);
  assert.equal(mia.normalize({ ...painting, image: 'invalid' }), null);
  assert.equal(mia.normalize(null), null);
});

test('Mia : requête Lucene (support, époque, thème, mot-clé)', () => {
  const q = mia.buildQuery({ ...cleanCriteria(), theme: 'nature-morte', epoque: 'baroque', motcle: 'winter' }, 'peinture');
  assert.equal(q, 'rights_type:"Public Domain" AND image:valid AND public_access:1 AND classification:Paintings'
    + ' AND dated:[1600 TO 1749] AND still AND life AND winter');
});

test('Mia : sous-recherche pastel, et URL paginée', () => {
  assert.match(mia.buildQuery(cleanCriteria(), 'pastel'), /classification:Drawings AND medium:pastel$/);
  const url = new URL(mia.buildSearchUrl(cleanCriteria(), 'dessin', 8, 4));
  assert.equal(url.origin, 'https://search.artsmia.org');
  assert.equal(url.searchParams.get('from'), '8');
  assert.equal(url.searchParams.get('size'), '4');
});
