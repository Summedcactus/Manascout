const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { dom } = require("./helpers/card-dom.cjs");
const { raw, id } = require("./helpers/cards.cjs");
const transport = require("../assets/js/scryfall-client.js");
const urlState = require("../assets/js/url-state.js");
const app = fs.readFileSync("assets/js/app.js", "utf8");
const alpha = raw(1, { name: "Sol Ring" });
const beta = raw(2, { name: "Black Lotus" });
const edition = raw(3, { name: "Sol Ring", oracle_id: alpha.oracle_id });

const offline = () => Object.assign(new Error("not found"), { status: 404 });
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function browser(handler = () => {}, { guide = false } = {}) {
  const fixture = dom();
  const { document, Element } = fixture;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.remove = function () {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  };
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => document.body.querySelector(selector);
  document.title = guide ? "Sol Ring first printing — Limited Edition Alpha" : "ManaScout";
  if (guide) document.body.dataset.cardName = "Sol Ring";
  document.body.innerHTML = '<meta name="robots"><form id="search-form"><input id="search-input"><div id="autocomplete-list" hidden></div></form><div id="ms-search-status"></div><section id="ms-search-results"></section><div id="card-details"></div>';
  const home = "https://manascout.co.uk/";
  const listeners = {};
  const calls = [];
  const window = {
    location: new URL(guide ? home + "card/sol-ring/" : home),
    ManaScoutURLState: urlState,
    ManaScoutGuideCatalogue: require("../assets/js/guide-catalogue.js"),
    ManaScoutPrinting: require("../assets/js/printing-presentation.js"),
    ManaScoutSearchIntent: guide ? undefined : require("../assets/js/search-intent.js"),
    ManaScoutScryfall: { ...transport, get: async (address, { signal } = {}) => {
      const request = new URL(address);
      calls.push({ request, signal });
      const overridden = handler(request, signal);
      if (overridden !== undefined) return overridden;
      if (request.pathname === "/sets") return { data: [{ code: "tst", name: "Test" }] };
      if (request.pathname === "/cards/search") {
        const records = [alpha, beta, edition].filter(card => request.searchParams.get("q")?.includes(card.oracle_id));
        return { data: records, has_more: false };
      }
      if (request.pathname === "/cards/random") return beta;
      const name = request.searchParams.get("exact") || request.searchParams.get("fuzzy");
      return [alpha, beta, edition].find(card => card.id === request.pathname.split("/").at(-1) || card.name === name) ||
        Promise.reject(offline());
    } },
    matchMedia: () => ({ matches: true }),
    dispatchEvent() {},
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  const historyEntries = [];
  const history = {
    pushState(payload, _, url) { historyEntries.push(payload); window.location = new URL(url); },
    replaceState(payload, _, url) { historyEntries[historyEntries.length - 1] = payload; window.location = new URL(url); }
  };
  const context = vm.createContext({
    document, window, history, AbortController, URL, URLSearchParams, encodeURIComponent,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout: fixture.setTimeout, clearTimeout: fixture.clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ rate: 1 }) }),
    console: { warn() {}, error() {} }
  });
  vm.runInContext(app, context);
  const input = document.getElementById("search-input");
  const details = document.getElementById("card-details");
  return {
    window, document, calls, details, input,
    app: window.ManaScout,
    selected: () => details.querySelector("h2")?.textContent,
    status: () => document.getElementById("ms-search-status").textContent,
    submit: async value => { input.value = value; await document.getElementById("search-form").emit("submit"); await turn(); },
    suggest: async value => { input.value = value; await input.emit("input"); fixture.timeouts(); await turn(); },
    pop: async (path, payload = null) => { window.location = new URL(path, home); listeners.popstate({ state: payload }); await turn(); }
  };
}

test("homepage Search resolves an exact name, uses fuzzy fallback on 404 and preserves the typed term", async () => {
  const page = browser(url => url.searchParams.get("fuzzy") === "Sll Ring" ? alpha : undefined);
  await page.submit("Sol Ring");
  assert.equal(page.selected(), "Sol Ring");
  assert.ok(page.calls.some(({ request }) => request.searchParams.get("exact") === "Sol Ring"));
  await page.submit("Sll Ring");
  assert.equal(page.selected(), "Sol Ring");
  assert.equal(page.input.value, "Sll Ring");
  assert.ok(page.calls.some(({ request }) => request.searchParams.get("fuzzy") === "Sll Ring"));
  assert.match(page.document.title, /^Sol Ring/);
});

test("exact UUID and finish reach the Search bridge and different identities are rejected", async () => {
  const page = browser(url => url.pathname === "/cards/" + id(4) ? beta : undefined);
  assert.equal((await page.app.loadCard(alpha.name, { printingId: edition.id, finish: "foil" })).id, edition.id);
  assert.equal(page.app.comparison.card(edition.id).id, edition.id);
  assert.equal(page.app.comparison.finish(edition), "foil");
  assert.equal((await page.app.comparison.exact(beta.id)).id, beta.id);
  assert.match(page.app.comparison.image(edition), /cards.scryfall.io/);
  assert.equal(page.app.guidePath("Sol Ring"), "/card/sol-ring/");
  assert.equal(await page.app.loadCard(alpha.name, { printingId: id(4) }), null);
  assert.match(page.details.textContent, /different card/);
  assert.equal((await page.app.scoutRandom()).id, beta.id);
  assert.equal(page.selected(), beta.name);
});

test("set and collector Search uses a verified physical identity and rejects wrong language or number", async () => {
  const page = browser(url => {
    if (url.pathname === "/cards/tst/1/en") return alpha;
    if (url.pathname === "/cards/tst/2/en") return { ...beta, lang: "ja", collector_number: "9" };
  });
  await page.submit("tst 1");
  assert.equal(page.selected(), "Sol Ring");
  assert.equal(page.window.location.searchParams.get("printing"), alpha.id);
  await page.submit("tst 2");
  assert.match(page.status(), /could not complete/);
  assert.equal(page.selected(), "Sol Ring");
});

test("an incomplete or digital-only card does not become the active printing", async () => {
  const page = browser(url => url.searchParams.get("exact") === "bad" ? { id: "invalid" } : undefined);
  await page.submit("bad");
  assert.match(page.status(), /could not complete/);
  assert.equal(page.selected(), undefined);
  const digital = browser(url => url.searchParams.get("exact") === "digital" ? { ...alpha, games: ["arena"] } : undefined);
  await digital.submit("digital");
  assert.match(digital.status(), /could not complete/);
  assert.equal(digital.selected(), undefined);
});

test("newer Search wins when earlier Search resolves last despite ignoring abort", async () => {
  const older = deferred();
  const page = browser(url => url.searchParams.get("exact") === alpha.name ? older.promise : undefined);
  await page.submit(alpha.name);
  await page.submit(beta.name);
  assert.equal(page.selected(), beta.name);
  older.resolve(alpha);
  await turn();
  assert.equal(page.selected(), beta.name);
  assert.ok(page.calls.find(({ request }) => request.searchParams.get("exact") === alpha.name).signal.aborted);
});

test("newer Search also cancels a stale exact load through the public bridge", async () => {
  const older = deferred();
  const page = browser(url => url.pathname === "/cards/" + edition.id ? older.promise : undefined);
  const pending = page.app.loadCard(alpha.name, { printingId: edition.id, finish: "foil" });
  await page.submit(beta.name);
  older.resolve(edition);
  assert.equal(await pending, null);
  assert.equal(page.selected(), beta.name);
  assert.equal(page.window.location.searchParams.get("printing"), beta.id);
});

test("late autocomplete results and failures cannot replace or close the newer suggestions", async () => {
  for (const fail of [false, true]) {
    const older = deferred();
    const page = browser(url => url.pathname === "/cards/autocomplete"
      ? url.searchParams.get("q") === "So" ? older.promise : { data: [beta.name] }
      : undefined);
    await page.suggest("So");
    await page.suggest("Bla");
    assert.ok(page.calls.find(({ request }) => request.searchParams.get("q") === "So").signal.aborted);
    if (fail) older.reject(Error("late network failure"));
    else older.resolve({ data: [alpha.name] });
    await turn();
    const list = page.document.getElementById("autocomplete-list");
    assert.equal(list.hidden, false);
    assert.equal(list.querySelector('[role="option"]').dataset.name, beta.name);
  }
});

test("the Home history state clears pending searches and stale responses do not repopulate it", async () => {
  const older = deferred();
  const page = browser(url => url.searchParams.get("exact") === alpha.name ? older.promise : undefined);
  await page.submit(alpha.name);
  await page.pop("/");
  older.resolve(alpha);
  await turn();
  assert.equal(page.selected(), undefined);
  assert.equal(page.input.value, "");
  assert.equal(page.status(), "");
  assert.equal(page.document.querySelector('meta[name="robots"]').getAttribute("content"), "index,follow,max-image-preview:large");
});

test("exact guide selection and back/forward keep the guide path and editorial title", async () => {
  const page = browser(undefined, { guide: true });
  const title = page.document.title;
  const exact = await page.app.loadCard(alpha.name, { printingId: edition.id, finish: "foil" });
  assert.equal(exact.id, edition.id);
  assert.equal(page.window.location.pathname, "/card/sol-ring/");
  assert.equal(page.window.location.searchParams.get("q"), null);
  assert.equal(page.window.location.searchParams.get("finish"), "foil");
  await page.pop("/card/sol-ring/?q=Black+Lotus");
  assert.equal(page.selected(), beta.name);
  assert.equal(page.document.title, title);
  assert.equal(page.window.location.pathname, "/card/sol-ring/");
});
