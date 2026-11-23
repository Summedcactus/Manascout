const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { interpret, makeSetIndex } = require("../assets/js/search-intent.js");
const cosmic = require("./fixtures/cosmic-spider-man.json");
const { dom } = require("./helpers/card-dom.cjs");

const home = readFileSync("index.html", "utf8");
const sets = makeSetIndex([
  { code: "ltr", name: "The Lord of the Rings: Tales of Middle-earth" },
  { code: "spm", name: "Marvel's Spider-Man" }
]);
const languages = { en: "English", ja: "Japanese" };

test("homepage has one labelled Universal Search input and no visible filter form", () => {
  const form = home.match(/<form[\s\S]*?id="search-form"[\s\S]*?<\/form>/)[0];
  assert.equal((form.match(/<input\b/g) || []).length, 1);
  assert.match(form, /<label[^>]*for="search-input"/);
  assert.match(form, /placeholder="Search card, printing, collector number, artist…"/);
  assert.match(form, /role="listbox"/);
  assert.doesNotMatch(form, /<select|<details|Advanced search/);
});

for (const [input, query, lookup] of [
  ["Sol Ring borderless", '"Sol Ring" is:borderless', false],
  ["Sol Ring #451", '"Sol Ring" cn="451"', false],
  ["LTR 246", 'set:ltr cn="246"', true],
  ["Cosmic Spider-Man 271", '"Cosmic Spider-Man" cn="271"', false],
  ["Cosmic Spider-Man traditional foil", '"Cosmic Spider-Man" finish:foil', false],
  ["Spider-Man extended art", '"Spider-Man" is:extendedart', false],
  ["Japanese Rhystic Study", 'lang:ja "Rhystic Study"', false],
  ["Cosmic Spider-Man Marvel's Spider-Man #271 foil", '"Cosmic Spider-Man" set:spm cn="271" finish:foil', true]
]) {
  test(`Universal Search understands ${input}`, () => {
    const intent = interpret(input, {}, sets, languages);
    assert.ok(intent.query.includes(query), intent.query);
    assert.equal(Boolean(intent.lookup), lookup);
    assert.equal(intent.printing, true);
  });
}

test("Week 009 has the verified foil profile and decorative effects are outside the artwork", () => {
  const archive = JSON.parse(home.match(/id="card-week-archive-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const featured = archive.entries.find(entry => entry.status === "current");
  assert.equal(archive.currentWeek, 9);
  assert.deepEqual([featured.card, featured.set, featured.collectorNumber, featured.artist, featured.treatment, featured.finish],
    [cosmic.name, cosmic.set_name, cosmic.collector_number, cosmic.artist, "Extended Art", "foil"]);
  assert.equal(featured.printingId, cosmic.id);
  assert.deepEqual(cosmic.finishes, ["nonfoil", "foil"]);
  assert.deepEqual(new Set(cosmic.color_identity), new Set("WUBRG"));
  assert.match(home, /<svg class="weekly-cosmic-filaments"[^>]+aria-hidden="true"/);
  assert.ok(home.indexOf('class="weekly-cosmic-filaments"') < home.indexOf('class="weekly-card-stage"'));
  assert.match(home, /class="weekly-card-face"[\s\S]*?<img[^>]+id="card-week-image"[\s\S]*?class="weekly-foil-sheen"/);
});

test("Week 009 refresh checks the exact catalogue profile and keeps the static fallback on mismatch", async () => {
  const { Element } = dom();
  const weekly = new Element("article");
  weekly.dataset = {
    weeklySet: cosmic.set, weeklyNumber: cosmic.collector_number, weeklyId: cosmic.id, weeklyCard: cosmic.name
  };
  const image = new Element("img");
  const source = readFileSync("assets/js/scoutboard.js", "utf8");
  const context = vm.createContext({
    weekly, URLSearchParams, API: "https://api.scryfall.com", weeklyImage: image,
    weeklyPrinting: new Element("p"), weeklyLink: new Element("a"),
    console: { warn() {} }, norm: value => value.toLowerCase(), cardImage: card => card.image_uris.normal,
    response: cosmic, getJson: async () => context.response
  });
  vm.runInContext(source.slice(source.indexOf("  function linkToCard("), source.indexOf("  /* ========================================\n     SCRYFALL NETWORK")), context);
  vm.runInContext(source.slice(source.indexOf("  async function loadWeekly()"), source.indexOf("  void loadWeekly();")), context);
  await context.loadWeekly();
  assert.equal(image.src, cosmic.image_uris.normal);
  assert.match(context.weeklyLink.href, /finish=foil/);
  for (const change of [{ id: "wrong" }, { artist: "Other" }, { frame_effects: [] }, { finishes: ["nonfoil"] }, { games: ["arena"] }]) {
    image.src = "static";
    context.response = { ...cosmic, ...change };
    await context.loadWeekly();
    assert.equal(image.src, "static");
  }
});
