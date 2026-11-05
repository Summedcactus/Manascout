/* One source of truth: printing records are stored once; entries refer to them. */
((root) => {
  "use strict";
  const formatRegistry = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
  const data = typeof module === "object" && module.exports ? require("./deck-data.js") : root.ManaScoutDeckData;
  const zones = new Set(["main", "sideboard", "commander", "signature"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entryKey = (id, finish, zone, assignedTo = "") => `${id}:${finish}:${zone}${zone === "signature" ? ":" + (assignedTo || "unassigned") : ""}`;
  const newId = () => root.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function createDeck({ id = newId(), name = "Untitled deck", format = "commander" } = {}) {
    if (!formatRegistry.get(format)) throw Error("Choose a supported Constructed format.");
    return { schemaVersion: 1, id, name, format, view: "artwork", cards: {}, entries: [], selection: null, revision: 0, updatedAt: Date.now() };
  }
  function changed(deck, patch) { return { ...deck, ...patch, revision: deck.revision + 1, updatedAt: Date.now() }; }
  function edit(deck, patch) {
    if (patch.format !== undefined && !formatRegistry.get(patch.format)) throw Error("Unsupported format.");
    if (patch.view !== undefined && !["artwork", "list"].includes(patch.view)) throw Error("Unsupported view.");
    if (patch.name !== undefined) patch = { ...patch, name: String(patch.name).trim().slice(0, 80) || "Untitled deck" };
    return changed(deck, patch);
  }
  function add(deck, card, { finish = card.finish, zone = "main", quantity = 1, assignedTo = "" } = {}) {
    if (!uuid.test(card?.id || "") || !card.name) throw Error("This card has no valid printing identity.");
    if (!zones.has(zone)) throw Error("Unsupported deck section.");
    if (!card.availableFinishes?.includes(finish)) throw Error("That finish is not listed for this printing.");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw Error("Enter a quantity from 1 to 10,000.");
    if (assignedTo && !uuid.test(assignedTo)) throw Error("The signature spell needs a valid Oathbreaker assignment.");
    const key = entryKey(card.id, finish, zone, assignedTo);
    const existing = deck.entries.find(e => e.key === key);
    const total = (existing?.quantity || 0) + quantity;
    if (total > 10000) throw Error("One entry cannot exceed 10,000 copies.");
    const entry = { key, printingId: card.id, finish, zone, quantity: total, ...(zone === "signature" ? { assignedTo } : {}) };
    return changed(deck, { cards: { ...deck.cards, [card.id]: card }, entries: existing ? deck.entries.map(e => e.key === key ? entry : e) : [...deck.entries, entry] });
  }
  function setQuantity(deck, key, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000) throw Error("Enter a quantity from 0 to 10,000.");
    if (!deck.entries.some(e => e.key === key)) throw Error("That entry is no longer in this deck.");
    const entries = quantity ? deck.entries.map(e => e.key === key ? { ...e, quantity } : e) : deck.entries.filter(e => e.key !== key);
    const used = new Set([...entries.map(e => e.printingId), deck.selection?.printingId].filter(Boolean));
    return changed(deck, { entries, cards: Object.fromEntries(Object.entries(deck.cards).filter(([id]) => used.has(id))) });
  }
  function moveOne(deck, key, zone, assignedTo = "") {
    const entry = deck.entries.find(e => e.key === key);
    if (!entry) throw Error("That entry is no longer in this deck.");
    if (entry.zone === zone && (zone !== "signature" || entry.assignedTo === assignedTo)) return deck;
    const card = deck.cards[entry.printingId];
    return add(setQuantity(deck, key, entry.quantity - 1), card, { finish: entry.finish, zone, assignedTo });
  }
  function replaceRecords(deck, cards) {
    const records = { ...deck.cards };
    for (const card of cards) if (records[card.id]) records[card.id] = card;
    return changed(deck, { cards: records });
  }
  function select(deck, card, finish = card.finish) {
    if (!uuid.test(card?.id || "")) throw Error("This selection has no valid printing identity.");
    if (deck.selection?.printingId === card.id && deck.selection.finish === finish && deck.cards[card.id] === card) return deck;
    const used = new Set([...deck.entries.map(e => e.printingId), card.id]);
    return changed(deck, { selection: { printingId: card.id, finish }, cards: Object.fromEntries(Object.entries({ ...deck.cards, [card.id]: card }).filter(([id]) => used.has(id))) });
  }
  // Pure atomic replacement; callers verify live legality before committing the candidate.
  function replacePrinting(deck, key, card, finish) {
    const original = deck.entries.find(entry => entry.key === key);
    if (!original) throw Error("That deck entry is no longer available.");
    if (!uuid.test(card?.id || "") || !data.sameOracleCard(deck.cards[original.printingId], card)) throw Error("Choose a printing of the same Oracle card with equivalent gameplay data.");
    if (!card.availableFinishes?.includes(finish)) throw Error("That finish is not listed for this printing.");
    const ownerChanged = original.zone === "commander" && original.printingId !== card.id;
    const grouped = new Map();
    for (const entry of deck.entries) {
      let next = entry.key === key ? { ...entry, printingId: card.id, finish } : entry;
      if (ownerChanged && next.zone === "signature" && next.assignedTo === original.printingId) next = { ...next, assignedTo: card.id };
      const newKey = entryKey(next.printingId, next.finish, next.zone, next.assignedTo);
      next = { ...next, key: newKey };
      const previous = grouped.get(newKey);
      if (previous) next = { ...next, quantity: next.quantity + previous.quantity };
      if (next.quantity > 10000) throw Error("One entry cannot exceed 10,000 copies.");
      grouped.set(newKey, next);
    }
    const entries = [...grouped.values()];
    const selection = deck.selection?.printingId === original.printingId && deck.selection.finish === original.finish ? { printingId: card.id, finish } : deck.selection;
    const used = new Set([...entries.map(entry => entry.printingId), selection?.printingId].filter(Boolean));
    const cards = Object.fromEntries(Object.entries({ ...deck.cards, [card.id]: card }).filter(([id]) => used.has(id)));
    return changed(deck, { entries, cards, selection });
  }
  const count = (deck, zone) => deck.entries.filter(e => !zone || e.zone === zone).reduce((sum, e) => sum + e.quantity, 0);
  const api = Object.freeze({ createDeck, edit, add, setQuantity, moveOne, replaceRecords, replacePrinting, select, count, entryKey, newId });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckModel = api;
})(typeof window === "undefined" ? globalThis : window);
