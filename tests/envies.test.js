// Tests de la recherche par « envie » (dictionnaire local).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEnvie, normalize, ENVIES } from '../js/envies.js';
import { THEMES, EPOQUES, SUPPORTS } from '../js/filters.js';
import { LEVELS } from '../js/analysis.js';

test('normalize retire accents, majuscules et ponctuation', () => {
  assert.equal(normalize("Lumière CHAUDE, l'été !"), 'lumiere chaude l ete');
});

test('exemple complet : paisible + eau + dessin', () => {
  const r = parseEnvie("J'ai envie de dessiner quelque chose de paisible avec de l'eau");
  assert.deepEqual(r.criteria, { theme: '', epoque: '', support: 'dessin', motcle: 'calm water' });
  assert.deepEqual(r.unknown, []);
});

test('expressions de plusieurs mots reconnues avant les mots seuls', () => {
  const r = parseEnvie('une lumière chaude');
  assert.equal(r.criteria.motcle, 'sunset'); // et pas « sunlight » via « lumière »
  assert.equal(parseEnvie('une nature morte').criteria.theme, 'nature-morte');
});

test('pluriels et accents', () => {
  assert.equal(parseEnvie('des Fleurs').criteria.theme, 'fleurs');
  assert.equal(parseEnvie('forêts').criteria.theme, 'arbres');
});

test('négation : « pas trop dur » → débutant, « dur » → avancé', () => {
  assert.equal(parseEnvie('un dessin pas trop dur').niveau, 'debutant');
  assert.equal(parseEnvie('quelque chose de dur').niveau, 'avance');
});

test('dramatique → baroque, simple → débutant', () => {
  const r = parseEnvie('dramatique mais simple');
  assert.equal(r.criteria.epoque, 'baroque');
  assert.equal(r.niveau, 'debutant');
});

test('le premier thème reconnu l’emporte, et 2 mots-clés au plus', () => {
  const r = parseEnvie('mer et fleurs, nuit, hiver, orage');
  assert.equal(r.criteria.theme, 'marine');
  assert.equal(r.criteria.motcle, 'moonlight winter');
  assert.ok(!r.understood.some((u) => u.mot === 'fleurs'), 'thème ignoré non annoncé');
});

test('texte vide ou inconnu : aucun filtre', () => {
  const r = parseEnvie('xyzzy');
  assert.deepEqual(r.criteria, { theme: '', epoque: '', support: '', motcle: '' });
  assert.deepEqual(r.unknown, ['xyzzy']);
});

test('le dictionnaire ne référence que des filtres existants', () => {
  const valid = { theme: THEMES, epoque: EPOQUES, support: SUPPORTS, niveau: LEVELS };
  for (const { mots, effet } of ENVIES) {
    for (const [key, value] of Object.entries(effet)) {
      if (key === 'motcle') assert.match(value, /^[a-z]+$/, `${mots[0]} : mot-clé invalide`);
      else assert.ok(value in valid[key], `${mots[0]} : ${key}=${value} inconnu`);
    }
  }
});
