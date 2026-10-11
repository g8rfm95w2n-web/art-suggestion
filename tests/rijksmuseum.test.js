// Tests du connecteur Rijksmuseum, sur de vraies fiches Linked Art (allégées).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as rk from '../js/connectors/rijksmuseum.js';
import { cleanCriteria } from '../js/filters.js';

const [painting, drawing, attributed] = JSON.parse(
  readFileSync(new URL('./fixtures/rijks-objects.json', import.meta.url), 'utf8'),
);
const image = { iiif: 'https://iiif.micr.io/hodeb', publicDomain: true };

test('Rijksmuseum : peinture normalisée (titre et technique en anglais)', () => {
  const art = rk.normalize(painting, image, 'peinture');
  assert.equal(art.id, 'rijks:200106038');
  assert.equal(art.title, 'The Stone Bridge');
  assert.equal(art.artist, 'Rembrandt van Rijn');
  assert.equal(art.year, 1638);
  assert.equal(art.date, 'c. 1638');
  assert.equal(art.medium, 'oil on panel');
  assert.equal(art.type, 'peinture');
  assert.equal(art.thumbUrl, 'https://iiif.micr.io/hodeb/full/400,/0/default.jpg');
  assert.equal(art.imageUrl, 'https://iiif.micr.io/hodeb/full/1200,/0/default.jpg');
  assert.equal(art.pageUrl, 'https://www.rijksmuseum.nl/en/collection/SK-A-1935');
});

test('Rijksmuseum : dessin, technique traduite du néerlandais', () => {
  const art = rk.normalize(drawing, image, 'dessin');
  assert.equal(art.type, 'dessin');
  assert.equal(art.medium, 'plume et pinceau en gris');
});

test('Rijksmuseum : œuvre attribuée → mention de l\'auteur', () => {
  assert.match(rk.normalize(attributed, image).artist, /^Aert van der Neer/);
});

test('Rijksmuseum : image hors domaine public ou absente écartée', () => {
  assert.equal(rk.normalize(painting, { ...image, publicDomain: false }), null);
  assert.equal(rk.normalize(painting, { iiif: '', publicDomain: true }), null);
});

test('Rijksmuseum : traduction des techniques', () => {
  assert.equal(rk.translateMedium('olieverf op koper'), 'huile sur cuivre');
  assert.equal(rk.translateMedium('potlood, zwart krijt, pastel'), 'crayon, pierre noire, pastel');
  assert.equal(rk.translateMedium('pastel in kleuren'), 'pastel coloré');
});

test('Rijksmuseum : URL de recherche (type, thème, époque, pastel)', () => {
  const url = new URL(rk.buildSearchUrl({ ...cleanCriteria(), theme: 'paysage', epoque: 'baroque' }, 'peinture'));
  assert.equal(url.searchParams.get('type'), 'painting');
  assert.equal(url.searchParams.get('imageAvailable'), 'true');
  assert.equal(url.searchParams.get('title'), 'landscape');
  assert.equal(url.searchParams.get('creationDate'), '16??');
  const pastel = new URL(rk.buildSearchUrl(cleanCriteria(), 'pastel'));
  assert.equal(pastel.searchParams.get('type'), 'drawing');
  assert.equal(pastel.searchParams.get('material'), 'pastel');
});

test('Rijksmuseum : pagination par jetons et filtre exact de l\'époque', async () => {
  // Fausse API : 2 pages de 100 identifiants chaînées par un jeton, et des
  // fiches datées de 1800 + n (pour vérifier le filtre 1850–1899).
  const realFetch = globalThis.fetch;
  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'data.rijksmuseum.nl') {
      const page = u.searchParams.get('pageToken') === 'P2' ? 1 : 0;
      return json({
        partOf: { totalItems: 200 },
        orderedItems: Array.from({ length: 100 }, (_, i) => ({ id: `https://id.rijksmuseum.nl/9${page * 100 + i}` })),
        next: page === 0 ? { id: `${u.origin}${u.pathname}?pageToken=P2` } : undefined,
      });
    }
    if (u.pathname.startsWith('/visual/')) return json({ subject_to: 'Public Domain', digitally_shown_by: [{ id: 'https://id.rijksmuseum.nl/digital/x' }] });
    if (u.pathname.startsWith('/digital/')) return json({ access_point: [{ id: 'https://iiif.micr.io/abc/full/max/0/default.jpg' }] });
    const n = Number(u.pathname.slice(2)); // /9<n>
    return json({
      id: url, shows: [{ id: 'https://id.rijksmuseum.nl/visual/x' }],
      identified_by: [{ type: 'Name', content: `Œuvre ${n}` }],
      produced_by: { timespan: { begin_of_the_begin: `${1800 + (n % 100)}-01-01T00:00:00Z` } },
    });
  };
  try {
    // Page 25 (4 par page) = identifiants 100 à 103 : deuxième page de l'API.
    const r = await rk.search({ ...cleanCriteria(), support: 'dessin', epoque: 'impressionnisme' }, 25, 4);
    assert.equal(r.total, 200);
    assert.deepEqual(r.items.map((a) => a.title), []); // 1800–1803 : hors de 1850–1899
    const r2 = await rk.search({ ...cleanCriteria(), support: 'dessin', epoque: 'impressionnisme' }, 38, 4);
    assert.deepEqual(r2.items.map((a) => a.year), [1852, 1853, 1854, 1855]); // ids 152–155
  } finally {
    globalThis.fetch = realFetch;
  }
});
