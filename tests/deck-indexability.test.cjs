const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { profiles } = require("../assets/js/deck-formats.js");
const { createPlausibleAdapter } = require("../assets/js/analytics.js");

const read = path => readFileSync(path, "utf8");
const deck = read("deck/index.html");
const origin = "https://manascout.co.uk";

test("Deck Studio has one H1 and clean, relevant static metadata", () => {
  assert.deepEqual([...deck.matchAll(/<h1>([^<]+)<\/h1>/g)].map(match => match[1]), ["Deck Studio"]);
  assert.match(deck, /<title>[^<]*Deck Studio[^<]*MTG Deck[^<]*<\/title>/);
  assert.match(deck, /<meta name="description" content="[^"]*exact printings[^"]*import, export/);
  assert.match(deck, /<meta name="robots" content="index,follow">/);
  assert.deepEqual([...deck.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(match => match[1]), [origin + "/deck/"]);
  const schema = JSON.parse(deck.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
  assert.equal(schema["@type"], "WebPage");
  assert.equal(schema.url, origin + "/deck/");
  assert.equal(schema.description, deck.match(/<meta name="description" content="([^"]+)"/)[1]);
});

test("incoming query state only changes the robots directive", () => {
  const boot = deck.match(/<script>([^]*?)<\/script>/)[1];
  for (const search of ["", "?card=Dark+Ritual&printing=uuid&finish=foil&guide=guide&source=home", "?import=1", "?format=commander"]) {
    const robots = { content: "index,follow" };
    const location = Object.freeze({ search });
    vm.runInNewContext(boot, {
      location,
      document: { querySelector(selector) {
        assert.equal(selector, 'meta[name="robots"]');
        return robots;
      } }
    });
    assert.equal(robots.content, search ? "noindex,follow" : "index,follow");
  }
});

test("workspace comes before static explanations of implemented capabilities", () => {
  const intro = deck.match(/<div class="ds-intro">([^]*?)<\/div>/)[1];
  assert.ok(intro.replace(/<[^>]+>/g, "").trim().split(/\s+/).length <= 30);
  const workspace = deck.indexOf('<main class="ds-workspace"');
  const about = deck.indexOf('<section class="ds-about"');
  assert.ok(deck.indexOf("<h1>") < workspace && workspace < deck.indexOf("</main>") && deck.indexOf("</main>") < about);
  const copy = deck.slice(about, deck.indexOf("</section>", about));
  for (const capability of [/collector number/, /language/, /finish/, /text decklist/, /CSV/, /JSON backup/, /mana curve/, /deck health/]) assert.match(copy, capability);
  for (const profile of profiles) assert.ok(copy.includes(profile.name.split(/ [—(]/)[0]), profile.name);
});

test("Contact is crawlable with noindex and all 66 sitemap targets are clean", () => {
  const contact = read("contact/index.html");
  assert.match(contact, /<meta name="robots" content="noindex,follow">/);
  assert.ok(contact.includes(`<link rel="canonical" href="${origin}/contact/">`));
  const targets = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(targets).size, 66);
  assert.equal(targets.length, 66);
  assert.deepEqual(targets.filter(url => url.startsWith(origin + "/deck/")), [origin + "/deck/"]);
  assert.ok(targets.every(url => url.startsWith(origin + "/") && !/[?#]/.test(url)));
  assert.ok(!targets.includes(origin + "/contact/"));
  assert.match(read("robots.txt"), /^User-agent: \*\s+Allow: \/\s+Sitemap: https:\/\/manascout\.co\.uk\/sitemap\.xml\s*$/);
  for (const page of [read("index.html"), read("card/index.html")]) assert.match(page, /<a href="\/deck\/">Deck Studio<\/a>/);
});

test("prepared analytics uses canonical Deck Studio page identity for handoffs", () => {
  const sent = [];
  const location = new URL(origin + "/deck/?card=Private+card&printing=uuid&finish=foil#restore");
  const adapter = createPlausibleAdapter({ enabled: true, provider: "plausible", domain: location.hostname }, {
    location, navigator: {}, document: { referrer: "" },
    fetch(_url, init) { sent.push(JSON.parse(init.body)); }
  });
  adapter.pageview();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, origin + "/deck/");
  assert.match(read("assets/js/analytics-config.js"), /enabled: false,[^]*?provider: null/);
});
