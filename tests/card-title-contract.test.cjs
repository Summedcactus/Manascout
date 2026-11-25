const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const app = readFileSync("assets/js/app.js", "utf8");
const controller = readFileSync("assets/js/card-page.js", "utf8");
const start = app.indexOf("  function setSearchTitle(");
const ownership = app.slice(start, app.indexOf("  function setHome(", start));

function titleState(pathname, title, guideName = "") {
  const context = vm.createContext({ document: { title }, window: { location: { pathname } }, guideName });
  vm.runInContext(ownership, context);
  return context;
}

test("homepage search can set and reset the browser title", () => {
  const page = titleState("/", "ManaScout");
  page.setSearchTitle("MTG Card Search | ManaScout");
  assert.equal(page.document.title, "MTG Card Search | ManaScout");
  page.setSearchTitle("Sol Ring Printings, Foils & Art | ManaScout");
  assert.equal(page.document.title, "Sol Ring Printings, Foils & Art | ManaScout");
});

test("permanent guides and Deck Studio retain their own titles", () => {
  for (const [url, title, guide] of [
    ["/card/sol-ring/", "Sol Ring First Printing — Alpha 1993", "Sol Ring"],
    ["/deck/", "Deck Studio | ManaScout", ""]
  ]) {
    const page = titleState(url, title, guide);
    page.setSearchTitle("An exact printing | ManaScout");
    assert.equal(page.document.title, title);
  }
  assert.equal([...app.matchAll(/document\.title\s*=/g)].length, 1);
  assert.doesNotMatch(controller, /MutationObserver|document\.title/);
});
