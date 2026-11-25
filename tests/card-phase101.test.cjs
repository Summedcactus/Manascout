const guideCount = require("../data/guides.json").length;
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {GUIDES} = require("../assets/js/analytics.js");
const printing = require("../assets/js/printing-presentation.js");
const {guides, reviewed} = require("../docs/phase10-1-guides.json");
const baseline = require("../docs/phase61-baseline.json").guides;

const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const names = ["deep-space-9", "heroic-intervention", "highly-illogical", "hit-it", "reanimate"];
const origin = "https://manascout.co.uk";
const editions = {
  "heroic-intervention": ["aer", "109", "2017-01-20", "James Ryman", "rare", ["nonfoil", "foil"], 12],
  "reanimate": ["tmp", "151", "1997-10-14", "Robert Bliss", "uncommon", ["nonfoil"], 9],
  "deep-space-9": ["trk", "263", "2026-11-13", "Paolo Puggioni", "mythic", ["nonfoil", "foil"], 3],
  "highly-illogical": ["trk", "62", "2026-11-13", "Joel Chaim Holtzman", "uncommon", ["nonfoil", "foil"], 2],
  "hit-it": ["trk", "240", "2026-11-13", "Aaron J. Riley", "rare", ["nonfoil", "foil"], 2]
};

test("the five researched additions and the previous guide routes remain registered", () => {
  const previous = Object.keys(baseline);
  assert.equal(previous.length, 63);
  assert.deepEqual(Object.keys(guides).sort(), names);
  const expected = [...previous, ...names].sort();
  const actual = fs.readdirSync(path.resolve(__dirname, "../card"), {withFileTypes: true})
    .filter(item => item.isDirectory()).map(item => item.name).sort();
  assert.deepEqual(actual.filter(slug => expected.includes(slug)), expected);
  assert.deepEqual([...GUIDES].sort(), actual);
  const list = JSON.parse(read("card/index.html").match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)[1])
    ["@graph"].find(item => item["@type"] === "ItemList");
  const sitemap = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  const registry = require("../assets/js/guide-catalogue.js").slugs;
  assert.deepEqual(registry, actual);
  assert.equal(list.numberOfItems, guideCount);
  assert.equal(new Set(sitemap.map(([, url]) => url)).size, guideCount + 3);
  for (const slug of names) {
    const url = `${origin}/card/${slug}/`;
    assert.equal(list.itemListElement.filter(item => item.url === url).length, 1);
    assert.deepEqual(sitemap.filter(([, loc]) => url === loc).map(match => match[2]), [reviewed]);
  }
});

for (const slug of names) test(`${slug} presents its verified exact first printing and collector proposition`, () => {
  const guide = guides[slug];
  const html = read(`card/${slug}/index.html`);
  const first = guide.curated.find(card => card.id === guide.first);
  const {set, collector_number, released_at, artist, rarity, finishes} = first;
  assert.deepEqual([set, collector_number, released_at, artist, rarity, finishes, guide.curated.length], editions[slug]);
  assert.ok(guide.curated.every(card => card.oracle_id === first.oracle_id && card.games.includes("paper") && card.lang === "en"));
  assert.match(html, new RegExp(`data-guide-initial-printing="${first.id}"`));
  assert.ok(html.includes(`<title>${guide.title}</title>`));
  assert.ok(html.includes(`<h1>${guide.name}</h1>`));
  assert.ok(html.includes(`rel="canonical" href="${origin}/card/${slug}/"`));
  assert.ok(html.includes('index,follow,max-image-preview:large'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  const image = first.image_uris.normal.replaceAll("&", "&amp;");
  assert.ok(html.includes(`property="og:image" content="${image}"`));
  assert.ok(html.includes(`name="twitter:image" content="${image}"`));
  assert.match(html, /og:image:alt[^\n]+illustrated by/);
  assert.match(html, /src="\/assets\/js\/printing-presentation\.js\?v=[^"]+"/);
  assert.ok(html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>/g).length === guide.curated.length);
  assert.ok([...html.matchAll(/href="\/card\/([a-z0-9-]+)\/"/g)].length >= 2);
  assert.doesNotMatch(html, /AggregateRating|hreflang|application\/ld\+json[^<]+Offer/);
});

test("the Star Trek pages distinguish artwork, format, finish, distribution and Oracle text", () => {
  const station = guides["deep-space-9"].curated;
  assert.equal(new Set(station.map(card => printing.artwork(card))).size, 2);
  assert.equal(station[0].illustration_id, station[1].illustration_id);
  assert.notEqual(station[1].illustration_id, station[2].illustration_id);
  assert.deepEqual(station[2].finishes, ["foil"]);
  const event = read("card/highly-illogical/index.html");
  assert.match(event, /PW26 #17/);
  assert.match(event, /WPN Premium locations/);
  assert.match(event, /20–26 November 2026/);
  const pike = read("card/hit-it/index.html");
  assert.match(pike, /Printed text and current Oracle wording/);
  assert.match(pike, /<q>look at<\/q>/);
  assert.match(pike, /<strong>reveal<\/strong>/);
  assert.match(pike, /Star Trek release notes/);
});

test("prominent cards have an independent idle wrapper and compact thumbnails use only the tilt shell", () => {
  const card = guides["heroic-intervention"].curated[0];
  const image = {card, finish: "nonfoil", src: card.image_uris.normal};
  assert.match(printing.markup(image), /ms-physical-drift[^>]*>\s*<span class="ms-physical-shell"/);
  assert.doesNotMatch(printing.markup({...image, compact: true}), /ms-physical-drift/);
  assert.match(read("assets/css/printing-presentation.css"), /data-idle-held[^\n]+ms-physical-drift/);
});

test("charcoal layers are independent and reduced-motion keeps static paint", () => {
  const css = read("assets/css/printing-presentation.css");
  for (const time of [37, 46, 41, 49]) assert.match(css, new RegExp(`--mist-cycle: ${time}s`));
  assert.match(css, /@keyframes ms-edge-drift[\s\S]+translate3d[\s\S]+opacity:/);
  assert.match(css, /max-width: 620px[^\n]*\n[^\n]+--mist-strength:[^\n]+\n[^\n]+ms-edge-atmosphere > span[^\n]+animation: none/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]+ms-edge-atmosphere > span[^\n]+animation: none/);
});
