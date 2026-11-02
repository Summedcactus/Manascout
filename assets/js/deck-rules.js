/* Conservative construction checks. Current Scryfall data/proofs are supplied by the client. */
((root) => {
  "use strict";
  const normal = s => String(s || "").normalize("NFC").trim().toLowerCase();
  const colors = ["W", "U", "B", "R", "G"];
  const variants = new Set(["character select", "father & son", "friends forever", "survivors"]);
  const legendary = c => /\bLegendary\b/.test(c.frontType);
  const background = c => legendary(c) && /\bEnchantment\b/.test(c.frontType) && /\bBackground\b/.test(c.frontType);
  const doctor = c => legendary(c) && /\bCreature\b/.test(c.frontType) && !c.keywords?.includes("Changeling") && /^Time Lord Doctor$/.test((c.frontType.split(/[—–]/)[1] || "").trim());
  const colorChoice = c => /choose a colou?r before the game begins|before the game begins[^\n]*choose a colou?r/i.test(c.frontText);
  function abilities(card) {
    const text = card.frontText || "";
    const groups = new Set();
    if (/^Partner(?:\s*\(|\s*$)/im.test(text)) groups.add("partner");
    if (/^Friends forever(?:\s*\(|\s*$)/im.test(text)) groups.add("variant:friends forever");
    let unknown = false;
    for (const match of text.matchAll(/^Partner\s*[—–-]\s*([^\n(]+)/gim)) {
      const suffix = normal(match[1]);
      if (variants.has(suffix)) groups.add("variant:" + suffix); else unknown = true;
    }
    return { groups, unknown, withName: normal(text.match(/^Partner with ([^\n(]+)/im)?.[1]),
      chooseBackground: /^Choose a Background(?:\s*\(|\s*$)/im.test(text), companion: /^Doctor[’']s companion(?:\s*\(|\s*$)/im.test(text) };
  }
  function pair(a, b) {
    const aa = abilities(a), bb = abilities(b);
    if ((aa.chooseBackground && background(b)) || (bb.chooseBackground && background(a))) return { valid: true, kind: "Background" };
    if ((aa.companion && doctor(b) && legendary(a) && /\bCreature\b/.test(a.frontType)) || (bb.companion && doctor(a) && legendary(b) && /\bCreature\b/.test(b.frontType))) return { valid: true, kind: "Doctor's companion" };
    if (legendary(a) && legendary(b)) {
      for (const group of aa.groups) if (bb.groups.has(group)) return { valid: true, kind: group };
      if (aa.withName && bb.withName && aa.withName === normal(b.name) && bb.withName === normal(a.name)) return { valid: true, kind: "Partner with" };
    }
    if (aa.unknown || bb.unknown) return { valid: false, unsupported: true, reason: "This named partner variant is not supported. This pairing cannot be certified." };
    return { valid: false, reason: "These commanders do not have matching supported pairing abilities." };
  }
  function copyLimit(card, format) {
    if (/\bBasic\b/.test(card.frontType) && /\bLand\b/.test(card.frontType)) return Infinity;
    const text = card.rulesText || "";
    const any = text.match(/A deck can have any number of cards named ([^\n]+)\./i);
    if (any && normal(any[1]) === normal(card.name)) return Infinity;
    const capped = text.match(/A deck can have up to (\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty) cards named ([^\n]+)\./i);
    if (capped && normal(capped[2]) === normal(card.name)) {
      const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
      return /^\d+$/.test(capped[1]) ? Number(capped[1]) : words.indexOf(normal(capped[1]));
    }
    return format === "commander" ? 1 : 4;
  }
  function validate(deck, { isVerified = () => false, proof = () => null } = {}) {
    const issues = [];
    const issue = (code, message, severity = "error", key = "") => issues.push({ code, message, severity, key });
    const entries = deck.entries;
    const count = zone => entries.filter(e => e.zone === zone).reduce((n, e) => n + e.quantity, 0);
    const main = count("main"), side = count("sideboard"), command = count("commander");
    const commanders = entries.filter(e => e.zone === "commander").map(e => deck.cards[e.printingId]);
    if (deck.format === "commander") {
      if (!command) issue("commander-missing", "Choose a commander. A selected preview is not a commander assignment.", "incomplete");
      if (command > 2 || commanders.length > 2) issue("commander-count", "Commander supports one commander or a supported pair, never more than two.");
      if (main + command !== 100) issue("size", `${main + command}/100 cards including commanders. Commander requires exactly 100.`, main + command > 100 ? "error" : "incomplete");
      if (side) issue("sideboard", "Commander has no sideboard. Move or remove the preserved sideboard entries.");
      for (const entry of entries.filter(e => e.zone === "commander")) {
        const card = deck.cards[entry.printingId];
        if (entry.quantity !== 1) issue("commander-quantity", `${card.name}: a commander assignment must contain exactly one copy.`, "error", entry.key);
        if (colorChoice(card)) issue("commander-choice", `${card.name} requires a pregame colour choice. That special configuration is not supported.`, "unsupported", entry.key);
        if (background(card)) {
          if (commanders.length !== 2 || !commanders.some(other => other.id !== card.id && abilities(other).chooseBackground)) issue("background", `${card.name} needs a commander with Choose a Background. It cannot command alone.`);
        } else {
          const eligible = proof(card);
          if (eligible === null) issue("eligibility-pending", `${card.name}: commander eligibility needs a current Scryfall check.`, "pending", entry.key);
          if (eligible === false) issue("commander-ineligible", `${card.name} is not eligible to be a commander. Move it to the main deck instead.`, "error", entry.key);
        }
      }
      if (commanders.length === 2) {
        const pairing = pair(commanders[0], commanders[1]);
        if (!pairing.valid) issue("commander-pair", pairing.reason, pairing.unsupported ? "unsupported" : "error");
      }
      const identity = new Set(commanders.flatMap(c => c.colorIdentity || []));
      if (commanders.length) for (const entry of entries) {
        const card = deck.cards[entry.printingId];
        const required = new Set(card.colorIdentity || []);
        // Basic land types have an additional inclusion rule, independent of reminder text.
        const landColors = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
        if (/\bLand\b/.test(card.frontType)) for (const [type, color] of Object.entries(landColors)) if (new RegExp(`\\b${type}\\b`).test(card.frontType)) required.add(color);
        if ([...required].some(c => !identity.has(c))) issue("identity", `${card.name} is outside the combined commander colour identity.`, "error", entry.key);
      }
    } else if (deck.format === "pauper") {
      if (main < 60) issue("size", `${main}/60 minimum main-deck cards. Sideboard cards do not count towards 60.`, "incomplete");
      if (side > 15) issue("sideboard", `${side}/15 sideboard cards. Pauper permits at most 15.`);
      if (command) issue("pauper-commanders", "Pauper has no command zone. Move the preserved commander entries to the main deck.");
    } else issue("format", "Choose a supported format.", "unsupported");

    // Union both English-name and Oracle identities so editions cannot evade copy limits.
    const groups = [];
    for (const entry of entries) {
      const card = deck.cards[entry.printingId];
      const matching = groups.filter(g => g.names.has(normal(card.name)) || (card.oracleId && g.ids.has(card.oracleId)));
      let group = matching[0];
      if (!group) { group = { names: new Set(), ids: new Set(), cards: [], count: 0 }; groups.push(group); }
      for (const other of matching.slice(1)) { for (const name of other.names) group.names.add(name); for (const id of other.ids) group.ids.add(id); group.cards.push(...other.cards); group.count += other.count; groups.splice(groups.indexOf(other), 1); }
      group.names.add(normal(card.name)); if (card.oracleId) group.ids.add(card.oracleId); group.cards.push(card); group.count += entry.quantity;
      if (!isVerified(card)) issue("stale", `${card.name}: current card data has not been verified in this session.`, "pending", entry.key);
      if (!card.oracleId || !Array.isArray(card.colorIdentity) || !card.frontType || card.manaValue === "Not supplied") issue("missing-data", `${card.name}: required card information is missing.`, "pending", entry.key);
      if (!card.printingDataComplete || !card.layout || !["black", "white", "borderless", "gold", "silver"].includes(card.borderColor)) issue("printing-data", `${card.name}: physical-printing metadata is incomplete.`, "pending", entry.key);
      const legality = card.legalities?.[deck.format];
      if (legality === "unknown" || !legality) issue("legality-unknown", `${card.name}: ${deck.format} legality is unavailable.`, "pending", entry.key);
      else if (legality !== "legal") issue("legality", `${card.name}: ${legality === "banned" ? "banned" : "not legal"} in ${deck.format}.`, "error", entry.key);
      if (!card.games?.includes("paper") || card.oversized || ["gold", "silver"].includes(card.borderColor) || card.securityStamp === "acorn" || ["token", "double_faced_token", "emblem", "art_series", "scheme", "planar", "vanguard"].includes(card.layout)) issue("printing", `${card.name}: this printing is not a supported tournament-appropriate paper card.`, "error", entry.key);
      if (!card.availableFinishes?.includes(entry.finish)) issue("finish", `${card.name}: ${entry.finish} is not available for the saved printing. Choose a supported entry; it has not been removed.`, "error", entry.key);
    }
    for (const group of groups) {
      const limit = Math.min(...group.cards.map(c => copyLimit(c, deck.format)));
      if (group.count > limit) issue("copies", `${group.cards[0].name}: ${group.count} copies across all sections/printings; the limit is ${limit}.`);
    }
    const status = issues.some(i => i.severity === "unsupported") ? "unsupported" : issues.some(i => i.severity === "error") ? "illegal" : issues.some(i => i.severity === "pending") ? "unverified" : issues.length ? "incomplete" : "valid";
    return { status, complete: status === "valid", issues, main, side, command, total: main + command, required: deck.format === "commander" ? 100 : 60,
      label: { valid: "Construction checks passed", unsupported: "Unsupported configuration", illegal: "Needs correction", unverified: "Needs current card data", incomplete: "Incomplete deck" }[status] };
  }
  function statistics(deck) {
    const curve = Array(8).fill(0), distribution = Object.fromEntries([...colors, "C", "Unknown"].map(c => [c, 0]));
    const types = Object.fromEntries(["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Other"].map(t => [t, 0]));
    let count = 0, sum = 0, spells = 0, unknownMana = 0;
    for (const entry of deck.entries) {
      if (entry.zone === "sideboard" || (deck.format === "pauper" && entry.zone === "commander")) continue;
      const card = deck.cards[entry.printingId], q = entry.quantity;
      count += q;
      const type = card.layout === "split" ? card.type : card.frontType;
      let matched = false;
      for (const t of Object.keys(types).filter(t => t !== "Other")) if (new RegExp(`\\b${t}\\b`).test(type)) { types[t] += q; matched = true; }
      if (!matched) types.Other += q;
      if (!Array.isArray(card.colorIdentity)) distribution.Unknown += q;
      else if (!card.colorIdentity.length) distribution.C += q;
      else for (const c of card.colorIdentity) distribution[c] += q;
      if (!/\bLand\b/.test(type)) {
        const value = card.manaValue === "Not supplied" ? NaN : Number(card.manaValue);
        if (Number.isFinite(value) && value >= 0) { curve[Math.min(7, Math.floor(value))] += q; sum += value * q; spells += q; }
        else unknownMana += q;
      }
    }
    return { count, curve, distribution, types, lands: types.Land, creatures: types.Creature, average: spells ? sum / spells : null, unknownMana };
  }
  const api = Object.freeze({ validate, statistics, copyLimit, pair, background, colorChoice, abilities });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckRules = api;
})(typeof window === "undefined" ? globalThis : window);
