const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");

const archive = readFileSync("card/index.html", "utf8");
const directory = readdirSync("card", { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const entries = [...archive.matchAll(/class="hub-guide" href="\/card\/([^/]+)\/" data-guide-tags="([^"]*)"/g)];
const tags = new Map(entries.map(([, slug, values]) => [slug, values.split(/\s+/).filter(Boolean)]));

test("every archive entry has an explicit editorial category assignment", () => {
  assert.equal(entries.length, directory.length);
  assert.deepEqual([...tags.keys()].sort(), directory);
  for (const values of tags.values()) {
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.every(value => ["original", "premium", "artwork"].includes(value)));
  }
  for (const slug of ["sol-ring", "mana-crypt", "reanimate", "brainstorm", "dark-ritual", "swords-to-plowshares"]) {
    assert.ok(tags.get(slug).includes("original"), slug);
  }
  for (const slug of ["heroic-intervention", "sheoldred-the-apocalypse", "smothering-tithe", "demonic-consultation"]) {
    assert.ok(tags.get(slug).includes("premium"), slug);
  }
  assert.deepEqual(tags.get("grim-monolith"), ["original", "artwork"]);
  assert.deepEqual(tags.get("hit-it"), []);
});

test("archive metadata and static counts agree with the catalogue", () => {
  const count = directory.length;
  assert.match(archive, /rel="canonical"\s+href="https:\/\/manascout\.co\.uk\/card\/"/);
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const description = archive.match(new RegExp(key + '\\s+content="([^"]+)"'))[1];
    assert.ok(description.includes(`${count} `), description);
  }
  const graph = JSON.parse(archive.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])["@graph"];
  assert.match(graph.find(node => node["@type"] === "CollectionPage").description, new RegExp(`\\b${count}\\b`));
  const list = graph.find(node => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, count);
  assert.deepEqual(list.itemListElement.map(item => new URL(item.url).pathname.split("/")[2]).sort(), directory);
  assert.match(archive, new RegExp(`id="hub-total">${count}<\\/span>`));
  assert.match(archive, new RegExp(`id="hub-status"[^>]*>\\s*${count} guides`));
  assert.doesNotMatch(archive, /\b63 (?:Magic|ManaScout|guides|card)/);
});
