/* One source of truth: printing records are stored once; entries refer to them. */
((root) => {
  "use strict";
  const zones = new Set(["main", "sideboard", "commander"]);
  const formats = new Set(["commander", "pauper"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entryKey = (id, finish, zone) => `${id}:${finish}:${zone}`;
  const newId = () => root.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function createDeck({ id = newId(), name = "Untitled deck", format = "commander" } = {}) {
    if (!formats.has(format)) throw Error("Choose Commander or Pauper.");
    return { schemaVersion: 1, id, name, format, view: "artwork", cards: {}, entries: [], selection: null, revision: 0, updatedAt: Date.now() };
  }
  function changed(deck, patch) { return { ...deck, ...patch, revision: deck.revision + 1, updatedAt: Date.now() }; }
  function edit(deck, patch) {
    if (patch.format !== undefined && !formats.has(patch.format)) throw Error("Unsupported format.");
    if (patch.view !== undefined && !["artwork", "list"].includes(patch.view)) throw Error("Unsupported view.");
    if (patch.name !== undefined) patch = { ...patch, name: String(patch.name).trim().slice(0, 80) || "Untitled deck" };
    return changed(deck, patch);
  }
  function add(deck, card, { finish = card.finish, zone = "main", quantity = 1 } = {}) {
    if (!uuid.test(card?.id || "") || !card.name) throw Error("This card has no valid printing identity.");
    if (!zones.has(zone)) throw Error("Unsupported deck section.");
    if (!card.availableFinishes?.includes(finish)) throw Error("That finish is not listed for this printing.");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw Error("Enter a quantity from 1 to 10,000.");
    const key = entryKey(card.id, finish, zone);
    const existing = deck.entries.find(e => e.key === key);
    const total = (existing?.quantity || 0) + quantity;
    if (total > 10000) throw Error("One entry cannot exceed 10,000 copies.");
    const entry = { key, printingId: card.id, finish, zone, quantity: total };
    return changed(deck, { cards: { ...deck.cards, [card.id]: card }, entries: existing ? deck.entries.map(e => e.key === key ? entry : e) : [...deck.entries, entry] });
  }
  function setQuantity(deck, key, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000) throw Error("Enter a quantity from 0 to 10,000.");
    if (!deck.entries.some(e => e.key === key)) throw Error("That entry is no longer in this deck.");
    const entries = quantity ? deck.entries.map(e => e.key === key ? { ...e, quantity } : e) : deck.entries.filter(e => e.key !== key);
    const used = new Set([...entries.map(e => e.printingId), deck.selection?.printingId].filter(Boolean));
    return changed(deck, { entries, cards: Object.fromEntries(Object.entries(deck.cards).filter(([id]) => used.has(id))) });
  }
  function moveOne(deck, key, zone) {
    const entry = deck.entries.find(e => e.key === key);
    if (!entry) throw Error("That entry is no longer in this deck.");
    if (entry.zone === zone) return deck;
    const card = deck.cards[entry.printingId];
    return add(setQuantity(deck, key, entry.quantity - 1), card, { finish: entry.finish, zone });
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
  const count = (deck, zone) => deck.entries.filter(e => !zone || e.zone === zone).reduce((sum, e) => sum + e.quantity, 0);
  const api = Object.freeze({ createDeck, edit, add, setQuantity, moveOne, replaceRecords, select, count, entryKey, newId });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckModel = api;
})(typeof window === "undefined" ? globalThis : window);
