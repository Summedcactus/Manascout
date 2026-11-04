/* Paced, cancellable Scryfall access; no automatic network retries. */
((root) => {
  "use strict";
  const data = typeof module === "object" && module.exports ? require("./deck-data.js") : root.ManaScoutDeckData;
  const formats = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
  const API = "https://api.scryfall.com";
  const abortError = () => Object.assign(new Error("Request cancelled."), { name: "AbortError" });
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => { signal?.removeEventListener("abort", cancel); resolve(); };
    const timer = setTimeout(done, ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(abortError()); };
    signal?.addEventListener("abort", cancel, { once: true });
  });
  function createClient({ fetchImpl = root.fetch?.bind(root), interval = 130, timeout = 12000, now = Date.now } = {}) {
    let queue = Promise.resolve();
    let lastStart = -Infinity;
    const cache = new Map();
    const verified = new WeakMap();
    const latest = new Map();
    let generation = 0;
    const proofs = new Map();
    function cached(key, task, ttl = 300000) {
      const hit = cache.get(key);
      if (hit && now() - hit.time < ttl) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit.value); }
      return task().then(value => {
        cache.set(key, { value, time: now() });
        while (cache.size > 16) cache.delete(cache.keys().next().value);
        return value;
      });
    }
    function request(url, { signal, method = "GET", body, cache } = {}) {
      if (!fetchImpl) return Promise.reject(new data.SelectionError("Scryfall requests are not supported by this browser.", true));
      const task = async () => {
        if (signal?.aborted) throw abortError();
        await pause(Math.max(0, interval - (now() - lastStart)), signal);
        if (signal?.aborted) throw abortError();
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
          lastStart = now();
          const response = await fetchImpl(url, { method, headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), ...(cache ? { cache } : {}), signal: controller.signal });
          if (!response.ok) {
            const error = new data.SelectionError(response.status === 404 ? "No matching card was found." : response.status === 429 ? "Scryfall is busy. Wait a moment before trying again." : "Scryfall could not complete this request. Try again later.", response.status !== 404);
            error.status = response.status; throw error;
          }
          return await response.json();
        } catch (error) {
          if (signal?.aborted) throw abortError();
          if (error instanceof data.SelectionError) throw error;
          throw new data.SelectionError(controller.signal.aborted ? "The Scryfall request timed out. Try again when your connection is ready." : "Scryfall data is unavailable. Check your connection and try again.", true);
        } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
      };
      const result = queue.catch(() => {}).then(task);
      queue = result.catch(() => {});
      return result;
    }
    function remember(raw, selection = {}) {
      const card = data.normaliseCard(raw, { id: raw.id?.toLowerCase(), ...selection });
      return verify(card);
    }
    function verify(card) {
      latest.delete(card.id); latest.set(card.id, ++generation);
      verified.set(card, { generation, time: now() });
      while (latest.size > 20000) latest.delete(latest.keys().next().value);
      return card;
    }
    async function search(query, { signal, page = "", format = "commander" } = {}) {
      const text = String(query).trim().slice(0, 300);
      const profile = formats.get(format);
      if (!profile) throw new data.SelectionError("Unsupported search format.");
      const q = text ? `(${text}) game:${profile.platform}` : "";
      if (!q) return { cards: [], nextPage: "", total: 0 };
      let url = `${API}/cards/search?${new URLSearchParams({ q, unique: "cards", order: "name", include_extras: "false" })}`;
      if (page) {
        const next = new URL(page);
        if (next.origin !== API || next.pathname !== "/cards/search") throw new data.SelectionError("Invalid search page.");
        url = next.href;
      }
      return cached(url, async () => {
        try {
          const result = await request(url, { signal });
          if (!Array.isArray(result.data)) throw new data.SelectionError("Scryfall returned an incomplete search response.", true);
          return { cards: result.data.map(raw => remember(raw)), nextPage: result.has_more ? result.next_page || "" : "", total: result.total_cards || result.data.length };
        } catch (error) { if (error.status === 404) return { cards: [], nextPage: "", total: 0 }; throw error; }
      });
    }
    async function random({ format = "commander", signal, excludeOracleId = "" } = {}) {
      const profile = formats.get(format);
      if (!profile) throw new data.SelectionError("Choose a supported format before discovering a card.");
      if (excludeOracleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excludeOracleId)) throw new data.SelectionError("The previous card identity is invalid.");
      const query = [`f:${profile.legalityKey}`, `game:${profile.platform}`];
      if (excludeOracleId) query.push(`-oracleid:${excludeOracleId}`);
      if (profile.originalVersions) query.push("-is:rebalanced");
      const raw = await request(`${API}/cards/random?${new URLSearchParams({ q: query.join(" ") })}`, { signal, cache: "no-store" });
      if (signal?.aborted) throw abortError();
      if (raw?.object !== "card" || typeof raw.id !== "string") throw new data.SelectionError("Scryfall returned an incomplete random-card response. Try Discover again.");
      const identity = data.parseSelection(`?printing=${encodeURIComponent(raw.id)}`);
      if (!identity) throw new data.SelectionError("Scryfall returned a printing without an identity. Try Discover again.");
      const card = data.normaliseCard(raw, identity);
      if (!formats.supportedLegality(card, profile) || !card.games.includes(profile.platform)) throw new data.SelectionError("Scryfall returned a card whose format or platform could not be verified. Try Discover again.");
      if (!card.oracleId || !card.frontType || card.manaValue === "Not supplied" || !Array.isArray(card.colorIdentity) || !card.printingDataComplete || !card.images.length || !card.availableFinishes.length || !["black", "white", "borderless"].includes(card.borderColor)) throw new data.SelectionError("The discovered printing has incomplete card information. Try Discover again.");
      if (card.oversized || ["gold", "silver"].includes(card.borderColor) || card.securityStamp === "acorn" || ["token", "double_faced_token", "emblem", "art_series", "scheme", "planar", "vanguard"].includes(card.layout) || /\bAttraction\b|\bContraption\b|\bDungeon\b|\bConspiracy\b|\bStickers\b/.test(card.frontType) || (card.layout === "meld" && card.meldEntry !== "meld_part")) throw new data.SelectionError("This printing needs a special-card workflow. Try Discover again for a supported game card.");
      if (profile.originalVersions && card.isRebalanced) throw new data.SelectionError("Gladiator discovery requires an original, unrebalanced card.");
      if (card.oracleId === excludeOracleId) throw new data.SelectionError("Scryfall repeated the previous card. Try Discover again.");
      return verify(card);
    }
    // Bounded role pools share the same queue, pacing, normalisation and cache as Search.
    async function candidates(query, { signal, pages = 1, order = "edhrec" } = {}) {
      if (!["edhrec", "eur", "name"].includes(order) || !Number.isInteger(pages) || pages < 1 || pages > 2) throw new data.SelectionError("Invalid generation pool request.");
      let url = `${API}/cards/search?${new URLSearchParams({ q: `f:commander game:paper (${query})`, unique: "cards", order, dir: "asc", include_extras: "false" })}`;
      const cards = [];
      for (let page = 0; page < pages && url; page++) {
        if (signal?.aborted) throw abortError();
        const key = url;
        const response = await cached(key, async () => {
          try {
            const result = await request(key, { signal });
            if (!Array.isArray(result.data)) throw new data.SelectionError("Scryfall returned an incomplete candidate pool.", true);
            return { cards: result.data.map(raw => remember(raw)), next: result.has_more ? result.next_page || "" : "" };
          } catch (error) { if (error.status === 404) return { cards: [], next: "" }; throw error; }
        });
        // Reuse cached candidate hints even after a previous deck's final refresh replaced
        // their object identities. Every selected record still gets a fresh final collection check.
        cards.push(...response.cards.map(card => verify(card)));
        url = response.next;
        if (url) { const next = new URL(url); if (next.origin !== API || next.pathname !== "/cards/search") throw new data.SelectionError("Invalid candidate pool page."); }
      }
      if (signal?.aborted) throw abortError();
      return cards;
    }
    async function euroRate({ signal } = {}) {
      const url = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP";
      return cached(url, async () => {
        const raw = await request(url, { signal });
        const age = now() - Date.parse(raw?.date);
        if (raw?.base !== "EUR" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date || "") || !Number.isFinite(age) || age < -86400000 || age > 7 * 86400000 || typeof raw.rates?.GBP !== "number" || !Number.isFinite(raw.rates.GBP) || raw.rates.GBP <= 0) throw new data.SelectionError("A current EUR/GBP reference rate is unavailable. Try No limit, or retry later.");
        return { rate: raw.rates.GBP, date: raw.date };
      }, 3600000);
    }
    async function autocomplete(query, { signal } = {}) {
      const q = String(query).trim().slice(0, 200);
      if (q.length < 2) return [];
      const url = `${API}/cards/autocomplete?${new URLSearchParams({ q, include_extras: "false" })}`;
      return cached(url, async () => {
        const result = await request(url, { signal });
        if (!Array.isArray(result.data)) return [];
        return result.data.filter(name => typeof name === "string").slice(0, 6);
      });
    }
    async function printing(selection, { signal } = {}) {
      data.parseSelection(`?printing=${encodeURIComponent(selection.id)}`);
      const raw = await request(`${API}/cards/${selection.id}`, { signal });
      return remember(raw, selection);
    }
    async function commanderEligibility(card, { signal } = {}) {
      if (!card.oracleId) throw new data.SelectionError("This printing has no Oracle identity; commander eligibility cannot be verified.");
      const hit = proofs.get(card.oracleId);
      if (hit && now() - hit.time < 900000) return hit.eligible;
      let eligible = false;
      try {
        const result = await request(`${API}/cards/search?${new URLSearchParams({ q: `oracleid:${card.oracleId} is:commander`, unique: "cards" })}`, { signal });
        if (!Array.isArray(result.data)) throw new data.SelectionError("Commander eligibility could not be verified.", true);
        eligible = result.data.some(c => c.oracle_id === card.oracleId);
      } catch (error) { if (error.status !== 404) throw error; }
      proofs.set(card.oracleId, { eligible, time: now() });
      return eligible;
    }
    async function refresh(cards, { signal } = {}) {
      const updated = [];
      for (const card of cards) latest.delete(card.id);
      for (let i = 0; i < cards.length; i += 75) {
        const result = await request(`${API}/cards/collection`, { signal, method: "POST", body: { identifiers: cards.slice(i, i + 75).map(card => ({ id: card.id })) } });
        if (!Array.isArray(result.data)) throw new data.SelectionError("The current-card check returned incomplete data.", true);
        for (const raw of result.data) {
          const old = cards.find(c => c.id === raw.id);
          if (old) updated.push(remember(raw, { requestedFinish: old.finish, guide: old.guide }));
        }
      }
      return updated;
    }
    return { search, random, candidates, euroRate, autocomplete, printing, commanderEligibility, refresh,
      isVerified: card => { const check = verified.get(card); return !!check && latest.get(card.id) === check.generation && now() - check.time < 900000; },
      proof: card => { const p = proofs.get(card.oracleId); return p && now() - p.time < 900000 ? p.eligible : null; },
      clearProofs: () => proofs.clear() };
  }
  const api = Object.freeze({ createClient });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckClient = api;
})(typeof window === "undefined" ? globalThis : window);
