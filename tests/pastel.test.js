// Règle « les œuvres en couleur (pastel, aquarelle, gouache…) sont de la peinture »,
// commune à toutes les sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isPastel, isPainted, isColourMedium, searchBySupport } from '../js/connectors/shared.js';
import * as met from '../js/connectors/met.js';
import * as smk from '../js/connectors/smk.js';
import { cleanCriteria } from '../js/filters.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('isPastel reconnaît le pastel en anglais et en danois', () => {
  assert.ok(isPastel('Pastel on paper'));
  assert.ok(isPastel('Charcoal and unfixed pastel on paper'));
  assert.ok(isPastel('Pastelkridt på karton'));
  assert.ok(!isPastel('Oil on canvas'));
  assert.ok(!isPastel(''));
  assert.ok(!isPastel(undefined));
});

test('isPainted : aquarelle, gouache, huile… dans les 4 langues', () => {
  // L'exemple qui a motivé la règle (Gavarni, Mia) :
  assert.ok(isPainted('Black and red chalks heightened with watercolor and gouache'));
  assert.ok(isPainted('Opaque watercolor on paper'));
  assert.ok(isPainted('Akvarel og gouache'));
  assert.ok(isPainted('waterverf, dekverf'));
  assert.ok(isPainted('huile sur toile'));
  assert.ok(isPainted('pierre noire, plume en brun, pinceau en couleurs')); // Rijksmuseum
  assert.ok(!isPainted('crayons de couleur'));
  assert.ok(isPainted('Oil on canvas'));
  assert.ok(!isPainted('Pen and brown ink'));
  assert.ok(!isPainted('Graphite on wove paper'));
  assert.ok(!isPainted('Brush and brown wash')); // le lavis est de l'encre diluée
});

test('isPainted : de simples rehauts de gouache blanche restent un dessin', () => {
  assert.ok(!isPainted('Brush and brown wash, highlighted with white gouache, on gray-green prepared paper'));
  assert.ok(!isPainted('pierre noire, rehauts de gouache blanche'));
  assert.ok(!isColourMedium('Black chalk, heightened with white bodycolor'));
  // … mais des rehauts blancs AVEC de l'aquarelle : peinture
  assert.ok(isPainted('Graphite, watercolor, heightened with white gouache'));
});

test('chaque connecteur classe un pastel en peinture', () => {
  const metDrawing = fixture('met-drawing.json');
  assert.equal(met.normalize({ ...metDrawing, medium: 'Pastel on blue paper' }).type, 'peinture');
  assert.equal(met.normalize({ ...metDrawing, classification: 'Pastels', medium: 'Chalk' }).type, 'peinture');
  const [, smkDrawing] = fixture('smk-artworks.json');
  assert.equal(smk.normalize({ ...smkDrawing, techniques: ['Pastelkridt på karton'] }).type, 'peinture');
  assert.equal(smk.normalize({ ...smkDrawing, object_names: [{ name: 'Pastel' }] }).type, 'peinture');
});

// Fausse API : pour chaque sorte demandée, une œuvre attendue et un intrus
// (mal classé), pour vérifier le tri fait par searchBySupport.
const SAMPLE = {
  peinture: ['oil on canvas', 'oil on canvas'],
  pastel: ['pastel on paper', 'oil on canvas'],
  aquarelle: ['watercolor on paper', 'pen and ink'],
  dessin: ['pen and ink', 'pastel and charcoal'],
};
function fakeFetch(calls) {
  return async (kind, offset, limit) => {
    calls.push({ kind, offset, limit });
    const [ok, intruder] = SAMPLE[kind];
    return { total: 100, items: [{ id: `${kind}-ok`, medium: ok }, { id: `${kind}-intrus`, medium: intruder }] };
  };
}

test('« Peinture » cherche aussi pastels et aquarelles ; « Dessin » les exclut', async () => {
  let calls = [];
  const peinture = await searchBySupport({ ...cleanCriteria(), support: 'peinture' }, 0, 8, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['peinture', 'pastel', 'aquarelle']);
  // Les peintures ont une plus grande part de la page
  assert.ok(calls[0].limit > calls[1].limit);
  assert.deepEqual(peinture.items.map((a) => a.id).sort(),
    ['aquarelle-ok', 'pastel-ok', 'peinture-intrus', 'peinture-ok'].sort());

  calls = [];
  const dessin = await searchBySupport({ ...cleanCriteria(), support: 'dessin' }, 0, 6, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['dessin']);
  assert.deepEqual(dessin.items.map((a) => a.id), ['dessin-ok']); // le pastel est retiré
});

test('sans support choisi : quatre sous-recherches, pages successives sans chevauchement', async () => {
  const calls = [];
  await searchBySupport(cleanCriteria(), 2, 6, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['peinture', 'pastel', 'aquarelle', 'dessin']);
  for (const c of calls) assert.equal(c.offset, 2 * c.limit);
});
