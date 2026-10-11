// Tests de la normalisation des connecteurs.
// Lancement : node --test        (Node 18+, aucune dépendance à installer)
//
// Les fixtures (tests/fixtures/*.json) sont de vraies réponses des API,
// enregistrées une fois : les tests ne font aucun appel réseau.
// Équivalent Python : pytest avec des fichiers JSON de référence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as met from '../js/connectors/met.js';
import * as smk from '../js/connectors/smk.js';
import * as mia from '../js/connectors/mia.js';
import { cleanCriteria } from '../js/filters.js';
import { interleave } from '../js/utils.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const metPainting = fixture('met-painting.json');
const metDrawing = fixture('met-drawing.json');

// ------------------------------------------------------------ Contrat commun

const EXPECTED_KEYS = [
  'id', 'source', 'sourceLabel', 'title', 'artist', 'date', 'year', 'medium',
  'type', 'thumbUrl', 'imageUrl', 'hdUrl', 'pageUrl', 'tags',
].sort();

test('tous les connecteurs renvoient exactement le format commun', () => {
  const cases = [
    met.normalize(metPainting), met.normalize(metDrawing),
    ...fixture('smk-artworks.json').map(smk.normalize),
    ...fixture('mia-objects.json').map(mia.normalize),
  ];
  for (const art of cases) {
    assert.deepEqual(Object.keys(art).sort(), EXPECTED_KEYS);
    assert.match(art.id, /^(met|smk|mia):\S/);
    assert.ok(['peinture', 'dessin', 'autre'].includes(art.type));
    for (const key of ['thumbUrl', 'imageUrl', 'hdUrl', 'pageUrl']) {
      assert.match(art[key], /^https:\/\//, `${art.id}.${key} doit être une URL https`);
    }
    assert.ok(Array.isArray(art.tags));
    assert.ok(art.tags.every((t) => t === t.toLowerCase()), 'tags en minuscules');
    assert.equal(new Set(art.tags).size, art.tags.length, 'tags sans doublon');
    assert.ok(art.year === null || Number.isInteger(art.year));
  }
});

// ------------------------------------------------------------ Met

test('Met : peinture normalisée', () => {
  const art = met.normalize(metPainting);
  assert.equal(art.id, 'met:436535');
  assert.equal(art.title, 'Wheat Field with Cypresses');
  assert.equal(art.artist, 'Vincent van Gogh');
  assert.equal(art.date, '1889');
  assert.equal(art.year, 1889);
  assert.equal(art.type, 'peinture');
  assert.equal(art.thumbUrl, metPainting.primaryImageSmall);
  assert.equal(art.hdUrl, metPainting.primaryImage);
  assert.equal(art.pageUrl, 'https://www.metmuseum.org/art/collection/search/436535');
  assert.deepEqual(art.tags, ['landscapes', 'cypresses', 'summer']);
});

test('Met : dessin reconnu comme tel', () => {
  assert.equal(met.normalize(metDrawing).type, 'dessin');
});

test('Met : œuvres sous droits ou sans image écartées', () => {
  assert.equal(met.normalize({ ...metPainting, isPublicDomain: false }), null);
  assert.equal(met.normalize({ ...metPainting, primaryImageSmall: '' }), null);
  assert.equal(met.normalize(null), null); // objet supprimé (404)
});

test('Met : valeurs de repli (date inconnue, artiste anonyme, pas de tags)', () => {
  const art = met.normalize({
    ...metPainting, objectDate: '', objectBeginDate: 0,
    artistDisplayName: '', culture: 'Japan', tags: null,
  });
  assert.equal(art.year, null);
  assert.equal(art.artist, 'Japan');
  assert.deepEqual(art.tags, []);
});

test('Met : URL de recherche v1.1 avec filtres', () => {
  const url = new URL(met.buildSearchUrl({ theme: 'nature-morte', epoque: 'baroque', support: '' }, 'Paintings', 12, 6));
  assert.equal(url.pathname, '/public/collection/v1.1/search');
  assert.equal(url.searchParams.get('q'), 'still life');
  assert.equal(url.searchParams.get('medium'), 'Paintings');
  assert.equal(url.searchParams.get('hasImages'), 'true');
  assert.equal(url.searchParams.get('offset'), '12');
  assert.equal(url.searchParams.get('dateBegin'), '1600');
  assert.equal(url.searchParams.get('dateEnd'), '1749');
});

test('Met : thème et mot-clé combinés dans q', () => {
  const url = new URL(met.buildSearchUrl({ ...cleanCriteria(), theme: 'paysage', motcle: 'sunset' }, 'Paintings', 0, 6));
  assert.equal(url.searchParams.get('q'), 'landscape sunset');
});

test('Met : sans thème, on cherche « * »', () => {
  const url = new URL(met.buildSearchUrl(cleanCriteria(), 'Drawings', 0, 6));
  assert.equal(url.searchParams.get('q'), '*');
  assert.equal(url.searchParams.has('dateBegin'), false);
});

// ------------------------------------------------------------ Utilitaires

test('cleanCriteria ignore les valeurs inconnues', () => {
  assert.deepEqual(
    cleanCriteria({ theme: 'paysage', epoque: 'nimporte', support: '<script>', motcle: 'a"b' }),
    { theme: 'paysage', epoque: '', support: '', motcle: '' },
  );
});

test('interleave alterne les listes de longueurs différentes', () => {
  assert.deepEqual(interleave([[1, 2, 3], ['a']]), [1, 'a', 2, 3]);
  assert.deepEqual(interleave([]), []);
});
