const { test } = require("node:test");
const assert = require("node:assert/strict");
const state = require("../assets/js/url-state.js");
const home = "https://manascout.co.uk/";
const guide = home + "card/sol-ring/";
const id = "aabbccdd-1111-4111-8111-111111111111";

test("normal homepage searches and exact printing/finish URLs round-trip", () => {
  const named = state.selectionUrl(home, { query: "Swords to Plowshares" });
  assert.deepEqual(state.restore(named.search), { kind: "search", query: "Swords to Plowshares", filters: {} });
  const exact = state.selectionUrl(named.href, { query: "Swords to Plowshares", printingId: id.toUpperCase(), finish: "foil" });
  assert.deepEqual(state.restore(exact.search), { kind: "card", query: "Swords to Plowshares", printingId: id, finish: "foil" });
  for (const finish of ["nonfoil", "foil", "etched"]) {
    assert.equal(state.parse(state.selectionUrl(home, { query: "Sol Ring", printingId: id, finish }).search).finish, finish);
  }
});

test("same-card guide selection removes q and keeps the route, unrelated parameters and hash", () => {
  const exact = state.selectionUrl(guide + "?q=old&campaign=known#printings-container", {
    query: " sol ring ", printingId: id, finish: "etched", guideName: "Sol Ring"
  });
  assert.equal(exact.pathname, "/card/sol-ring/");
  assert.equal(exact.searchParams.get("q"), null);
  assert.equal(exact.searchParams.get("campaign"), "known");
  assert.equal(exact.hash, "#printings-container");
  assert.deepEqual(state.restore(exact.search, null, "Sol Ring"), { kind: "card", query: "Sol Ring", printingId: id, finish: "etched" });
});

test("an explicit different-card selection preserves the guide route and gets dynamic q state", () => {
  const different = state.selectionUrl(guide, { guideName: "Sol Ring", query: "Black Lotus" });
  assert.equal(different.pathname, "/card/sol-ring/");
  assert.equal(different.searchParams.get("q"), "Black Lotus");
  assert.equal(state.restore(different.search, null, "Sol Ring").query, "Black Lotus");
});

test("clear and invalid state discard printing, invalid finish and malformed search values", () => {
  const cleared = state.selectionUrl(home + `?q=Sol+Ring&printing=${id}&finish=foil`);
  assert.equal(cleared.href, home);
  assert.deepEqual(state.restore(cleared.search), { kind: "home" });
  assert.deepEqual(state.parse("?q=Sol%00Ring&printing=wrong&finish=foil"), { query: "", printingId: "", finish: "" });
  assert.equal(state.parse(`?printing=${id}&finish=galaxy`).finish, "");
  assert.equal(state.parse("?q=Sol+Ring&finish=foil").finish, "");
  const old = state.restore("?q=Sol+Ring&printing=bad&finish=foil", { search: { query: 123 } });
  assert.deepEqual(old, { kind: "search", query: "Sol Ring", filters: {} });
});

test("list results keep the existing back/forward payload and clean home URL", () => {
  const entry = state.searchEntry(guide + "#printings-container", "blue instant", {
    artist: "Example", finish: "foil", set: "lea", language: 0, unknown: "discard", type: ["invalid"]
  });
  assert.equal(entry.url.href, home);
  assert.deepEqual(entry.state, { search: { query: "blue instant", filters: { artist: "Example", finish: "foil", set: "lea" } } });
  assert.deepEqual(state.restore("", entry.state), { kind: "search", ...entry.state.search });
  assert.deepEqual(state.restore("", null), { kind: "home" });
});

test("utility query presence remains distinct from the canonical homepage", () => {
  assert.ok(!state.isVariant(""));
  assert.ok(state.isVariant("?q=Sol+Ring"));
  assert.ok(state.isVariant("?printing=malformed"));
  assert.ok(state.isVariant("?collector_number=269"));
  assert.ok(!state.isVariant("?utm_source=foo"));
});
