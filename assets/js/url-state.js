/* Pure Search URL and browser-history payloads for the homepage and permanent guides. */
((root) => {
  "use strict";

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const finishes = new Set(["nonfoil", "foil", "etched"]);
  const filterKeys = ["set", "collector_number", "rarity", "colour", "type", "artist", "finish", "language"];
  const text = value => typeof value === "string" && !/[\x00-\x1f\x7f]/.test(value)
    ? value.trim().slice(0, 160) : "";

  function printing(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return uuid.test(id) ? id.toLowerCase() : "";
  }

  function finish(value) {
    const label = typeof value === "string" ? value.trim().toLowerCase() : "";
    return finishes.has(label) ? label : "";
  }

  function parse(search) {
    const params = new URLSearchParams(search);
    const printingId = printing(params.get("printing"));
    return { query: text(params.get("q")), printingId, finish: printingId ? finish(params.get("finish")) : "" };
  }

  function selectionUrl(href, { query, printingId, finish: selected, guideName } = {}) {
    const url = new URL(href);
    const name = text(query);
    const id = printing(printingId);
    const values = {
      q: name.toLowerCase() === text(guideName).toLowerCase() ? "" : name,
      printing: id,
      finish: id ? finish(selected) : ""
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    return url;
  }

  function filtersFor(value) {
    return Object.fromEntries(filterKeys
      .map(key => [key, key === "finish" ? finish(value?.[key]) : text(value?.[key])])
      .filter(([, entry]) => entry));
  }

  function searchEntry(href, query, filters) {
    return {
      url: new URL("/", href),
      state: { search: { query: text(query), filters: filtersFor(filters) } }
    };
  }

  function restore(search, state, guideName) {
    const saved = text(state?.search?.query);
    if (saved) return { kind: "search", query: saved, filters: filtersFor(state.search.filters) };
    const record = parse(search);
    const query = record.query || text(guideName);
    if (!query) return { kind: "home" };
    if (record.printingId || guideName) return { kind: "card", ...record, query };
    return { kind: "search", query, filters: {} };
  }

  function isVariant(search) {
    const params = new URLSearchParams(search);
    return ["q", "printing", ...filterKeys].some(key => params.has(key));
  }

  const api = Object.freeze({ parse, printing, finish, selectionUrl, searchEntry, restore, isVariant });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutURLState = api;
})(typeof window === "undefined" ? globalThis : window);
