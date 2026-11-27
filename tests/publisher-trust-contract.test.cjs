const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const guides = require("../data/guides.json");
const { cohort, controls } = require("./fixtures/ctr-experiment.json");

const read = path => readFileSync(path, "utf8");
const guide = slug => read(`card/${slug}/index.html`);
const decode = text => text.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const title = html => decode(html.match(/<title>([^<]+)<\/title>/)[1]);
const fields = (html, name) => [...html.matchAll(new RegExp(
  `<meta\\s+(?:name|property)="${name}"\\s+content="([^"]+)"`, "g"
))].map(field => decode(field[1]));
const graph = html => JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])["@graph"];
const origin = "https://manascout.co.uk";
const organization = {
  "@type": "Organization",
  "@id": origin + "/#organization",
  name: "ManaScout",
  url: origin + "/"
};

test("About is indexable, linked, and lists a real editorial and correction route", () => {
  const html = read("about/index.html");
  assert.equal(title(html), "About ManaScout | Editorial Method & Corrections");
  assert.match(html, /rel="canonical" href="https:\/\/manascout.co.uk\/about\/"/);
  assert.deepEqual(fields(html, "robots"), ["index,follow,max-image-preview:large"]);
  assert.deepEqual(fields(html, "og:url"), [origin + "/about/"]);
  assert.deepEqual(fields(html, "og:title"), [title(html)]);
  assert.deepEqual(fields(html, "twitter:title"), [title(html)]);
  assert.equal(fields(html, "description").length, 1);
  assert.match(html, /How we research printings[\s\S]+Scryfall[\s\S]+collector numbers/);
  assert.match(html, /id="corrections"[\s\S]+<a href="\/contact\/">report it through Contact<\/a>/);
  assert.match(html, /id="affiliate-disclosure"[\s\S]+may earn a commission[\s\S]+Affiliate tracking is currently inactive/);
  assert.match(read("terms/index.html"), /href="\/about\/#affiliate-disclosure"/);
  const org = graph(html).find(node => node["@type"] === "Organization");
  assert.deepEqual(org, organization);
  assert.deepEqual(graph(html).find(node => node["@type"] === "AboutPage").mainEntity, { "@id": org["@id"] });
  for (const file of ["index.html", "card/index.html", "deck/index.html", "contact/index.html", "privacy/index.html", "terms/index.html"]) {
    assert.match(read(file).split("<footer")[1], /href="\/about\/"/, file);
  }
});

test("all 68 guides name their organisational author and publisher and show the existing modification date", () => {
  for (const { slug } of guides) {
    const html = guide(slug);
    const article = graph(html).find(node => node["@type"] === "Article");
    assert.deepEqual(article.author, organization, slug);
    assert.deepEqual(article.publisher, organization, slug);
    const bylines = [...html.matchAll(/<p class="guide-byline">By <a href="\/about\/">ManaScout<\/a> · Updated <time datetime="(\d{4}-\d{2}-\d{2})">[^<]+<\/time><\/p>/g)];
    assert.equal(bylines.length, 1, slug);
    assert.equal(bylines[0][1], article.dateModified, slug);
    assert.doesNotMatch(JSON.stringify(graph(html)), /"@type":"Person"/, slug);
  }
});

test("the static CTR cohort contains eight distinct metadata propositions with aligned social descriptions", () => {
  assert.equal(Object.keys(cohort).length, 8);
  for (const [slug, { old, new: next }] of Object.entries(cohort)) {
    const html = guide(slug);
    assert.notEqual(next.title, old.title);
    assert.notEqual(next.description, old.description);
    assert.equal(title(html), next.title, slug);
    for (const name of ["description", "og:description", "twitter:description"]) {
      assert.deepEqual(fields(html, name), [next.description], slug);
    }
    for (const name of ["og:title", "twitter:title"]) {
      assert.deepEqual(fields(html, name), [next.title], slug);
    }
    assert.equal(graph(html).find(node => node["@type"] === "Article").description, next.description, slug);
  }
  const titles = guides.map(({ slug }) => title(guide(slug)));
  const descriptions = guides.map(({ slug }) => fields(guide(slug), "description")[0]);
  assert.equal(new Set(titles).size, guides.length);
  assert.equal(new Set(descriptions).size, guides.length);
});

test("homepage and Rhystic Study keep the released snippet and social metadata", () => {
  for (const [name, expected] of Object.entries(controls)) {
    const html = name === "home" ? read("index.html") : guide(name);
    assert.equal(title(html), expected.title);
    for (const [field, value] of Object.entries(expected)) {
      if (field !== "title") assert.deepEqual(fields(html, field), [value], `${name} ${field}`);
    }
  }
});

test("About is the only additional utility sitemap URL and the Google seller row is preserved", () => {
  const locations = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(location => location[1]);
  const expected = ["/", "/about/", "/card/", "/deck/", ...guides.map(({ slug }) => `/card/${slug}/`)];
  assert.deepEqual(locations.sort(), expected.map(path => origin + path).sort());
  assert.equal(read("ads.txt"), "google.com, pub-2249291081711812, DIRECT, f08c47fec0942fa0\n");
});
