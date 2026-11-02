/* Synthetic records and a DOM double only. No real card claims or network requests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const data = require('../assets/js/deck-data.js');
const id = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const selected = { id, cardName: 'Fixture Card', requestedFinish: 'foil', guide: '/card/fixture-card/' };
const record = (extra = {}) => ({
  object: 'card', id, name: 'Fixture Card', cmc: 0, type_line: 'Artifact — Test Fixture',
  set: 'tst', set_name: 'Synthetic Test Set', collector_number: '7a', artist: 'Test Artist', lang: 'en',
  released_at: '2000-01-01', finishes: ['nonfoil', 'foil'], oracle_text: 'A synthetic rules line.\nA second fixture line.',
  image_uris: { normal: 'https://cards.scryfall.io/normal/front/test.jpg' },
  scryfall_uri: 'https://scryfall.com/card/tst/7a/fixture-card', ...extra
});
const response = (card = record(), status = 200) => ({ ok: status === 200, status, json: async () => card });

test('empty URL, exact identity and encoded names', () => {
  assert.equal(data.parseSelection(''), null);
  const s = data.parseSelection(`?printing=${id.toUpperCase()}&card=A%26B%20%2F%2F%20C&finish=etched&guide=%2Fcard%2Fa-b-c%2F`);
  assert.equal(s.id, id);
  assert.equal(s.cardName, 'A&B // C');
  assert.equal(s.requestedFinish, 'etched');
  for (const q of ['?card=Only+a+name', '?printing=not-an-id', '?printing=https://evil.example/']) {
    assert.throws(() => data.parseSelection(q), data.SelectionError);
  }
});

test('display model retains zero mana value, exact printing and supplied information', () => {
  const m = data.normaliseCard(record(), selected);
  assert.equal(m.id, id); assert.equal(m.name, 'Fixture Card');
  assert.equal(m.manaValue, '0'); assert.equal(m.setCode, 'TST'); assert.equal(m.collectorNumber, '7a');
  assert.equal(m.artist, 'Test Artist'); assert.equal(m.finishLabel, 'Foil');
  assert.equal(m.summary, 'A synthetic rules line.'); assert.equal(m.guide, '/card/fixture-card/');
  assert.equal(m.oracle, record().oracle_text);
  assert.ok(!('price' in m) && !('legalities' in m) && !('commander' in m));
});

test('unavailable finishes and missing fields are labelled without invented values', () => {
  const m = data.normaliseCard(record({ finishes: ['nonfoil'], cmc: null, artist: '', lang: '', released_at: '' }), selected);
  assert.equal(m.finishLabel, 'Nonfoil'); assert.match(m.finishNotice, /not listed/);
  assert.equal(m.manaValue, 'Not supplied'); assert.equal(m.artist, 'Not supplied');
  const absent = data.normaliseCard(record({ finishes: undefined }), selected);
  assert.equal(absent.finishes, 'Not supplied'); assert.equal(absent.finishLabel, 'Not supplied');
  assert.throws(() => data.normaliseCard(record({ id: id2 }), selected), data.SelectionError);
  assert.throws(() => data.normaliseCard({ object: 'error' }, selected), data.SelectionError);
});

test('two-sided artwork and rules are supported with optional additional information', () => {
  const m = data.normaliseCard(record({ image_uris: undefined, oracle_text: undefined, card_faces: [
    { name: 'Fixture Front', oracle_text: 'Front rules.', image_uris: { normal: 'https://cards.scryfall.io/front.jpg' } },
    { name: 'Fixture Back', oracle_text: 'Back rules.', image_uris: { normal: 'https://cards.scryfall.io/back.jpg' } }
  ] }), selected);
  assert.equal(m.images.length, 2); assert.match(m.oracle, /Back rules/); assert.equal(m.summary, 'Front rules.');
  const long = data.normaliseCard(record({ oracle_text: 'x'.repeat(200) }), selected);
  assert.equal(long.summary.length, 158); assert.ok(long.summary.endsWith('…')); assert.equal(long.oracle.length, 200);
});

test('untrusted image, source and guide URLs are rejected', () => {
  for (const url of ['javascript:alert(1)', 'https://evil.example/a.jpg', 'https://cards.scryfall.io.evil.example/a.jpg', 'http://cards.scryfall.io/a.jpg', 'https://x:y@cards.scryfall.io/a.jpg']) {
    const m = data.normaliseCard(record({ image_uris: { normal: url }, scryfall_uri: url }), { ...selected, guide: 'https://evil.example' });
    assert.deepEqual(m.images, []); assert.equal(m.sourceUrl, ''); assert.equal(m.guide, '');
  }
  assert.equal(data.normaliseCard(record({ name: "Urza's Fixture" }), { ...selected, guide: '/card/urzas-fixture/' }).guide, '/card/urzas-fixture/');
});

test('one exact GET, no search fallback or automatic retry', async () => {
  const calls = [];
  const m = await data.fetchPrinting(selected, { fetchImpl: async (...args) => { calls.push(args); return response(); } });
  assert.equal(m.id, id); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `https://api.scryfall.com/cards/${id}`);
  assert.equal(calls[0][1].headers.Accept, 'application/json'); assert.ok(calls[0][1].signal instanceof AbortSignal);
  let attempted = false;
  await assert.rejects(data.fetchPrinting({ id: 'invalid' }, { fetchImpl: () => { attempted = true; } }), data.SelectionError);
  assert.equal(attempted, false);
});

test('404, rate limit, service failure, bad JSON and wrong identity have clear errors', async () => {
  for (const [status, retryable, text] of [[404, false, /not be found/], [429, true, /too many requests/], [503, true, /could not load/]]) {
    let calls = 0;
    await assert.rejects(data.fetchPrinting(selected, { fetchImpl: async () => { calls++; return response(null, status); } }), e => e.retryable === retryable && text.test(e.message));
    assert.equal(calls, 1);
  }
  await assert.rejects(data.fetchPrinting(selected, { fetchImpl: async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }) }), /unavailable/);
  await assert.rejects(data.fetchPrinting(selected, { fetchImpl: async () => response(record({ id: id2 })) }), /requested printing/);
  await assert.rejects(data.fetchPrinting(selected, { fetchImpl: async () => { throw Error('network'); } }), e => e.retryable && /connection/.test(e.message));
});

test('timeout aborts the request and offers a user-triggered retry', async () => {
  await assert.rejects(data.fetchPrinting(selected, { timeout: 2, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) }), e => e.retryable && /timed out/.test(e.message));
});

function rendererContext(card, pathname) {
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  const deckLink = source.slice(source.indexOf('  function deckLink('), source.indexOf('  function marketplace('));
  const render = source.slice(source.indexOf('  function renderCard('), source.indexOf('  /* ========================================\n     CURRENCY AND PRICE DATA'));
  const registry = new Set([...source.match(/const GUIDE_SLUGS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]));
  const blank = () => '';
  const c = { card, URLSearchParams, GUIDE_SLUGS: registry, window: { location: { pathname } }, ui: { details: { innerHTML: '' } },
    currentCard: null, currentPick: false, slug: x => x.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    esc: x => String(x ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    selectedFinish: c => c.testFinish, previewImage: blank, stat: blank, pretty: blank, finishText: blank, finishLabel: blank,
    treatmentText: blank, legalFormats: blank, oracleHtml: blank, guideLink: blank, marketplace: blank, announce: blank, LANGS: {}, safe: blank };
  vm.createContext(c); vm.runInContext(deckLink + render + '\nrenderCard(card);', c); return c;
}

test('shared renderer provides exact handoff on home, search and guide contexts', () => {
  for (const pathname of ['/', '/?q=Rhystic%20Study', '/card/rhystic-study/']) {
    const c = rendererContext(record({ name: 'Rhystic Study', testFinish: 'etched' }), pathname);
    const html = c.ui.details.innerHTML;
    const href = html.match(/data-build-deck href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const url = new URL(href, 'https://manascout.co.uk');
    assert.equal(url.pathname, '/deck/'); assert.equal(url.searchParams.get('printing'), id);
    assert.equal(url.searchParams.get('card'), 'Rhystic Study'); assert.equal(url.searchParams.get('finish'), 'etched');
    assert.equal(url.searchParams.get('guide'), '/card/rhystic-study/');
    assert.match(html, /data-copy-printing/); assert.match(html, /data-discovery="wild"/);
    c.card = record({ id: id2, name: 'A&B // Fixture', testFinish: 'nonfoil' }); vm.runInContext('renderCard(card);', c);
    const updated = new URL(c.ui.details.innerHTML.match(/data-build-deck href="([^"]+)"/)[1].replace(/&amp;/g, '&'), 'https://manascout.co.uk');
    assert.equal(updated.searchParams.get('printing'), id2); assert.equal(updated.searchParams.get('card'), 'A&B // Fixture');
    assert.equal(updated.searchParams.has('guide'), false);
  }
});

// The controller is exercised with events and a minimal DOM double, not a browser.
function studio({ search = '', narrow = false, card = record(), fail = false } = {}) {
  const elements = new Map(); let document; let calls = 0;
  class Element {
    constructor(id, attrs = '') { this.id = id; this.hidden = /\bhidden\b/.test(attrs); this.disabled = /\bdisabled\b/.test(attrs); this.dataset = {}; this.attrs = {}; this.listeners = {}; this.scrollTop = 0; this.textContent = ''; this.value = ''; this.open = false; this.isConnected = true; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, extra = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn({ target: this, preventDefault() {}, ...extra }))); }
    setAttribute(key, value) { this.attrs[key] = value; } getAttribute(key) { return this.attrs[key]; }
    removeAttribute(key) { delete this.attrs[key]; if (key === 'src') delete this.src; }
    focus() { document.activeElement = this; } contains(el) { return el === this || el?.panel === this.id; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    getBoundingClientRect() { return { left: 800, top: 0, right: 1200, bottom: 800 }; }
    showModal() { this.open = true; } close() { this.open = false; this.emit('close'); }
  }
  const html = fs.readFileSync(path.join(root, 'deck/index.html'), 'utf8');
  for (const m of html.matchAll(/<[a-z][a-z0-9]*\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements.set(m[2], new Element(m[2], m[1]));
  const el = id => elements.get(id);
  const buttons = ['deck', 'discover', 'stats'].map(p => { const e = new Element(p + '-nav'); e.dataset.panel = p; return e; });
  const collapses = ['discover-body', 'stats-body'].map(p => { const e = new Element(p + '-collapse'); e.dataset.collapse = p; return e; });
  const triggers = [new Element('discover-open'), new Element('inspiration-open')];
  triggers[0].panel = 'studio-discover'; triggers[1].panel = 'studio-deck';
  const nav = new Element('nav'); nav.querySelectorAll = () => buttons;
  const skip = new Element('skip'); const nojs = new Element('nojs');
  for (const p of ['deck', 'discover', 'stats']) el(p === 'deck' ? 'deck-heading' : p === 'discover' ? 'discover-heading' : 'stats-heading').panel = 'studio-' + p;
  const body = { classList: { contains: () => true }, dataset: {} };
  document = { body, activeElement: null, getElementById: el, querySelector: q => q === '.ds-mobile-nav' ? nav : q === '.ds-skip' ? skip : q === '.ds-nojs-discover' ? nojs : triggers[1], querySelectorAll: q => q === '[data-collapse]' ? collapses : triggers };
  const media = { matches: narrow, listeners: [], addEventListener(_name, fn) { this.listeners.push(fn); } };
  const api = { ...data, fetchPrinting: s => data.fetchPrinting(s, { fetchImpl: async () => { calls++; if (fail) throw Error('offline'); return response(card); } }) };
  const context = { document, window: { ManaScoutDeckData: api, matchMedia: () => media, location: { search } }, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/deck-studio.js'), 'utf8'), context);
  return { el, buttons, triggers, collapses, body, document, media, calls: () => calls, resize(narrow) { media.matches = narrow; media.listeners.forEach(fn => fn()); } };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test('empty studio makes no data requests; mobile sections retain name and scroll state', async () => {
  const s = studio({ narrow: true });
  assert.equal(s.calls(), 0); assert.equal(s.el('studio-deck').hidden, false); assert.equal(s.el('studio-stats').hidden, true);
  s.el('deck-name').value = 'My temporary name'; s.el('studio-deck').scrollTop = 120;
  await s.buttons[1].emit('click'); assert.equal(s.body.dataset.activePanel, 'discover');
  s.el('studio-discover').scrollTop = 65;
  await s.buttons[0].emit('click'); assert.equal(s.el('deck-name').value, 'My temporary name'); assert.equal(s.el('studio-deck').scrollTop, 120);
  await s.buttons[1].emit('click'); assert.equal(s.el('studio-discover').scrollTop, 65);
  await s.buttons[1].emit('keydown', { key: 'End' }); assert.equal(s.body.dataset.activePanel, 'stats');
  await s.buttons[2].emit('keydown', { key: 'ArrowRight' }); assert.equal(s.body.dataset.activePanel, 'deck');
  await s.buttons[0].emit('keydown', { key: 'Home' }); assert.equal(s.buttons[0].attrs['aria-pressed'], 'true');
});

test('desktop collapse frees column state; mobile expands content without losing it', async () => {
  const s = studio(); await s.collapses[0].emit('click');
  assert.equal(s.body.dataset.discoverCollapsed, 'true'); assert.equal(s.el('discover-body').hidden, true);
  assert.equal(s.collapses[0].attrs['aria-expanded'], 'false');
  s.resize(true); assert.equal(s.el('discover-body').hidden, false); assert.equal(s.body.dataset.discoverCollapsed, 'false');
  s.resize(false); assert.equal(s.el('discover-body').hidden, true); assert.equal(s.el('studio-deck').hidden, false);
});

test('selected printing populates compact details once and closes back to its trigger', async () => {
  const s = studio({ search: `?printing=${id}&card=Ignored+name&finish=foil&guide=/card/fixture-card/` }); await settled();
  assert.equal(s.calls(), 1); assert.equal(s.el('preview-name').textContent, 'Fixture Card');
  assert.equal(s.el('preview-mv').textContent, '0'); assert.match(s.el('preview-printing').textContent, /TST #7a/);
  assert.equal(s.el('preview-artist').textContent, 'Test Artist'); assert.equal(s.el('preview-finish').textContent, 'Foil');
  assert.equal(s.el('preview-guide').href, '/card/fixture-card/'); assert.equal(s.el('card-preview').open, true);
  await s.el('close-preview').emit('click'); assert.equal(s.el('card-preview').open, false); assert.equal(s.document.activeElement, s.triggers[1]);
  await s.triggers[0].emit('click'); await s.el('back-to-workspace').emit('click'); assert.equal(s.document.activeElement, s.triggers[0]);
  await s.buttons[2].emit('click'); await s.buttons[0].emit('click'); assert.equal(s.calls(), 1); assert.equal(s.el('preview-id').textContent, id);
  await s.el('preview-image').emit('error'); assert.equal(s.el('preview-image').hidden, true); assert.match(s.el('image-status').textContent, /could not load/);
});

test('API text is assigned literally; missing artwork is explicit and two faces can switch', async () => {
  const s = studio({ search: `?printing=${id}`, card: record({ name: '<img src=x onerror=alert(1)>', image_uris: undefined, card_faces: [] }) }); await settled();
  assert.equal(s.el('preview-name').textContent, '<img src=x onerror=alert(1)>'); assert.equal(s.el('preview-image').hidden, true); assert.match(s.el('image-status').textContent, /No artwork/);
  const t = studio({ search: `?printing=${id}`, card: record({ image_uris: undefined, card_faces: [
    { name: 'Test front', image_uris: { normal: 'https://cards.scryfall.io/front.jpg' } },
    { name: 'Test back', image_uris: { normal: 'https://cards.scryfall.io/back.jpg' } }
  ] }) }); await settled(); await t.el('flip-preview').emit('click');
  assert.equal(t.el('preview-image').src, 'https://cards.scryfall.io/back.jpg'); assert.equal(t.el('flip-preview').textContent, 'View front face');
});

test('invalid handoff requests nothing; network error leaves workspace and explicit retry', async () => {
  const s = studio({ search: '?printing=invalid' }); assert.equal(s.calls(), 0); assert.equal(s.el('selection-error').hidden, false); assert.equal(s.el('retry-printing').hidden, true);
  const t = studio({ search: `?printing=${id}`, fail: true }); await settled();
  assert.equal(t.el('selection-error').hidden, false); assert.equal(t.el('retry-printing').hidden, false); assert.equal(t.el('studio-deck').hidden, false);
  assert.equal(t.el('card-preview').open, false); assert.equal(t.calls(), 1);
  await t.el('retry-printing').emit('click'); assert.equal(t.calls(), 2);
});
