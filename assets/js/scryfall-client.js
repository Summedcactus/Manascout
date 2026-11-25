/* Shared, read-only Scryfall transport. Card identity and display rules belong to callers. */
((root) => {
  "use strict";

  const origin = "https://api.scryfall.com";
  const defaults = Object.freeze({ interval: 105, timeout: 12000, cacheTtl: 300000, cacheLimit: 32 });

  class ScryfallError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = code === "abort" ? "AbortError" : "ScryfallError";
      this.code = code;
      Object.assign(this, details);
    }
  }

  const aborted = () => new ScryfallError("abort", "Request cancelled.");
  function checkAbort(signal) {
    if (signal.aborted) throw aborted();
  }

  function apiUrl(value) {
    if (typeof value !== "string" || !/^https:\/\//i.test(value) ||
        /[\\\x00-\x20\x7f]|%(?![\da-f]{2})/i.test(value)) return null;
    try {
      const url = new URL(value);
      return url.origin === origin && !url.username && !url.password && !url.hash ? url : null;
    } catch {
      return null;
    }
  }

  function searchPageUrl(value) {
    const url = apiUrl(value);
    return url?.pathname === "/cards/search" ? url.href : "";
  }

  function cooldownMs(header, now) {
    const value = header?.trim() || "";
    let seconds;
    if (/^\d+$/.test(value)) seconds = Number(value);
    else if (/^[a-z]{3}, \d{2} [a-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/i.test(value)) {
      seconds = (Date.parse(value) - now) / 1000;
    }
    return Math.max(1, Math.min(60, Number.isNaN(seconds) || seconds === undefined ? 10 : seconds)) * 1000;
  }

  function pause(ms, signal) {
    return new Promise((resolve, reject) => {
      checkAbort(signal);
      const cancel = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        reject(aborted());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, ms);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  function createClient({
    fetchImpl = root.fetch?.bind(root), now = Date.now, interval = defaults.interval,
    timeout = defaults.timeout, cacheTtl = defaults.cacheTtl, cacheLimit = defaults.cacheLimit
  } = {}) {
    let queue = Promise.resolve();
    let lastStart = -Infinity;
    let cooldownUntil = 0;
    const pending = new Map();
    const cache = new Map();

    const limited = () => new ScryfallError("http", "Scryfall HTTP 429.", { status: 429, retryAt: cooldownUntil });

    // Queue the starts only. A slow body must not stall a later independent lookup.
    function schedule(signal, begin) {
      let request;
      const slot = queue.then(async () => {
        checkAbort(signal);
        if (now() < cooldownUntil) throw limited();
        let remaining = interval - (now() - lastStart);
        while (remaining > 0) {
          await pause(remaining, signal);
          remaining = interval - (now() - lastStart);
        }
        checkAbort(signal);
        if (now() < cooldownUntil) throw limited();
        lastStart = now();
        request = begin();
      });
      queue = slot.catch(() => {});
      return slot.then(() => request);
    }

    async function fetchJson(url, signal, deadline, random) {
      checkAbort(signal);
      const controller = new AbortController();
      let interrupt;
      const boundary = new Promise((_, reject) => { interrupt = reject; });
      const stop = error => {
        interrupt(error);
        controller.abort();
      };
      const cancel = () => stop(aborted());
      const timer = setTimeout(() => stop(new ScryfallError("timeout", "Scryfall request timed out.")), deadline);
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const work = (async () => {
          let response;
          try {
            response = await fetchImpl(url, {
              signal: controller.signal, redirect: "error", headers: { Accept: "application/json" },
              ...(random ? { cache: "no-store" } : {})
            });
          } catch {
            checkAbort(controller.signal);
            throw new ScryfallError("network", "Scryfall request failed.");
          }
          checkAbort(controller.signal);
          if (!response || typeof response.ok !== "boolean" || response.redirected || (response.url && !apiUrl(response.url))) {
            throw new ScryfallError("invalid_response", "Invalid Scryfall response.");
          }
          if (response.status === 429) {
            const time = now();
            cooldownUntil = Math.max(cooldownUntil, time + cooldownMs(response.headers?.get("Retry-After"), time));
            throw limited();
          }
          if (!response.ok) throw new ScryfallError("http", `Scryfall HTTP ${response.status}.`, { status: response.status });
          try {
            return await response.json();
          } catch {
            checkAbort(controller.signal);
            throw new ScryfallError("invalid_response", "Scryfall returned invalid JSON.");
          }
        })();
        return await Promise.race([work, boundary]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      }
    }

    function forget(job) {
      if (pending.get(job.key) === job) pending.delete(job.key);
    }

    function subscribe(job, signal) {
      job.users++;
      if (!signal) return job.promise;
      return new Promise((resolve, reject) => {
        const cancel = () => {
          signal.removeEventListener("abort", cancel);
          if (--job.users === 0) {
            forget(job);
            job.controller.abort();
          }
          reject(aborted());
        };
        const finish = callback => value => {
          if (signal.aborted) return;
          signal.removeEventListener("abort", cancel);
          job.users--;
          callback(value);
        };
        signal.addEventListener("abort", cancel, { once: true });
        job.promise.then(finish(resolve), finish(reject));
      });
    }

    async function get(resource, { signal, cache: useCache = false, timeout: deadline = timeout } = {}) {
      if (signal?.aborted) throw aborted();
      const url = apiUrl(resource);
      if (!url) throw new ScryfallError("invalid_url", "Invalid Scryfall API URL.");
      const random = url.pathname === "/cards/random";
      const save = useCache && !random && cacheLimit > 0 && cacheTtl > 0;
      if (save) {
        const hit = cache.get(url.href);
        cache.delete(url.href);
        if (hit && hit.expires > now()) {
          cache.set(url.href, hit);
          return hit.data;
        }
      }

      const key = random ? null : `${save}:${deadline}:${url.href}`;
      let job = pending.get(key);
      if (!job) {
        const controller = new AbortController();
        job = { key, controller, users: 0 };
        job.promise = schedule(controller.signal, () => fetchJson(url.href, controller.signal, deadline, random))
          .then(data => {
            if (save && !controller.signal.aborted) {
              cache.set(url.href, { data, expires: now() + cacheTtl });
              while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
            }
            return data;
          })
          .finally(() => forget(job));
        if (key !== null) pending.set(key, job);
      }
      return subscribe(job, signal);
    }

    return Object.freeze({ get });
  }

  const api = Object.freeze({ origin, searchPageUrl, createClient, ...createClient() });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutScryfall = api;
})(typeof window === "undefined" ? globalThis : window);
