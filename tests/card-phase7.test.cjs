const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { interpret, makeSetIndex } = require("../assets/js/search-intent.js");
const { createTracker } = require("../assets/js/analytics.js");
const sets = makeSetIndex([
  { code: "j25", name: "Foundations Jumpstart" }, { code: "mh3", name: "Modern Horizons 3" },
  { code: "dmu", name: "Dominaria United" }, { code: "hob", name: "A catalogue set" },
  { code: "lea", name: "Limited Edition Alpha" }, { code: "dig", name: "Digital Set", digital: true }
]);
const langs = { en: "English", ja: "Japanese", de: "German", ph: "Phyrexian" };
const parse = (input, filters) => interpret(input, filters, sets, langs);

for (const [input, category, name, criteria] of [
  ["Sol Ring", "name", "Sol Ring", {}],
  ["Soll Ring", "name", "Soll Ring", {}],
  ["J25 35", "exact_printing", "", { set: "j25", collector_number: "35" }],
  ["J25 #35", "exact_printing", "", { set: "j25", collector_number: "35" }],
  ["j25 35", "exact_printing", "", { set: "j25", collector_number: "35" }],
  ["MH3 383", "exact_printing", "", { set: "mh3", collector_number: "383" }],
  ["DMU 107", "exact_printing", "", { set: "dmu", collector_number: "107" }],
  ["Cynette J25 35", "exact_printing", "Cynette", { set: "j25", collector_number: "35" }],
  ["Sheoldred DMU 107", "exact_printing", "Sheoldred", { set: "dmu", collector_number: "107" }],
  ["Sheoldred DMU", "combined", "Sheoldred", { set: "dmu" }],
  ["Sheoldred #107", "combined", "Sheoldred", { collector_number: "107" }],
  ["Sol Ring LEA", "combined", "Sol Ring", { set: "lea" }],
  ["Sol Ring Alpha", "combined", "Sol Ring", { set: "lea" }],
  ["DMU #107 Japanese", "exact_printing", "", { set: "dmu", collector_number: "107", language: "ja" }],
  ["#35", "collector_number", "", { collector_number: "35" }],
  ["collector 35", "collector_number", "", { collector_number: "35" }],
  ["MH3", "set", "", { set: "mh3" }],
  ["Modern Horizons 3", "set", "", { set: "mh3" }],
  ["mythic", "rarity", "", { rarity: "mythic" }],
  ["mythic dragon", "combined", "", { rarity: "mythic", type: "dragon" }],
  ["rare goblin", "combined", "", { rarity: "rare", type: "goblin" }],
  ["mythic HOB", "combined", "", { rarity: "mythic", set: "hob" }],
  ["Jellyfish", "type", "", { type: "jellyfish" }],
  ["legendary vampire", "type", "", { type: "legendary vampire" }],
  ["blue jellyfish", "combined", "", { colour: "u", type: "jellyfish" }],
  ["Goblin commander", "combined", "", { type: "goblin", commander: true }],
  ["artist:Mark Poole", "artist", "", { artist: "Mark Poole" }],
  ["etched", "combined", "", { finish: "etched" }],
  ["Phyrexian language", "combined", "", { language: "ph" }]
]) {
  test(`interprets ${input}`, () => {
    const result = parse(input);
    assert.equal(result.category, category);
    assert.equal(result.cardName, name);
    assert.deepEqual(result.criteria, criteria);
    if (category === "collector_number") assert.equal(Boolean(result.lookup), false);
  });
}

test("advanced filters combine, set codes come from the paper index and user operators stay inside literals", () => {
  const result = parse("", { set: "Modern Horizons 3", rarity: "rare", collector_number: "#383",
    colour: "u", type: "Legendary Jellyfish", artist: 'Mark Poole" OR set:lea', finish: "foil", language: "ja" });
  assert.equal(result.query, 'game:paper lang:ja set:mh3 cn="383" r:rare c:u t:"Legendary" t:"Jellyfish" a:"Mark Poole OR set lea" finish:foil');
  assert.throws(() => parse("", { set: "dig" }), /Set not found/);
  assert.doesNotMatch(parse('x" or set:lea (o:test)', { finish: "etched" }).query, /set:lea|o:test|\(/);
});

const app = fs.readFileSync("assets/js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

test("homepage explorer comes before editorial material and rules are appended after the live explorer", () => {
  assert.ok(html.indexOf('id="card-details"') < html.indexOf('id="printings-container"'));
  assert.ok(html.indexOf('id="printings-container"') < html.indexOf('id="scoutboard"'));
  assert.match(app, /explorer\.after\(information\);[^]*?<summary>Rules &amp; legality<\/summary>[^]*?oracleHtml\(card\)[^]*?<summary>Collector information/);
  assert.match(app, /selection\.after\(explorer\)/);
  assert.match(html, /rel="canonical"\s+href="https:\/\/manascout\.co\.uk\/"/);
  assert.equal((fs.readFileSync("sitemap.xml", "utf8").match(/<loc>/g) || []).length, 71);
});

test("grouping preserves UUID and finish, and stays conservative when art or edition evidence differs", () => {
  const start = app.indexOf("  function groupPrintings(");
  const context = vm.createContext({});
  vm.runInContext(app.slice(start, app.indexOf("  function renderArchive(", start)), context);
  const base = { id: "en", lang: "en", oracle_id: "oracle", set: "dmu", collector_number: "107", illustration_id: "art", finishes: ["foil"] };
  const ja = { ...base, id: "ja", lang: "ja", finishes: ["nonfoil"] };
  const de = { ...base, id: "de", lang: "de" };
  const ph = { ...base, id: "ph", lang: "ph", frame_effects: ["showcase"] };
  const unknown = { ...base, id: "unknown", lang: "ja", illustration_id: undefined };
  const groups = context.groupPrintings([ja, base, de, ph, unknown, { ...base, id: "another-en" }], ja);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].primary, ja);
  assert.equal(groups[0].variants[0], base);
  assert.equal(groups[0].variants[1], de);
  assert.equal(groups[1].primary, ph);
  assert.equal(groups[2].primary, unknown);
});

test("debug-compatible analytics accept classifications and reject raw data or exact language", () => {
  const payloads = [];
  const tracker = createTracker({ adapter: event => payloads.push(event) });
  const search = { surface: "home", exact_printing: false, search_type: "artist", result_band: "few" };
  const selection = { source: "search", language_group: "other", finish: "etched" };
  assert.ok(tracker.track("search_success", search));
  assert.ok(tracker.track("exact_printing_select", selection));
  assert.equal(tracker.track("search_success", { ...search, query: "Mark Poole" }), false);
  assert.equal(tracker.track("search_success", { ...search, search_type: "Mark Poole" }), false);
  assert.equal(tracker.track("exact_printing_select", { ...selection, language_group: "Japanese" }), false);
  assert.equal(tracker.track("exact_printing_select", { ...selection, uuid: "123" }), false);
  assert.deepEqual(payloads.map(event => event.properties), [search, selection]);
});
