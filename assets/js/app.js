
/* ManaScout search and printings — DEVELOPMENT full replacement */
(() => {
  "use strict";

  const { origin: API, get: getScryfall, searchPageUrl: printingSearchUrl } = window.ManaScoutScryfall;
  const urlState = window.ManaScoutURLState;
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

  const GUIDE_SLUGS = new Set(window.ManaScoutGuideCatalogue?.slugs || []);

  const presentation = window.ManaScoutPrinting;
  const LANGS = presentation.languages;

  const previews = new Map();
  const pickCache = new Map();

  let controller = null;
  let loadingCard = null;
  let suggestController = null;
  let suggestTimer = 0;
  let generation = 0;
  let activeSuggestion = -1;
  let fxPromise = null;
  let currentCard = null;
  let currentPick = false;
  let archive = null;
  let searchController = null;
  let resultController = null;
  let setIndex = null;
  const searchPages = new Map();
  const searchStatus = $("ms-search-status");
  const searchResults = $("ms-search-results");
  let showingExactResults = false;
  const intentEngine = window.ManaScoutSearchIntent;


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
    Array.isArray(c?.games) && c.games.includes("paper");

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
    return urlState.selectionUrl(window.location.href, {
      query: card?.name, printingId: card?.id, finish, guideName
    });
  }

  function setSelectionUrl(url, replace) {
    history[replace ? "replaceState" : "pushState"]({}, "", url);
    updateSearchRobots();
  }

  function replaceUrl(card, replace = true) {
    setSelectionUrl(pageUrl(card, card ? selectedFinish(card) : ""), replace);
  }

  function updateSearchRobots() {
    if (!intentEngine || window.location.pathname !== "/") return;
    const utility = urlState.isVariant(window.location.search);
    document.querySelector('meta[name="robots"]')?.setAttribute("content", utility ? "noindex,follow" : "index,follow,max-image-preview:large");
  }

  function startUrl(query, printingId, replace = false) {
    const { finish } = urlState.parse(window.location.search);
    setSelectionUrl(urlState.selectionUrl(window.location.href, { query, printingId, finish, guideName }), replace);
  }


  /* ========================================
     NETWORK REQUESTS
     ======================================== */

  async function namedCard(name, signal) {
    try {
      return await getScryfall(
        `${API}/cards/named?exact=${encodeURIComponent(name)}`,
        { signal }
      );
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      return getScryfall(
        `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`,
        { signal }
      );
    }
  }

  async function cardId(id, signal) {
    return getScryfall(
      `${API}/cards/${encodeURIComponent(id)}`,
      { signal }
    );
  }

  function cancelActive() {
    controller?.abort();
    searchController?.abort();
    resultController?.abort();
    if (searchStatus) searchStatus.textContent = "";
    if (searchResults) searchResults.hidden = true;
    showingExactResults = false;
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

  function setSearchTitle(title) {
    if (!guideName && /^\/(?:index\.html)?$/.test(window.location.pathname)) {
      document.title = title;
    }
  }

  function setHome() {
    cancelActive();

    currentCard = null;
    $("ms-card-information")?.remove();
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

    setSearchTitle("MTG Card Printings, Foils & Versions | ManaScout");

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
    for (const img of document.querySelectorAll(".guide-static-art img, .guide-variant-grid img")) {
      const { printingId, verifiedFinish, verifiedTreatments } = img.closest("figure").dataset;
      presentation.enhance(img, {
        id: printingId,
        finishes: verifiedFinish ? [verifiedFinish] : [],
        promo_types: verifiedTreatments?.split(" ") || []
      }, verifiedFinish);
      const failed = () => {
        img.hidden = true;
        const notice = img.closest("figure")?.querySelector(".guide-image-error");
        if (notice) notice.hidden = false;
      };
      img.addEventListener("error", failed);
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

  const finishes = presentation.available;

  function selectedFinish(card) {
    const requested = previews.get(card?.id);
    return finishes(card).includes(requested) ? requested : presentation.defaultFinish(card);
  }

  const finishLabel = presentation.finishLabel;
  const finishText = presentation.finishList;

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

  function finishSelector(card) {
    const available = finishes(card);
    if (available.length < 2) return stat("Selected Finish", finishLabel(selectedFinish(card), card));
    return `<div class="detail"><strong><label for="ms-selected-finish">Selected Finish</label></strong><select id="ms-selected-finish" data-ms-selected-finish="${esc(card.id)}">${available.map(finish => `<option value="${esc(finish)}"${finish === selectedFinish(card) ? " selected" : ""}>${esc(finishLabel(finish, card))}</option>`).join("")}</select></div>`;
  }

  function previewImage(card, small = false, finish = selectedFinish(card)) {
    const src = img(card, small ? "small" : "normal");
    if (small) return presentation.markup({
      card, finish, src, alt: "", compact: true, lazy: true, imageClass: "printing-card-image"
    });
    const pair = reversibleFaces(card);
    const picture = (source, name, back = false) => `<span class="ms-card-face${back ? " ms-card-back" : ""}"${back ? ' aria-hidden="true"' : ""}>${presentation.markup({
      card, finish, src: source, alt: `${name} — ${presentation.printing(card)}`, imageClass: "card-image"
    })}</span>`;
    return `<div class="ms-preview ms-card-image" data-ms-preview="${esc(card.id || "")}">
      <div class="ms-face-turner" data-ms-face="front">${picture(pair[0]?.src || src, pair[0]?.name || card.name)}${pair.length ? picture(pair[1].src, pair[1].name, true) : ""}</div>
      ${pair.length ? `<button class="ms-surface-control ms-flip-control" type="button" data-ms-flip="${esc(card.id)}" aria-label="${esc(`Flip to back: ${pair[1].name}`)}" aria-pressed="false" title="Flip card" disabled><span aria-hidden="true">↻</span></button><span class="ms-face-status" role="status" aria-live="polite"></span>` : ""}
    </div>`;
  }

  let previewSession = null;
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

  const treatments = presentation.treatments;
  const treatmentText = card => treatments(card).join(" · ") || presentation.frame(card) || "Frame not supplied";

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
      slug(card?.name?.split(" // ")[0]);

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
        <a href="/card/${esc(path)}/${card?.id ? `?${esc(new URLSearchParams({printing: card.id, finish: selectedFinish(card)}).toString())}` : ""}">
          ◇ View this printing in the guide →
        </a>
      </div>
    `;
  }

  function deckLink(card) {
    if (!card?.id) return "";
    const path = slug(card.name?.split(" // ")[0]);
    const query = new URLSearchParams({
      card: card.name || "",
      printing: card.id,
      finish: selectedFinish(card),
      source: window.location?.pathname?.startsWith("/card/") ? "guide" : "home"
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
    const retailers = window.ManaScoutRetailers;
    const links = retailers?.linksFor(card) || [];
    const source = retailers?.verificationLink(card);
    if (source) links.push(source);
    if (!links.length) return "";
    const anchors = links.map(({ href, label, merchant, affiliate }) =>
      `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer${affiliate ? " sponsored" : ""}"${merchant ? ` data-ms-merchant="${esc(merchant)}"` : ""}>${esc(label)}${affiliate ? " (affiliate)" : ""}</a>`);
    if (links.some(link => link.affiliate)) anchors.push('<a href="/about/#affiliate-disclosure">Affiliate disclosure</a>');
    return `<div class="marketplace-links">${anchors.join("")}</div>`;
  }

  function trackMerchantLink(event) {
    const link = event.target.closest?.("a[data-ms-merchant]");
    if (!link || !currentCard || !$("ms-card-information")?.contains(link)) return;
    const analytics = window.ManaScoutAnalytics;
    analytics?.trackMerchantExit({
      merchant: link.dataset.msMerchant, guide: analytics.guide(),
      printingId: currentCard.id, finish: selectedFinish(currentCard) || "unknown"
    });
  }

  function stat(label, value) {
    return `
      <div class="detail">
        <strong>${esc(label)}</strong>
        ${esc(value || "—")}
      </div>
    `;
  }

  function updateGuideReference(card) {
    if (!guideName || !sameName(card.name, guideName)) return;
    const figure = document.querySelector("[data-guide-reference]");
    if (!figure) return;
    const image = figure.querySelector("img"), label = figure.querySelector("[data-guide-reference-label]");
    const link = figure.querySelector("[data-guide-reference-link]"), notice = figure.querySelector(".guide-image-error");
    const imageUrl = img(card), sourceUrl = safe(card.scryfall_uri);
    if (image && !imageUrl) {
      image.hidden = true;
      if (notice) notice.hidden = false;
    } else if (image && image.getAttribute("src") !== imageUrl) {
      image.hidden = false;
      if (notice) notice.hidden = true;
      image.src = imageUrl;
    }
    if (image) image.alt = `${card.name} — ${presentation.setCode(card.set)} #${card.collector_number}, ${finishLabel(selectedFinish(card), card)}`;
    presentation.enhance(image, card, selectedFinish(card));
    if (label) label.textContent = `Selected printing · ${presentation.setCode(card.set)} #${card.collector_number} · ${card.artist || "Artist not listed"} · ${presentation.language(card.lang)} · ${finishLabel(selectedFinish(card), card)}. Catalogue image; physical finishes vary.`;
    for (const sourceLink of [link, figure.querySelector(".guide-reference-source")]) {
      if (!sourceLink) continue;
      if (sourceUrl) sourceLink.href = sourceUrl;
      else sourceLink.removeAttribute("href");
    }
  }

  function guideDifferences(card) {
    if (!card || !document.body?.dataset?.guideIntent) return "";
    const referenceId = document.querySelector("[data-guide-reference]")?.dataset.printingId;
    const baseline = archive?.cards.find(item => item.id === referenceId && item.oracle_id === card.oracle_id);
    if (!baseline || baseline.id === card.id) return "";
    const changes = presentation.differences([
      { card: baseline, finish: presentation.defaultFinish(baseline) },
      { card, finish: selectedFinish(card) }
    ]);
    if (!changes.length) return "";
    const art = presentation.artwork(card);
    const sameArtwork = art && art === presentation.artwork(baseline);
    const rules = presentation.rules(card);
    const sameRules = rules && rules === presentation.rules(baseline);
    return `<details data-version-differences><summary>What makes this version different?</summary>
      <p>Compared with ${esc(presentation.printing(baseline))}.</p>
      <ul>${changes.map(({label, values}) => `<li><strong>${esc(label)}</strong> · ${esc(label === "Artwork" ? "Different artwork" : values[1] || "Not supplied")}</li>`).join("")}
        ${sameArtwork ? "<li>Same artwork</li>" : ""}
        ${sameRules ? "<li>Same gameplay text</li>" : ""}
      </ul></details>`;
  }

  function refreshGuideFacts(result) {
    const count = document.querySelector("[data-intent-record-count]");
    if (!count || !result.complete || result.notice) return;
    const records = result.cards.filter(card => sameName(card.name, guideName) && card.lang === "en" && paper(card));
    const artworks = records.map(presentation.artwork).filter(Boolean);
    const families = new Set(artworks).size;
    const exactCount = new Set(records.map(card => card.id)).size;
    if (exactCount) count.textContent = `${exactCount} English paper printing ${exactCount === 1 ? "record" : "records"}`;
    if (exactCount && artworks.length === records.length) count.textContent += ` · ${families} artwork ${families === 1 ? "family" : "families"}`;
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
    if (!document.body?.dataset?.guideIntent) updateGuideReference(card);

    const artwork = (
      card.card_faces || []
    ).filter(
      face =>
        face.image_uris?.normal
    );

    ui.details.innerHTML = `
      <article class="card-display ms-compact-card">

        <div class="card-image-wrap">
          ${previewImage(card)}
        </div>

        <div class="card-text-details">

          <h2 tabindex="-1">${esc(card.name || "Unknown card")}</h2>
          <p class="card-subtitle"><strong>${esc(presentation.printing(card))}</strong></p>
          <p class="card-subtitle">${esc([card.artist, presentation.language(card.lang)].filter(Boolean).join(" · "))}</p>
          <div class="ms-printing-facts">
            ${stat("Frame / Treatment", treatmentText(card))}
            ${finishSelector(card)}
            ${selectedPrice(card, selectedFinish(card))}
          </div>
          <div class="ms-selected-actions">
            <button type="button" data-compare-id="${esc(card.id)}">Compare this version</button><a href="#ms-comparison-current" data-compare-jump hidden>View comparison</a>
            ${deckLink(card)}
            ${showingExactResults ? '<button type="button" data-open-printing-archive>All printings of this card</button>' : ""}
          </div>
        </div>
      </article>
    `;

    const explorer = ui.printings?.closest?.("section");
    const selection = ui.details.closest?.("section");
    explorer?.classList?.add("ms-live-explorer");
    if (explorer && selection && explorer !== selection && selection.nextElementSibling !== explorer) {
      selection.after(explorer);
    }
    let information = explorer && $("ms-card-information");
    if (!information && explorer) {
      information = document.createElement("div");
      information.id = "ms-card-information";
      explorer.after(information);
    }
    if (information) information.innerHTML = `
      <div data-guide-difference-slot>${guideDifferences(card)}</div>
      <details><summary>Card details</summary>
          <p>${esc(card.type_line)} ${esc(card.mana_cost)}</p>
          <div class="detail-grid">
            ${stat("Set", card.set_name)}
            ${stat("Set code", presentation.setCode(card.set))}
            ${stat("Collector number", card.collector_number)}
            ${stat("Release Date", card.released_at)}
            ${stat("Rarity", pretty(card.rarity))}
            ${stat("Artist", card.artist)}
            ${stat("Language", presentation.language(card.lang))}
            ${stat("Available Finishes", finishText(card))}
            ${stat("Frame / Treatment", treatmentText(card))}
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

      </details>
      <details><summary>Rules &amp; legality</summary>
          <p class="ms-help">
            <strong>Legal in:</strong>
            ${esc(legalFormats(card))}
          </p>

          ${oracleHtml(card)}
      </details>
      <details><summary>Collector information</summary>
          ${isPick ? '<p class="ms-note">ManaScout Pick · selected for its artwork or distinctive collector treatment.</p>' : ""}

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

      </details>
    `;

    activatePreview(card);

    announce(
      "card",
      {
        cardName: card.name || "",
        printingId: card.id || ""
      }
    );
    if (explorer && showingExactResults) explorer.hidden = true;
  }


  /* ========================================
     CURRENCY AND PRICE DATA
     ======================================== */

  async function fetchRate(currency) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${FX}/${encodeURIComponent(currency)}/GBP`, {
        signal: controller.signal, headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("FX rate unavailable");
      const data = await response.json();
      const rate = Number(data?.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX rate invalid");
      return rate;
    } finally {
      clearTimeout(timer);
    }
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

  /* ========================================
     ALL PRINTINGS

     Request Scryfall's variation, extras
     and multilingual options.

     Do not collapse records by card name.
     ======================================== */

  async function fetchPrintings(
    card,
    token,
    signal,
    previous
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

    const result = previous ? [...previous.cards] : [];
    const ids = new Set(result.map(item => item.id));
    const visited = new Set(previous?.visited);
    let next = previous ? previous.next : first;
    let pages = 0;
    let complete = true;
    let notice = "";

    while (
      next &&
      pages < 1
    ) {
      if (visited.has(next)) { complete = false; notice = "The printing archive repeated a page; results are incomplete."; next = ""; break; }
      visited.add(next);
      let data;

      try {
        data =
          await getScryfall(
            next,
            { signal }
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

        if (!pages) throw error;
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
      if (next && visited.has(next)) {
        complete = false;
        notice = "The printing archive repeated a page; results are incomplete.";
        next = "";
      }

      pages++;

    }

    if (next) complete = false;

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
      notice,
      next,
      visited
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
            "Catalogue records"
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
            "Records with foil",
            !s.foil.length
          )}

          ${snapshotButton(
            "etched",
            s.etched.length,
            "Records with etched",
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

  function selectedPrice(card, finish) {
    const values = presentation.prices(card, finish);
    return values.length ? stat("Scryfall Reference Price", values.join(" · ")) : "";
  }

  function referencePrices(card) {
    const values = finishes(card).flatMap(finish => {
      const prices = presentation.prices(card, finish);
      return prices.length ? [`<span><strong>${esc(finishLabel(finish, card))}</strong> ${esc(prices.join(" · "))}</span>`] : [];
    });
    return values.length ? values.join("") : '<span class="muted">No reference price</span>';
  }

  const printingHead = '<thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Card</th><th scope="col" role="columnheader">Printing</th><th scope="col" role="columnheader">Finish / Treatment</th><th scope="col" role="columnheader">Reference Price</th></tr></thead>';

  function recordId(target) {
    return target.closest("[data-print-id]")?.dataset.printId ||
      (!target.closest("button, a, summary, details") && target.closest("[data-record-id]")?.dataset.recordId);
  }

  function row(card, selected, { variants = [], search = false, requested } = {}) {
    const chosen = card.id === selected?.id;
    const finish = !chosen && card.finishes?.includes(requested) ? requested : selectedFinish(card);
    const identity = `${card.name}, ${presentation.printing(card)}, ${presentation.language(card.lang)}, ${finishLabel(finish, card)}`;
    const select = `type="button" data-print-id="${esc(card.id)}" aria-pressed="${chosen}"`;
    const tags = treatments(card);
    return `<tr role="row" data-record-id="${esc(card.id)}" class="${chosen ? "is-selected-printing" : ""}">
      <td role="cell" class="ms-print-art"><button class="ms-print-thumbnail" ${select} aria-label="${esc(`Inspect ${identity}`)}">${previewImage(card, true, finish)}</button></td>
      <td role="cell" class="ms-print-identity">
        <button class="ms-print-name" ${select}>${search ? `<strong>${esc(card.name)}</strong>` : ""}${esc(presentation.printing(card))}</button>
        <span class="ms-print-note">${esc([card.artist, card.lang !== "en" && presentation.language(card.lang), !search && card.released_at].filter(Boolean).join(" · "))}</span>
        ${!search ? `<button type="button" data-compare-id="${esc(card.id)}">Compare version</button><a href="#ms-comparison-current" data-compare-jump hidden>View comparison</a>` : ""}
        ${variants.length ? `<details class="ms-print-variants"><summary>${variants.length} other language ${variants.length === 1 ? "version" : "versions"}</summary>
          <ul>${variants.map(variant => `<li><button type="button" data-print-id="${esc(variant.id)}">${esc(presentation.language(variant.lang))} · ${esc(finishText(variant))}</button></li>`).join("")}</ul></details>` : ""}
      </td>
      <td role="cell" class="ms-print-finish"><strong>${esc(finishText(card))}</strong>${tags.length ? `<span class="ms-print-note">${esc(tags.join(" · "))}</span>` : ""}</td>
      <td role="cell" class="ms-print-prices">${referencePrices(card)}</td>
    </tr>`;
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

  function groupPrintings(cards, selected) {
    const groups = [];
    const keyed = new Map();
    for (const card of cards) {
      const art = card.illustration_id || card.card_faces?.map(face => face.illustration_id || "").join(",");
      const key = card.oracle_id && art && art.replace(/,/g, "") && JSON.stringify([
        card.oracle_id, card.set, card.collector_number, art, card.layout, card.frame,
        card.border_color, card.full_art, card.textless, card.promo, card.oversized, card.variation, card.security_stamp,
        [...(card.frame_effects || [])].sort(), [...(card.promo_types || [])].sort()
      ]);
      const sameEdition = key ? keyed.get(key) : undefined;
      const group = sameEdition?.find(entries => !entries.some(entry => entry.lang === card.lang));
      if (group) group.push(card);
      else {
        const entries = [card];
        groups.push(entries);
        if (key) keyed.set(key, [...(sameEdition || []), entries]);
      }
    }
    return groups.map(entries => {
      const primary = entries.find(card => card.id === selected?.id) || entries.find(card => card.lang === "en") || entries[0];
      return { primary, variants: entries.filter(card => card !== primary) };
    });
  }

  function renderArchive(
    result,
    rates,
    token,
    previous
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
        cards.filter(card => card.lang === "en" && paper(card)),
        rates
      );

    const sets = [
      ...new Map(
        cards.filter(paper).map(
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
        cards.filter(paper)
          .map(c => c.lang)
          .filter(Boolean)
      )
    ]
      .sort()
      .map(
        id => [
          id,
          presentation.language(id)
        ]
      );

    const state = {
      cards,
      rates,
      token,
      selected: currentCard,
      snapshot: "all",
      pageSize: 24,
      limit: 24
    };

    archive = state;
    refreshGuideFacts(result);
    const differences = document.querySelector("[data-guide-difference-slot]");
    if (differences) differences.innerHTML = guideDifferences(currentCard);

    ui.printings.innerHTML = `
      <label class="ms-language-toggle"><input id="ms-show-languages" type="checkbox" aria-controls="ms-language-filter ms-print-body"> Show other languages</label>
        <label id="ms-language-filter" hidden>
          Language
          <select id="ms-print-lang" disabled>
            ${selectOptions(
              langs,
              "All languages"
            )}
          </select>
        </label>

      <p id="ms-language-selection" class="ms-note" role="status" hidden></p>
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

      <details class="ms-archive-options">
      <summary>Filter and sort catalogue records</summary>

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
          <input id="ms-print-set" type="search" list="ms-print-set-options" placeholder="Name or code" autocomplete="off">
          <datalist id="ms-print-set-options">
            ${sets.map(([code, name]) => `<option value="${esc(code.toUpperCase())}" label="${esc(name)}"></option>`).join("")}
          </datalist>
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
              Surge Foil
            </option>
            <option value="galaxyfoil">
              Galaxy Foil
            </option>
            <option value="halofoil">
              Halo Foil
            </option>
            <option value="textured">
              Textured Foil
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
          Clear filters
        </button>

      </div>

      </details>

      <div class="ms-live-printings">
        <table role="table" class="ms-printing-table" aria-label="Printing catalogue records">
          ${printingHead}
          <tbody role="rowgroup" id="ms-print-body"></tbody>
        </table>
      </div>

      <div
        class="ms-pagination"
        id="ms-print-pages"
      ></div>

      ${result.next || result.retry ? `<button type="button" id="ms-load-printings">${result.retry ? "Retry loading printings" : "Load more catalogue printings"}</button>` : ""}
      <p id="ms-archive-request" class="ms-note" role="status"></p>
      <details class="ms-printing-notes ms-snapshot-options">
        <summary>English printing highlights</summary>
        ${snapshotMarkup(cards.filter(card => card.lang === "en" && paper(card)), rates, s)}
      </details>
      <details class="ms-printing-notes"><summary>About printing records and prices</summary><p class="ms-help">
        Each row is a catalogue record for a set, collector number and language;
        another language does not necessarily mean different artwork.
        A record can offer several finishes. Scryfall reference prices are shown in their source currencies. Foil effects illustrate the selected finish.
      </p></details>
    `;

    const c = {
      find: $("ms-print-search"),
      set: $("ms-print-set"),
      lang: $("ms-print-lang"),
      multilingual: $("ms-show-languages"),
      finish: $("printing-finish-filter"),
      treatment: $("ms-print-treatment"),
      sort: $("printing-sort"),
      body: $("ms-print-body"),
      pages: $("ms-print-pages")
    };

    if (previous) {
      for (const field of ["find", "set", "lang", "finish", "treatment", "sort"]) {
        c[field].value = previous.values[field];
      }
      c.multilingual.checked = previous.multilingual;
      state.limit = previous.limit;
      state.snapshot = previous.snapshot;
      ui.printings.querySelector(".ms-archive-options").open = previous.open;
      ui.printings.querySelector(".ms-snapshot-options").open = previous.highlightsOpen;
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
      const q = norm(c.find.value);
      const set = norm(c.set.value);

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
            paper(card) &&
            (!q || haystack.includes(q)) &&

            (
              !set || norm(card.set) === set || norm(card.set_name).includes(set)
            ) &&

            (
              c.multilingual.checked
                ? c.lang.value === "all" || card.lang === c.lang.value
                : card.lang === "en" && paper(card)
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
      const groups = groupPrintings(list, state.selected);
      const start = state.limit - state.pageSize;
      const page = groups.slice(start, state.limit);
      const languageFilter = $("ms-language-filter");
      languageFilter.hidden = !c.multilingual.checked;
      c.lang.disabled = !c.multilingual.checked;
      const languageSelection = $("ms-language-selection");
      languageSelection.hidden = c.multilingual.checked || state.selected?.lang === "en" || !state.selected;
      languageSelection.textContent = languageSelection.hidden ? "" :
        `Browsing English printings. Your ${presentation.language(state.selected.lang)} printing is still selected.`;

      c.body.innerHTML = page.map(({ primary, variants }) =>
        row(primary, state.selected, { variants })
      ).join("") ||
        `
          <tr>
            <td
              colspan="4"
              class="ms-table-empty"
            >
              No printings match these filters.
            </td>
          </tr>
        `;

      const languages = new Set(list.map(card => card.lang)).size;
      ui.status.textContent = c.multilingual.checked
        ? `${list.length} printings · ${languages} ${languages === 1 ? "language" : "languages"}`
        : `${list.length} English ${list.length === 1 ? "printing" : "printings"}`;
      if (!result.complete) ui.status.textContent += " · from loaded records";


      c.pages.innerHTML = groups.length ? `<span>Showing ${start + 1}–${start + page.length} of ${groups.length} editions</span>
        <button type="button" data-print-page="previous"${start === 0 ? " disabled" : ""}>Previous</button>
        <button type="button" data-print-page="next"${groups.length <= state.limit ? " disabled" : ""}>Next</button>` : "";

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

    c.pages.addEventListener("click", event => {
      const button = event.target.closest("[data-print-page]");
      if (!button || button.disabled) return;
      const direction = button.dataset.printPage === "next" ? 1 : -1;
      state.limit += direction * state.pageSize;
      update();
      c.pages.querySelector(`[data-print-page="${button.dataset.printPage}"]:not(:disabled)`)?.focus();
      if (!c.pages.contains(document.activeElement)) c.pages.querySelector("button:not(:disabled)")?.focus();
    });

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
      trackExact(card, guideName ? "guide" : "search");
      trackTableSelection("archive");
      update();

      if (scroll) focusSelectedCard();
    }

    c.body.addEventListener(
      "click",
      event => {
        const id = recordId(event.target);
        if (id) selectCard(cards.find(card => card.id === id));
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

          if (chosen && filtered().some(card => card.id === chosen.id)) {
            selectCard(chosen, state.snapshot.includes("foil") ? "foil" : "", false);
          } else {
            update();
          }

          scrollTo(
            ui.printings.querySelector(".ms-live-printings")
          );
        }
      );

    for (
      const element of [
        c.find,
        c.set,
        c.lang,
        c.multilingual,
        c.finish,
        c.treatment,
        c.sort
      ]
    ) {
      element.addEventListener(
        element.type === "search" ? "input" : "change",
        () => {
          state.limit = state.pageSize;
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
          c.set.value = "";
          c.lang.value = "all";
          c.finish.value = "all";
          c.treatment.value = "all";
          c.sort.value = "newest";

          state.limit =
            state.pageSize;

          update();
        }
      );

    const loadMore = $("ms-load-printings");
    loadMore?.addEventListener("click", async () => {
      const status = $("ms-archive-request");
      loadMore.disabled = true;
      status.textContent = "Loading more printings…";
      try {
        const next = await fetchPrintings(currentCard, token, controller.signal, result.retry ? undefined : result);
        if (token !== generation) return;
        renderArchive(next, rates, token, {
          values: Object.fromEntries(["find", "set", "lang", "finish", "treatment", "sort"].map(field => [field, c[field].value])),
          multilingual: c.multilingual.checked,
          limit: state.limit,
          snapshot: state.snapshot,
          open: ui.printings.querySelector(".ms-archive-options").open,
          highlightsOpen: ui.printings.querySelector(".ms-snapshot-options").open
        });
        ($("ms-load-printings") || ui.printings.querySelector(".ms-live-printings"))?.focus({ preventScroll: true });
      } catch (error) {
        if (token !== generation) return;
        status.textContent = searchError(error);
        loadMore.disabled = false;
      }
    });
    state.update = update;
    update();
  }


  /* ========================================
     CARD LOADING AND EXACT-ID RESTORATION

     A requested printing ID takes precedence
     over a ManaScout Pick.
     ======================================== */

  function focusSelectedCard() {
    ui.details?.querySelector(".ms-compact-card h2")?.focus({ preventScroll: true });
    scrollTo(ui.details);
  }

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

    const request = new AbortController();
    const { signal } = request;
    controller = loadingCard = request;
    const restored = opts.fromHistory ? urlState.parse(window.location.search) : {};
    const requestedId = urlState.printing(opts.printingId || restored.printingId);
    const requestedFinish = urlState.finish(opts.finish || restored.finish);

    if (!opts.fromHistory) {
      startUrl(
        query,
        requestedId,
        Boolean(opts.replace)
      );
    }

    if (ui.input) {
      ui.input.value = opts.input || query;
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
    ui.details?.ownerDocument?.getElementById("ms-card-information")?.remove();

    if (ui.status) {
      ui.status.textContent =
        "Loading printings…";
    }

    try {
      let card = opts.record || null;
      let exact = Boolean(card);

      if (requestedId && !card) {
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
            ) && norm(candidate.id) === norm(requestedId)
          ) {
            card = candidate;
            exact = true;
          } else {
            throw Object.assign(new Error("The requested printing belongs to a different card. Your exact link has been kept."), {exactPrinting: true});
          }

        } catch (error) {
          if (error.name === "AbortError" || error.exactPrinting) throw error;
          throw Object.assign(new Error("The requested printing could not be loaded. Your exact link has been kept; please retry."), {exactPrinting: true});
        }
      }

      if (!card) {
        card = opts.nameRecord ||
          await namedCard(
            query,
            signal
          );
      }

      if (
        signal.aborted || token !== generation
      ) {
        return null;
      }

      if (!validSearchCard(card)) throw new Error("Incomplete physical card response.");

      if (
        exact &&
        requestedFinish
      ) {
        const accepted = chooseFinish(
          card,
          requestedFinish
        );
        if (!accepted) throw Object.assign(new Error("That finish is not available for the requested printing. Your exact link has been kept."), {exactPrinting: true});
      }

      renderCard(
        card,
        false
      );
      if (exact && opts.userSearch) trackExact(card, "search");

      const rateRequest = Promise.race([exchangeRates(), delay(750).then(() => null)]).catch(() => null);
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
          retry: true,
          notice:
            "Scryfall's printing archive is unavailable. Showing the selected printing only."
        };
      }

      if (
        signal.aborted || token !== generation
      ) {
        return null;
      }

      const rates = await rateRequest;

      if (
        signal.aborted || token !== generation
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
            result.cards.filter(item => item.lang === "en" && paper(item)),
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

      setSearchTitle(`${card.name} Printings, Foils & Art | ManaScout`);

      if (opts.userSearch) trackSearch(opts.searchType || (exact ? "exact_printing" : "name"), exact, 1);
      if (opts.userSearch || opts.focusSelection) focusSelectedCard();
      return card;

    } catch (error) {
      if (
        error.name === "AbortError" ||
        signal.aborted || token !== generation
      ) {
        return null;
      }

      console.error(
        "ManaScout card load failed",
        error
      );

      errorState(
        error.exactPrinting ? error.message : error.status === 429 ? searchError(error) : error.status === 404
          ? `No card matched “${query}”. Check the spelling and try again.`
          : "Scryfall could not be reached. Please try again."
      );

      return null;
    } finally {
      if (loadingCard === request) loadingCard = null;
    }
  }


  /* ========================================
     AUTOCOMPLETE
     ======================================== */

  async function catalogueSets(signal) {
    if (setIndex) return setIndex;
    const data = await getScryfall(`${API}/sets`, { signal });
    if (!Array.isArray(data?.data) || !data.data.length) throw new Error("Set catalogue unavailable.");
    setIndex = intentEngine.makeSetIndex(data.data);
    return setIndex;
  }

  function trackSearch(category, exact, count) {
    window.ManaScoutAnalytics?.track("search_success", {
      surface: guideName ? "guide" : "home",
      exact_printing: exact,
      search_type: category,
      result_band: count === 1 ? "one" : count <= 10 ? "few" : "many"
    });
  }

  function trackExact(card, source) {
    const finish = selectedFinish(card);
    window.ManaScoutAnalytics?.track("exact_printing_select", {
      source,
      language_group: card.lang === "en" ? "english" : "other",
      finish: ["nonfoil", "foil", "etched"].includes(finish) ? finish : "unknown"
    });
  }

  const validSearchCard = card => Boolean(urlState.printing(card?.id) && paper(card) &&
    ["name", "set", "collector_number", "lang"].every(key => typeof card[key] === "string" && card[key].trim()));

  async function cataloguePage(url, signal) {
    const cached = searchPages.get(url);
    if (cached && cached.expires > Date.now()) return cached.data;
    const data = await getScryfall(url, { signal });
    if (!Array.isArray(data?.data) || !data.data.length || !data.data.every(validSearchCard)) {
      throw new Error("Incomplete catalogue response.");
    }
    const next = data.has_more ? printingSearchUrl(data.next_page) : "";
    if (data.has_more && (!next || next === url)) throw new Error("Incomplete catalogue pagination.");
    const page = { cards: data.data, total: data.total_cards || data.data.length, next };
    searchPages.set(url, { data: page, expires: Date.now() + 5 * 60 * 1000 });
    if (searchPages.size > 12) searchPages.delete(searchPages.keys().next().value);
    return page;
  }

  function selectSearchCard(card, intent, query, { userSearch = false } = {}) {
    return loadCard(card.name, {
      record: card,
      printingId: card.id,
      finish: intent.criteria.finish,
      input: query,
      searchType: intent.category,
      userSearch,
      replace: !userSearch
    });
  }

  function trackTableSelection(table) {
    window.ManaScoutAnalytics?.track("printing_table_select", { table, surface: guideName ? "guide" : "home" });
  }

  function renderSearchResults(page, intent, query, signal) {
    let records = page.cards;
    let next = page.next;
    let start = 0;
    const pageSize = 16;
    const visited = new Set();
    const heading = document.createElement("h2");
    heading.textContent = intent.printing ? "Exact printings" : "Card matches";
    const list = document.createElement(intent.printing ? "table" : "ul");
    if (intent.printing) {
      list.className = "ms-printing-table";
      list.setAttribute("aria-label", "Exact printing results");
      list.setAttribute("role", "table");
      list.innerHTML = `${printingHead}<tbody role="rowgroup"></tbody>`;
    }
    const body = intent.printing ? list.querySelector("tbody") : list;
    showingExactResults = intent.printing;
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous results";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "Next results";
    const navigation = document.createElement("div");
    navigation.className = "ms-pagination";
    navigation.append(previous, more);
    searchResults.replaceChildren(heading);
    if (intent.category === "collector_number") {
      const hint = document.createElement("p");
      hint.textContent = `Collector #${intent.criteria.collector_number} can appear in multiple sets. Add a set code such as J25 35, or choose a match below.`;
      searchResults.append(hint);
    }
    searchResults.append(list, navigation);
    searchResults.hidden = false;

    function drawPage() {
      const group = records.slice(start, start + pageSize);
      if (intent.printing) {
        body.innerHTML = group.map(card => row(card, currentCard, { search: true, requested: intent.criteria.finish })).join("");
      } else {
        body.replaceChildren();
        for (const card of group) {
          const item = document.createElement("li");
          item.innerHTML = `<button type="button">${img(card, "small") ? `<img src="${esc(img(card, "small"))}" alt="" width="72" height="100" loading="lazy">` : ""}
            <span><strong>${esc(card.name)}</strong><span>${esc(card.type_line)}</span></button>`;
          item.firstElementChild.addEventListener("click", () => void loadCard(card.name, { focusSelection: true }));
          body.append(item);
        }
      }
      previous.disabled = start === 0;
      more.disabled = start + group.length >= records.length && !next;
      navigation.hidden = previous.disabled && more.disabled;
      const shown = group.length === 1 ? String(start + 1) : `${start + 1}–${start + group.length}`;
      searchStatus.textContent = `Showing ${shown} of ${page.total} ${intent.printing ? "printings" : "cards"}.`;
    }

    if (intent.printing) list.closest("section").addEventListener("ms:finish-change", drawPage, { signal });
    if (intent.printing) body.addEventListener("click", event => {
      const id = recordId(event.target);
      const card = records.find(item => item.id === id);
      if (!card || signal.aborted) return;
      if (intent.criteria.finish && !previews.has(card.id)) chooseFinish(card, intent.criteria.finish);
      startUrl(card.name, card.id, false);
      renderCard(card);
      replaceUrl(card);
      const selection = ui.details.closest("section");
      if (selection?.nextElementSibling !== searchResults) selection?.after(searchResults);
      setSearchTitle(`${card.name} Printings, Foils & Art | ManaScout`);
      trackExact(card, "search");
      trackTableSelection("search");
      drawPage();
      focusSelectedCard();
    });

    previous.addEventListener("click", () => {
      start -= pageSize;
      drawPage();
      if (previous.disabled) more.focus({ preventScroll: true });
    });
    more.addEventListener("click", async () => {
      more.disabled = true;
      previous.disabled = true;
      try {
        if (start + pageSize * 2 > records.length && next) {
          searchStatus.textContent = "Loading more results…";
          if (visited.has(next)) throw new Error("Repeated catalogue page.");
          const additional = await cataloguePage(next, signal);
          if (signal.aborted) return;
          visited.add(next);
          const ids = new Set(records.map(card => card.id));
          records = records.concat(additional.cards.filter(card => !ids.has(card.id)));
          next = additional.next;
        }
        if (start + pageSize < records.length) start += pageSize;
        drawPage();
        (more.disabled ? previous : more).focus({ preventScroll: true });
      } catch (error) {
        if (!signal.aborted) {
          previous.disabled = start === 0;
          more.disabled = false;
          searchStatus.textContent = searchError(error);
        }
      }
    });
    drawPage();
  }

  function searchError(error) {
    if (error.status === 429) return "Scryfall is rate limiting requests. Wait a moment and retry.";
    if (error.status === 404) return "No paper cards or printings matched. Check the spelling or try fewer search terms.";
    return "Catalogue search could not complete. Please retry.";
  }

  const locators = new Map();
  async function exactLocator(set, number, language, signal) {
    const endpoint = `${API}/cards/${set}/${encodeURIComponent(number)}/${language}`;
    if (locators.has(endpoint)) return locators.get(endpoint);
    const card = await getScryfall(endpoint, { signal });
    if (!validSearchCard(card) || card.set !== set ||
        norm(card.collector_number) !== norm(number) || card.lang !== language) {
      throw new Error("The catalogue returned a different printing.");
    }
    locators.set(endpoint, card);
    if (locators.size > 32) locators.delete(locators.keys().next().value);
    return card;
  }

  async function submitSearch(query, filters = {}, fromHistory = false) {
    if (!intentEngine || !searchResults) return loadCard(query, { userSearch: !fromHistory });
    query = String(query).trim().slice(0, 160);
    if (loadingCard) {
      loadingCard.abort();
      ui.details?.querySelector('.empty-state[role="status"]')?.remove();
      if (ui.status) ui.status.textContent = "";
    }
    searchController?.abort();
    suggestController?.abort();
    clearTimeout(suggestTimer);
    clearSuggestions();
    searchController = new AbortController();
    const { signal } = searchController;
    searchStatus.textContent = "Searching the catalogue…";
    try {
      if (filters.language) {
        const language = Object.entries(LANGS).find(([code, label]) => [code, label.toLowerCase()].includes(filters.language.trim().toLowerCase()));
        if (!language) {
          searchStatus.textContent = "Enter a catalogue language, such as Japanese.";
          return;
        }
        filters = { ...filters, language: language[0] };
      }
      let intent = intentEngine.interpret(query, {}, setIndex || undefined, LANGS);
      const constrained = Object.keys(filters).length || intent.category !== "name" || /(?:^|\s)#?\d[\p{L}\d★†-]*$/u.test(query);
      const exactNameFirst = !constrained || !Object.keys(filters).length && !intent.printing && Boolean(intent.cardName) && !intent.criteria.type;
      if (exactNameFirst && intent.cardName) {
        try {
          const card = await getScryfall(`${API}/cards/named?exact=${encodeURIComponent(query)}`, { signal });
          if (!validSearchCard(card)) throw new Error("Incomplete card response.");
          if (!signal.aborted) return loadCard(card.name, { nameRecord: card, input: query, fromHistory, userSearch: !fromHistory });
          return;
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }
      // Discovery with no potential set suffix can skip the set catalogue.
      const needsSets = filters.set || intent.cardName || intent.criteria.collector_number && /\s/.test(query) || !constrained;
      const sets = needsSets ? await catalogueSets(signal) : setIndex;
      if (signal.aborted) return;
      try {
        intent = intentEngine.interpret(query, filters, sets || undefined, LANGS);
      } catch (error) {
        searchStatus.textContent = error.message;
        return;
      }
      if (intent.category === "name") {
        if (!intent.cardName) return;
        if (/^[a-z0-9]{2,8}\s+\d[\p{L}\d★†-]*$/iu.test(intent.cardName)) {
          searchStatus.textContent = "Set code not found. Check the code, or search for the collector number with #.";
          return;
        }
        try {
          const card = await getScryfall(`${API}/cards/named?fuzzy=${encodeURIComponent(intent.cardName)}`, { signal });
          if (!validSearchCard(card)) throw new Error("Incomplete card response.");
          if (!signal.aborted) return loadCard(card.name, { nameRecord: card, input: query, fromHistory, userSearch: !fromHistory });
          return;
        } catch (error) {
          if (error.status !== 404 || signal.aborted) throw error;
          intent = intentEngine.interpret("", { artist: intent.cardName }, sets || undefined, LANGS);
        }
      }

      const { set, collector_number, language } = intent.criteria;
      let multilingualFallback = false;
      if (intent.lookup && !intent.cardName && Object.keys(intent.criteria).every(key => ["set", "collector_number", "language"].includes(key))) {
        try {
          const card = await exactLocator(set, collector_number, language || "en", signal);
          if (!signal.aborted) return selectSearchCard(card, intent, query, { userSearch: !fromHistory });
          return;
        } catch (error) {
          if (error.status !== 404 || language) throw error;
          multilingualFallback = true;
        }
      }

      const search = new URLSearchParams({
        q: multilingualFallback ? intent.query.replace(" lang:en", "") : intent.query,
        unique: intent.printing ? "prints" : "cards",
        include_multilingual: String(Boolean(language) || multilingualFallback), include_variations: String(intent.printing)
      });
      let page;
      try {
        page = await cataloguePage(`${API}/cards/search?${search}`, signal);
      } catch (error) {
        if (error.status !== 404 || !intent.lookup || language || multilingualFallback) throw error;
        search.set("q", intent.query.replace(" lang:en", ""));
        search.set("include_multilingual", "true");
        page = await cataloguePage(`${API}/cards/search?${search}`, signal);
      }
      if (signal.aborted) return;
      if (intent.lookup && page.cards.some(card => !paper(card) || card.set !== set ||
          norm(card.collector_number) !== norm(collector_number) || language && card.lang !== language ||
          intent.criteria.finish && !has(card, intent.criteria.finish))) throw new Error("Mismatched printing results.");
      if (intent.printing && (intent.lookup || intent.cardName) && page.total === 1 && page.cards.length === 1) {
        return selectSearchCard(page.cards[0], intent, query, { userSearch: !fromHistory });
      }
      controller?.abort();
      currentCard = null;
      ui.details?.replaceChildren();
      ui.printings?.replaceChildren();
      $("ms-card-information")?.remove();
      archive = null;
      generation++;
      announce("loading");
      if (!fromHistory) {
        const entry = urlState.searchEntry(window.location.href, query, filters);
        history.pushState(entry.state, "", entry.url);
        trackSearch(intent.category, false, page.total);
      }
      setSearchTitle("MTG Card Search | ManaScout");
      updateSearchRobots();
      resultController?.abort();
      resultController = new AbortController();
      renderSearchResults(page, intent, query, resultController.signal);
    } catch (error) {
      if (!signal.aborted) searchStatus.textContent = searchError(error);
    }
  }

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

    const { signal } = suggestController;
    try {
      let names = [];
      let sets = setIndex;
      const locator = query.match(/^([a-z0-9]{2,8})\s+#?(\d[\p{L}\d★†-]{0,15})$/iu);
      if (intentEngine && (locator || /^[A-Z0-9]{2,5}$/.test(query))) sets = await catalogueSets(signal);
      const set = sets?.get(norm(locator?.[1] || query));
      if (set && locator) {
        const card = await exactLocator(set.code, locator[2], "en", signal);
        const style = treatments(card).find(label => ["Extended art", "Showcase", "Borderless", "Full art", "Retro frame"].includes(label));
        names = [{ query, label: `${presentation.setCode(set.code)} #${card.collector_number} — ${card.name}${style ? " · " + style : ""}` }];
      } else if (set) {
        names = [{ query: set.code, label: `${set.code.toUpperCase()} — ${set.name}` }];
      } else if (!locator && !/^#|^collector\s|artist:/i.test(query)) {
        const response = await getScryfall(`${API}/cards/autocomplete?q=${encodeURIComponent(query)}`, { signal });
        names = (Array.isArray(response?.data) ? response.data : []).filter(name => typeof name === "string").slice(0, 8)
          .map(name => ({ query: name, label: name }));
      }
      if (signal.aborted || norm(ui.input?.value) !== norm(query) || !ui.suggestions) return;

      if (!names.length) {
        clearSuggestions();
        return;
      }

      activeSuggestion = -1;

      ui.suggestions.innerHTML =
        names.map(
          (item, i) => `
            <button
              type="button"
              class="autocomplete-item"
              id="ms-autocomplete-${i}"
              role="option"
              aria-selected="false"
              tabindex="-1"
              data-name="${esc(item.query)}"
            >
              ${esc(item.label)}
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
        !signal.aborted && error.name !== "AbortError"
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
          void submitSearch(name);
        }
      }
    );

    ui.input.addEventListener(
      "input",
      () => {
        clearTimeout(
          suggestTimer
        );

        suggestController?.abort();
        clearSuggestions();
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

        } else if (event.key === "Enter" && activeSuggestion >= 0 && items[activeSuggestion]) {
          event.preventDefault();
          ui.form.requestSubmit();
        } else if (event.key === "Escape") {
          clearTimeout(suggestTimer);
          suggestController?.abort();
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
            void submitSearch(item.dataset.name);
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
          clearTimeout(suggestTimer);
          suggestController?.abort();
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
      $("ms-card-information")?.querySelector(".ms-actions-status");

    if (status) {
      status.textContent =
        message;
    }
  }

  function updateSelectedFinish(finish) {
    if (!currentCard || finish === selectedFinish(currentCard) || !chooseFinish(currentCard, finish)) return;
    const card = currentCard;
    renderCard(card, currentPick);
    replaceUrl(card);
    window.ManaScoutAnalytics?.track("finish_switch", { surface: guideName ? "guide" : "home" });
    archive?.update();
    if (showingExactResults) searchResults.dispatchEvent(new Event("ms:finish-change"));
    ui.details?.querySelector("[data-ms-selected-finish]")?.focus({ preventScroll: true });
    showAction(`${finishLabel(finish, card)} selected for this exact printing.`);
  }
  document.addEventListener("toggle", event => {
    if (event.target.open && event.target.hasAttribute?.("data-version-differences")) {
      window.ManaScoutAnalytics?.track("printing_difference_expand", { surface: "guide" });
    }
  }, true);
  document.addEventListener("change", event => {
    const select = event.target.closest("[data-ms-selected-finish]");
    if (select && ui.details?.contains(select) && currentCard?.id === select.dataset.msSelectedFinish) updateSelectedFinish(select.value);
  });
  document.addEventListener("click", async event => {
      const flip = event.target.closest("[data-ms-flip]");
      if (flip && ui.details?.contains(flip)) { flipPreview(flip); return; }
      if (event.target.closest("[data-open-printing-archive]") && currentCard) {
        void loadCard(currentCard.name, { record: currentCard, printingId: currentCard.id, finish: selectedFinish(currentCard), focusSelection: true });
        return;
      }

      const copy =
        event.target.closest(
          "[data-copy-printing]"
        );

      if (
        copy &&
        $("ms-card-information")?.contains(copy) &&
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
        !$("ms-card-information")?.contains(button) ||
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
        ...$("ms-card-information").querySelectorAll(
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
          await getScryfall(
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

  function restoreSelection(state) {
    if (state.kind === "home") {
      setHome();
    } else if (state.kind === "search" && intentEngine && ui.input) {
      ui.input.value = state.query;
      void submitSearch(state.query, state.filters, true);
    } else {
      void loadCard(state.query, {
        fromHistory: true, printingId: state.printingId, finish: state.finish
      });
    }
  }

  window.addEventListener("popstate", event => {
    updateSearchRobots();
    restoreSelection(urlState.restore(window.location.search, event.state, guideName));
  });


  /* ========================================
     PUBLIC API
     ======================================== */

  window.ManaScout =
    Object.freeze({
      loadCard,
      comparison: Object.freeze({
        card: id => currentCard?.id === id ? currentCard : archive?.cards.find(c => c.id === id),
        finish: selectedFinish,
        exact: cardId,
        image: img
      }),
      guidePath: name => {
        const path = slug(name);
        return GUIDE_SLUGS.has(path) ? `/card/${path}/` : "";
      },

      scoutRandom: async () => {
        const result =
          await getScryfall(
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


  document.addEventListener("click", trackMerchantLink);
  document.addEventListener("auxclick", event => {
    if (event.button === 1) trackMerchantLink(event);
  });
  installGuideImages();
  updateSearchRobots();

  if (urlState.parse(window.location.search).query) {
    restoreSelection(urlState.restore(window.location.search, null, guideName));
  }

})();

/* Guide-to-studio action; native navigation remains untouched. */
(()=>{
  document.addEventListener("click", event => {
    if(!event.target.closest?.("[data-build-deck]"))return;
    const guide=window.ManaScoutAnalytics?.guide();
    if(guide&&guide!=="none")window.ManaScoutAnalytics.track("guide_deck_start",{guide,commander_seeded:false});
  });

})();
