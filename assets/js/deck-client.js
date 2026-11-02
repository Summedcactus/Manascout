/* Paced, cancellable Scryfall access; no automatic network retries. */
((root) => {
  "use strict";
  const data = typeof module === "object" && module.exports ? require("./deck-data.js") : root.ManaScoutDeckData;
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
    const verified = new Map();
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
    function request(url, { signal, method = "GET", body } = {}) {
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
          const response = await fetchImpl(url, { method, headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
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
      verified.set(card.id, { card, time: now() });
      return card;
    }
    async function search(query, { signal, page = "" } = {}) {
      const q = String(query).trim().slice(0, 300);
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
    return { search, autocomplete, printing, commanderEligibility, refresh,
      isVerified: card => verified.get(card.id)?.card === card && now() - verified.get(card.id).time < 900000,
      proof: card => { const p = proofs.get(card.oracleId); return p && now() - p.time < 900000 ? p.eligible : null; },
      clearProofs: () => proofs.clear() };
  }
  const api = Object.freeze({ createClient });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckClient = api;
})(typeof window === "undefined" ? globalThis : window);
