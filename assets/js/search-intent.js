/* Translate a small natural-language vocabulary into owned catalogue filters. */
((root) => {
  "use strict";
  const rarities = ["common", "uncommon", "rare", "mythic", "special", "bonus"];
  const finishes = ["nonfoil", "foil", "etched"];
  const colours = { white: "w", blue: "u", black: "b", red: "r", green: "g", colourless: "c", colorless: "c" };
  const types = new Set(("artifact battle creature enchantment instant land planeswalker sorcery legendary snow basic kindred " +
    "dragon jellyfish vampire goblin elf wizard human merfolk zombie soldier angel demon beast knight " +
    "sliver dinosaur elemental spirit cat dog rat squirrel shapeshifter phyrexian faerie pirate rogue " +
    "cleric warrior construct vehicle equipment aura saga room spider hero forest island mountain plains swamp").split(" "));
  const plain = value => String(value || "").trim().replace(/\s+/g, " ");
  const key = value => plain(value).toLowerCase().replace(/’/g, "'");
  const number = /^\d[\p{L}\d★†-]{0,15}$/u;
  const safeText = value => plain(value).replace(/[^\p{L}\p{M}\p{N}\s.,'’&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const quote = value => '"' + safeText(value) + '"';

  function makeSetIndex(records) {
    const names = new Map();
    for (const set of records) {
      if (set?.digital || !/^[a-z0-9]{2,8}$/.test(set?.code || "") || !set.name) continue;
      names.set(key(set.name), set);
      names.set(set.code, set);
    }
    const alpha = names.get("lea");
    if (alpha) names.set("alpha", alpha);
    return names;
  }

  function interpret(raw, filters = {}, sets = new Map(), languages = {}) {
    let query = plain(raw).slice(0, 160);
    const criteria = {};
    let artist = query.match(/(?:^|\s)artist\s*:\s*(?:"([^"]+)"|(.+))$/i);
    if (artist) {
      criteria.artist = safeText(artist[1] || artist[2]);
      if (!criteria.artist) throw new Error("Enter an artist name.");
      query = query.slice(0, artist.index).trim();
    }
    const treatment = query.match(/(?:^|\s)(extended[ -]art|full[ -]art|borderless|showcase|retro[ -]frame)(?=\s|$)/i);
    if (treatment) {
      criteria.treatment = key(treatment[1]).replace(/[- ]/g, "");
      query = (query.slice(0, treatment.index) + query.slice(treatment.index + treatment[0].length)).trim();
    }
    const finish = query.match(/(?:^|\s)(traditional foil|etched foil|nonfoil|foil|etched)(?=\s|$)/i);
    if (finish) {
      const label = key(finish[1]);
      criteria.finish = label === "etched foil" ? "etched" : label === "traditional foil" ? "foil" : label;
      query = (query.slice(0, finish.index) + query.slice(finish.index + finish[0].length)).trim();
    }
    const languageNames = new Map(Object.entries(languages).map(([code, label]) => [key(label), code]));
    for (const [label, code] of [...languageNames].sort((a, b) => b[0].length - a[0].length)) {
      const suffix = [label + " language", label].find(value => key(query).endsWith(" " + value) ||
        key(query) === value && !types.has(value));
      const prefix = !types.has(label) && [label + " language", label].find(value => key(query).startsWith(value + " "));
      if (suffix || prefix) {
        criteria.language = code;
        query = (suffix ? query.slice(0, -suffix.length) : query.slice(prefix.length)).trim();
        break;
      }
    }
    const explicitNumber = query.match(/(?:^|\s)(?:collector\s*#?\s*|#)(\d[\p{L}\d★†-]{0,15})$/iu);
    if (explicitNumber) {
      criteria.collector_number = explicitNumber[1];
      query = query.slice(0, explicitNumber.index).trim();
    }
    const words = query ? query.split(" ") : [];
    const trailing = words.at(-1);
    const hasNumber = !criteria.collector_number && trailing && number.test(trailing);
    const findSet = tokens => {
      for (let i = 0; i < tokens.length; i++) {
        const set = sets.get(key(tokens.slice(i).join(" ")));
        if (set) return { set, index: i };
      }
      return null;
    };
    let match = findSet(words);
    if (!match && hasNumber) {
      match = findSet(words.slice(0, -1));
      criteria.collector_number = trailing;
      words.pop();
    }
    if (match) {
      criteria.set = match.set.code;
      words.splice(match.index);
    }
    const lower = words.map(key);
    const discovery = lower.some(word => rarities.includes(word) || Object.hasOwn(colours, word) || finishes.includes(word)) ||
      lower.every(word => types.has(word) || word === "commander") && lower.some(word => types.has(word));
    const type = [];
    const name = [];
    for (const word of words) {
      const token = key(word);
      if (!discovery) name.push(word);
      else if (rarities.includes(token)) criteria.rarity = token;
      else if (Object.hasOwn(colours, token)) criteria.colour = colours[token];
      else if (finishes.includes(token)) criteria.finish = token;
      else if (types.has(token)) type.push(token);
      else if (token === "commander" && lower.some(word => types.has(word))) criteria.commander = true;
      else name.push(word);
    }
    if (type.length) criteria.type = type.join(" ");
    for (const field of ["set", "collector_number", "rarity", "colour", "type", "artist", "finish", "language"]) {
      const value = plain(filters[field]);
      if (!value) continue;
      if (field === "set") {
        const set = sets.get(key(value));
        if (!set) throw new Error("Set not found. Enter a catalogue set name or code.");
        criteria.set = set.code;
      } else if (field === "collector_number" && number.test(value.replace(/^#/, ""))) criteria[field] = value.replace(/^#/, "");
      else if (field === "rarity" && rarities.includes(value) ||
               field === "colour" && (value === "m" || Object.values(colours).includes(value)) ||
               field === "finish" && finishes.includes(value) ||
               field === "language" && Object.hasOwn(languages, value)) criteria[field] = value;
      else if (["type", "artist"].includes(field) && safeText(value)) criteria[field] = safeText(value);
      else throw new Error("Check the " + field.replace("_", " ") + " filter.");
    }
    const cardName = name.join(" ");
    const fields = Object.keys(criteria);
    const lookup = criteria.set && criteria.collector_number;
    const category = lookup ? "exact_printing" : fields.length > 1 || (cardName && fields.length) ? "combined" :
      fields.length ? (["finish", "language", "commander", "treatment"].includes(fields[0]) ? "combined" : fields[0]) : "name";
    const printing = Boolean(criteria.set || criteria.collector_number || criteria.artist || criteria.finish || criteria.treatment || criteria.language);
    const clauses = ["game:paper"];
    clauses.push("lang:" + (criteria.language || "en"));
    if (cardName && safeText(cardName)) clauses.push(quote(cardName));
    if (criteria.set) clauses.push("set:" + criteria.set);
    if (criteria.collector_number) clauses.push('cn="' + criteria.collector_number + '"');
    if (criteria.rarity) clauses.push("r:" + criteria.rarity);
    if (criteria.colour) clauses.push("c" + (criteria.colour === "c" ? "=" : ":") + criteria.colour);
    if (criteria.type) clauses.push(...criteria.type.split(" ").map(word => "t:" + quote(word)));
    if (criteria.artist) clauses.push("a:" + quote(criteria.artist));
    if (criteria.treatment) clauses.push(criteria.treatment === "retroframe" ? "frame:old" : "is:" + criteria.treatment);
    if (criteria.finish) clauses.push("finish:" + criteria.finish);
    if (criteria.commander) clauses.push("is:commander");
    return { cardName, criteria, category, printing, lookup, query: clauses.join(" ") };
  }

  const api = { interpret, makeSetIndex };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutSearchIntent = api;
})(globalThis);
