/* Versioned local drafts. Immutable snapshots preserve work across failed/conflicting pointer writes. */
((root) => {
  "use strict";
  const model = typeof module === "object" && module.exports ? require("./deck-model.js") : root.ManaScoutDeckModel;
  const formats = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
  const PREFIX = "manascout.deckstudio.v1.";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeId = /^[a-zA-Z0-9-]{8,100}$/;
  const finishes = new Set(["nonfoil", "foil", "etched"]);
  const maxBytes = 20 * 1024 * 1024;
  const snapshotBytes = 5 * 1024 * 1024;
  const bytes = text => new TextEncoder().encode(text).length;
  class StorageError extends Error {
    constructor(message, code = "storage") { super(message); this.name = "StorageError"; this.code = code; }
  }
  const invalid = message => { throw new StorageError(message, "invalid"); };
  function string(value, max = 200, optional = false) {
    if (optional && value === undefined) return "";
    if (typeof value !== "string" || value.length > max || (!optional && !value.trim())) invalid("A draft contains invalid or oversized text fields.");
    return value;
  }
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  function url(value, hosts) {
    if (!value) return "";
    try { const u = new URL(value); return u.protocol === "https:" && hosts.includes(u.hostname) && !u.username && !u.password ? u.href : ""; } catch { return ""; }
  }
  function sanitizeCard(source, expectedId) {
    if (!source || source.id !== expectedId || !uuid.test(source.id) || expectedId !== expectedId.toLowerCase()) invalid("A draft has a missing or invalid printing ID.");
    const c = { id: source.id.toLowerCase(), name: string(source.name), type: string(source.type, 500),
      oracleId: uuid.test(source.oracleId || "") ? source.oracleId.toLowerCase() : "",
      frontType: string(source.frontType, 500, true), frontText: string(source.frontText, 16000, true), rulesText: string(source.rulesText, 24000, true),
      manaValue: string(source.manaValue, 30), setName: string(source.setName, 400), setCode: string(source.setCode, 30, true), collectorNumber: string(source.collectorNumber, 80),
      artist: string(source.artist, 500), language: string(source.language, 30), released: string(source.released, 30), oracle: string(source.oracle, 24000),
      summary: string(source.summary, 1000), finishes: string(source.finishes, 100), finishLabel: string(source.finishLabel, 60),
      finish: source.finish === "" || finishes.has(source.finish) ? source.finish : "",
      finishNotice: string(source.finishNotice, 1000, true), layout: string(source.layout, 80, true), borderColor: string(source.borderColor, 30, true),
      securityStamp: string(source.securityStamp, 40, true), oversized: source.oversized === true, printingDataComplete: source.printingDataComplete === true,
      hasPrintedPT: typeof source.hasPrintedPT === "boolean" ? source.hasPrintedPT : null, isRebalanced: source.isRebalanced === true || /^A-/.test(source.name),
      meldEntry: ["meld_part", "meld_result", "not_meld"].includes(source.meldEntry) ? source.meldEntry : source.layout === "meld" ? "unknown" : "not_meld" };
    c.frame = typeof source.frame === "string" ? source.frame.slice(0,40) : "";
    c.frameEffects = Array.isArray(source.frameEffects) ? source.frameEffects.filter(x => typeof x === "string").slice(0,30).map(x => x.slice(0,80)) : [];
    c.fullArt = source.fullArt === true;
    c.promoTypes = Array.isArray(source.promoTypes) ? source.promoTypes.filter(x => typeof x === "string").slice(0,30).map(x => x.slice(0,80)) : [];
    c.manaCost = typeof source.manaCost === "string" && source.manaCost.length <= 200 ? source.manaCost : "";
    c.pricesEUR = Object.fromEntries(["nonfoil", "foil", "etched"].map(f => [f, typeof source.pricesEUR?.[f] === "number" && Number.isFinite(source.pricesEUR[f]) && source.pricesEUR[f] > 0 ? source.pricesEUR[f] : null]));
    c.edhrecRank = Number.isSafeInteger(source.edhrecRank) && source.edhrecRank > 0 ? source.edhrecRank : null;
    c.colorIdentity = Array.isArray(source.colorIdentity) && source.colorIdentity.every(x => /^[WUBRG]$/.test(x)) ? [...new Set(source.colorIdentity)] : null;
    c.colors = Array.isArray(source.colors) ? source.colors.filter(x => /^[WUBRG]$/.test(x)) : [];
    c.games = Array.isArray(source.games) ? source.games.filter(x => ["paper", "mtgo", "arena"].includes(x)) : [];
    c.keywords = Array.isArray(source.keywords) && source.keywords.length <= 100 ? source.keywords.map(x => string(x, 200)) : [];
    c.availableFinishes = Array.isArray(source.availableFinishes) ? [...new Set(source.availableFinishes.filter(x => finishes.has(x)))] : [];
    c.legalities = {};
    for (const key of formats.legalityKeys) c.legalities[key] = ["legal", "not_legal", "banned", "restricted", "unknown"].includes(source.legalities?.[key]) ? source.legalities[key] : "unknown";
    if (!Array.isArray(source.images) || source.images.length > 8 || source.images.some(image => !image || typeof image !== "object")) invalid("A draft has invalid artwork records.");
    c.images = source.images.map(image => ({ name: string(image.name), url: url(image.url, ["cards.scryfall.io"]) })).filter(image => image.url);
    const slug = c.name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    c.guide = source.guide === `/card/${slug}/` ? source.guide : "";
    c.sourceUrl = url(source.sourceUrl, ["scryfall.com", "www.scryfall.com"]);
    return c;
  }
  function generationMetadata(source) {
    if(!source || source.version!==1) return {};
    const style = value => typeof value==="string" && /^[a-z][a-z:+0-9-]{0,59}$/.test(value) ? value : "";
    const numbers = value => Object.fromEntries(Object.entries(value && typeof value==="object" && !Array.isArray(value)?value:{}).slice(0,60).filter(([k,v])=>/^[a-z][a-zA-Z:0-9-]{0,59}$/.test(k)&&integer(v,0,100)));
    const priorities={};
    for(const k of ["ramp","draw","removal","wipes","protection","tutors","combo","adherence"])if(typeof source.priorities?.[k]==="string"&&["light","normal","heavy","low","high","none","some","loose","balanced","strict"].includes(source.priorities[k]))priorities[k]=source.priorities[k];
    return {generation:{version:1,
      ...(["low","balanced","high"].includes(source.curve)?{curve:source.curve}:{}),
      ...(integer(source.bracket,1,5)?{bracket:source.bracket}:{}),
      ...(Array.isArray(source.commanderOracles)&&source.commanderOracles.length<=2&&source.commanderOracles.every(id=>uuid.test(id))?{commanderOracles:[...source.commanderOracles]}:{}),
      primaryStyle:style(source.primaryStyle),secondaryStyle:style(source.secondaryStyle),tertiaryStyle:style(source.tertiaryStyle),priorities,targets:numbers(source.targets),counts:numbers(source.counts)}};
  }
  function sanitizeDeck(source) {
    if (!source || source.schemaVersion !== 1) invalid("This deck version is not supported. The original has not been changed.");
    if (!safeId.test(source.id || "") || !formats.get(source.format) || !["artwork", "list"].includes(source.view)) invalid("A draft has an invalid identity, unsupported format or view. The original has not been changed.");
    if (!Array.isArray(source.entries) || source.entries.length > 2000 || !source.cards || typeof source.cards !== "object" || Array.isArray(source.cards) || Object.keys(source.cards).length > 2001) invalid("A draft exceeds the supported 2,000-entry workspace limit or has invalid card records.");
    const records = {};
    for (const [id, record] of Object.entries(source.cards)) records[id] = sanitizeCard(record, id);
    const seen = new Set();
    const entries = source.entries.map(e => {
      if (!e || !records[e.printingId] || !finishes.has(e.finish) || !["main", "sideboard", "commander", "signature"].includes(e.zone) || !integer(e.quantity, 1, 10000)) invalid("A draft contains an invalid entry, quantity, finish or section.");
      const assignedTo = e.zone === "signature" ? e.assignedTo || "" : "";
      if (assignedTo && !uuid.test(assignedTo)) invalid("A signature spell has an invalid Oathbreaker reference.");
      const key = model.entryKey(e.printingId, e.finish, e.zone, assignedTo);
      if (seen.has(key) || e.key !== key) invalid("A draft has duplicate or inconsistent entry keys.");
      seen.add(key); return { key, printingId: e.printingId, finish: e.finish, zone: e.zone, quantity: e.quantity, ...(e.zone === "signature" ? { assignedTo } : {}) };
    });
    let selection = null;
    if (source.selection) {
      if (!records[source.selection.printingId] || !(source.selection.finish === "" || finishes.has(source.selection.finish))) invalid("A draft has an invalid selected printing.");
      selection = { printingId: source.selection.printingId, finish: source.selection.finish };
    }
    const used = new Set([...entries.map(e => e.printingId), selection?.printingId].filter(Boolean));
    return { ...generationMetadata(source.generation), schemaVersion: 1, id: source.id, name: string(source.name, 80), format: source.format, view: source.view, entries, selection,
      cards: Object.fromEntries(Object.entries(records).filter(([id]) => used.has(id))), revision: integer(source.revision, 0, 1000000000) ? source.revision : 0,
      updatedAt: Number.isFinite(source.updatedAt) && source.updatedAt >= 0 ? source.updatedAt : 0 };
  }
  function encodeBackup(deck) {
    const text = JSON.stringify({ application: "ManaScout Deck Studio", version: 1, exportedAt: new Date().toISOString(), deck: sanitizeDeck(deck) });
    if (bytes(text) > maxBytes) invalid("This backup exceeds the supported 20 MB file limit.");
    return text;
  }
  function decodeBackup(text) {
    if (typeof text !== "string" || bytes(text) > maxBytes) invalid("Backup files must be JSON under 20 MB.");
    let payload; try { payload = JSON.parse(text); } catch { invalid("That file is not valid JSON."); }
    if (!payload || payload.application !== "ManaScout Deck Studio" || payload.version !== 1) invalid("That backup format/version is not supported. Existing drafts have not been changed.");
    const deck = sanitizeDeck(payload.deck);
    return { ...deck, id: model.newId(), revision: 0, updatedAt: Date.now() };
  }
  function createStore({ storage, now = Date.now } = {}) {
    const owner = model.newId();
    const key = (kind, id = "") => PREFIX + kind + (id ? "." + id : "");
    function access() { if (!storage) throw new StorageError("Browser storage is unavailable. This deck is only in memory; download a JSON backup.", "unavailable"); return storage; }
    function read(k) { try { return access().getItem(k); } catch (e) { if (e instanceof StorageError) throw e; throw new StorageError("Browser storage cannot be read. Existing drafts have not been changed.", "unavailable"); } }
    function write(k, value) { try { access().setItem(k, value); } catch { throw new StorageError("Local saving failed: browser storage is unavailable or full. Your working deck is still here; download a JSON backup.", "quota"); } }
    function erase(k) { try { access().removeItem(k); } catch { throw new StorageError("The local record could not be removed. It has not been reported as deleted.", "unavailable"); } }
    function keys(prefix) { const s = access(), out = []; try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(prefix)) out.push(k); } return out; } catch { throw new StorageError("Saved drafts cannot be listed in this browser.", "unavailable"); } }
    function pointer(k) {
      const raw = read(k); if (raw === null) return null;
      try { const p = JSON.parse(raw); if (p.version !== 1 || !safeId.test(p.token || "")) throw Error(); return p.token; }
      catch { throw new StorageError("A saved draft pointer is damaged or uses a newer version. It has not been overwritten.", "corrupt"); }
    }
    function snapshot(id, token) {
      if (!safeId.test(id || "") || !safeId.test(token || "")) invalid("Invalid recovery identity.");
      const raw = read(key("snapshot", `${id}.${token}`));
      if (!raw || bytes(raw) > snapshotBytes) throw new StorageError("This draft snapshot is missing or too large. Try a previous recovery version.", "corrupt");
      let value; try { value = JSON.parse(raw); } catch { throw new StorageError("This draft snapshot is damaged. Try a previous recovery version.", "corrupt"); }
      if (value.version !== 1 || value.token !== token || value.deck?.id !== id || !["saved", "recovery"].includes(value.kind) || !Number.isFinite(value.savedAt) || value.savedAt < 0) throw new StorageError("This draft snapshot uses an unsupported version or identity.", "corrupt");
      return { ...value, deck: sanitizeDeck(value.deck) };
    }
    function load(id, { includeJournal = true } = {}) {
      let originalError;
      const primaryExists = read(key("deck", id)) !== null;
      try {
        const token = pointer(key("deck", id));
        const saved = token ? snapshot(id, token) : null;
        try {
          const journalToken = includeJournal ? pointer(key("journal", id)) : null;
          if (journalToken) {
            const journal = snapshot(id, journalToken);
            const sameLineage = saved && journal.owner === saved.owner && journal.baseToken === saved.baseToken && journal.deck.revision > saved.deck.revision;
            if ((journal.baseToken === token || sameLineage) && (!saved || journal.savedAt >= saved.savedAt || sameLineage)) return { ...journal, token, dirty: true, recovered: false };
          }
        } catch { /* A damaged journal cannot hide a valid primary; its bytes remain untouched. */ }
        if (saved) return { ...saved, dirty: false, recovered: false };
      } catch (error) { originalError = error; }
      if (primaryExists) { const backup = pointer(key("backup", id)); if (backup) return { ...snapshot(id, backup), dirty: true, recovered: true }; }
      if (originalError) throw originalError;
      throw new StorageError("That saved deck no longer exists. Your working deck has not been replaced.", "missing");
    }
    function list() {
      const decks = [], issues = [];
      for (const k of keys(key("deck") + ".")) {
        const id = k.slice((key("deck") + ".").length);
        try { const record = load(id); decks.push(record); if (record.recovered) issues.push({ id, message: "The primary record is damaged; a previous snapshot is available." }); } catch (error) { issues.push({ id, message: error.message }); }
      }
      decks.sort((a, b) => b.savedAt - a.savedAt);
      return { decks, issues };
    }
    function versions() {
      const out = [];
      for (const k of keys(key("snapshot") + ".")) {
        const parts = k.slice((key("snapshot") + ".").length).split(".");
        if (parts.length !== 2) continue;
        try { out.push(snapshot(parts[0], parts[1])); } catch { /* Preserve damaged bytes; do not present them as a valid recovery. */ }
      }
      return out.sort((a, b) => b.savedAt - a.savedAt || b.token.localeCompare(a.token));
    }
    function prune(id, keepTokens) {
      const own = versions().filter(s => s.deck.id === id);
      const keep = new Set([...keepTokens, ...own.slice(0, 3).map(s => s.token)]);
      for (const s of own) if (!keep.has(s.token)) erase(key("snapshot", `${id}.${s.token}`));
    }
    function immutable(deck, kind, baseToken) {
      const value = { version: 1, token: model.newId(), savedAt: now(), kind, baseToken, owner, deck: sanitizeDeck(deck) };
      const encoded = JSON.stringify(value);
      if (bytes(encoded) > snapshotBytes) invalid("This deck exceeds the 5 MB local snapshot limit. Download a backup before reducing it.");
      write(key("snapshot", `${deck.id}.${value.token}`), encoded);
      return value;
    }
    function save(deck, { expectedToken = null } = {}) {
      const current = pointer(key("deck", deck.id));
      if (current !== expectedToken) throw new StorageError("This draft changed in another tab or was deleted. Your edits are preserved here. Save a copy instead of overwriting it.", "conflict");
      const value = immutable(deck, "saved", current);
      // Re-read after writing the immutable snapshot, before moving the live pointer.
      if (pointer(key("deck", deck.id)) !== current) throw new StorageError("Another tab changed this draft during saving. A recovery snapshot of your work was retained; save a copy.", "conflict");
      if (current) write(key("backup", deck.id), JSON.stringify({ version: 1, token: current }));
      write(key("deck", deck.id), JSON.stringify({ version: 1, token: value.token }));
      if (pointer(key("deck", deck.id)) !== value.token) throw new StorageError("Another tab moved the saved draft. Your immutable recovery snapshot is retained; save a copy.", "conflict");
      let warning = "";
      try { write(key("active"), deck.id); } catch (error) { warning = "Deck saved, but the last-opened selection could not be recorded. Select it from Saved decks when reopening."; }
      try {
        const journal = pointer(key("journal", deck.id));
        if (journal) { const recovery = snapshot(deck.id, journal); if (recovery.baseToken === expectedToken && recovery.deck.revision <= value.deck.revision) erase(key("journal", deck.id)); }
        prune(deck.id, [value.token, current].filter(Boolean));
      } catch { warning = warning || "Deck saved. Some older recovery records could not be cleaned up."; }
      return { ...value, warning };
    }
    function checkpoint(deck, expectedToken = null) {
      const value = immutable(deck, "recovery", expectedToken);
      write(key("journal", deck.id), JSON.stringify({ version: 1, token: value.token }));
      try { prune(deck.id,[value.token,pointer(key("deck",deck.id)),pointer(key("backup",deck.id))].filter(Boolean)); } catch { /* A successful recovery pointer must not be reported lost if cleanup fails. */ }
      try { write(key("active"), deck.id); } catch { /* The snapshot remains discoverable from Recent recovery versions. */ }
      return value;
    }
    function remove(id, expectedToken) {
      const current = pointer(key("deck", id));
      if (!current || current !== expectedToken) throw new StorageError("That deck changed or was deleted in another tab. Reload before deleting it.", "conflict");
      snapshot(id, current); // Never discard the pointer to an unreadable last copy.
      if (pointer(key("deck", id)) !== current) throw new StorageError("The deck changed during deletion. It has not been deleted.", "conflict");
      erase(key("deck", id));
      try { erase(key("backup", id)); erase(key("journal", id)); if (read(key("active")) === id) erase(key("active")); } catch { /* Immutable snapshots remain recoverable. The primary deletion already succeeded. */ }
      return { deleted: true };
    }
    function purgeDeleted(id) {
      if (read(key("deck", id)) !== null) throw new StorageError("Delete the saved deck first. Recovery copies for a live draft cannot be erased here.", "conflict");
      for (const k of keys(key("snapshot", id) + ".")) erase(k);
      erase(key("backup", id)); erase(key("journal", id));
      if (read(key("active")) === id) erase(key("active"));
    }
    function loadActive() {
      const id = read(key("active"));
      if (id && safeId.test(id)) { try { return load(id); } catch { /* Surface the library's issue and offer remaining drafts/recovery. */ } }
      return list().decks[0] || null;
    }
    return { save, load, list, versions, checkpoint, remove, purgeDeleted, loadActive, snapshot,
      discardJournal: (id, token) => { if (pointer(key("journal", id)) === token) erase(key("journal", id)); },
      isSaved: id => read(key("deck", id)) !== null,
      active: id => write(key("active"), id), pointerKey: id => key("deck", id),
      restoreVersion: (id, token) => ({ ...snapshot(id, token).deck, id: model.newId(), revision: 0, updatedAt: now() }) };
  }
  const api = Object.freeze({ createStore, sanitizeDeck, encodeBackup, decodeBackup, StorageError, PREFIX, maxBytes });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckStore = api;
})(typeof window === "undefined" ? globalThis : window);
