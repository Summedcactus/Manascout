const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { setTimeout: wait } = require("node:timers/promises");
const { dom } = require("./helpers/card-dom.cjs");
const presentation = require("../assets/js/printing-presentation.js");
const scryfall = require("../assets/js/scryfall-client.js");
const weekly = require("./fixtures/cosmic-spider-man.json");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/js/scoutboard.js"), "utf8");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const weeklyMarkup = homepage.match(/<article\b[^>]*\bid="card-of-the-week"[^>]*>/s)[0];
const weeklyData = Object.fromEntries([...weeklyMarkup.matchAll(/(data-weekly-[\w-]+)="([^"]*)"/g)]
  .map(([, key, value]) => [key, value]));
const first = "Rhystic Study";
const searchPage = number => `${scryfall.origin}/cards/search?page=${number}`;
const card = (id, fields = {}) => ({
  id, name: first, set: "wot", set_name: "Enchanting Tales", collector_number: "71",
  lang: "en", games: ["paper"], finishes: ["nonfoil"], released_at: "2023-09-08",
  image_uris: { normal: `https://cards.scryfall.io/${id}.jpg` }, ...fields
});
const list = (data, next_page) => ({ data, has_more: Boolean(next_page), next_page });
const missing = { status: 404 };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function until(predicate) {
  for (let i = 0; i < 120; i++) {
    if (predicate()) return;
    await wait(5);
  }
  assert.fail("Scoutboard did not reach the expected state");
}

function mount(answer, { features = true, active = false, archive = [], random } = {}) {
  const { document, Element } = dom();
  Element.prototype.appendChild = function (node) { this.append(node); return node; };
  Element.prototype.insertAdjacentElement = function (_position, node) { this.parentElement.append(node); };
  Object.defineProperty(Element.prototype, "id", {
    set(value) { this.setAttribute("id", value); }
  });
  Object.defineProperty(Element.prototype, "innerHTML", {
    get() { return this.textContent; }
  });
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  const recent = archive.length ? `<section id="scoutboard-panel-weekly"></section>
    <script id="card-week-archive-data"></script>` : "";
  document.body.innerHTML = `
    <main id="scoutboard">
      <button id="discover-card-button">Discover a Card</button>
      ${features ? `<div class="scoutboard-feature-grid">
        <article data-feature-card="Rhystic Study">
          <small></small><h4></h4><div class="scoutboard-feature-copy"><p></p></div>
          <a class="scoutboard-feature-link"></a><div class="scoutboard-feature-art"></div>
        </article>
      </div>` : ""}
      ${active ? `<article id="card-of-the-week"><img id="card-week-image" src="static.jpg">
        <a id="card-week-link"></a><p id="card-week-printing">Static printing</p></article>` : ""}
      ${recent}
    </main><section id="card-details-section"></section>`;
  const $ = id => document.getElementById(id);
  const feature = document.querySelector("[data-feature-card]");
  const weeklyLink = $("card-week-link");
  const weeklyElement = $("card-of-the-week");
  if (weeklyElement) {
    for (const [key, value] of Object.entries(weeklyData)) weeklyElement.setAttribute(key, value);
    weeklyLink.href = "/?printing=static&source=cotw";
  }
  if (archive.length) $("card-week-archive-data").textContent = JSON.stringify({ entries: archive });
  const scrolls = [];
  $("card-details-section").scrollIntoView = options => scrolls.push(options);
  const calls = [];
  const warnings = [];
  const enhanced = [];
  const fetch = async (target, options) => {
    const url = new URL(target);
    calls.push(url);
    const result = await answer(url, options);
    const status = result?.status ?? 200;
    return { ok: status === 200, status, headers: new Headers(), json: async () => result };
  };
  const { get } = scryfall.createClient({ fetchImpl: fetch, interval: 0, timeout: 30 });
  const window = {
    location: { search: "" }, addEventListener() {}, matchMedia: () => ({ matches: true }),
    ManaScoutPrinting: { ...presentation, enhance: (...args) => enhanced.push(args) },
    ManaScout: { scoutRandom: random }, ManaScoutScryfall: { ...scryfall, get }
  };
  // Advance Scoutboard's UI pauses independently of any request deadline.
  const timer = (callback, delay) => setTimeout(callback, delay === 12000 ? 35 : 0);
  vm.runInNewContext(source, {
    window, document, URL, URLSearchParams, AbortController, fetch,
    console: { warn: (...args) => warnings.push(args) }, setTimeout: timer, clearTimeout
  });
  return {
    $, calls, warnings, enhanced, scrolls, feature, weeklyElement,
    discover: $("discover-card-button"), rotate: document.querySelector(".scoutboard-heading-link"),
    link: () => feature.querySelector("a").href,
    art: () => feature.querySelector(".scoutboard-feature-art")
  };
}

const featureQuery = url => url.searchParams.get("q");
const linkParams = value => new URL(value, "https://manascout.co.uk").searchParams;
const firstPage = `!"${first}" game:paper`;

test("feature pagination prefers valid exact-name paper art and breaks score ties by release date", async () => {
  const winner = card("winner", { border_color: "borderless", finishes: ["nonfoil", "etched"] });
  const page = mount(url => {
    assert.equal(url.pathname, "/cards/search");
    if (url.searchParams.get("page") === "2") return list([winner, card("wrong-name", {
      name: "Other Card", border_color: "borderless", full_art: true
    })]);
    assert.equal(featureQuery(url), firstPage);
    assert.equal(url.searchParams.get("unique"), "prints");
    return list([card("base"), card("older", { ...winner, id: "older", released_at: "2020-01-01" }),
      card("digital", { border_color: "borderless", full_art: true, digital: true })], searchPage(2));
  });
  await until(() => linkParams(page.link()).has("printing"));
  assert.equal(linkParams(page.link()).get("printing"), winner.id);
  assert.equal(linkParams(page.link()).get("finish"), "etched");
  assert.equal(page.art().querySelector("img").src, winner.image_uris.normal);
  assert.equal(page.calls.length, 2);
});

test("feature traversal stops at its page limit, cycles and unsafe origins", async () => {
  for (const [next, count] of [
    [url => searchPage(Number(url.searchParams.get("page") || 1) + 1), 24],
    [() => searchPage(2), 2],
    [() => "https://unrelated.example/cards/search?page=2", 1],
    [() => "https://user@api.scryfall.com/cards/search?page=2", 1]
  ]) {
    const page = mount(url => list([card("good")], next(url)));
    await until(() => linkParams(page.link()).has("printing"));
    assert.equal(page.calls.length, count);
  }
});

test("first-page failure falls back to exact named lookup", async () => {
  const page = mount(url => url.pathname === "/cards/search" ? missing : card("named"));
  await until(() => linkParams(page.link()).has("printing"));
  assert.deepEqual(page.calls.map(url => url.pathname), ["/cards/search", "/cards/named"]);
  assert.equal(page.calls[1].searchParams.get("exact"), first);
  assert.equal(linkParams(page.link()).get("printing"), "named");
});

test("later-page failure retains the best earlier printing", async () => {
  const page = mount(url => featureQuery(url) === firstPage
    ? list([card("earlier")], searchPage(2)) : missing);
  await until(() => linkParams(page.link()).has("printing"));
  assert.equal(linkParams(page.link()).get("printing"), "earlier");
  assert.deepEqual(page.calls.map(url => url.pathname), ["/cards/search", "/cards/search"]);
});

test("complete enrichment failure retains featured name, guide link and art placeholder", async () => {
  const page = mount(() => { throw Error("offline"); });
  await until(() => page.warnings.length);
  assert.equal(page.feature.querySelector("h4").textContent, first);
  assert.equal(page.link(), "/card/rhystic-study/");
  assert.ok(page.art().querySelector(".scoutboard-feature-placeholder"));
});

test("rotating while a request is pending prevents older art and navigation from repainting", async () => {
  const held = deferred();
  const page = mount(url => featureQuery(url) === firstPage
    ? held.promise : list([card("sol", { name: "Sol Ring" })]));
  await until(() => page.calls.length === 1);
  await page.rotate.emit("click");
  await until(() => linkParams(page.link()).get("printing") === "sol");
  held.resolve(list([card("stale")]));
  await wait(10);
  assert.equal(page.feature.querySelector("h4").textContent, "Sol Ring");
  assert.equal(linkParams(page.link()).get("printing"), "sol");
  assert.match(page.art().querySelector("img").alt, /^Sol Ring/);
});

test("weekly and archived exact lookups share a successful deterministic request", async () => {
  const held = deferred();
  const archived = { status: "archived", week: 1, card: weekly.name, setCode: weekly.set,
    collectorNumber: weekly.collector_number };
  const page = mount(() => held.promise, { features: false, active: true, archive: [archived] });
  await until(() => page.calls.length === 1);
  held.resolve(weekly);
  await until(() => page.$("ms-weekly-archive").querySelector("a").dataset.printingResolved);
  assert.equal(page.calls[0].pathname, `/cards/${weekly.set}/${weekly.collector_number}`);
  assert.equal(page.calls.length, 1);
  assert.equal(page.$("card-week-image").src, weekly.image_uris.normal);
  assert.equal(linkParams(page.$("card-week-link").href).get("printing"), weekly.id);
  assert.equal(page.enhanced[0][2], weeklyData["data-weekly-finish"]);
});

test("weekly identity or incomplete artwork mismatches retain static COTW", async () => {
  for (const change of [
    { set: "dsk" }, { collector_number: "1" }, { name: "Other" },
    { id: "11111111-1111-4111-8111-111111111111" }, { artist: "Other" }, { lang: "ja" },
    { games: ["arena"] }, { finishes: ["etched"] }, { finishes: ["foil"] },
    { frame_effects: [] }, { rarity: "rare" }, { image_uris: {} }, { set_name: "" }
  ]) {
    const page = mount(() => ({ ...weekly, ...change }), { features: false, active: true });
    await until(() => page.warnings.length);
    assert.equal(page.$("card-week-image").src, "static.jpg");
    assert.equal(page.$("card-week-printing").textContent, "Static printing");
    assert.equal(page.$("card-week-link").href, "/?printing=static&source=cotw");
    assert.equal(page.enhanced.length, 0);
  }
});

test("weekly 404, 429, hard timeout and connection failure retain static COTW", async () => {
  for (const answer of [() => missing, () => ({ status: 429 }), () => new Promise(() => {}),
    () => { throw new TypeError("Connection failed"); }]) {
    const page = mount(answer, { features: false, active: true });
    await until(() => page.warnings.length);
    assert.equal(page.$("card-week-image").src, "static.jpg");
    assert.equal(page.$("card-week-link").href, "/?printing=static&source=cotw");
  }
});

test("archived identity mismatch or failure retains its normal card-search link", async () => {
  const archived = { status: "archived", week: 1, card: first, setCode: "wot", collectorNumber: "71" };
  for (const answer of [() => missing, () => card("wrong", { collector_number: "72" }),
    () => card("wrong", { set: "sld" }), () => card("wrong", { name: "Sol Ring" })]) {
    const page = mount(answer, { features: false, archive: [archived] });
    await until(() => page.warnings.length);
    const link = page.$("ms-weekly-archive").querySelector("a");
    assert.equal(linkParams(link.href).get("q"), first);
    assert.equal(linkParams(link.href).has("printing"), false);
  }
});

test("Discover delegates once to the public bridge and restores its button after success and failure", async () => {
  const held = deferred();
  let calls = 0;
  const page = mount(() => missing, { features: false, random: () => {
    calls++;
    if (calls === 1) return held.promise;
    return Promise.reject(Error("offline"));
  } });
  const inProgress = page.discover.emit("click");
  assert.equal(page.discover.disabled, true);
  await page.discover.emit("click");
  assert.equal(calls, 1);
  held.resolve();
  await inProgress;
  assert.equal(page.discover.disabled, false);
  assert.equal(page.discover.textContent, "Discover a Card");
  assert.equal(page.scrolls[0].behavior, "auto");
  await page.discover.emit("click");
  assert.equal(calls, 2);
  assert.equal(page.discover.disabled, false);
  assert.equal(page.discover.textContent, "Discover a Card");
  assert.equal(page.calls.length, 0);
});
