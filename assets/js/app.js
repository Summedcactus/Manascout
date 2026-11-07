
/* ManaScout search and printings — DEVELOPMENT full replacement */
(() => {
  "use strict";

  const API = "https://api.scryfall.com";
  const FX = "https://api.frankfurter.dev/v2/rate";
  const $ = id => document.getElementById(id);

  const ui = {
    form: $("search-form"),
    input: $("search-input"),
    suggestions: $("autocomplete-list"),
    details: $("card-details"),
    printings: $("printings-container"),
    status: $("printings-status")
  };

  const guideName =
    document.body?.dataset?.cardName?.trim() || "";

  const GUIDE_SLUGS = new Set([
    "ancient-tomb",
    "arcane-signet",
    "birds-of-paradise",
    "black-lotus",
    "captain-jean-luc-picard",
    "cavern-of-souls",
    "chrome-mox",
    "command-tower",
    "counterspell",
    "cyclonic-rift",
    "deflecting-swat",
    "demonic-consultation",
    "demonic-tutor",
    "dockside-extortionist",
    "doubling-season",
    "edgar-markov",
    "esper-sentinel",
    "fierce-guardianship",
    "force-of-will",
    "gaeas-cradle",
    "grim-monolith",
    "jace-the-mind-sculptor",
    "jeskas-will",
    "jeweled-lotus",
    "lightning-bolt",
    "lightning-greaves",
    "lotus-petal",
    "mana-crypt",
    "mana-drain",
    "mana-vault",
    "mox-diamond",
    "mox-opal",
    "mr-spock-science-officer",
    "mystic-remora",
    "mystic-sanctuary",
    "necropotence",
    "orcish-bowmasters",
    "path-to-exile",
    "rhystic-study",
    "senseis-divining-top",
    "smaug-wicked-worm",
    "smothering-tithe",
    "sol-ring",
    "swords-to-plowshares",
    "teferis-protection",
    "the-great-henge",
    "the-one-ring",
    "the-theorist-jace-beleren",
    "urzas-saga",
    "vampiric-tutor"
  ]);

  const TREATMENT = {
    surgefoil: "Surge foil",
    galaxyfoil: "Galaxy foil",
    halofoil: "Halo foil",
    rainbowfoil: "Rainbow foil",
    textured: "Textured foil",
    stepandcompleat: "Step-and-Compleat foil",
    serialized: "Serialized",
    extendedart: "Extended art",
    showcase: "Showcase",
    inverted: "Inverted",
    boosterfun: "Booster Fun",
    etched: "Etched foil",
    confettifoil: "Confetti foil"
  };

  const LANGS = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    ru: "Russian",
    zhs: "Simplified Chinese",
    zht: "Traditional Chinese",
    he: "Hebrew",
    la: "Latin",
    grc: "Ancient Greek",
    ar: "Arabic",
    sa: "Sanskrit",
    ph: "Phyrexian"
  };

  const previews = new Map();
  const pickCache = new Map();

  let controller = null;
  let suggestController = null;
  let suggestTimer = 0;
  let generation = 0;
  let activeSuggestion = -1;
  let fxPromise = null;
  let currentCard = null;
  let currentPick = false;
  let archive = null;


  /* ========================================
     BASIC UTILITIES
     ======================================== */

  const esc = x =>
    String(x ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const pretty = x =>
    String(x || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, x => x.toUpperCase());

  const norm = x =>
    String(x || "")
      .trim()
      .toLowerCase();

  const safe = x => {
    try {
      const u = new URL(x);
      return /^https?:$/.test(u.protocol)
        ? u.href
        : "";
    } catch {
      return "";
    }
  };

    const slug = x =>
    norm(x)
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const img = (c, size = "normal") =>
    safe(
      c?.image_uris?.[size] ||
      c?.image_uris?.normal ||
      c?.card_faces?.[0]?.image_uris?.[size] ||
      c?.card_faces?.[0]?.image_uris?.normal ||
      ""
    );

  const has = (c, finish) =>
    (c?.finishes || []).includes(finish);

  const number = x =>
    x == null || x === ""
      ? null
      : Number.isFinite(Number(x))
        ? Number(x)
        : null;

  const paper = c =>
    (c?.games || []).includes("paper");

  const motion = () =>
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
      ? "auto"
      : "smooth";

  const scrollTo = e =>
    e?.scrollIntoView({
      behavior: motion(),
      block: "start"
    });

  const delay = ms =>
    new Promise(resolve =>
      setTimeout(resolve, ms)
    );

  const params = () =>
    new URLSearchParams(
      window.location.search
    );

  const readPrinting = () =>
    params().get("printing")?.trim() || "";

  const readFinish = () =>
    params().get("finish")?.trim() || "";

  const sameName = (a, b) =>
    norm(a) === norm(b);

  const announce = (state, extra = {}) =>
    window.dispatchEvent(
      new CustomEvent(
        "manascout:statechange",
        {
          detail: {
            state,
            ...extra
          }
        }
      )
    );


  /* ========================================
     URL AND HISTORY MANAGEMENT

     Permanent guide pages retain their
     canonical URL without adding q=.

     Homepage searches retain q= so results
     can be restored on refresh.
     ======================================== */

  function pageUrl(card, finish = "") {
    const url =
      new URL(window.location.href);

    if (
      guideName &&
      sameName(guideName, card?.name)
    ) {
      url.searchParams.delete("q");
    } else if (card?.name) {
      url.searchParams.set(
        "q",
        card.name
      );
    } else {
      url.searchParams.delete("q");
    }

    if (card?.id) {
      url.searchParams.set(
        "printing",
        card.id
      );
    } else {
      url.searchParams.delete("printing");
    }

    if (finish) {
      url.searchParams.set(
        "finish",
        finish
      );
    } else {
      url.searchParams.delete("finish");
    }

    return url;
  }

  function replaceUrl(card, replace = true) {
    const finish = card
      ? selectedFinish(card)
      : "";

    const url = pageUrl(
      card,
      finish
    );

    history[
      replace
        ? "replaceState"
        : "pushState"
    ]({}, "", url);
  }

  function startUrl(
    name,
    printingId = "",
    replace = false
  ) {
    const url =
      new URL(window.location.href);

    if (
      guideName &&
      sameName(guideName, name)
    ) {
      url.searchParams.delete("q");
    } else {
      url.searchParams.set(
        "q",
        name
      );
    }

    if (printingId) {
      url.searchParams.set(
        "printing",
        printingId
      );
    } else {
      url.searchParams.delete("printing");
    }

    if (!printingId) {
      url.searchParams.delete("finish");
    }

    history[
      replace
        ? "replaceState"
        : "pushState"
    ]({}, "", url);
  }


  /* ========================================
     NETWORK REQUESTS
     ======================================== */

  async function readJson(url, signal, timeout = 12000) {
    const request = new AbortController();
    let timer, interrupt;
    const boundary = new Promise((_, reject) => { interrupt = reject; });
    const cancel = () => {
      request.abort();
      interrupt(signal?.aborted ? Object.assign(new Error("Request cancelled."), { name: "AbortError" }) : new Error("Card data request timed out. Please retry."));
    };
    if (signal?.aborted) throw Object.assign(new Error("Request cancelled."), { name: "AbortError" });
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(cancel, timeout);
    try {
      const work = (async () => {
        const response = await fetch(url, { signal: request.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        return response.json();
      })();
      return await Promise.race([work, boundary]);
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  }
  function printingSearchUrl(value) {
    try { const u = new URL(value); return u.origin === API && !u.username && !u.password && u.pathname === "/cards/search" ? u.href : ""; } catch { return ""; }
  }

  async function namedCard(name, signal) {
    try {
      return await readJson(
        `${API}/cards/named?exact=${encodeURIComponent(name)}`,
        signal
      );
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      return readJson(
        `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`,
        signal
      );
    }
  }

  async function cardId(id, signal) {
    return readJson(
      `${API}/cards/${encodeURIComponent(id)}`,
      signal
    );
  }

  function cancelActive() {
    controller?.abort();
    suggestController?.abort();
    clearTimeout(suggestTimer);

    generation++;
    archive = null;
  }

  function clearSuggestions() {
    if (
      !ui.suggestions ||
      !ui.input
    ) {
      return;
    }

    ui.suggestions.hidden = true;
    ui.suggestions.replaceChildren();

    ui.input.setAttribute(
      "aria-expanded",
      "false"
    );

    ui.input.removeAttribute(
      "aria-activedescendant"
    );

    activeSuggestion = -1;
  }

  function setHome() {
    cancelActive();

    currentCard = null;
    currentPick = false;

    if (ui.input) {
      ui.input.value = "";
    }

    ui.details?.replaceChildren();
    ui.printings?.replaceChildren();

    if (ui.status) {
      ui.status.textContent = "";
    }

    clearSuggestions();

    if (!guideName) {
      document.title =
        "MTG Card Printings, Foils & Versions | ManaScout";
    }

    announce("home");
  }

  function guideFallback(message) {
    const fallback = guideName && ui.details?.querySelector("[data-guide-static]");
    if (!fallback) return false;
    const status = fallback.querySelector("[data-static-status]");
    if (status) status.textContent = message;
    return true;
  }

  function installGuideImages() {
    for (const img of document.querySelectorAll("[data-guide-static] img")) {
      const failed = () => {
        img.hidden = true;
        const notice = img.closest("figure")?.querySelector(".guide-image-error");
        if (notice) notice.hidden = false;
      };
      img.addEventListener("error", failed, { once: true });
      if (img.complete && !img.naturalWidth) failed();
    }
  }

  function errorState(message) {
    if (ui.details && !guideFallback(message + " The researched printing reference remains below.")) {
      disposePreview();
      ui.details.innerHTML = `
        <div
          class="empty-state"
          role="alert"
        >
          ${esc(message)}
        </div>
      `;
    }

    if (ui.status) {
      ui.status.textContent = "";
    }

    ui.printings?.replaceChildren();

    // Keep the alert visible while hiding the empty printings section.
    announce("loading");
  }


  /* ========================================
     PRINTING FINISHES
     ======================================== */

  function finishes(card) {
    return Array.isArray(card?.finishes)
      ? card.finishes
      : [];
  }

  function selectedFinish(card) {
    const options =
      finishes(card);

    const requested =
      previews.get(card?.id);

    if (
      requested &&
      options.includes(requested)
    ) {
      return requested;
    }

    if (options.includes("foil")) {
      return "foil";
    }

    if (options.includes("etched")) {
      return "etched";
    }

    return options.includes("nonfoil")
      ? "nonfoil"
      : options[0] || "";
  }

  function finishLabel(finish) {
    return {
      nonfoil: "Nonfoil",
      foil: "Foil",
      etched: "Etched foil"
    }[finish] ||
      pretty(finish) ||
      "Unknown";
  }

  function finishText(card) {
    return finishes(card)
      .map(finishLabel)
      .join(", ") || "—";
  }

  function shimmer(card) {
    return [
      "foil",
      "etched"
    ].includes(
      selectedFinish(card)
    );
  }

  function chooseFinish(card, requested) {
    if (
      !card?.id ||
      !finishes(card).includes(requested)
    ) {
      return false;
    }

    previews.set(
      card.id,
      requested
    );
    while (previews.size > 256) previews.delete(previews.keys().next().value);

    return true;
  }

  /* Only physical front/back image pairs belonging to this exact printing can flip. */
  function reversibleFaces(card) {
    if (!["transform", "modal_dfc", "reversible_card", "double_faced_token"].includes(card?.layout) || card.card_faces?.length !== 2) return [];
    const result = card.card_faces.map((face, index) => {
      try {
        const url = new URL(face.image_uris?.normal || face.image_uris?.large || "");
        const side = index ? "back" : "front";
        if (url.protocol !== "https:" || url.hostname !== "cards.scryfall.io" || url.username || url.password || !url.pathname.includes(`/${side}/`) || !url.pathname.toLowerCase().endsWith(`/${String(card.id).toLowerCase()}.jpg`) && !url.pathname.toLowerCase().endsWith(`/${String(card.id).toLowerCase()}.png`)) return null;
        return { src: url.href, name: face.name || `${card.name} (${side})` };
      } catch { return null; }
    });
    return result.every(Boolean) && result[0].src !== result[1].src ? result : [];
  }

  function foilControl(card, small = false) {
    if (small || !shimmer(card) || !has(card, "nonfoil")) return "";
    const label = `Use nonfoil finish for ${card.name}; turn off simulated foil`;
    return `<button type="button" class="ms-surface-control ms-nonfoil-control" data-ms-nonfoil="${esc(card.id)}" aria-label="${esc(label)}" title="Use nonfoil"><span aria-hidden="true">×</span></button>`;
  }

  function finishSelector(card) {
    const available = finishes(card);
    if (available.length < 2) return stat("Preview finish", available.length ? finishLabel(available[0]) : "Not supplied");
    return `<div class="detail"><strong><label for="ms-selected-finish">Preview finish</label></strong><select id="ms-selected-finish" data-ms-selected-finish="${esc(card.id)}">${available.map(finish => `<option value="${esc(finish)}"${finish === selectedFinish(card) ? " selected" : ""}>${esc(finishLabel(finish))}</option>`).join("")}</select></div>`;
  }

  function previewImage(card, small = false) {
    const pair = small ? [] : reversibleFaces(card);
    const src = pair[0]?.src || img(card, small ? "small" : "normal");
    const glint = !small && shimmer(card) && src ? '<span class="ms-foil-glint" aria-hidden="true"></span>' : "";
    const picture = (source, name, back = false) => `<span class="ms-card-face${back ? " ms-card-back" : ""}"${back ? ' aria-hidden="true"' : ""}><img class="${small ? "printing-card-image" : "card-image"}" src="${esc(source)}" alt="${esc(name)} — ${esc(card.set_name)} #${esc(card.collector_number)}"${small ? ' loading="lazy"' : ""} decoding="async" width="488" height="680">${glint}</span>`;
    return `<div class="ms-preview ${small ? "ms-thumb" : "ms-card-image"}" data-ms-preview="${esc(card.id || "")}" data-ms-image-ready="false">
      ${src ? `<div class="ms-face-turner" data-ms-face="front">${picture(src, pair[0]?.name || card.name)}${pair.length ? picture(pair[1].src, pair[1].name, true) : ""}</div>` : '<span class="muted">Image unavailable</span>'}
      ${!small ? foilControl(card) : ""}
      ${pair.length ? `<button class="ms-surface-control ms-flip-control" type="button" data-ms-flip="${esc(card.id)}" aria-label="${esc(`Flip to back: ${pair[1].name}`)}" aria-pressed="false" title="Flip card" disabled><span aria-hidden="true">↻</span></button><span class="ms-face-status" role="status" aria-live="polite"></span>` : ""}
    </div>`;
  }

  let previewSession = null;
  let effectObserver = null;
  const effectHosts = new Set();
  function observeCardEffects(container) {
    if (!container?.querySelectorAll) return;
    if (!effectObserver && typeof IntersectionObserver === "function") effectObserver = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.dataset.msEffectsPaused = String(!entry.isIntersecting);
    }, { rootMargin: "80px" });
    for (const host of effectHosts) if (!host.isConnected) { effectObserver?.unobserve(host); effectHosts.delete(host); }
    for (const glint of container.querySelectorAll(".ms-foil-glint")) {
      const host = glint.closest(".ms-preview, .ms-thumb-frame");
      if (host && !effectHosts.has(host)) { effectHosts.add(host); host.dataset.msEffectsPaused = String(!!effectObserver); effectObserver?.observe(host); }
    }
  }
  function disposePreview() {
    previewSession?.controller.abort();
    previewSession = null;
  }
  function imageReady(image, signal) {
    return new Promise((resolve, reject) => {
      let timer;
      const done = error => {
        clearTimeout(timer); image.removeEventListener("load", loaded); image.removeEventListener("error", failed); signal.removeEventListener("abort", aborted);
        error ? reject(error) : resolve();
      };
      const failed = () => done(Error("Artwork could not load."));
      const aborted = () => done(Error("Preview changed."));
      const loaded = () => image.naturalWidth ? done() : failed();
      if (signal.aborted) return aborted();
      if (image.complete) return loaded();
      image.addEventListener("load", loaded, { once: true }); image.addEventListener("error", failed, { once: true }); signal.addEventListener("abort", aborted, { once: true });
      timer = setTimeout(() => done(Error("Artwork loading timed out.")), 12000);
    }).then(async () => {
      if (typeof image.decode === "function") await image.decode();
      if (signal.aborted) throw Error("Preview changed.");
    });
  }
  function activatePreview(card) {
    disposePreview();
    const host = ui.details.querySelector?.(".ms-card-image");
    if (!host) return;
    const session = { host, id: card.id, controller: new AbortController(), side: 0, ready: false, faces: reversibleFaces(card) };
    previewSession = session;
    const images = [...host.querySelectorAll(".ms-card-face img")], button = host.querySelector("[data-ms-flip]"), status = host.querySelector(".ms-face-status");
    const active = () => previewSession === session && host.isConnected;
    if (images[0]) imageReady(images[0], session.controller.signal).then(() => { if (active()) host.dataset.msImageReady = "true"; }).catch(() => { if (active()) { host.dataset.msImageReady = "false"; showAction("Artwork could not load. The exact printing and card details remain available."); if (status) status.textContent = "Front artwork is unavailable; card details remain accessible."; } });
    if (button && images.length === 2) Promise.all(images.map(image => imageReady(image, session.controller.signal))).then(() => {
      if (!active()) return;
      session.ready = true; button.disabled = false;
    }).catch(() => { if (active()) { button.disabled = true; button.title = "Card flip unavailable — artwork could not load"; showAction("Both face images must load before flipping. The original front and exact printing are preserved."); status.textContent = "Both face images must load before flipping. The front and exact printing are preserved."; } });
    observeCardEffects(ui.details);
  }
  function flipPreview(button) {
    const session = previewSession;
    if (!session?.ready || !session.host.isConnected || session.id !== currentCard?.id || button.dataset.msFlip !== session.id || !session.host.contains(button)) return;
    session.side = 1 - session.side;
    const back = session.side === 1, turner = session.host.querySelector(".ms-face-turner");
    turner.dataset.msFace = back ? "back" : "front";
    [...turner.querySelectorAll(".ms-card-face")].forEach((face, index) => face.setAttribute("aria-hidden", String(index !== session.side)));
    button.setAttribute("aria-pressed", String(back));
    button.setAttribute("aria-label", `Flip to ${back ? "front" : "back"}: ${session.faces[1 - session.side].name}`);
    session.host.querySelector(".ms-face-status").textContent = `Showing ${back ? "back" : "front"}: ${session.faces[session.side].name}.`;
  }


  /* ========================================
     CARD DETAILS
     ======================================== */

  function treatments(card) {
    const tags = [];

    if (
      card?.border_color === "borderless"
    ) {
      tags.push("Borderless");
    }

    if (card?.full_art) {
      tags.push("Full art");
    }

    if (card?.textless) {
      tags.push("Textless");
    }

    if (card?.promo) {
      tags.push("Promo");
    }

    for (
      const x of [
        ...(card?.frame_effects || []),
        ...(card?.promo_types || [])
      ]
    ) {
      tags.push(
        TREATMENT[x] ||
        pretty(x)
      );
    }

    return [
      ...new Set(tags)
    ];
  }

  function treatmentText(card) {
    return treatments(card)
      .join(" · ") ||
      "Standard frame";
  }

  function legalFormats(card) {
    const special = {
      predh: "PreDH",
      paupercommander: "Pauper Commander",
      standardbrawl: "Standard Brawl",
      oldschool: "Old School",
      penny: "Penny Dreadful"
    };

    return Object.entries(
      card?.legalities || {}
    )
      .filter(
        ([, status]) =>
          status === "legal"
      )
      .map(
        ([name]) =>
          special[name] ||
          pretty(name)
      )
      .join(", ") ||
      "No current legal formats listed";
  }

  function oracleHtml(card) {
    const faces =
      card?.card_faces?.length > 1
        ? card.card_faces
        : [card];

    return `
      <div class="oracle">
        ${faces.map(
          face => `
            <div class="oracle-face">
              ${faces.length > 1
                ? `
                  <strong class="oracle-face-name">
                    ${esc(face?.name)}
                  </strong>
                `
                : ""}

              ${String(
                face?.oracle_text ||
                "No Oracle text supplied."
              )
                .split("\n")
                .filter(Boolean)
                .map(
                  line => `
                    <p>${esc(line)}</p>
                  `
                )
                .join("")}
            </div>
          `
        ).join("")}
      </div>
    `;
  }

  function guideLink(card) {
    const path =
      slug(card?.name);

    if (
      !GUIDE_SLUGS.has(path) ||
      window.location.pathname.replace(
        /\/+$/,
        ""
      ) === `/card/${path}`
    ) {
      return "";
    }

    return `
      <div class="manascout-guide-link">
        <a href="/card/${esc(path)}/">
          ◇ View ManaScout Guide →
        </a>
      </div>
    `;
  }

  function deckLink(card) {
    if (!card?.id) return "";
    const path = slug(card.name);
    const query = new URLSearchParams({
      card: card.name || "",
      printing: card.id,
      finish: selectedFinish(card)
    });
    if (GUIDE_SLUGS.has(path)) query.set("guide", `/card/${path}/`);
    return `
      <div class="manascout-guide-link">
        <a data-build-deck href="/deck/?${esc(query.toString())}"
          title="Open the Deck Studio preview with this exact printing">
          Build a Deck →
        </a>
      </div>
    `;
  }

  function marketplace(card) {
    const trusted = (value, hosts) => {
      try { const u=new URL(value); return u.protocol==="https:"&&!u.username&&!u.password&&hosts.includes(u.hostname)?u.href:""; } catch { return ""; }
    };
    const direct=trusted(card?.purchase_uris?.cardmarket,["www.cardmarket.com","cardmarket.com"]);
    const market=direct||`https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(card?.name||"")}`;
    const source=trusted(card?.scryfall_uri,["scryfall.com","www.scryfall.com"]);
    return `<div class="marketplace-links"><a href="${esc(market)}" target="_blank" rel="noopener noreferrer">${direct?"View this printing on Cardmarket":"Search Cardmarket"}</a>${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Verify on Scryfall</a>`:""}</div>`;
  }

  function stat(label, value) {
    return `
      <div class="detail">
        <strong>${esc(label)}</strong>
        ${esc(value || "—")}
      </div>
    `;
  }

  function renderCard(
    card,
    isPick = false
  ) {
    if (
      !ui.details ||
      !card
    ) {
      return;
    }

    currentCard = card;
    currentPick = isPick;

    const artwork = (
      card.card_faces || []
    ).filter(
      face =>
        face.image_uris?.normal
    );

    ui.details.innerHTML = `
      <article class="card-display">

        <div class="card-image-wrap">
          ${previewImage(card)}
        </div>

        <div class="card-text-details">

          <p class="eyebrow">
            ${isPick
              ? "◇ MANASCOUT PICK · FEATURED PRINTING"
              : "CARD & PRINTING"}
          </p>

          <h2>
            ${esc(card.name || "Unknown card")}
          </h2>

          <p class="card-subtitle">
            ${esc(card.type_line)}
            ${card.mana_cost
              ? `
                <span class="mana-cost">
                  · ${esc(card.mana_cost)}
                </span>
              `
              : ""}
          </p>

          ${isPick
            ? `
              <div class="ms-selection-banner">
                ◇ ManaScout Pick — selected for its artwork
                or distinctive collector treatment.
                Select any other version below.
              </div>
            `
            : ""}

          <div class="detail-grid">
            ${stat("Set", card.set_name)}
            ${stat("Set code", String(card.set || "").toUpperCase())}
            ${stat("Collector number", card.collector_number)}
            ${stat("Released", card.released_at)}
            ${stat("Rarity", pretty(card.rarity))}
            ${stat("Artist", card.artist)}
            ${stat("Language", LANGS[card.lang] || String(card.lang || "").toUpperCase())}
            ${stat("Available finishes", finishText(card))}
            ${finishSelector(card)}
            ${stat("Treatments", treatmentText(card))}
          </div>

          <div class="ms-card-extra">

            ${card.reserved
              ? '<span class="ms-pill">Reserved List</span>'
              : ""}

            ${card.reprint
              ? '<span class="ms-pill">Reprint</span>'
              : '<span class="ms-pill">Original card release / first-series printing</span>'}

            ${card.promo
              ? '<span class="ms-pill">Promo</span>'
              : ""}

            ${card.security_stamp
              ? `
                <span class="ms-pill">
                  Stamp: ${esc(card.security_stamp)}
                </span>
              `
              : ""}
          </div>

          <p class="ms-help">
            <strong>Legal in:</strong>
            ${esc(legalFormats(card))}
          </p>

          ${oracleHtml(card)}

          ${artwork.length > 1
            ? `
              <details class="ms-faces">
                <summary>View all card faces</summary>

                <div class="ms-face-gallery">
                  ${artwork.map(
                    face => `
                      <img
                        src="${esc(safe(face.image_uris.normal))}"
                        alt="${esc(face.name)} card face"
                        loading="lazy"
                      >
                    `
                  ).join("")}
                </div>
              </details>
            `
            : ""}

          ${deckLink(card)}
          ${guideLink(card)}

          ${marketplace(card)}

          <div
            class="ms-card-actions"
            aria-label="Explore more cards"
          >
            <button type="button" data-discovery="wild">
              ◇ Surprise me
            </button>

            <button type="button" data-discovery="colour">
              Same colour identity
            </button>

            <button type="button" data-discovery="type">
              Same card type
            </button>

            <button type="button" data-copy-printing>
              Copy this printing link
            </button>
          </div>

          <p
            class="ms-actions-status"
            role="status"
            aria-live="polite"
          ></p>

          <p class="ms-help">
            Shimmer is a visual preview, not a photograph
            of the physical foil finish. Actual finishes
            vary by edition.
          </p>

        </div>

      </article>
    `;

    activatePreview(card);

    announce(
      "card",
      {
        cardName: card.name || "",
        printingId: card.id || ""
      }
    );
  }


  /* ========================================
     CURRENCY AND PRICE DATA
     ======================================== */

  async function fetchRate(currency) {
    const data =
      await readJson(
        `${FX}/${encodeURIComponent(currency)}/GBP`
      );

    if (
      !Number.isFinite(Number(data.rate)) ||
      Number(data.rate) <= 0
    ) {
      throw new Error(
        "FX rate invalid"
      );
    }

    return Number(data.rate);
  }

  function exchangeRates() {
    if (!fxPromise) {
      fxPromise = Promise.all([
        fetchRate("EUR"),
        fetchRate("USD")
      ])
        .then(
          ([eur, usd]) => ({
            eur,
            usd
          })
        )
        .catch(
          error => {
            fxPromise = null;
            throw error;
          }
        );
    }

    return fxPromise;
  }

  function gbp(
    c,
    finish,
    rates
  ) {
    if (!rates) {
      return null;
    }

    const prices =
      c?.prices || {};

    const eur =
      number(
        prices[
          finish === "foil"
            ? "eur_foil"
            : "eur"
        ]
      );

    const usd =
      number(
        prices[
          finish === "foil"
            ? "usd_foil"
            : finish === "etched"
              ? "usd_etched"
              : "usd"
        ]
      );

    if (
      finish !== "etched" &&
      eur !== null &&
      rates.eur
    ) {
      return eur * rates.eur;
    }

    return usd !== null &&
      rates.usd
        ? usd * rates.usd
        : null;
  }

  function priceValue(
    c,
    finish,
    rates
  ) {
    const value =
      gbp(c, finish, rates);

    return value !== null &&
      value > 0
        ? value
        : null;
  }

  function priceHtml(
    c,
    finish,
    rates
  ) {
    const converted =
      gbp(c, finish, rates);

    if (converted !== null) {
      return `
        <span class="price">
          <strong>
            £${converted.toFixed(2)}
          </strong>
        </span>
      `;
    }

    const prices =
      c?.prices || {};

    const eur =
      number(
        prices[
          finish === "foil"
            ? "eur_foil"
            : "eur"
        ]
      );

    const usd =
      number(
        prices[
          finish === "foil"
            ? "usd_foil"
            : finish === "etched"
              ? "usd_etched"
              : "usd"
        ]
      );

    if (
      finish !== "etched" &&
      eur !== null
    ) {
      return `
        <span class="price">
          <strong>
            €${eur.toFixed(2)}
          </strong>
        </span>
      `;
    }

    if (usd !== null) {
      return `
        <span class="price">
          <strong>
            $${usd.toFixed(2)}
          </strong>
        </span>
      `;
    }

    return '<span class="muted">—</span>';
  }


  /* ========================================
     ALL PRINTINGS

     Request Scryfall's variation, extras
     and multilingual options.

     Do not collapse records by card name.
     ======================================== */

  async function fetchPrintings(
    card,
    token,
    signal
  ) {
    let first =
      printingSearchUrl(
        card.prints_search_uri
      );

    if (first) {
      const url =
        new URL(first);

      url.searchParams.set(
        "unique",
        "prints"
      );

      url.searchParams.set(
        "include_extras",
        "true"
      );

      url.searchParams.set(
        "include_multilingual",
        "true"
      );

      url.searchParams.set(
        "include_variations",
        "true"
      );

      first = url.href;

    } else if (card.oracle_id) {
      const q =
        new URLSearchParams({
          q: `oracleid:${card.oracle_id}`,
          unique: "prints",
          include_extras: "true",
          include_multilingual: "true",
          include_variations: "true"
        });

      first =
        `${API}/cards/search?${q}`;
    }

    if (!first) {
      return {
        cards: [card],
        complete: true,
        notice:
          "Scryfall did not provide a printing search."
      };
    }

    const result = [];
    const ids = new Set();
    const visited = new Set();

    let next = first;
    let pages = 0;
    let complete = true;
    let notice = "";

    while (
      next &&
      pages < 70
    ) {
      if (visited.has(next)) { complete = false; notice = "The printing archive repeated a page; results are incomplete."; next = ""; break; }
      visited.add(next);
      let data;

      try {
        data =
          await readJson(
            next,
            signal
          );

      } catch (error) {
        if (
          error.name === "AbortError"
        ) {
          throw error;
        }

        complete = false;

        notice =
          "Some printings could not be loaded; the results below may be incomplete.";

        if (!result.length) {
          throw error;
        }

        break;
      }

      if (
        token !== generation
      ) {
        return {
          cards: [],
          complete: false,
          notice: ""
        };
      }

      if (!Array.isArray(data.data) || data.data.some(item => !item?.id || (card.oracle_id ? item.oracle_id !== card.oracle_id : !sameName(item.name,card.name)))) {
        complete = false; notice = "The printing archive returned incomplete or mismatched card identities; only accepted pages are shown."; next = ""; break;
      }
      for (
        const item of data.data
      ) {
        if (
          !item?.id ||
          ids.has(item.id)
        ) {
          continue;
        }

        ids.add(item.id);
        result.push(item);
      }

      next =
        data.has_more
          ? printingSearchUrl(data.next_page)
          : "";
      if (data.has_more && !next) { complete = false; notice = "The printing archive omitted a valid next page; results are incomplete."; }

      pages++;

      if (
        ui.status &&
        token === generation
      ) {
        ui.status.textContent =
          `Loading printings… ${result.length} found`;
      }

      if (next) {
        await delay(110);
      }
    }

    if (next) {
      complete = false;

      notice =
        "This card has an unusually large printing history. Only the first 70 Scryfall pages are shown.";
    }

    if (
      !ids.has(card.id)
    ) {
      result.push(card);
    }

    const normal =
      result.filter(
        c =>
          ![
            "art_series",
            "token",
            "emblem",
            "double_faced_token"
          ].includes(c.layout) &&
          !c.oversized
      );

    const visible =
      normal.length
        ? normal
        : result;

    visible.sort(
      (a, b) =>
        String(
          b.released_at || ""
        ).localeCompare(
          String(
            a.released_at || ""
          )
        )
    );

    return {
      cards: visible,
      complete,
      notice
    };
  }


  /* ========================================
     MANASCOUT PICK
     ======================================== */

  function pickScore(
    card,
    rates
  ) {
    if (!img(card)) {
      return -10000;
    }

    const frames =
      card.frame_effects || [];

    const promos =
      card.promo_types || [];

    let score =
      paper(card)
        ? 30
        : -120;

    score +=
      card.lang === "en"
        ? 15
        : -25;

    if (
      frames.includes("showcase")
    ) {
      score += 70;
    }

    if (
      card.border_color === "borderless"
    ) {
      score += 60;
    }

    if (card.full_art) {
      score += 52;
    }

    if (
      frames.includes("extendedart")
    ) {
      score += 45;
    }

    if (
      frames.includes("inverted")
    ) {
      score += 32;
    }

    for (
      const [key, value] of
      Object.entries({
        boosterfun: 35,
        textured: 34,
        galaxyfoil: 30,
        surgefoil: 28,
        rainbowfoil: 28,
        stepandcompleat: 26,
        halofoil: 26
      })
    ) {
      if (
        promos.includes(key)
      ) {
        score += value;
      }
    }

    if (has(card, "etched")) {
      score += 16;
    }

    if (has(card, "foil")) {
      score += 9;
    }

    if (card.promo) {
      score += 5;
    }

    if (
      promos.includes("serialized")
    ) {
      score -= 12;
    }

    const price =
      Math.max(
        priceValue(
          card,
          "nonfoil",
          rates
        ) || 0,
        priceValue(
          card,
          "foil",
          rates
        ) || 0
      );

    if (price) {
      score += Math.min(
        12,
        Math.log10(price + 1) * 5
      );
    }

    return score;
  }

  function pickPrinting(
    cards,
    rates
  ) {
    const candidates =
      cards.filter(
        c =>
          img(c) &&
          paper(c) &&
          c.lang === "en"
      );

    const usable =
      candidates.length
        ? candidates
        : cards.filter(
          c =>
            img(c) &&
            paper(c)
        );

    const eligible =
      usable.length
        ? usable
        : cards.filter(
          c =>
            img(c)
        );

    const key =
      eligible[0]?.oracle_id ||
      norm(
        eligible[0]?.name
      );

    const cached =
      eligible.find(
        c =>
          c.id === pickCache.get(key)
      );

    if (cached) {
      return cached;
    }

    const chosen =
      [...eligible]
        .sort(
          (a, b) =>
            pickScore(b, rates) -
              pickScore(a, rates) ||
            String(
              b.released_at || ""
            ).localeCompare(
              String(
                a.released_at || ""
              )
            ) ||
            String(
              a.collector_number || ""
            ).localeCompare(
              String(
                b.collector_number || ""
              )
            )
        )[0] || null;

    if (
      key &&
      chosen
    ) {
      pickCache.set(
        key,
        chosen.id
      );
      while (pickCache.size > 128) pickCache.delete(pickCache.keys().next().value);
    }

    return chosen;
  }


  /* ========================================
     SNAPSHOT
     ======================================== */

  function extreme(
    cards,
    rates,
    finish,
    highest = false
  ) {
    const priced =
      cards
        .map(
          c => ({
            card: c,
            price:
              priceValue(
                c,
                finish,
                rates
              )
          })
        )
        .filter(
          item =>
            item.price !== null
        )
        .sort(
          (a, b) =>
            highest
              ? b.price - a.price
              : a.price - b.price
        );

    return priced[0] || null;
  }

  function snapshot(
    cards,
    rates
  ) {
    const years =
      cards
        .map(
          c =>
            String(
              c.released_at || ""
            ).slice(0, 4)
        )
        .filter(
          y =>
            /^\d{4}$/.test(y)
        )
        .sort();

    return {
      oldest:
        years[0] || "",

      newest:
        years.at(-1) || "",

      foil:
        cards.filter(
          c =>
            has(c, "foil")
        ),

      etched:
        cards.filter(
          c =>
            has(c, "etched")
        ),

      cheapest:
        extreme(
          cards,
          rates,
          "nonfoil"
        ),

      "most-expensive":
        extreme(
          cards,
          rates,
          "nonfoil",
          true
        ),

      "cheapest-foil":
        extreme(
          cards,
          rates,
          "foil"
        ),

      "most-expensive-foil":
        extreme(
          cards,
          rates,
          "foil",
          true
        )
    };
  }

  function snapshotButton(
    key,
    value,
    label,
    disabled = false
  ) {
    return `
      <button
        type="button"
        class="snapshot-stat"
        data-snapshot="${esc(key)}"
        aria-pressed="${key === "all"}"
        ${disabled ? "disabled" : ""}
      >
        <strong>${esc(value)}</strong>
        <span>${esc(label)}</span>
      </button>
    `;
  }

  function snapshotMarkup(
    cards,
    rates,
    s
  ) {
    const fmt = x =>
      x
        ? `£${x.price.toFixed(2)}`
        : "—";

    return `
      <section
        class="snapshot"
        aria-label="ManaScout printing snapshot"
      >
        <div class="snapshot-heading">

          <div>
            <p class="eyebrow">
              MANASCOUT SNAPSHOT
            </p>

            <h3>
              At a glance
            </h3>
          </div>

          <span
            class="snapshot-mark"
            aria-hidden="true"
          >
            ◇
          </span>

        </div>

        <div class="snapshot-grid">

          ${snapshotButton(
            "all",
            cards.length,
            "Printings"
          )}

          ${snapshotButton(
            "cheapest",
            fmt(s.cheapest),
            "Cheapest",
            !s.cheapest
          )}

          ${snapshotButton(
            "most-expensive",
            fmt(s["most-expensive"]),
            "Most expensive",
            !s["most-expensive"]
          )}

          ${snapshotButton(
            "cheapest-foil",
            fmt(s["cheapest-foil"]),
            "Cheapest foil",
            !s["cheapest-foil"]
          )}

          ${snapshotButton(
            "most-expensive-foil",
            fmt(s["most-expensive-foil"]),
            "Most expensive foil",
            !s["most-expensive-foil"]
          )}

          ${snapshotButton(
            "oldest",
            s.oldest || "—",
            "Oldest",
            !s.oldest
          )}

          ${snapshotButton(
            "newest",
            s.newest || "—",
            "Newest",
            !s.newest
          )}

          ${snapshotButton(
            "foil",
            s.foil.length,
            "Foil versions",
            !s.foil.length
          )}

          ${snapshotButton(
            "etched",
            s.etched.length,
            "Etched versions",
            !s.etched.length
          )}

        </div>

        <p class="snapshot-note">
          Tap a tile to explore matching printings.
          GBP prices are approximate conversions
          from available Scryfall data,
          not live shop quotations.
        </p>
      </section>
    `;
  }


  /* ========================================
     PRINTING TABLE
     ======================================== */

  function row(
    card,
    selected,
    rates
  ) {
    const chosen =
      card.id === selected?.id;

    return `
      <tr
        class="${chosen
          ? "is-selected-printing"
          : ""}"
      >

        <td class="printing-image-cell">

          <div class="ms-thumb-frame">

            <button
              class="printing-select-button printing-image-button"
              type="button"
              data-print-id="${esc(card.id)}"
              title="Select this exact printing"
              aria-label="Select ${esc(card.set_name)} number ${esc(card.collector_number)}"
            >
              ${img(card, "small")
                ? `
                  <img
                    class="printing-card-image"
                    src="${esc(img(card, "small"))}"
                    alt="${esc(card.name)} — ${esc(card.set_name)}"
                    loading="lazy"
                    decoding="async"
                  >
                `
                : "—"}
            </button>

            ${chosen && shimmer(card) &&
              img(card, "small")
                ? `
                  <span
                    class="ms-foil-glint"
                    aria-hidden="true"
                  ></span>
                `
                : ""}


          </div>

        </td>

        <td>

          <button
            class="printing-select-button printing-name-button"
            type="button"
            data-print-id="${esc(card.id)}"
          >
            <span class="set-name">
              ${esc(card.set_name || "—")}
            </span>
          </button>

          <br>

          <span class="muted">
            ${esc(String(card.set || "").toUpperCase())}
          </span>

          <span class="ms-note">
            ${esc(card.artist || "Artist not listed")}
          </span>

          <span class="ms-note">
            ${esc(LANGS[card.lang] || card.lang || "Unknown language")}
          </span>

          ${chosen
            ? `
              <span class="ms-note">
                ◇ SELECTED
              </span>
            `
            : ""}

        </td>

        <td>
          ${esc(card.released_at || "—")}
        </td>

        <td>
          ${esc(card.collector_number || "—")}
        </td>

        <td>
          ${esc(pretty(card.rarity) || "—")}
        </td>

        <td>

          <span class="ms-note">
            ${esc(finishText(card))}
          </span>

          <span class="ms-note">
            ${esc(treatmentText(card))}
          </span>

        </td>

        <td>
          ${priceHtml(card, "nonfoil", rates)}
        </td>

        <td>
          ${priceHtml(card, "foil", rates)}
        </td>

        <td>
          ${priceHtml(card, "etched", rates)}
        </td>

      </tr>
    `;
  }

  function selectOptions(
    items,
    label,
    allValue = "all"
  ) {
    return `
      <option value="${esc(allValue)}">
        ${esc(label)}
      </option>
    ` + items.map(
      ([id, name]) => `
        <option value="${esc(id)}">
          ${esc(name)}
        </option>
      `
    ).join("");
  }


  /* ========================================
     PRINTING ARCHIVE AND FILTERS
     ======================================== */

  function renderArchive(
    result,
    rates,
    token
  ) {
    if (
      !ui.printings ||
      !ui.status ||
      token !== generation
    ) {
      return;
    }

    const cards =
      result.cards;

    const s =
      snapshot(
        cards,
        rates
      );

    const sets = [
      ...new Map(
        cards.map(
          c => [
            c.set,
            c.set_name
          ]
        )
      ).entries()
    ].sort(
      (a, b) =>
        String(a[1]).localeCompare(
          String(b[1])
        )
    );

    const langs = [
      ...new Set(
        cards
          .map(c => c.lang)
          .filter(Boolean)
      )
    ]
      .sort()
      .map(
        id => [
          id,
          LANGS[id] ||
          id.toUpperCase()
        ]
      );

    const state = {
      cards,
      rates,
      token,
      selected: currentCard,
      snapshot: "all",
      pageSize: 50,
      limit: 50
    };

    archive = state;

    ui.printings.innerHTML = `
      ${snapshotMarkup(cards, rates, s)}

      ${result.notice
        ? `
          <p
            class="ms-alert"
            role="status"
          >
            ${esc(result.notice)}
          </p>
        `
        : ""}

      <div class="ms-controls printing-controls">

        <label>
          Search printings
          <input
            id="ms-print-search"
            type="search"
            placeholder="Set, artist, number, treatment…"
            autocomplete="off"
          >
        </label>

        <label>
          Set
          <select id="ms-print-set">
            ${selectOptions(
              sets,
              "All sets"
            )}
          </select>
        </label>

        <label>
          Language
          <select id="ms-print-lang">
            ${selectOptions(
              langs,
              "All languages"
            )}
          </select>
        </label>

        <label>
          Game
          <select id="ms-print-game">
            <option value="paper">
              Paper printings
            </option>
            <option value="all">
              All platforms
            </option>
            <option value="digital">
              Digital only
            </option>
          </select>
        </label>

        <label>
          Finish
          <select id="printing-finish-filter">
            <option value="all">
              All finishes
            </option>
            <option value="nonfoil">
              Nonfoil
            </option>
            <option value="foil">
              Foil
            </option>
            <option value="etched">
              Etched
            </option>
          </select>
        </label>

        <label>
          Treatment
          <select id="ms-print-treatment">
            <option value="all">
              All treatments
            </option>
            <option value="borderless">
              Borderless
            </option>
            <option value="showcase">
              Showcase
            </option>
            <option value="extendedart">
              Extended art
            </option>
            <option value="fullart">
              Full art
            </option>
            <option value="surgefoil">
              Surge foil
            </option>
            <option value="galaxyfoil">
              Galaxy foil
            </option>
            <option value="halofoil">
              Halo foil
            </option>
            <option value="textured">
              Textured foil
            </option>
            <option value="serialized">
              Serialized
            </option>
            <option value="promo">
              Promo
            </option>
          </select>
        </label>

        <label>
          Sort
          <select id="printing-sort">
            <option value="newest">
              Newest
            </option>
            <option value="oldest">
              Oldest
            </option>
            <option value="price-asc">
              £ Low → High
            </option>
            <option value="price-desc">
              £ High → Low
            </option>
            <option value="name">
              Set A–Z
            </option>
            <option value="collector">
              Collector #
            </option>
          </select>
        </label>

        <button
          type="button"
          id="ms-reset-filters"
        >
          Reset
        </button>

      </div>

      <div class="table-wrap">

        <table class="printings-table">

          <thead>
            <tr>
              <th scope="col">Card</th>
              <th scope="col">Set / Artist / Language</th>
              <th scope="col">Released</th>
              <th scope="col">Collector #</th>
              <th scope="col">Rarity</th>
              <th scope="col">Finishes / Treatments</th>
              <th scope="col">Price</th>
              <th scope="col">Foil</th>
              <th scope="col">Etched</th>
            </tr>
          </thead>

          <tbody id="ms-print-body"></tbody>

        </table>

      </div>

      <div
        class="ms-pagination"
        id="ms-print-pages"
      ></div>

      <p class="ms-help">
        These are Scryfall printing records.
        A printing can have multiple available
        physical finishes, shown as separate
        price columns. The foil shimmer is illustrative.
      </p>
    `;

    const c = {
      find: $("ms-print-search"),
      set: $("ms-print-set"),
      lang: $("ms-print-lang"),
      game: $("ms-print-game"),
      finish: $("printing-finish-filter"),
      treatment: $("ms-print-treatment"),
      sort: $("printing-sort"),
      body: $("ms-print-body"),
      pages: $("ms-print-pages")
    };

    if (
      !cards.some(paper)
    ) {
      c.game.value = "all";
    }

    if (
      currentCard &&
      !paper(currentCard)
    ) {
      c.game.value = "all";
    }

    function matchesTreatment(
      card,
      key
    ) {
      if (key === "all") {
        return true;
      }

      if (key === "borderless") {
        return card.border_color === "borderless";
      }

      if (key === "fullart") {
        return Boolean(card.full_art);
      }

      if (key === "promo") {
        return Boolean(card.promo);
      }

      return [
        ...(card.frame_effects || []),
        ...(card.promo_types || [])
      ].includes(key);
    }

    function filtered() {
      const q =
        norm(c.find.value);

      let list =
        state.snapshot === "all"
          ? cards
          : ["foil", "etched"].includes(
              state.snapshot
            )
            ? s[state.snapshot]
            : ["oldest", "newest"].includes(
                state.snapshot
              )
              ? cards.filter(
                  card =>
                    String(
                      card.released_at || ""
                    ).startsWith(
                      s[state.snapshot]
                    )
                )
              : s[state.snapshot]?.card
                ? [s[state.snapshot].card]
                : [];

      list = list.filter(
        card => {
          const haystack = [
            card.name,
            card.printed_name,
            card.set_name,
            card.set,
            card.artist,
            card.collector_number,
            card.lang,
            LANGS[card.lang],
            treatmentText(card)
          ]
            .join(" ")
            .toLowerCase();

          return (
            (!q || haystack.includes(q)) &&

            (
              c.set.value === "all" ||
              card.set === c.set.value
            ) &&

            (
              c.lang.value === "all" ||
              card.lang === c.lang.value
            ) &&

            (
              c.game.value === "all" ||
              (
                c.game.value === "paper"
                  ? paper(card)
                  : !paper(card)
              )
            ) &&

            (
              c.finish.value === "all" ||
              has(
                card,
                c.finish.value
              )
            ) &&

            matchesTreatment(
              card,
              c.treatment.value
            )
          );
        }
      );

      return [...list].sort(
        (a, b) => {
          if (
            c.sort.value === "oldest"
          ) {
            return String(
              a.released_at || ""
            ).localeCompare(
              String(
                b.released_at || ""
              )
            );
          }

          if (
            c.sort.value === "name"
          ) {
            return String(
              a.set_name || ""
            ).localeCompare(
              String(
                b.set_name || ""
              )
            );
          }

          if (
            c.sort.value === "collector"
          ) {
            return String(
              a.collector_number || ""
            ).localeCompare(
              String(
                b.collector_number || ""
              ),
              undefined,
              {numeric: true}
            );
          }

          if (
            [
              "price-asc",
              "price-desc"
            ].includes(c.sort.value)
          ) {
            const aPrice =
              priceValue(
                a,
                "nonfoil",
                rates
              ) ??
              priceValue(
                a,
                "foil",
                rates
              );

            const bPrice =
              priceValue(
                b,
                "nonfoil",
                rates
              ) ??
              priceValue(
                b,
                "foil",
                rates
              );

            if (aPrice == null) {
              return bPrice == null
                ? 0
                : 1;
            }

            if (bPrice == null) {
              return -1;
            }

            return c.sort.value === "price-asc"
              ? aPrice - bPrice
              : bPrice - aPrice;
          }

          return String(
            b.released_at || ""
          ).localeCompare(
            String(
              a.released_at || ""
            )
          );
        }
      );
    }

    function update() {
      if (
        token !== generation ||
        archive !== state
      ) {
        return;
      }

      const list = filtered();

      const page =
        list.slice(
          0,
          state.limit
        );

      c.body.innerHTML =
        page.map(
          item =>
            row(
              item,
              state.selected,
              rates
            )
        ).join("") ||
        `
          <tr>
            <td
              colspan="9"
              class="ms-table-empty"
            >
              No printings match these filters.
            </td>
          </tr>
        `;

      ui.status.textContent =
        `${list.length} matching printings · ` +
        `${cards.length} Scryfall records loaded · ` +
        `${rates ? "GBP estimates" : "source currencies"}` +
        `${result.complete ? "" : " · partial data"}`;

      observeCardEffects(c.body);

      c.pages.innerHTML = `
        <span>
          Showing ${page.length} of ${list.length}
        </span>
      `;

      if (
        list.length > state.limit
      ) {
        const more =
          document.createElement("button");

        more.type = "button";

        more.textContent =
          `Show next ${Math.min(
            state.pageSize,
            list.length - state.limit
          )}`;

        more.addEventListener(
          "click",
          () => {
            state.limit += state.pageSize;
            update();
          }
        );

        c.pages.appendChild(more);
      }

      ui.printings
        .querySelectorAll(
          "[data-snapshot]"
        )
        .forEach(
          b => {
            const active =
              b.dataset.snapshot ===
              state.snapshot;

            b.classList.toggle(
              "is-active",
              active
            );

            b.setAttribute(
              "aria-pressed",
              String(active)
            );
          }
        );
    }

    function selectCard(
      card,
      finish = "",
      scroll = true
    ) {
      if (
        !card ||
        token !== generation
      ) {
        return;
      }

      if (finish) {
        chooseFinish(
          card,
          finish
        );
      }

      state.selected = card;

      renderCard(
        card,
        false
      );

      replaceUrl(card);
      update();

      if (scroll) {
        scrollTo(ui.details);
      }
    }

    c.body.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            "[data-print-id]"
          );

        if (button) {
          selectCard(
            cards.find(
              x =>
                x.id ===
                button.dataset.printId
            )
          );
        }
      }
    );

    ui.printings
      .querySelector(".snapshot")
      ?.addEventListener(
        "click",
        event => {
          const b =
            event.target.closest(
              "[data-snapshot]"
            );

          if (
            !b ||
            b.disabled
          ) {
            return;
          }

          state.snapshot =
            b.dataset.snapshot;

          state.limit =
            state.pageSize;

          c.find.value = "";
          c.set.value = "all";
          c.lang.value = "all";
          c.finish.value = "all";
          c.treatment.value = "all";

          const chosen = [
            "cheapest",
            "most-expensive",
            "cheapest-foil",
            "most-expensive-foil"
          ].includes(
            state.snapshot
          )
            ? s[state.snapshot]?.card
            : null;

          if (chosen) {
            if (
              state.snapshot.includes(
                "foil"
              )
            ) {
              chooseFinish(
                chosen,
                "foil"
              );
            }

            if (!paper(chosen)) {
              c.game.value = "all";
            }

            selectCard(
              chosen,
              "",
              false
            );
          }

          update();

          scrollTo(
            ui.printings.querySelector(
              ".table-wrap"
            )
          );
        }
      );

    for (
      const element of [
        c.find,
        c.set,
        c.lang,
        c.game,
        c.finish,
        c.treatment,
        c.sort
      ]
    ) {
      element.addEventListener(
        element === c.find
          ? "input"
          : "change",
        () => {
          state.limit =
            state.pageSize;

          update();
        }
      );
    }

    $("ms-reset-filters")
      ?.addEventListener(
        "click",
        () => {
          state.snapshot = "all";

          c.find.value = "";
          c.set.value = "all";
          c.lang.value = "all";
          c.finish.value = "all";
          c.treatment.value = "all";
          c.sort.value = "newest";

          c.game.value =
            cards.some(paper)
              ? "paper"
              : "all";

          state.limit =
            state.pageSize;

          update();
        }
      );

    update();
  }


  /* ========================================
     CARD LOADING AND EXACT-ID RESTORATION

     A requested printing ID takes precedence
     over a ManaScout Pick.
     ======================================== */

  async function loadCard(
    name,
    opts = {}
  ) {
    const query =
      String(name || "").trim();

    if (!query) {
      return null;
    }

    cancelActive();

    const token =
      generation;

    controller =
      new AbortController();

    const signal =
      controller.signal;

    const requestedId =
      String(
        opts.printingId ||
        (
          opts.fromHistory
            ? readPrinting()
            : ""
        )
      ).trim();

    const requestedFinish =
      String(
        opts.finish ||
        (
          opts.fromHistory
            ? readFinish()
            : ""
        )
      ).trim();

    if (!opts.fromHistory) {
      startUrl(
        query,
        requestedId,
        Boolean(opts.replace)
      );
    }

    if (ui.input) {
      ui.input.value = query;
    }

    clearSuggestions();

    announce(
      "loading",
      {
        cardName: query
      }
    );

    if (ui.details && !guideFallback("Loading live Scryfall details; showing the researched printing reference.")) {
      ui.details.innerHTML = `
        <div
          class="empty-state"
          role="status"
        >
          Scouting card details and printings…
        </div>
      `;
    }

    ui.printings?.replaceChildren();

    if (ui.status) {
      ui.status.textContent =
        "Loading printings…";
    }

    try {
      let card = null;
      let exact = false;

      if (requestedId) {
        try {
          const candidate =
            await cardId(
              requestedId,
              signal
            );

          if (
            sameName(
              candidate?.name,
              query
            )
          ) {
            card = candidate;
            exact = true;
          }

        } catch (error) {
          if (
            error.name === "AbortError"
          ) {
            throw error;
          }
        }
      }

      if (!card) {
        card =
          await namedCard(
            query,
            signal
          );
      }

      if (
        token !== generation
      ) {
        return null;
      }

      if (
        exact &&
        requestedFinish
      ) {
        chooseFinish(
          card,
          requestedFinish
        );
      }

      renderCard(
        card,
        false
      );

      let result;

      try {
        result =
          await fetchPrintings(
            card,
            token,
            signal
          );

      } catch (error) {
        if (
          error.name === "AbortError"
        ) {
          throw error;
        }

        console.warn(
          "ManaScout: printing lookup failed",
          error
        );

        result = {
          cards: [card],
          complete: false,
          notice:
            "Scryfall's printing archive is unavailable. Showing the selected printing only."
        };
      }

      if (
        token !== generation
      ) {
        return null;
      }

      let rates = null;

      try {
        rates =
          await Promise.race([
            exchangeRates(),
            delay(4500)
              .then(() => null)
          ]);

      } catch (error) {
        console.warn(
          "GBP conversions unavailable",
          error
        );
      }

      if (
        token !== generation
      ) {
        return null;
      }

      if (
        !result.cards.some(
          c =>
            c.id === card.id
        )
      ) {
        result.cards.unshift(card);
      }

      if (
        !exact &&
        result.cards.length
      ) {
        const best =
          pickPrinting(
            result.cards,
            rates
          );

        if (best) {
          card = best;

          renderCard(
            card,
            true
          );
        }
      }

      replaceUrl(
        card,
        true
      );

      renderArchive(
        result,
        rates,
        token
      );

      if (!guideName) {
        document.title =
          `${card.name} Printings, Foils & Art | ManaScout`;
      }

      return card;

    } catch (error) {
      if (
        error.name === "AbortError" ||
        token !== generation
      ) {
        return null;
      }

      console.error(
        "ManaScout card load failed",
        error
      );

      errorState(
        error.status === 404
          ? `No card matched “${query}”. Check the spelling and try again.`
          : "Scryfall could not be reached. Please try again."
      );

      return null;
    }
  }


  /* ========================================
     AUTOCOMPLETE
     ======================================== */

  function suggestions() {
    return [
      ...(
        ui.suggestions
          ?.querySelectorAll(
            ".autocomplete-item"
          ) || []
      )
    ];
  }

  function activateSuggestion(index) {
    const items =
      suggestions();

    if (
      !items.length ||
      !ui.input
    ) {
      return;
    }

    activeSuggestion =
      (
        index +
        items.length
      ) % items.length;

    items.forEach(
      (item, i) =>
        item.setAttribute(
          "aria-selected",
          String(
            i === activeSuggestion
          )
        )
    );

    ui.input.setAttribute(
      "aria-activedescendant",
      items[activeSuggestion].id
    );

    items[activeSuggestion]
      .scrollIntoView({
        block: "nearest"
      });
  }

  async function autocomplete(query) {
    suggestController?.abort();

    suggestController =
      new AbortController();

    try {
      const response =
        await readJson(
          `${API}/cards/autocomplete?q=${encodeURIComponent(query)}`,
          suggestController.signal
        );

      if (
        norm(ui.input?.value) !==
          norm(query) ||
        !ui.suggestions
      ) {
        return;
      }

      const names =
        (response.data || [])
          .slice(0, 8);

      if (!names.length) {
        clearSuggestions();
        return;
      }

      activeSuggestion = -1;

      ui.suggestions.innerHTML =
        names.map(
          (name, i) => `
            <button
              type="button"
              class="autocomplete-item"
              id="ms-autocomplete-${i}"
              role="option"
              aria-selected="false"
              data-name="${esc(name)}"
            >
              ${esc(name)}
            </button>
          `
        ).join("");

      ui.suggestions.hidden = false;

      ui.input.setAttribute(
        "aria-expanded",
        "true"
      );

      ui.input.removeAttribute(
        "aria-activedescendant"
      );

    } catch (error) {
      if (
        error.name !== "AbortError"
      ) {
        clearSuggestions();
      }
    }
  }

  if (
    ui.form &&
    ui.input
  ) {
    ui.form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const name =
          suggestions()[
            activeSuggestion
          ]?.dataset.name ||
          ui.input.value.trim();

        if (name) {
          void loadCard(name);
        }
      }
    );

    ui.input.addEventListener(
      "input",
      () => {
        clearTimeout(
          suggestTimer
        );

        const query =
          ui.input.value.trim();

        if (
          query.length < 2
        ) {
          suggestController?.abort();
          clearSuggestions();
          return;
        }

        suggestTimer =
          setTimeout(
            () =>
              void autocomplete(query),
            200
          );
      }
    );

    ui.input.addEventListener(
      "keydown",
      event => {
        const items =
          suggestions();

        if (
          event.key === "ArrowDown" &&
          items.length
        ) {
          event.preventDefault();

          activateSuggestion(
            activeSuggestion + 1
          );

        } else if (
          event.key === "ArrowUp" &&
          items.length
        ) {
          event.preventDefault();

          activateSuggestion(
            activeSuggestion - 1
          );

        } else if (
          event.key === "Escape"
        ) {
          clearSuggestions();
        }
      }
    );

    ui.suggestions
      ?.addEventListener(
        "click",
        event => {
          const item =
            event.target.closest(
              "[data-name]"
            );

          if (item) {
            void loadCard(
              item.dataset.name
            );
          }
        }
      );

    document.addEventListener(
      "click",
      event => {
        if (
          !ui.form.contains(
            event.target
          ) &&
          !ui.suggestions?.contains(
            event.target
          )
        ) {
          clearSuggestions();
        }
      }
    );
  }


  /* ========================================
     PRINTING BUTTONS AND DISCOVERY
     ======================================== */

  function showAction(message) {
    const status =
      ui.details?.querySelector(
        ".ms-actions-status"
      );

    if (status) {
      status.textContent =
        message;
    }
  }

  function updateSelectedFinish(finish) {
    if (!currentCard || !chooseFinish(currentCard, finish)) return;
    const card = currentCard;
    renderCard(card, currentPick);
    replaceUrl(card);
    if (archive) {
      const target = ui.printings?.querySelector(".is-selected-printing");
      if (target) target.outerHTML = row(card, card, archive.rates);
      observeCardEffects(ui.printings);
    }
    ui.details?.querySelector("[data-ms-selected-finish]")?.focus({ preventScroll: true });
    showAction(`${finishLabel(finish)} selected for this exact printing.`);
  }
  document.addEventListener("change", event => {
    const select = event.target.closest("[data-ms-selected-finish]");
    if (select && ui.details?.contains(select) && currentCard?.id === select.dataset.msSelectedFinish) updateSelectedFinish(select.value);
  });
  document.body.dataset.msEffectsPaused = String(document.hidden);
  document.addEventListener("visibilitychange", () => {
    document.body.dataset.msEffectsPaused = String(document.hidden);
  });

  document.addEventListener(
    "click",
    async event => {
      const flip = event.target.closest("[data-ms-flip]");
      if (flip && ui.details?.contains(flip)) { flipPreview(flip); return; }
      const nonfoil = event.target.closest("[data-ms-nonfoil]");
      if (nonfoil && ui.details?.contains(nonfoil) && currentCard?.id === nonfoil.dataset.msNonfoil && shimmer(currentCard) && has(currentCard, "nonfoil")) {
        updateSelectedFinish("nonfoil");
        return;
      }

      const copy =
        event.target.closest(
          "[data-copy-printing]"
        );

      if (
        copy &&
        ui.details?.contains(copy) &&
        currentCard
      ) {
        try {
          await navigator.clipboard.writeText(
            pageUrl(
              currentCard,
              selectedFinish(currentCard)
            ).href
          );

          showAction(
            "Exact printing link copied."
          );

        } catch {
          showAction(
            "Copy the current URL from your browser's address bar."
          );
        }

        return;
      }

      const button =
        event.target.closest(
          "[data-discovery]"
        );

      if (
        !button ||
        !ui.details?.contains(button) ||
        !currentCard
      ) {
        return;
      }

      const old =
        currentCard;

      const type =
        button.dataset.discovery;

      const excluded =
        old.oracle_id
          ? ` -oracleid:${old.oracle_id}`
          : "";

      let q =
        "game:paper";

      if (
        type === "colour"
      ) {
        q +=
          ` id:${(old.color_identity || []).join("") || "c"}`;
      }

      if (
        type === "type"
      ) {
        const major = [
          "Creature",
          "Artifact",
          "Enchantment",
          "Instant",
          "Sorcery",
          "Planeswalker",
          "Land",
          "Battle"
        ].find(
          x =>
            (old.type_line || "").includes(x)
        );

        if (major) {
          q +=
            ` t:${major.toLowerCase()}`;
        }
      }

      q += excluded;

      const buttons = [
        ...ui.details.querySelectorAll(
          "[data-discovery]"
        )
      ];

      buttons.forEach(
        b =>
          b.disabled = true
      );

      showAction(
        "Finding another card…"
      );

      try {
        const item =
          await readJson(
            `${API}/cards/random?q=${encodeURIComponent(q)}`
          );

        if (!item?.name) {
          throw new Error(
            "No card found"
          );
        }

        await loadCard(
          item.name
        );

      } catch (error) {
        console.warn(
          "Keep scouting failed",
          error
        );

        showAction(
          "Couldn't scout another card. Please try again."
        );

      } finally {
        buttons.forEach(
          b => {
            if (b.isConnected) {
              b.disabled = false;
            }
          }
        );
      }
    }
  );


  /* ========================================
     BROWSER HISTORY
     ======================================== */

  window.addEventListener(
    "popstate",
    () => {
      const query =
        params().get("q")?.trim() ||
        guideName;

      if (query) {
        void loadCard(
          query,
          {
            fromHistory: true,
            printingId: readPrinting(),
            finish: readFinish()
          }
        );
      } else {
        setHome();
      }
    }
  );


  /* ========================================
     PUBLIC API
     ======================================== */

  window.ManaScout =
    Object.freeze({
      loadCard,

      scoutRandom: async () => {
        const result =
          await readJson(
            `${API}/cards/random?q=${encodeURIComponent("game:paper")}`
          );

        if (!result?.name) {
          throw new Error(
            "Random card unavailable"
          );
        }

        await loadCard(
          result.name
        );

        return result;
      }
    });


  /* ========================================
     ADDITIONAL SHARED STYLES
     ======================================== */

  function installStyles() {
    if (
      $("ms-search-upgrade-styles")
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "ms-search-upgrade-styles";

    style.textContent = `
      .ms-preview { position: relative; isolation: isolate; display: inline-block; width: 100%; max-width: 100%; border-radius: 11px; overflow: hidden; perspective: 1100px; }
      .ms-face-turner { position: relative; width: 100%; transform-style: preserve-3d; transform: rotateY(0deg); transition: transform .62s cubic-bezier(.3,.05,.25,1); }
      .ms-face-turner[data-ms-face="back"] { transform: rotateY(180deg); }
      .ms-card-face { position: relative; display: block; width: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: inherit; overflow: hidden; }
      .ms-card-face img { display: block; width: 100%; height: auto; aspect-ratio: 488 / 680; object-fit: contain; }
      .ms-card-back { position: absolute; inset: 0; transform: rotateY(180deg); }
      .ms-card-back img { height: 100%; }
      .ms-foil-glint { position: absolute; inset: -8% -60%; pointer-events: none; border-radius: inherit; mix-blend-mode: screen; opacity: .22; background: linear-gradient(110deg, transparent 23%, #6eedc21a 36%, #b988f626 47%, #ffffff38 51%, #f3a2d71a 60%, transparent 74%); animation: msFoil 11s ease-in-out infinite; }
      @keyframes msFoil { 0%, 100% { transform: translate3d(-20%,0,0) rotate(1deg); } 50% { transform: translate3d(20%,0,0) rotate(-1deg); } }
      .ms-preview[data-ms-image-ready="false"] .ms-foil-glint { visibility: hidden; animation-play-state: paused; }
      [data-ms-effects-paused="true"] .ms-foil-glint { animation-play-state: paused; }
      .ms-surface-control { position: absolute; z-index: 5; width: 44px; height: 44px; display: grid; place-items: center; padding: 10px; border: 0; background: transparent; color: #eee6e9; cursor: pointer; font: inherit; font-size: 16px; line-height: 1; touch-action: manipulation; }
      .ms-surface-control::before { content: ""; position: absolute; inset: 10px; border-radius: 50%; border: 1px solid #a79a9f99; background: #0e1013dc; box-shadow: 0 2px 6px #0005; }
      .ms-surface-control span { position: relative; }
      .ms-flip-control { right: 2px; bottom: 6px; }
      .ms-nonfoil-control { left: 2px; bottom: 6px; color: #ee8395; }
      .ms-nonfoil-control::before { border-color: #b8586b; }
      .ms-surface-control:hover::before { background: #252027; }
      .ms-surface-control:focus-visible { outline: 2px solid #ebdce3; outline-offset: -4px; border-radius: 50%; }
      .ms-surface-control:disabled { opacity: .45; cursor: wait; }
      .ms-face-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      #ms-selected-finish { max-width: 100%; min-height: 44px; margin-top: 4px; padding: 6px 10px; border: 1px solid #ffffff2b; border-radius: 7px; background: #171318; color: #f4e9ec; font: inherit; }
      #ms-selected-finish:focus-visible { outline: 2px solid #d7768b; outline-offset: 2px; }

      .ms-thumb-frame {
        position: relative;
        display: inline-block;
        max-width: 100%;
        border-radius: 7px;
        overflow: hidden;
      }

      .ms-thumb-frame img {
        display: block;
        width: 64px;
        height: auto;
        border-radius: 7px;
      }

      .ms-thumb-frame .ms-foil-glint {
        opacity: .3;
      }

      .ms-card-extra,
      .ms-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 13px 0;
      }

      .ms-pill {
        display: inline-flex;
        border: 1px solid #ffffff25;
        padding: 5px 9px;
        border-radius: 30px;
        color: #cdc0c5;
        font-size: 11px;
      }

      .ms-card-actions button {
        border: 1px solid #ffffff2b;
        border-radius: 8px;
        padding: 8px 10px;
        background: #ffffff09;
        color: #f4e9ec;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }

      .ms-card-actions button:hover {
        border-color: #cd6977;
      }

      .ms-card-actions button:disabled {
        opacity: .55;
        cursor: wait;
      }

      .ms-help,
      .ms-note,
      .ms-actions-status {
        display: block;
        color: #a79da2;
        font-size: 11px;
        line-height: 1.65;
      }

      .ms-selection-banner {
        padding: 10px 12px;
        margin: 13px 0;
        background: #28523b20;
        border: 1px solid #70a17d55;
        border-radius: 9px;
        color: #c7e8d2;
        font-size: 12px;
        line-height: 1.55;
      }

      .ms-face-gallery {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 12px 0;
      }

      .ms-face-gallery img {
        width: min(180px,45%);
        height: auto;
        border-radius: 8px;
      }

      .ms-controls {
        display: flex;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 10px;
        margin: 17px 0;
      }

      .ms-controls label {
        display: flex;
        flex-direction: column;
        gap: 5px;
        color: #d9ced2;
        font-size: 12px;
      }

      .ms-controls select,
      .ms-controls input {
        min-height: 40px;
        max-width: 100%;
        border: 1px solid #ffffff32;
        border-radius: 8px;
        background: #171519;
        color: #f3e9ed;
        padding: 8px;
        font: inherit;
        font-size: 12px;
      }

      .ms-controls input {
        width: min(245px,85vw);
      }

      .ms-controls button,
      .ms-pagination button {
        min-height: 40px;
        padding: 8px 11px;
        border: 1px solid #ffffff32;
        border-radius: 8px;
        background: #ffffff0c;
        color: #f3e9ed;
        cursor: pointer;
      }

      .ms-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin: 18px 0;
        color: #bfb3b9;
        font-size: 12px;
      }

      .ms-table-empty {
        text-align: center;
        color: #afa6a8;
        padding: 18px;
      }

      .ms-alert {
        padding: 12px;
        border: 1px solid #b88c4766;
        border-radius: 8px;
        color: #edcf9a;
        font-size: 12px;
        line-height: 1.5;
      }

      .ms-note {
        margin-top: 4px;
      }

      .ms-actions-status {
        min-height: 16px;
      }

      @media (max-width:600px) {
        .ms-thumb-frame img {
          width: 52px;
        }

        .ms-controls label {
          flex: 1 1 130px;
        }

        .ms-controls select {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion:reduce) {
        .ms-foil-glint { animation: none !important; }
        .ms-face-turner { transition: none !important; }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  installGuideImages();
  installStyles();

  const first =
    params().get("q")?.trim();

  if (first) {
    void loadCard(
      first,
      {
        fromHistory: true,
        printingId: readPrinting(),
        finish: readFinish()
      }
    );
  }

})();
