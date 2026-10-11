// Règle « les pastels sont de la peinture », commune à toutes les sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isPastel, searchBySupport } from '../js/connectors/shared.js';
import * as aic from '../js/connectors/aic.js';
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

test('chaque connecteur classe un pastel en peinture', () => {
  const [, aicDrawing] = fixture('aic-artworks.json').data;
  assert.equal(aic.normalize({ ...aicDrawing, medium_display: 'Pastel on paper' }).type, 'peinture');
  const metDrawing = fixture('met-drawing.json');
  assert.equal(met.normalize({ ...metDrawing, medium: 'Pastel on blue paper' }).type, 'peinture');
  assert.equal(met.normalize({ ...metDrawing, classification: 'Pastels', medium: 'Chalk' }).type, 'peinture');
  const [, smkDrawing] = fixture('smk-artworks.json');
  assert.equal(smk.normalize({ ...smkDrawing, techniques: ['Pastelkridt på karton'] }).type, 'peinture');
  assert.equal(smk.normalize({ ...smkDrawing, object_names: [{ name: 'Pastel' }] }).type, 'peinture');
});

// Fausse API : renvoie, pour chaque sorte demandée, des œuvres dont une
// mal classée, pour vérifier le tri fait par searchBySupport.
function fakeFetch(calls) {
  return async (kind, offset, limit) => {
    calls.push({ kind, offset, limit });
    const items = [
      { id: `${kind}-ok`, medium: kind === 'pastel' ? 'pastel on paper' : 'pen and ink' },
      { id: `${kind}-intrus`, medium: kind === 'pastel' ? 'oil on canvas' : 'pastel and charcoal' },
    ];
    return { total: 100, items };
  };
}

test('« Peinture » cherche aussi les pastels ; « Dessin » les exclut', async () => {
  let calls = [];
  const peinture = await searchBySupport({ ...cleanCriteria(), support: 'peinture' }, 0, 6, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['peinture', 'pastel']);
  // Les peintures ont une plus grande part de la page que les pastels
  assert.ok(calls[0].limit > calls[1].limit);
  assert.deepEqual(peinture.items.map((a) => a.id), ['peinture-ok', 'pastel-ok', 'peinture-intrus']);

  calls = [];
  const dessin = await searchBySupport({ ...cleanCriteria(), support: 'dessin' }, 0, 6, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['dessin']);
  assert.deepEqual(dessin.items.map((a) => a.id), ['dessin-ok']); // le pastel est retiré
});

test('sans support choisi : trois sous-recherches, pages successives sans chevauchement', async () => {
  const calls = [];
  await searchBySupport(cleanCriteria(), 2, 6, fakeFetch(calls));
  assert.deepEqual(calls.map((c) => c.kind), ['peinture', 'pastel', 'dessin']);
  for (const c of calls) assert.equal(c.offset, 2 * c.limit);
});
