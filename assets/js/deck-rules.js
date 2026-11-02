/* Conservative construction checks. Current Scryfall data/proofs are supplied by the client. */
((root) => {
  "use strict";
  const formats = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
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
    return formats.get(format)?.copies || 4;
  }
  function leaderEligibility(card, profile, proof = () => null) {
    if (!profile?.leaders) return false;
    if (profile.eligibility === "commander") return proof(card);
    if (profile.eligibility === "planeswalker") return /\bPlaneswalker\b/.test(card.frontType);
    if (profile.eligibility === "brawl") {
      if (!legendary(card)) return false;
      if (/\bCreature\b|\bPlaneswalker\b|\bVehicle\b/.test(card.frontType)) return true;
      if (/\bSpacecraft\b/.test(card.frontType)) return card.hasPrintedPT === null ? null : card.hasPrintedPT === true;
      return false;
    }
    return null;
  }
  function validate(deck, { isVerified = () => false, proof = () => null } = {}) {
    const issues = [];
    const issue = (code, message, severity = "error", key = "") => issues.push({ code, message, severity, key });
    const profile = formats.get(deck.format);
    const entries = deck.entries;
    const count = zone => entries.filter(e => e.zone === zone).reduce((n, e) => n + e.quantity, 0);
    const main = count("main"), side = count("sideboard"), command = count("commander"), signature = count("signature");
    const leaderEntries = entries.filter(e => e.zone === "commander");
    const commanders = leaderEntries.map(e => deck.cards[e.printingId]).filter(Boolean);
    const total = main + (profile?.leaders ? command : 0) + (profile?.signature ? signature : 0);
    if (!profile) issue("format", "Choose a supported format.", "unsupported");
    else {
      const exact = profile.min === profile.max;
      if (total < profile.min || (profile.max && total > profile.max)) issue("size", exact ? `${total}/${profile.min} cards including required special zones. ${profile.name} requires exactly ${profile.min}.` : `${total}/${profile.min} minimum main-deck cards${profile.max ? `; maximum ${profile.max}` : ""}. Sideboard cards do not count.`, total < profile.min ? "incomplete" : "error");
      if (side > profile.sideboard) issue("sideboard", profile.sideboard ? `${side}/${profile.sideboard} sideboard cards. ${profile.name} permits at most ${profile.sideboard}.` : `${profile.name} has no sideboard. Move or remove the preserved sideboard entries.`);
      if (!profile.leaders && command) issue(deck.format === "pauper" ? "pauper-commanders" : "command-zone", `${profile.name} has no command zone. Move the preserved assignments to the main deck.`);
      if (!profile.signature && signature) issue("signature-zone", `${profile.name} has no signature spell zone. The preserved entries must be moved to the main deck.`);
      if (profile.leaders) {
        if (!command) issue("commander-missing", `Choose a ${profile.leaderLabel.toLowerCase()}. A selected preview is not an assignment.`, "incomplete");
        if (command > profile.leaders || commanders.length > profile.leaders) issue("commander-count", `${profile.name} supports ${profile.leaders === 1 ? "one commander only" : "one leader or a supported pair, never more than two"}.`);
        for (const entry of leaderEntries) {
          const card = deck.cards[entry.printingId]; if (!card) continue;
          if (entry.quantity !== 1) issue("commander-quantity", `${card.name}: a leader assignment must contain exactly one copy.`, "error", entry.key);
          if (colorChoice(card)) issue("commander-choice", `${card.name} requires a pregame colour choice. That special configuration is not supported.`, "unsupported", entry.key);
          if (profile.eligibility === "commander" && background(card)) {
            if (commanders.length !== 2 || !commanders.some(other => other.id !== card.id && abilities(other).chooseBackground)) issue("background", `${card.name} needs a commander with Choose a Background. It cannot command alone.`);
          } else {
            const eligible = leaderEligibility(card, profile, proof);
            if (eligible === null) issue("eligibility-pending", `${card.name}: ${profile.leaderLabel.toLowerCase()} eligibility needs current card data.`, "pending", entry.key);
            if (eligible === false) issue("commander-ineligible", `${card.name} is not eligible as ${profile.leaderLabel.toLowerCase()}. Move it to the main deck instead.`, "error", entry.key);
          }
        }
        if (commanders.length === 2 && profile.leaders === 2) {
          const pairing = pair(commanders[0], commanders[1]);
          if (!pairing.valid || (profile.signature && ["Background", "Doctor's companion"].includes(pairing.kind))) issue("commander-pair", pairing.reason || "This pairing ability is not supported for Oathbreakers.", pairing.unsupported ? "unsupported" : "error");
        }
        const identity = new Set(commanders.flatMap(c => c.colorIdentity || []));
        const landColors = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
        const basicTypes = new Set();
        if (profile.colorlessBasicException && commanders.length === 1 && !identity.size) for (const entry of entries) {
          const card = deck.cards[entry.printingId];
          if (card && /\bBasic\b/.test(card.frontType) && /\bLand\b/.test(card.frontType)) for (const type of Object.keys(landColors)) if (new RegExp(`\\b${type}\\b`).test(card.frontType)) basicTypes.add(type);
        }
        if (basicTypes.size > 1) issue("brawl-basics", "A colourless Brawl commander permits basic lands of only one chosen basic land type.");
        if (commanders.length) for (const entry of entries) {
          const card = deck.cards[entry.printingId]; if (!card) continue;
          const required = new Set(card.colorIdentity || []);
          if (/\bLand\b/.test(card.frontType)) for (const [type, color] of Object.entries(landColors)) if (new RegExp(`\\b${type}\\b`).test(card.frontType)) required.add(color);
          const allowed = new Set(identity);
          if (basicTypes.size === 1 && /\bBasic\b/.test(card.frontType) && /\bLand\b/.test(card.frontType)) allowed.add(landColors[[...basicTypes][0]]);
          if ([...required].some(c => !allowed.has(c))) issue("identity", `${card.name} is outside the combined leader colour identity.`, "error", entry.key);
        }
        if (profile.signature) {
          const signatures = entries.filter(e => e.zone === "signature");
          if (signatures.length !== commanders.length || signature !== command) issue("signature-count", "Assign exactly one signature spell per Oathbreaker, each with quantity one.", signature < command ? "incomplete" : "error");
          const owners = new Set();
          for (const entry of signatures) {
            const card = deck.cards[entry.printingId]; if (!card) continue;
            const owner = commanders.find(c => c.id === entry.assignedTo);
            if (!owner) issue("signature-owner", `${card.name}: choose its Oathbreaker.`, "error", entry.key);
            else {
              if (owners.has(owner.id)) issue("signature-owner", `${owner.name} has more than one signature spell.`);
              owners.add(owner.id);
              if (!Array.isArray(owner.colorIdentity) || !Array.isArray(card.colorIdentity)) issue("signature-identity-unknown", `${card.name}: signature colour identity needs current data.`, "pending");
              else if (card.colorIdentity.some(c => !owner.colorIdentity.includes(c))) issue("signature-identity", `${card.name} must fit its own Oathbreaker's colour identity, not only the pair's combined identity.`, "error", entry.key);
            }
            const type = card.layout === "split" ? card.type : card.frontType;
            if (!/\bInstant\b|\bSorcery\b/.test(type)) issue("signature-type", `${card.name}: a signature spell must be an instant or sorcery on its front face (or a split spell).`, "error", entry.key);
            if (entry.quantity !== 1) issue("signature-quantity", `${card.name}: a signature assignment must contain one copy.`, "error", entry.key);
          }
        }
      }
    }
    // Union both English-name and Oracle identities: printings/sections cannot evade limits.
    const groups = [];
    for (const entry of entries) {
      const card = deck.cards[entry.printingId];
      if (!card) { issue("missing-card", "A preserved entry has no card record.", "pending", entry.key); continue; }
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1) issue("quantity", `${card.name}: invalid quantity.`, "error", entry.key);
      if (!["main", "sideboard", "commander", "signature"].includes(entry.zone)) issue("zone", `${card.name}: unsupported deck section.`, "error", entry.key);
      const matching = groups.filter(g => g.names.has(normal(card.name)) || (card.oracleId && g.ids.has(card.oracleId)));
      let group = matching[0];
      if (!group) { group = { names: new Set(), ids: new Set(), cards: [], count: 0 }; groups.push(group); }
      for (const other of matching.slice(1)) { for (const name of other.names) group.names.add(name); for (const id of other.ids) group.ids.add(id); group.cards.push(...other.cards); group.count += other.count; groups.splice(groups.indexOf(other), 1); }
      group.names.add(normal(card.name)); if (card.oracleId) group.ids.add(card.oracleId); group.cards.push(card); group.count += entry.quantity;
      if (!isVerified(card)) issue("stale", `${card.name}: current card data has not been verified in this session.`, "pending", entry.key);
      if (!card.oracleId || !Array.isArray(card.colorIdentity) || !card.frontType || card.manaValue === "Not supplied") issue("missing-data", `${card.name}: required card information is missing.`, "pending", entry.key);
      if (!card.printingDataComplete || !card.layout || !["black", "white", "borderless", "gold", "silver"].includes(card.borderColor)) issue("printing-data", `${card.name}: printing metadata is incomplete.`, "pending", entry.key);
      const legality = card.legalities?.[profile?.legalityKey];
      if (!legality || legality === "unknown" || !["legal", "not_legal", "banned", "restricted"].includes(legality)) issue("legality-unknown", `${card.name}: ${profile?.name || deck.format} legality is unavailable.`, "pending", entry.key);
      else if (!formats.supportedLegality(card, profile)) issue("legality", `${card.name}: ${legality === "banned" ? "banned" : "not legal"} in ${profile?.name || deck.format}.`, "error", entry.key);
      if (!card.games?.includes(profile?.platform) || card.oversized || ["gold", "silver"].includes(card.borderColor) || card.securityStamp === "acorn" || ["token", "double_faced_token", "emblem", "art_series", "scheme", "planar", "vanguard"].includes(card.layout)) issue("printing", `${card.name}: this exact printing is not a supported ${profile?.platform || "format"} game card. Select an appropriate printing; the saved entry has been preserved.`, "error", entry.key);
      if (profile?.originalVersions && (card.isRebalanced || /^A-/.test(card.name))) issue("rebalanced", `${card.name}: Gladiator uses original versions, not rebalanced A- cards.`, "error", entry.key);
      if (!card.availableFinishes?.includes(entry.finish)) issue("finish", `${card.name}: ${entry.finish} is not available for the saved printing. Choose a supported entry; it has not been removed.`, "error", entry.key);
    }
    for (const group of groups) {
      const restricted = profile?.restricted && group.cards.some(c => c.legalities?.[profile.legalityKey] === "restricted");
      const limit = restricted ? 1 : Math.min(...group.cards.map(c => copyLimit(c, deck.format)));
      if (group.count > limit) issue(restricted ? "restricted" : "copies", `${group.cards[0].name}: ${group.count} copies across all sections/printings; the ${restricted ? "restricted " : ""}limit is ${limit}.`);
    }
    const status = issues.some(i => i.severity === "unsupported") ? "unsupported" : issues.some(i => i.severity === "error") ? "illegal" : issues.some(i => i.severity === "pending") ? "unverified" : issues.length ? "incomplete" : "valid";
    return { status, complete: status === "valid", issues, main, side, command, signature, total, required: profile?.min || 0,
      label: { valid: "Construction checks passed", unsupported: "Unsupported configuration", illegal: "Needs correction", unverified: "Needs current card data", incomplete: "Incomplete deck" }[status] };
  }
  function statistics(deck) {
    const profile = formats.get(deck.format);
    const curve = Array(8).fill(0), distribution = Object.fromEntries([...colors, "C", "Unknown"].map(c => [c, 0]));
    const types = Object.fromEntries(["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Other"].map(t => [t, 0]));
    let count = 0, sum = 0, spells = 0, unknownMana = 0;
    for (const entry of deck.entries) {
      if (entry.zone === "sideboard" || (entry.zone === "commander" && !profile?.leaders) || (entry.zone === "signature" && !profile?.signature)) continue;
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
  const api = Object.freeze({ validate, statistics, copyLimit, leaderEligibility, pair, background, colorChoice, abilities });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckRules = api;
})(typeof window === "undefined" ? globalThis : window);
