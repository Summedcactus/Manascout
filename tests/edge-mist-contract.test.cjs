const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const guides = require("../data/guides.json");

const css = readFileSync("assets/css/printing-presentation.css", "utf8");
const start = css.indexOf(".ms-edge-atmosphere {");
const mist = css.slice(start, css.indexOf("\n.ms-physical-drift {", start));

test("normal mist remains CSS-driven and only animates transform and opacity", () => {
  assert.match(mist, /pointer-events: none/);
  assert.doesNotMatch(mist, /animation\s*:\s*none/);
  const track = mist.match(/@keyframes ([\w-]+)\s*\{([^]*?)\n\}/);
  assert.ok(track);
  assert.match(mist, new RegExp(`animation: ${track[1]} `));
  const frames = [...track[2].matchAll(/\d+%\s*\{([^}]+)\}/g)];
  assert.ok(frames.length >= 3);
  for (const frame of frames) {
    assert.deepEqual([...frame[1].matchAll(/([\w-]+):/g)].map(field => field[1]).sort(), ["opacity", "transform"]);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ms-edge-atmosphere > span[^\n]+animation: none/);
});

test("all shared stylesheet references receive the mist cache marker", () => {
  const pages = ["index.html", "card/index.html", "deck/index.html",
    ...guides.map(({ slug }) => `card/${slug}/index.html`)];
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    const references = [...html.matchAll(/href="(\/assets\/css\/printing-presentation\.css[^"]*)"/g)];
    assert.equal(references.length, 1, file);
    const url = new URL(references[0][1].replaceAll("&amp;", "&"), "https://manascout.co.uk");
    assert.deepEqual(url.searchParams.getAll("mist-motion"), ["1"], file);
  }
});
