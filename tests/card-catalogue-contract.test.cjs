const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const vm = require("node:vm");
const manifest = require("../data/guides.json");
const catalogue = require("../assets/js/guide-catalogue.js");
const analytics = require("../assets/js/analytics.js");
const archive = readFileSync("card/index.html", "utf8");
const slugs = manifest.map(guide => guide.slug).sort();
const canonical = slug => `https://manascout.co.uk/card/${slug}/`;

test("manifest, static archive, JSON-LD and sitemap agree with published guide pages", () => {
  const pages = readdirSync("card", { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => entry.name).sort();
  assert.equal(slugs.length, new Set(slugs).size);
  assert.deepEqual(pages, slugs);
  const graph = JSON.parse(archive.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])["@graph"];
  const list = graph.find(node => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, slugs.length);
  assert.deepEqual(list.itemListElement.map(item => item.url).sort(), slugs.map(canonical));
  const sitemap = readFileSync("sitemap.xml", "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(hit => hit[1]);
  const directory = "https://manascout.co.uk/card/";
  assert.deepEqual(urls.filter(url => url.startsWith(directory) && url !== directory).sort(), slugs.map(canonical));
  for (const { slug, name, categories } of manifest) {
    assert.ok(categories.length && categories.every(tag => ["original", "premium", "artwork"].includes(tag)), slug);
    const html = readFileSync(`card/${slug}/index.html`, "utf8");
    assert.ok(html.includes(`rel="canonical" href="${canonical(slug)}"`), slug);
    assert.equal(list.itemListElement.find(item => item.url === canonical(slug)).name, name);
    assert.ok(archive.includes(`class="hub-guide" href="/card/${slug}/" data-guide-tags="${categories.join(" ")}"`), slug);
  }
  execFileSync("python3", ["scripts/sync-guide-catalogue.py", "--check"]);
});

test("Search and analytics recognise manifest routes only", () => {
  assert.deepEqual(catalogue.slugs, slugs);
  assert.deepEqual(analytics.GUIDES, slugs);
  const document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({}),
    head: { appendChild() {} }
  };
  const window = {
    location: { pathname: "/", search: "" },
    ManaScoutPrinting: require("../assets/js/printing-presentation.js"),
    addEventListener() {}
  };
  const browser = vm.createContext({ document, window, URLSearchParams });
  for (const script of ["guide-catalogue.js", "app.js", "analytics.js"]) {
    vm.runInContext(readFileSync(`assets/js/${script}`, "utf8"), browser);
  }
  for (const { slug, name } of manifest) {
    const path = `/card/${slug}/`;
    assert.equal(window.ManaScout.guidePath(name), path);
    assert.equal(analytics.canonicalPath(path), path);
    window.location.pathname = path;
    assert.equal(window.ManaScoutAnalytics.guide(), slug);
  }
  assert.equal(window.ManaScout.guidePath("Unknown catalogue guide"), "");
  window.location.pathname = "/card/unknown-catalogue-guide/";
  assert.equal(window.ManaScoutAnalytics.guide(), "none");
  assert.equal(analytics.canonicalPath(window.location.pathname), null);
});
