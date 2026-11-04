/* Commander generation V1: bounded candidate pools, explicit roles, atomic model output.
 * Heuristics suggest a starting deck; they do not certify power brackets or combos. */
((root) => {
  "use strict";
  const common = typeof module === "object" && module.exports;
  const model = common ? require("./deck-model.js") : root.ManaScoutDeckModel;
  const rules = common ? require("./deck-rules.js") : root.ManaScoutDeckRules;
  const themes = {
    artifacts: { label: "Artifacts", query: '(t:artifact or o:"artifact")', leader: /artifact (?:spells?|cards?|tokens?)|artifacts? you control|whenever[^\n.]*artifact|for each artifact/i, seed: /\bArtifact\b/, support: /artifact|affinity|improvise|metalcraft/i },
    graveyard: { label: "Graveyard", query: '(o:"graveyard" or o:"mill" or o:"discard")', leader: /(?:from|in|into|leave|leaves|your) (?:your |a |the |their )?graveyard|\bmill\b|discard[^\n.]*card/i, support: /graveyard|\bmill\b|discard|dredge|flashback|escape|unearth|surveil/i },
    tokens: { label: "Tokens", query: 'o:"token"', leader: /(?:create|populate|tokens? you control|whenever[^\n.]*token|for each token)/i, support: /token|populate|convoke/i },
    spellslinger: { label: "Spellslinger", query: '(t:instant or t:sorcery or o:"instant" or o:"sorcery" or o:"noncreature spell")', leader: /instant|sorcery|noncreature spell|magecraft|prowess/i, seed: /\bInstant\b|\bSorcery\b/, support: /instant|sorcery|noncreature spell|magecraft|prowess|storm|copy[^\n.]*spell/i },
    aristocrats: { label: "Aristocrats", query: '(o:"sacrifice" or o:"dies" or o:"die")', leader: /(?:whenever|if)[^\n.]*\b(?:dies|die|sacrifice)\b|sacrifice (?:another|a) creature/i, support: /sacrifice|dies|die|create[^\n.]*token|return[^\n.]*creature/i },
    voltron: { label: "Voltron", query: '(t:equipment or t:aura or o:"equipped" or o:"enchanted" or o:"commander")', leader: /equipped|enchanted|auras? you control|equipment|attach|commander[^\n.]*(?:damage|\+\d)/i, seed: /\bEquipment\b|\bAura\b/, support: /equipment|aura|equipped|enchanted|attach|double strike|hexproof|indestructible|commander/i },
    ramp: { label: "Ramp", query: '(o:"landfall" or o:"land" or o:"mana")', leader: /landfall|lands? (?:you control|enters?|cards?)|additional land|mana[^\n.]*(?:double|twice)|double[^\n.]*mana/i, seed: /\bLand\b/, support: /landfall|lands?|mana|\{[WUBRGC]\}/i },
    aggro: { label: "Aggro", query: '(t:creature or o:"creatures you control")', leader: /(?:whenever[^\n.]*attack|creatures? you control[^\n.]*(?:\+|haste|trample)|combat damage|extra combat)/i, support: /attack|combat|haste|trample|double strike|creatures you control/i },
    control: { label: "Control", query: '(o:"counter target" or o:"draw" or o:"destroy" or o:"exile")', leader: /counter[^\n.]*spell|whenever[^\n.]*draw|opponents?[^\n.]*can[’']t|opponents?[^\n.]*cast[^\n.]*cost/i, support: /counter target|destroy|exile|draw|opponents?[^\n.]*can[’']t/i },
    combo: { label: "Combo", query: '(o:"untap" or o:"copy" or o:"sacrifice" or o:"return")', leader: /untap|copy[^\n.]*spell|sacrifice (?:another|a)|return[^\n.]*graveyard/i, support: /untap|copy|sacrifice|return[^\n.]*graveyard|you win|loses the game/i }
  };
  const abort = () => { throw Object.assign(Error("Generation cancelled. Your deck is unchanged."), { name: "AbortError" }); };
  const check = signal => { if (signal?.aborted) abort(); };
  const text = c => c.rulesText || c.frontText || "";
  const land = c => /\bLand\b/.test(c.frontType);
  const basic = c => /\bBasic\b/.test(c.frontType) && land(c);
  const creature = c => /\bCreature\b/.test(c.frontType);
  const mv = c => Number(c.manaValue);
  const normal = s => String(s).normalize("NFC").toLowerCase();
  const identity = c => Array.isArray(c.colorIdentity) ? c.colorIdentity : [];
  const fits = (c, colors) => Array.isArray(c.colorIdentity) && c.colorIdentity.every(color => colors.includes(color));
  function context(deck) {
    if (deck.format !== "commander" || !deck.selection) return null;
    const seed = deck.entries.find(e => e.printingId === deck.selection.printingId && e.finish === deck.selection.finish && e.zone === "commander") || deck.entries.find(e => e.printingId === deck.selection.printingId && e.finish === deck.selection.finish && e.zone === "main");
    if (!seed || !deck.cards[seed.printingId]) return null;
    return { seed, commanders: deck.entries.filter(e => e.zone === "commander") };
  }
  function needsConfirmation(deck) {
    const ctx = context(deck); if (!ctx) return false;
    const keep = new Set([...ctx.commanders.map(e => e.key), ctx.seed.key]);
    return deck.entries.some(e => !keep.has(e.key) || e.quantity !== 1);
  }
  function affinity(card, theme, leader = false) {
    const def = themes[theme]; if (!def) return 0;
    const t = text(card);
    if (leader) return def.leader.test(card.frontText || "") ? 4 : 0;
    let score = def.support.test(t) ? 2 : 0;
    if (def.seed?.test(card.frontType)) score += 3;
    if (theme === "tokens" && /create[^\n.]*token|populate/i.test(t)) score += 3;
    if (theme === "graveyard" && /mill|dredge|flashback|escape|unearth|return[^\n.]*graveyard/i.test(t)) score += 3;
    if (theme === "aristocrats" && /sacrifice (?:a|another)|whenever[^\n.]*(?:dies|die)|create[^\n.]*creature token/i.test(t)) score += 3;
    if (theme === "aggro" && creature(card) && (mv(card) <= 3 || /haste|trample|attack|combat/i.test(t))) score += 2;
    if (theme === "spellslinger" && /\bInstant\b|\bSorcery\b/.test(card.frontType)) score += 2;
    return score;
  }
  function infer(cards, leader = true) {
    return Object.keys(themes).map(key => ({ key, score: cards.reduce((n, c) => n + affinity(c, key, leader), 0) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  }
  function strategies(deck) {
    const ctx = context(deck); if (!ctx) return [];
    const cards = ctx.commanders.length ? ctx.commanders.map(e => deck.cards[e.printingId]) : [deck.cards[ctx.seed.printingId]];
    return infer(cards, !!ctx.commanders.length).map(x => ({ value: x.key, label: themes[x.key].label }));
  }
  function options(input = {}) {
    const o = { bracket: Number(input.bracket ?? 2), budget: input.budget === "" || input.budget == null ? null : Number(input.budget), strategy: input.strategy || "auto", curve: input.curve || "balanced", randomness: input.randomness || "reliable" };
    if (!Number.isInteger(o.bracket) || o.bracket < 1 || o.bracket > 5 || (o.budget !== null && (!Number.isFinite(o.budget) || o.budget < 1 || o.budget > 100000)) || (o.strategy !== "auto" && !themes[o.strategy]) || !["low", "balanced", "high"].includes(o.curve) || !["reliable", "mixed", "wild"].includes(o.randomness)) throw Error("Choose valid deck options. Budgets must be between £1 and £100,000.");
    return o;
  }
  function roles(c, strategy) {
    const t = text(c), r = new Set();
    if (land(c)) return new Set(["land"]);
    if (/\badd (?:an amount of |one |two |three |[WXUBRGC0-9} {/,]|mana)|search your library[^\n.]*land|additional land|(?:spells? you cast|spells? cost|spells? have)[^\n.]*less/i.test(t)) r.add("ramp");
    if (/\bdraw (?:a |an |one|two|three|four|\d|X|that many|cards)|draws?[^\n.]*cards?|exile[^\n.]*top[^\n.]*library[^\n.]*(?:play|cast)|look at[^\n.]*top[^\n.]*library/i.test(t)) r.add("draw");
    if (/destroy all|exile all|each creature gets -|damage to each creature/i.test(t)) r.add("wipe");
    else if (/destroy target|exile target|counter target|return target[^\n.]*to (?:its|their) owner|damage to any target|damage to target (?:creature|permanent)/i.test(t)) r.add("interaction");
    if (/hexproof|indestructible|phase out|protection from|counter target spell[^\n.]*targets/i.test(t)) r.add("protection");
    if (/return[^\n.]*from[^\n.]*graveyard|cast[^\n.]*from[^\n.]*graveyard|escape|flashback|unearth/i.test(t)) r.add("recursion");
    if (affinity(c, strategy) >= 2) r.add("synergy");
    if (/you win the game|loses? the game|each opponent[^\n.]*loses?|damage to each opponent|creatures you control get \+|double strike|extra combat|trample/i.test(t) || (creature(c) && mv(c) >= 5 && affinity(c, strategy) >= 2)) r.add("payoff");
    if (/create[^\n.]*token|mill|sacrifice (?:a|another)|discard|untap|equip|cost[^\n.]*less/i.test(t) && r.has("synergy")) r.add("enabler");
    return r;
  }
  function powerAllowed(c, o) {
    const t = text(c);
    if (o.bracket <= 2 && (/search your library for (?:a|any) card\b/i.test(t) || /extra turn|you win the game|loses the game|destroy (?:all|target) lands?/i.test(t) || (mv(c) <= 1 && /\bArtifact\b/.test(c.frontType) && /add \{/i.test(t)))) return false;
    return true;
  }
  function validCard(c, client) {
    if (!c || !c.oracleId) return false;
    try {
      const d = model.add(model.createDeck(), c);
      return !rules.validate(d, client).issues.some(i => !["size", "commander-missing"].includes(i.code));
    } catch { return false; }
  }
  function estimate(deck, rate) {
    let total = 0, unknown = 0;
    for (const e of deck.entries) {
      const value = deck.cards[e.printingId]?.pricesEUR?.[e.finish];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) unknown += e.quantity;
      else total += value * e.quantity * rate;
    }
    return { total, unknown };
  }
  function targets(commanders, o, strategy) {
    const high = Math.max(...commanders.map(mv));
    const lands = Math.max(32, Math.min(40, (o.curve === "low" ? 33 : o.curve === "high" ? 39 : 36) + (high >= 6 ? 2 : 0) + (strategy === "aggro" ? -1 : 0) - Math.max(0, o.bracket - 3)));
    return { land: lands, ramp: high >= 6 || strategy === "ramp" ? 12 : 9, draw: 10, interaction: strategy === "control" ? Math.max(11, 6 + o.bracket) : 6 + o.bracket, wipe: strategy === "aggro" ? 1 : 2, protection: strategy === "voltron" ? 5 : 3, recursion: ["graveyard", "aristocrats"].includes(strategy) ? 6 : 2, synergy: 20, enabler: 8, payoff: 5 };
  }
  async function generate(deck, input, { client, signal, random = Math.random, progress = () => {} } = {}) {
    const ctx = context(deck); if (!ctx) throw Error("In Commander, assign the selected printing as a commander or add it to the 99 first.");
    if (!client?.candidates || !client.refresh) throw Error("Generation is unavailable in this browser. Your deck is unchanged.");
    const o = options(input); check(signal);
    // Preserve exact IDs, finishes and assignments; refresh records without mutating the input.
    progress("Checking the seed and commander data…");
    const keep = [...ctx.commanders, ...(!ctx.commanders.some(e => e.key === ctx.seed.key) ? [ctx.seed] : [])];
    const records = await client.refresh([...new Map(keep.map(e => [e.printingId, deck.cards[e.printingId]])).values()], { signal }); check(signal);
    const fresh = new Map(records.map(c => [c.id, c]));
    let candidate = model.createDeck({ id: deck.id, name: deck.name });
    for (const e of keep) {
      const c = fresh.get(e.printingId);
      if (!c || !c.availableFinishes.includes(e.finish)) throw Error("The seed or commander printing could not be rechecked with its saved finish. Your deck is unchanged.");
      candidate = model.add(candidate, c, { finish: e.finish, zone: e.zone, quantity: e.quantity });
    }
    const seed = fresh.get(ctx.seed.printingId);
    let commanders = candidate.entries.filter(e => e.zone === "commander").map(e => candidate.cards[e.printingId]);
    let strategy = o.strategy;
    let rate = null;
    if (o.budget !== null) { rate = await client.euroRate({ signal }); check(signal); }
    const paid = c => o.budget === null || (typeof c.pricesEUR?.[c.finish] === "number" && c.pricesEUR[c.finish] > 0);
    if (o.budget !== null) {
      const seedCost = estimate(candidate, rate.rate);
      if (seedCost.unknown || seedCost.total >= o.budget) throw Error(seedCost.unknown ? "A preserved seed/commander finish has no EUR price. A pound budget cannot be checked; choose No limit or another seed." : "The preserved seed/commanders already use the budget. Increase it or choose No limit.");
    }
    if (!commanders.length) {
      const detected = infer([seed], false).filter(x => x.score >= 3);
      const hints = strategy === "auto" ? detected.slice(0, 3).map(x => x.key) : detected.some(x => x.key === strategy) ? [strategy] : [];
      if (!hints.length) throw Error("No confident mechanical theme was found for this seed. Choose a commander manually, then generate around it.");
      progress("Finding a mechanically compatible commander…");
      const color = identity(seed).join("").toLowerCase();
      const query = `is:commander ${color ? `id>=${color}` : ""} (${hints.map(k => themes[k].query).join(" or ")})`;
      const pool = await client.candidates(query, { signal, pages: 1, order: o.budget === null ? "edhrec" : "eur" }); check(signal);
      const ranked = pool.filter(c => validCard(c, client) && fits(seed, identity(c)) && c.oracleId !== seed.oracleId && normal(c.name) !== normal(seed.name) && !rules.background(c) && !rules.colorChoice(c) && paid(c)).map(c => {
        const matches = hints.filter(k => affinity(c, k, true) >= 4 && affinity(seed, k) >= 3);
        const extra = identity(c).filter(x => !identity(seed).includes(x)).length;
        return { c, matches, score: matches.length * 8 - extra * 2 - (o.budget === null ? 0 : c.pricesEUR[c.finish] * rate.rate) };
      }).filter(x => x.matches.length).sort((a, b) => b.score - a.score);
      let chosen;
      for (const item of ranked.slice(0, 4)) {
        if (o.budget !== null && estimate(candidate, rate.rate).total + item.c.pricesEUR[item.c.finish] * rate.rate > o.budget * .45) continue;
        if (await client.commanderEligibility(item.c, { signal })) { chosen = item; break; }
        check(signal);
      }
      check(signal);
      if (!chosen) throw Error("No confidently synergistic, legal commander was found in the candidate pool. Select a commander manually and retry.");
      commanders = [chosen.c];
      candidate = model.add(candidate, chosen.c, { zone: "commander" });
      if (strategy === "auto") strategy = chosen.matches[0];
    }
    for (const c of commanders) if (!rules.background(c)) { await client.commanderEligibility(c, { signal }); check(signal); }
    const precheck = rules.validate(candidate, client);
    const blocking = precheck.issues.find(i => i.code !== "size");
    if (blocking) throw Error(`The preserved seed/commander configuration needs correction: ${blocking.message}`);
    const colors = [...new Set(commanders.flatMap(identity))];
    if (strategy === "auto") strategy = infer(commanders, true)[0]?.key || (creature(commanders[0]) ? "aggro" : "control");
    if (o.strategy !== "auto" && !commanders.some(c => affinity(c, strategy, true) >= 4) && affinity(seed, strategy) < 3) throw Error("That strategy is not a confident match for the seed or commander. Use Auto or another listed strategy.");
    const target = targets(commanders, o, strategy);
    const ci = colors.length ? `id<=${colors.join("").toLowerCase()}` : "id=c";
    const base = `${ci} -t:land`;
    const order = o.budget === null ? "edhrec" : "eur";
    // At most 12 search pages including commander discovery; never fetch each card separately.
    const queries = [
      { q: `${ci} t:basic t:land -t:snow`, order: "name" },
      { q: `${ci} t:land -t:basic`, order },
      { q: `${base} (o:"add" or o:"search your library" or o:"additional land")`, order },
      { q: `${base} (o:"draw" or o:"look at" or o:"exile the top")`, order },
      { q: `${base} (o:"destroy" or o:"exile" or o:"counter target" or o:"damage to")`, order },
      { q: `${base} (o:"destroy all" or o:"exile all" or o:"each creature gets" or o:"damage to each creature")`, order },
      { q: `${base} (o:"hexproof" or o:"indestructible" or o:"graveyard" or o:"phase out")`, order },
      { q: `${base} ${themes[strategy].query}`, order, pages: 2 },
      { q: `${base} (o:"each opponent" or o:"creatures you control get" or o:"trample" or o:"double strike" or o:"win the game")`, order }
    ];
    const found = new Map();
    for (let i = 0; i < queries.length; i++) {
      check(signal); progress(`Finding ${themes[strategy].label.toLowerCase()} and deck roles (${i + 1}/${queries.length})…`);
      const q = queries[i];
      for (const c of await client.candidates(q.q, { signal, pages: q.pages || 1, order: q.order })) found.set(c.id, c);
    }
    check(signal);
    const used = new Set(Object.values(candidate.cards).map(c => c.oracleId));
    const usedNames = new Set(Object.values(candidate.cards).map(c => normal(c.name)));
    // No land destruction, extra turns or one-mana accelerants are slipped into casual targets.
    const pool = [...found.values()].filter(c => fits(c, colors) && validCard(c, client) && paid(c) && powerAllowed(c, o));
    const roleMap = new Map(pool.map(c => [c.id, roles(c, strategy)]));
    const jitter = new Map(pool.map(c => [c.id, random() * (o.randomness === "wild" ? 3 : o.randomness === "mixed" ? 1.2 : .15)]));
    const counts = () => {
      const result = Object.fromEntries(Object.keys(target).map(k => [k, 0]));
      for (const e of candidate.entries.filter(e => e.zone === "main")) for (const r of roles(candidate.cards[e.printingId], strategy)) result[r] += e.quantity;
      return result;
    };
    function price(c) { return o.budget === null ? 0 : c.pricesEUR[c.finish] * rate.rate; }
    function add(c) {
      candidate = model.add(candidate, c); used.add(c.oracleId); usedNames.add(normal(c.name));
    }
    function available(c) { return !used.has(c.oracleId) && !usedNames.has(normal(c.name)); }
    const basics = pool.filter(basic);
    const basicMap = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
    const needed = colors.length ? colors : ["C"];
    const chosenBasics = needed.map(color => basics.filter(c => color === "C" ? c.name === "Wastes" : c.name === basicMap[color]).sort((a, b) => price(a) - price(b))[0]);
    if (chosenBasics.some(c => !c)) throw Error("A suitable current basic-land printing or its budget price is missing. Your deck is unchanged.");
    const basicPrice = Math.min(...chosenBasics.map(price));
    const basicReserve = chosenBasics.reduce((n, c) => n + price(c), 0) + Math.max(0, target.land - chosenBasics.length) * basicPrice;
    // Reserve room for remaining cards; the final estimate is checked again after refresh.
    function affordable(c, reserve = 0) { return o.budget === null || estimate(candidate, rate.rate).total + price(c) + reserve <= o.budget; }
    // First build spells so the basic allocation can follow their actual coloured mana symbols.
    const spellsNeeded = 100 - commanders.length - target.land;
    while (model.count(candidate, "main") - counts().land < spellsNeeded) {
      check(signal);
      const have = counts();
      const choices = pool.filter(c => !land(c) && available(c) && roleMap.get(c.id).size && affordable(c, basicReserve));
      let best = null, bestScore = -Infinity;
      for (const c of choices) {
        const rs = roleMap.get(c.id);
        let score = 0;
        for (const r of rs) if (have[r] < target[r]) score += (1 - have[r] / target[r]) * (["ramp", "draw", "interaction", "payoff"].includes(r) ? 5 : r === "synergy" ? 4 : 2);
        score += affinity(c, strategy) * .75;
        const curve = o.curve === "low" ? 2.8 - o.bracket * .1 : o.curve === "high" ? 5 - o.bracket * .15 : 4 - o.bracket * .25;
        score -= Math.max(0, mv(c) - curve) * (.45 + o.bracket * .13);
        if (o.bracket >= 3 && /search your library for (?:a|any) card\b|untap|copy[^\n.]*spell/i.test(text(c))) score += (o.bracket - 2) * .55;
        const rank = c.edhrecRank || 100000;
        score += o.randomness === "reliable" ? Math.max(0, 2 - Math.log10(rank) / 2.5) : o.randomness === "wild" ? Math.min(1, Math.log10(rank) / 5) : 0;
        score += jitter.get(c.id);
        if (o.budget !== null) score -= price(c) * 1.5;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) throw Error("The bounded candidate pools cannot fill a coherent deck within these options. Try Auto, a higher budget or another commander. Your deck is unchanged.");
      add(best);
    }
    const have = counts();
    const minimum = { ramp: Math.min(7, target.ramp), draw: 6, interaction: 5, synergy: 12, payoff: 3 };
    for (const [role, n] of Object.entries(minimum)) if (have[role] < n) throw Error(`Not enough verified ${role} cards for a coherent ${themes[strategy].label.toLowerCase()} deck. Select a different strategy/commander or increase the budget.`);
    // Prefer basics; reserve up to eight useful fixing/utility lands for coloured decks.
    const nonbasics = pool.filter(c => land(c) && !basic(c) && available(c) && !/destroy target land|sacrifice[^\n.]*destroy[^\n.]*land/i.test(text(c)) && /add \{|any color|any colour|search your library[^\n.]*land/i.test(text(c))).sort((a, b) => price(a) - price(b) || (a.edhrecRank || 100000) - (b.edhrecRank || 100000));
    for (const c of nonbasics.slice(0, colors.length > 1 ? 8 : 3)) if (counts().land < target.land && affordable(c, (target.land - counts().land - 1) * basicPrice)) add(c);
    const weights = Object.fromEntries(needed.map(color => [color, 1]));
    for (const e of candidate.entries) for (const color of needed) weights[color] += ((candidate.cards[e.printingId].manaCost || "").match(new RegExp(`\\{[^}]*${color}[^}]*\\}`, "g")) || []).length * e.quantity;
    const allocated = Object.fromEntries(needed.map(color => [color, 0]));
    // Never meet a tight budget by silently omitting a required colour's basics.
    for (let i = 0; i < chosenBasics.length; i++) {
      const c = chosenBasics[i];
      if (!affordable(c)) throw Error("The budget cannot cover every required basic-land colour. Your deck is unchanged.");
      add(c); allocated[needed[i]]++;
    }
    while (model.count(candidate) < 100) {
      check(signal);
      const choices = chosenBasics.map((c, i) => ({ c, color: needed[i] })).filter(x => affordable(x.c, (99 - model.count(candidate)) * basicPrice)).sort((a, b) => allocated[a.color] / weights[a.color] - allocated[b.color] / weights[b.color]);
      if (!choices.length) throw Error("The mana base exceeds the available budget. Your deck is unchanged.");
      const { c, color } = choices[0]; add(c); allocated[color]++;
    }
    check(signal); progress("Rechecking all printings and final construction…");
    const refreshed = await client.refresh(Object.values(candidate.cards), { signal }); check(signal);
    if (new Set(refreshed.map(c => c.id)).size !== Object.keys(candidate.cards).length || Object.keys(candidate.cards).some(id => !refreshed.some(c => c.id === id))) throw Error("Some generated printing records could not be rechecked. Your deck is unchanged.");
    candidate = model.replaceRecords(candidate, refreshed);
    for (const c of candidate.entries.filter(e => e.zone === "commander").map(e => candidate.cards[e.printingId])) if (!rules.background(c)) { await client.commanderEligibility(c, { signal }); check(signal); }
    candidate = model.select(candidate, candidate.cards[ctx.seed.printingId], ctx.seed.finish);
    const validation = rules.validate(candidate, client);
    if (!validation.complete) throw Error(`Generation did not pass the existing construction checks: ${validation.issues[0]?.message || validation.label} Your deck is unchanged.`);
    const cost = rate ? estimate(candidate, rate.rate) : null;
    if (cost && (cost.unknown || cost.total > o.budget)) throw Error("Current pricing could not confirm the selected budget after the final check. Your deck is unchanged; try No limit or a higher budget.");
    check(signal);
    return { deck: model.edit(deck, { entries: candidate.entries, cards: candidate.cards, selection: candidate.selection }), strategy, target, roles: counts(), bracket: o.bracket, estimate: cost ? { gbp: cost.total, rateDate: rate.date, budget: o.budget } : null,
      note: `Generated a ${themes[strategy].label.toLowerCase()} starting deck. Bracket ${o.bracket} is a power preference, not certification. Review synergies and win conditions before play; no combo verification is claimed.${cost ? ` Estimated £${cost.total.toFixed(2)} using Scryfall EUR prices and the ${rate.date} EUR/GBP reference rate; shipping and availability excluded.` : " No budget or price guarantee."}` };
  }
  const api = Object.freeze({ generate, context, needsConfirmation, strategies, affinity, roles, options, estimate, targets });
  if (common) module.exports = api; else root.ManaScoutDeckGenerator = api;
})(typeof window === "undefined" ? globalThis : window);
