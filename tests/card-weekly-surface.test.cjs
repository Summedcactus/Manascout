const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const printing = require('../assets/js/printing-presentation.js');
const cards = require('./fixtures/phase10-printings.json');

const specialFinishes = {
  surgefoil: 'Surge Foil', galaxyfoil: 'Galaxy Foil', halofoil: 'Halo Foil',
  confettifoil: 'Confetti Foil', textured: 'Textured Foil', rainbowfoil: 'Rainbow Foil',
  stepandcompleat: 'Step-and-Compleat Foil'
};
const css = fs.readFileSync('assets/css/printing-presentation.css', 'utf8');
for (const [value, label] of Object.entries(specialFinishes)) test(`${label} requires a verified foil treatment and gets its own paint`, () => {
  const card = { finishes: ['nonfoil', 'foil'], promo_types: [value] };
  assert.equal(printing.defaultFinish(card), 'nonfoil');
  assert.equal(printing.surface(card, 'nonfoil'), 'nonfoil');
  assert.equal(printing.surface(card, 'foil'), value);
  assert.equal(printing.finishLabel('foil', card), label);
  assert.equal(printing.surface({ ...card, promo_types: [] }, 'foil'), 'foil');
  const rule = css.match(new RegExp(`\\[data-surface="${value}"\\]\\s+\\.ms-physical-reflection\\s*{([^}]+)}`));
  assert.match(rule[1], /background:/);
});

test('etching, classic foil, unavailable finishes and conflicting metadata remain distinct', () => {
  assert.equal(printing.surface(cards[6], 'etched'), 'etched');
  assert.equal(printing.surface(cards[6], 'foil'), 'unavailable');
  assert.equal(printing.surface(cards[4], 'foil'), 'foil');
  assert.equal(printing.surface({ finishes: ['foil'], promo_types: ['surgefoil', 'galaxyfoil'] }, 'foil'), 'foil');
  assert.equal(printing.language('JA'), 'Japanese');
  assert.equal(printing.language('en'), 'English');
  assert.equal(printing.printing(cards[6]), 'Secret Lair Drop · SLD #1117');
});

test('only differing verified collector attributes are shown and artwork IDs stay internal', () => {
  const result = printing.differences(cards.slice(2, 4).map(card => ({ card, finish: 'foil' })));
  assert.deepEqual(result.map(({ label }) => label), ['Set / Collector Number', 'Selected Finish']);
  assert.deepEqual(result[1].values, ['Traditional Foil', 'Surge Foil']);
  const variations = printing.differences(cards.slice(1, 4).map(card => ({ card, finish: 'foil' })));
  assert.deepEqual(variations.find(({ label }) => label === 'Artwork').values, ['Artwork 1', 'Artwork 2', 'Artwork 2']);
  assert.doesNotMatch(JSON.stringify(variations), /[\da-f]{8}-[\da-f]{4}-/);
});

test('reference prices come from available finish fields and retain source currencies', () => {
  const card = { finishes: ['foil', 'etched'], prices: { usd: '2.00', usd_foil: null, eur_foil: '5.20', usd_etched: '9.95' } };
  assert.deepEqual(printing.prices(card, 'nonfoil'), []);
  assert.deepEqual(printing.prices(card, 'foil'), ['€5.20 EUR']);
  assert.deepEqual(printing.prices(card, 'etched'), ['$9.95 USD']);
});

test('the same rounded face contains card art, reflection and edge paint', () => {
  const html = printing.markup({ card: cards[3], finish: 'foil', src: cards[3].image_uris.normal, alt: 'Exact Spock artwork', compact: true });
  assert.match(html, /data-compact[\s\S]*ms-physical-shell[\s\S]*ms-physical-face[\s\S]*<img[\s\S]*width="488" height="680"[\s\S]*ms-physical-reflection" aria-hidden="true"[\s\S]*ms-physical-edge" aria-hidden="true"/);
  assert.match(css, /\.ms-physical-face\s*{[^}]+aspect-ratio: 488 \/ 680[^}]+overflow: hidden[^}]+clip-path: inset/);
  assert.match(css, /touch-action: pan-y pinch-zoom/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(printing.markup({ card: cards[3], finish: 'foil', src: 'https://example.net/card.jpg' }), /<img/);
});
