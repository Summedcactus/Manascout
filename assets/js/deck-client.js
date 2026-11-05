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
    const oracleFacts = new Map();
    const proofs = new Map();
    const eligibilityJobs = new Map();
    const warnings = new Map();
    const eligibilityErrors = new Map();
    const events = [];
    let proofEra = 0;
    const currentTTL = 900000;
    const diagnostic = (area, error, identity = "") => {
      events.push({ area, kind: error.name === "AbortError" ? "cancelled" : error.status ? "remote-response" : "remote-data", status: error.status || null, message: error.message, identity, time: now() });
      if(events.length > 32)events.shift();
    };
    function waitFor(promise, signal) {
      if(!signal)return promise;
      if(signal.aborted)return Promise.reject(abortError());
      return new Promise((resolve,reject)=>{
        const cancel=()=>{signal.removeEventListener("abort",cancel);reject(abortError());};
        signal.addEventListener("abort",cancel,{once:true});
        promise.then(value=>{signal.removeEventListener("abort",cancel);if(signal.aborted)reject(abortError());else resolve(value);},error=>{signal.removeEventListener("abort",cancel);reject(error);});
      });
    }
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
        // Reject on timeout/abort even if fetch or its JSON reader ignores AbortSignal.
        let timer, rejectBoundary;
        const boundary = new Promise((_,reject)=>{rejectBoundary=reject;});
        const interrupted=()=>rejectBoundary(signal?.aborted ? abortError() : new data.SelectionError("The Scryfall request timed out. Try again when your connection is ready.",true));
        controller.signal.addEventListener("abort",interrupted,{once:true});
        timer=setTimeout(abort,timeout);
        try {
          lastStart = now();
          const work=(async()=>{
            const response=await fetchImpl(url,{method,headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),...(cache?{cache}:{}),signal:controller.signal});
            if(!response.ok){
              const error=new data.SelectionError(response.status===404?"No matching card was found.":response.status===429?"Scryfall is busy. Wait a moment before trying again.":"Scryfall could not complete this request. Try again later.",response.status!==404);
              error.status=response.status;throw error;
            }
            return response.json();
          })();
          return await Promise.race([work,boundary]);
        } catch (error) {
          const failure=signal?.aborted?abortError():error instanceof data.SelectionError?error:new data.SelectionError("Scryfall data is unavailable. Check your connection and try again.",true);
          diagnostic("request",failure,new URL(url).pathname);throw failure;
        } finally { clearTimeout(timer); controller.signal.removeEventListener("abort",interrupted); signal?.removeEventListener("abort",abort); }
      };
      const result = queue.catch(() => {}).then(task);
      queue = result.catch(() => {});
      return waitFor(result,signal);
    }
    const sharedKeys=["oracleId","name","type","frontType","frontText","rulesText","colorIdentity","legalities","keywords","hasPrintedPT","isRebalanced","manaValue"];
    const printingKeys=["id","layout","games","oversized","borderColor","securityStamp","printingDataComplete","availableFinishes","meldEntry"];
    const signature=(card,keys)=>JSON.stringify(keys.map(key=>["colorIdentity","games","availableFinishes","keywords"].includes(key)&&Array.isArray(card[key])?[...card[key]].sort():card[key]));
    const fresh=record=>!!record&&now()-record.time<currentTTL;
    const freeze=value=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    function isVerified(card) {
      const check=verified.get(card),record=latest.get(card?.id),oracle=oracleFacts.get(card?.oracleId);
      return !!check&&fresh(record)&&record.facts===check.facts&&oracle?.facts===check.oracleFacts;
    }
    // Resolve cached hints against current accepted facts; never re-stamp a cache hit as a fetch.
    function current(card) {
      const record=latest.get(card.id);
      if(!verified.has(card)||!record)return card;
      latest.delete(card.id);latest.set(card.id,record); // LRU only: never extend freshness.
      return record.card;
    }
    function complete(card,raw) {
      return !!card.oracleId && !!card.frontType && Array.isArray(card.colorIdentity) && card.manaValue!=="Not supplied" && card.printingDataComplete && card.availableFinishes.length>0 && card.legalities.commander!=="unknown" && (typeof raw.oracle_text==="string" || (Array.isArray(raw.card_faces)&&raw.card_faces.length>0&&raw.card_faces.every(face=>typeof face.oracle_text==="string")));
    }
    function contradicts(raw,card,previous) {
      if(raw.oracle_id&&card.oracleId!==previous.oracleId)return true;
      for(const key of ["type_line","oracle_text","color_identity","games","finishes"]) {
        if(!Object.hasOwn(raw,key))continue;
        const field={type_line:"type",oracle_text:"rulesText",color_identity:"colorIdentity",games:"games",finishes:"availableFinishes"}[key];
        if(JSON.stringify(card[field])!==JSON.stringify(previous[field]))return true;
      }
      return Object.entries(raw.legalities||{}).some(([key,status])=>["legal","not_legal","banned","restricted"].includes(status)&&previous.legalities[key]&&previous.legalities[key]!=="unknown"&&previous.legalities[key]!==status);
    }
    function remember(raw, selection = {}) {
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw?.id||""))throw new data.SelectionError("Scryfall returned an invalid printing identity. Retry Search or the current-card check.",true);
      const card = data.normaliseCard(raw, { id: raw.id?.toLowerCase(), ...selection });
      const previous=latest.get(card.id);
      const droppedLegality=previous&&Object.entries(previous.card.legalities).some(([key,status])=>status!=="unknown"&&card.legalities[key]==="unknown");
      if(!complete(card,raw)||droppedLegality){
        const error=new data.SelectionError("The card response is incomplete; current printing data could not be refreshed. Retry the current-card check.",true);
        diagnostic("card-refresh",error,card.id);
        if(previous&&contradicts(raw,card,previous.card)){
          latest.delete(card.id); proofs.delete(previous.card.oracleId);
          const oracle=oracleFacts.get(previous.card.oracleId);
          oracleFacts.set(previous.card.oracleId,{facts:"contradictory incomplete response",epoch:(oracle?.epoch||0)+1});
          throw new data.SelectionError("An incomplete response contradicts the saved card facts. Recheck this printing before continuing.",true);
        }
        if(previous&&isVerified(previous.card)){warnings.set(card.id,error.message);return previous.card;}
        throw error;
      }
      return verify(card);
    }
    function verify(card) {
      const oracleSignature=signature(card,sharedKeys),facts=signature(card,[...sharedKeys,...printingKeys]);
      const previous=oracleFacts.get(card.oracleId);
      if(previous&&previous.facts!==oracleSignature)proofs.delete(card.oracleId);
      oracleFacts.set(card.oracleId,{facts:oracleSignature,epoch:(previous?.epoch||0)+(previous?.facts===oracleSignature?0:1)});
      const previousPrinting=latest.get(card.id);
      const accepted=previousPrinting&&JSON.stringify(previousPrinting.card)===JSON.stringify(card)?previousPrinting.card:freeze(card);
      latest.delete(card.id);latest.set(card.id,{card:accepted,facts,time:now()});
      verified.set(accepted,{facts,oracleFacts:oracleSignature});warnings.delete(card.id);
      while(latest.size>5000)latest.delete(latest.keys().next().value);
      return accepted;
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
      const result = await cached(url, async () => {
        try {
          const result = await request(url, { signal });
          if (!Array.isArray(result.data)) throw new data.SelectionError("Scryfall returned an incomplete search response.", true);
          return { cards: result.data.map(raw => remember(raw)), nextPage: result.has_more ? result.next_page || "" : "", total: result.total_cards || result.data.length };
        } catch (error) { if (error.status === 404) return { cards: [], nextPage: "", total: 0 }; throw error; }
      });
      if(signal?.aborted)throw abortError();
      const cards=result.cards.map(current);
      return cards.every((card,index)=>card===result.cards[index])?result:{...result,cards};
    }
    async function random({ format = "commander", signal, excludeOracleId = "", commanderOnly = false } = {}) {
      const profile = formats.get(format);
      if (!profile) throw new data.SelectionError("Choose a supported format before discovering a card.");
      if (commanderOnly && format !== "commander") throw new data.SelectionError("Commander discovery is available only in Commander format.");
      if (excludeOracleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excludeOracleId)) throw new data.SelectionError("The previous card identity is invalid.");
      const query = [`f:${profile.legalityKey}`, `game:${profile.platform}`];
      if (commanderOnly) query.push("is:commander");
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
      const accepted=verify(card);
      if (commanderOnly) {
        if (!(await commanderEligibility(accepted, { signal }))) throw new data.SelectionError("This card's commander eligibility could not be verified. Try Discover again.");
        if (signal?.aborted) throw abortError();
      }
      return accepted;
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
        // Cached hints resolve to accepted records without invalidating the deck's equivalent
        // objects or reviving obsolete facts after a contradictory full refresh.
        cards.push(...response.cards.map(current));
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
    async function printing(selection, { signal, sameOracleAs = null } = {}) {
      data.parseSelection(`?printing=${encodeURIComponent(selection.id)}`);
      let raw;
      try { raw = await request(`${API}/cards/${selection.id}`, { signal }); }
      catch(error) {
        if(error.name!=="AbortError"&&latest.has(selection.id)) {
          warnings.set(selection.id,error.status===404?"This exact printing could not be found. Its saved entry is preserved; recheck or choose another edition.":error.message);
          if(error.status===404)latest.delete(selection.id);
        }
        throw error;
      }
      if (sameOracleAs && !data.sameOracleCard(sameOracleAs, data.normaliseCard(raw, selection))) throw new data.SelectionError("The new edition has different or incomplete Oracle gameplay data. Your current printing is preserved; recheck card data before retrying.",true);
      return remember(raw, selection);
    }
    // Catalogue hints are intentionally NOT promoted to authoritative gameplay facts.
    // Only the explicitly applied UUID goes through printing()/remember().
    async function printings(oracleId, { signal, page = "", format = "commander", order = "newest" } = {}) {
      const profile = formats.get(format);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oracleId || "") || !profile || !["newest","oldest"].includes(order)) throw new data.SelectionError("Invalid printing catalogue request.");
      const params = { q: `oracleid:${oracleId} game:${profile.platform}`, unique: "prints", order: "released", dir: order === "newest" ? "desc" : "asc", include_extras: "false", include_multilingual: "true", include_variations: "true" };
      function checkedPage(value) {
        const next = new URL(value);
        if (next.origin !== API || next.username || next.password || next.pathname !== "/cards/search" || !/^[1-9]\d*$/.test(next.searchParams.get("page") || "") || Object.entries(params).some(([key,value]) => next.searchParams.has(key) && next.searchParams.get(key) !== value)) throw new data.SelectionError("Invalid printing catalogue page.");
        return `${API}/cards/search?${new URLSearchParams({...params,page:next.searchParams.get("page")})}`;
      }
      const url = page ? checkedPage(page) : `${API}/cards/search?${new URLSearchParams(params)}`;
      const result = await cached(url, async () => {
        try {
          const raw = await request(url, { signal });
          if (!Array.isArray(raw.data) || raw.data.some(card => card?.oracle_id?.toLowerCase() !== oracleId.toLowerCase() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card?.id || ""))) throw new data.SelectionError("The printing catalogue did not match this Oracle card.",true);
          if (raw.has_more && !raw.next_page) throw new data.SelectionError("The printing catalogue omitted its next page. Retry the lookup.",true);
          return { cards: raw.data.map(card => data.normaliseCard(card,{id:card.id?.toLowerCase()})), nextPage: raw.has_more ? checkedPage(raw.next_page) : "", total: Number.isSafeInteger(raw.total_cards) ? raw.total_cards : null };
        } catch (error) { if (error.status === 404) return { cards: [], nextPage: "", total: 0 }; throw error; }
      });
      if (signal?.aborted) throw abortError();
      return result;
    }
    const proof = card => {
      const hit=proofs.get(card.oracleId);
      return hit&&fresh(hit)&&hit.era===proofEra&&hit.epoch===(oracleFacts.get(card.oracleId)?.epoch||0)?hit.eligible:null;
    };
    async function commanderEligibility(card, { signal, refresh = false } = {}) {
      if(signal?.aborted)throw abortError();
      if(!card.oracleId)throw new data.SelectionError("This printing has no Oracle identity; commander eligibility cannot be verified.");
      const known=proof(card);if(known!==null&&!refresh)return known;
      const epoch=oracleFacts.get(card.oracleId)?.epoch||0,era=proofEra;
      let job=eligibilityJobs.get(card.oracleId);
      if(!job||job.epoch!==epoch||job.era!==era){
        job={epoch,era};
        job.promise=(async()=>{
          let eligible=false;
          try{
            const result=await request(`${API}/cards/search?${new URLSearchParams({q:`oracleid:${card.oracleId} is:commander`,unique:"cards"})}`);
            if(!Array.isArray(result.data)||!result.data.length||result.data.some(c=>!c||typeof c.oracle_id!=="string")||!result.data.every(c=>c.oracle_id===card.oracleId))throw new data.SelectionError("Commander eligibility could not be verified: the response did not confirm the requested Oracle identity.",true);
            eligible=true;
          }catch(error){if(error.status!==404)throw error;}
          if(proofEra!==era||(oracleFacts.get(card.oracleId)?.epoch||0)!==epoch)throw new data.SelectionError("Card facts changed during the eligibility check. Recheck this commander.",true);
          proofs.set(card.oracleId,{eligible,time:now(),epoch,era});eligibilityErrors.delete(card.oracleId);return eligible;
        })().catch(error=>{if(proofEra===era&&(oracleFacts.get(card.oracleId)?.epoch||0)===epoch)eligibilityErrors.set(card.oracleId,error.message);diagnostic("commander-eligibility",error,card.oracleId);throw error;}).finally(()=>{if(eligibilityJobs.get(card.oracleId)===job)eligibilityJobs.delete(card.oracleId);});
        eligibilityJobs.set(card.oracleId,job);
      }
      return waitFor(job.promise,signal);
    }
    function commanderState(card) {
      const eligible=proof(card),record=latest.get(card.id),refreshError=warnings.get(card.id)||eligibilityErrors.get(card.oracleId)||"";
      const state=isVerified(card)&&["banned","not_legal"].includes(card.legalities.commander)?"verified-ineligible":isVerified(card)&&eligible!==null?(eligible?"verified-legal":"verified-ineligible"):eligibilityJobs.has(card.oracleId)?"pending":"temporarily-unverifiable";
      return {state,eligible,record:isVerified(card)?current(card):null,verifiedAt:record?.time||null,refreshError,cardRefreshError:warnings.get(card.id)||""};
    }
    async function ensure(cards,{signal}={}) {
      if(signal?.aborted)throw abortError();
      return cards.every(isVerified)?cards.map(current):refresh(cards,{signal});
    }
    async function refresh(cards, { signal } = {}) {
      const updated = [];
      for (let i = 0; i < cards.length; i += 75) {
        let result;
        try { result = await request(`${API}/cards/collection`, { signal, method: "POST", body: { identifiers: cards.slice(i, i + 75).map(card => ({ id: card.id })) } }); }
        catch(error){if(error.name!=="AbortError")for(const card of cards.slice(i,i+75))warnings.set(card.id,error.message);throw error;}
        if (!Array.isArray(result.data)) throw new data.SelectionError("The current-card check returned incomplete data.", true);
        const batch=cards.slice(i,i+75);
        const notFound=new Set((Array.isArray(result.not_found)?result.not_found:[]).map(item=>item?.id?.toLowerCase()).filter(id=>batch.some(card=>card.id===id)));
        for(const card of batch)if(!result.data.some(raw=>raw.id===card.id)){
          const message=notFound.has(card.id)?"Scryfall could not find this exact printing. Recheck it or select another printing; the saved entry is preserved.":"Scryfall omitted this printing from the refresh. Previously verified data is retained only until its normal expiry; retry the recheck.";
          warnings.set(card.id,message);diagnostic("card-refresh",new data.SelectionError(message,true),card.id);
          if(notFound.has(card.id))latest.delete(card.id);
        }
        for (const raw of result.data) {
          const old = cards.find(c => c.id === raw.id);
          if (old) updated.push(remember(raw, { requestedFinish: old.finish, guide: old.guide }));
        }
      }
      return updated;
    }
    return { search, random, candidates, euroRate, autocomplete, printing, printings, commanderEligibility, refresh, ensure, current, commanderState,
      isVerified, proof, diagnostics:()=>events.map(event=>({...event})),
      clearProofs:()=>{proofEra++;proofs.clear();} };
  }
  const api = Object.freeze({ createClient });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckClient = api;
})(typeof window === "undefined" ? globalThis : window);
