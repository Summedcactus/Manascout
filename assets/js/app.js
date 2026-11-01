
/*
 * ManaScout — Complete card-search engine
 * File: assets/js/app.js
 * Branch: DEVELOPMENT
 *
 * Search, autocomplete, printing selection, ManaScout Pick,
 * finish previews, printings archive, GBP estimates and discovery.
 * No roulette and no change to main/dev branches.
 */
(() => {
  "use strict";

  const API = "https://api.scryfall.com";
  const FX_API = "https://api.frankfurter.dev/v2/rate";
  const $ = id => document.getElementById(id);

  const els = {
    form: $("search-form"),
    input: $("search-input"),
    autocomplete: $("autocomplete-list"),
    details: $("card-details"),
    status: $("printings-status"),
    printings: $("printings-container")
  };

  const GUIDE_SLUGS = new Set([
    "ancient-tomb", "birds-of-paradise", "black-lotus",
    "counterspell", "cyclonic-rift", "deflecting-swat",
    "demonic-consultation", "demonic-tutor",
    "dockside-extortionist", "force-of-will",
    "jace-the-mind-sculptor", "jeskas-will",
    "lightning-greaves", "mana-crypt", "mana-drain",
    "mystic-remora", "rhystic-study", "smaug-wicked-worm",
    "smothering-tithe", "sol-ring", "swords-to-plowshares",
    "teferis-protection", "the-one-ring",
    "the-theorist-jace-beleren", "vampiric-tutor",
    "mana-vault", "arcane-signet", "esper-sentinel",
    "doubling-season", "path-to-exile", "lightning-bolt",
    "mystic-sanctuary"
  ]);

  const TREATMENT_LABELS = {
    surgefoil: "Surge foil",
    galaxyfoil: "Galaxy foil",
    halofoil: "Halo foil",
    textured: "Textured foil",
    rainbowfoil: "Rainbow foil",
    stepandcompleat: "Step-and-Compleat foil",
    serialized: "Serialized",
    boosterfun: "Booster Fun",
    etched: "Etched",
    extendedart: "Extended art",
    showcase: "Showcase",
    fullart: "Full art",
    borderless: "Borderless",
    inverted: "Inverted"
  };

  let requestController = null;
  let suggestController = null;
  let suggestTimer = 0;
  let searchToken = 0;
  let activeSuggestion = -1;
  let ratesPromise = null;
  let currentCard = null;
  let printingState = null;

  const pickCache = new Map();
  const foilDisabled = new Set();


  /* ========================================
     HELPERS
     ======================================== */

  const html = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const asNumber = value => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const title = value => String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  const slug = name => String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const safeUrl = value => {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol)
        ? url.href
        : "";
    } catch {
      return "";
    }
  };

  const imageFor = (card, size = "normal") => safeUrl(
    card?.image_uris?.[size] ||
    card?.image_uris?.normal ||
    card?.card_faces?.[0]?.image_uris?.[size] ||
    card?.card_faces?.[0]?.image_uris?.normal ||
    ""
  );

  const finishHas = (card, finish) =>
    (card?.finishes || []).includes(finish);

  const prefersReducedMotion = () =>
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  const scrollTo = element =>
    element?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start"
    });

  const wait = ms =>
    new Promise(resolve => window.setTimeout(resolve, ms));


  /* ========================================
     PAGE STATE AND HISTORY
     ======================================== */

  function announce(state, extra = {}) {
    window.dispatchEvent(
      new CustomEvent("manascout:statechange", {
        detail: {
          state,
          ...extra
        }
      })
    );
  }

  function urlParams() {
    return new URLSearchParams(window.location.search);
  }

  function updateUrl(name, printingId = "", replace = false) {
    const url = new URL(window.location.href);

    if (name) {
      url.searchParams.set("q", name);
    } else {
      url.searchParams.delete("q");
    }

    if (printingId) {
      url.searchParams.set("printing", printingId);
    } else {
      url.searchParams.delete("printing");
    }

    history[
      replace ? "replaceState" : "pushState"
    ]({}, "", url);
  }


  /* ========================================
     NETWORK REQUESTS
     ======================================== */

  async function json(url, signal) {
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const error = new Error(
        `Scryfall returned HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function cardNamed(name, signal) {
    try {
      return await json(
        `${API}/cards/named?exact=${encodeURIComponent(name)}`,
        signal
      );
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      return json(
        `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`,
        signal
      );
    }
  }

  async function cardId(id, signal) {
    return json(
      `${API}/cards/${encodeURIComponent(id)}`,
      signal
    );
  }

  function sameCardName(a, b) {
    return String(a || "").trim().toLowerCase() ===
      String(b || "").trim().toLowerCase();
  }


  /* ========================================
     CLEAR SEARCH / AUTOCOMPLETE
     ======================================== */

  function clearSuggestions() {
    if (!els.autocomplete || !els.input) {
      return;
    }

    els.autocomplete.replaceChildren();
    els.autocomplete.hidden = true;

    els.input.setAttribute(
      "aria-expanded",
      "false"
    );

    els.input.removeAttribute(
      "aria-activedescendant"
    );

    activeSuggestion = -1;
  }

  function stopRequests() {
    requestController?.abort();
    suggestController?.abort();

    window.clearTimeout(suggestTimer);

    ++searchToken;
    printingState = null;
  }

  function setHome() {
    stopRequests();
    currentCard = null;

    if (els.input) {
      els.input.value = "";
    }

    if (els.details) {
      els.details.replaceChildren();
    }

    if (els.printings) {
      els.printings.replaceChildren();
    }

    if (els.status) {
      els.status.textContent = "";
    }

    clearSuggestions();

    document.title =
      "MTG Card Printings, Foils & Versions | ManaScout";

    announce("home");
  }

  function setLoading() {
    if (els.details) {
      els.details.innerHTML = `
        <div class="empty-state" role="status">
          Scouting this card and its printings…
        </div>
      `;
    }

    if (els.printings) {
      els.printings.replaceChildren();
    }

    if (els.status) {
      els.status.textContent =
        "Loading printing data…";
    }
  }

  function setError(message) {
    if (els.details) {
      els.details.innerHTML = `
        <div class="empty-state" role="alert">
          ${html(message)}
        </div>
      `;
    }

    if (els.printings) {
      els.printings.replaceChildren();
    }

    if (els.status) {
      els.status.textContent = "";
    }

    announce("home");
  }


  /* ========================================
     ADDITIONAL COMPONENT STYLING
     Bundled for single-file replacement
     ======================================== */

  function installStyles() {
    if ($("manascout-app-extras")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "manascout-app-extras";

    style.textContent = `
      .ms-preview {
        position:relative;
        display:inline-block;
        max-width:100%;
        isolation:isolate
      }

      .ms-preview>img {
        display:block;
        max-width:100%;
        height:auto
      }

      .ms-foil-glint {
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        mix-blend-mode:screen;
        opacity:.39;
        background:linear-gradient(
          110deg,
          transparent 22%,
          rgba(102,241,194,.1) 37%,
          rgba(182,142,249,.18) 46%,
          rgba(255,255,255,.33) 51%,
          rgba(248,170,220,.15) 57%,
          transparent 72%
        );
        background-size:250% 100%;
        animation:msFoil 7s ease-in-out infinite
      }

      @keyframes msFoil {
        0%,100% {background-position:100% 0}
        50% {background-position:0 0}
      }

      .ms-finish-control {
        position:absolute;
        right:7px;
        top:7px;
        z-index:5;
        max-width:calc(100% - 14px);
        background:rgba(11,11,14,.89);
        border:1px solid #bc4b5f;
        border-radius:7px;
        padding:5px 7px;
        color:#f4d8de;
        font-size:11px;
        cursor:pointer;
        box-shadow:0 4px 15px #0007
      }

      .ms-finish-control:focus-visible {
        outline:2px solid #fff;
        outline-offset:3px
      }

      .ms-finish-control[aria-pressed="true"] {
        border-color:#6baa80;
        color:#c9f0d6
      }

      .ms-card-image {
        border-radius:12px;
        overflow:hidden
      }

      .ms-card-image>.card-image {
        width:100%;
        display:block
      }

      .ms-card-extra {
        display:flex;
        flex-wrap:wrap;
        gap:7px;
        margin:12px 0
      }

      .ms-pill {
        display:inline-flex;
        align-items:center;
        gap:4px;
        border:1px solid #ffffff22;
        background:#ffffff08;
        border-radius:20px;
        padding:5px 9px;
        color:#c3bec1;
        font-size:11px;
        line-height:1.4
      }

      .ms-pill strong {
        color:#f2e9eb
      }

      .ms-card-extra .ms-pill {
        font-size:12px
      }

      .ms-card-actions {
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin:13px 0
      }

      .ms-card-actions button,
      .ms-card-actions a {
        border:1px solid #ffffff28;
        border-radius:8px;
        background:#ffffff07;
        color:#f1e6e8;
        text-decoration:none;
        padding:8px 10px;
        font:inherit;
        font-size:12px;
        cursor:pointer;
        line-height:1.4
      }

      .ms-card-actions button:hover,
      .ms-card-actions a:hover {
        border-color:#c75a69
      }

      .ms-card-actions button:disabled {
        opacity:.55;
        cursor:wait
      }

      .ms-help {
        color:#a59aa0;
        font-size:12px;
        line-height:1.65
      }

      .ms-headline {
        margin:10px 0 7px;
        font-size:16px;
        color:#f1e7ea
      }

      .ms-controls {
        display:flex;
        flex-wrap:wrap;
        align-items:flex-end;
        gap:11px;
        margin:17px 0
      }

      .ms-controls label {
        display:flex;
        flex-direction:column;
        gap:5px;
        font-size:12px;
        color:#ddd3d7
      }

      .ms-controls select,
      .ms-controls input {
        min-height:40px;
        max-width:100%;
        border:1px solid #ffffff32;
        border-radius:8px;
        background:#171519;
        color:#f7edf0;
        padding:8px;
        font:inherit;
        font-size:13px
      }

      .ms-controls input {
        width:min(250px,85vw)
      }

      .ms-controls button {
        min-height:40px;
        padding:8px 12px;
        border:1px solid #ffffff32;
        border-radius:8px;
        background:#ffffff0a;
        color:#f2e7ea;
        cursor:pointer
      }

      .ms-treatments {
        max-width:300px;
        line-height:1.5
      }

      .ms-printing-note {
        display:block;
        margin-top:5px;
        color:#aaa0a5;
        font-size:11px;
        line-height:1.5
      }

      .ms-thumbnail {
        position:relative;
        display:inline-block;
        max-width:100%;
        border-radius:8px;
        overflow:hidden
      }

      .ms-thumbnail img {
        display:block;
        width:64px;
        height:auto;
        border-radius:7px
      }

      .ms-thumbnail .ms-foil-glint {
        opacity:.32
      }

      .ms-thumb-toggle {
        position:absolute;
        right:1px;
        top:1px;
        z-index:3;
        width:22px;
        height:22px;
        border:1px solid #d65b69;
        border-radius:50%;
        background:#190f14dc;
        color:#ffcad2;
        font-size:12px;
        cursor:pointer
      }

      .ms-table-information {
        font-size:11px;
        line-height:1.45;
        color:#a99fa3
      }

      .ms-print-pagination {
        display:flex;
        justify-content:center;
        align-items:center;
        gap:12px;
        margin:18px 0;
        color:#c5bec1;
        font-size:12px
      }

      .ms-print-pagination button {
        border:1px solid #ffffff35;
        background:#ffffff0b;
        border-radius:8px;
        padding:9px 13px;
        color:#eee;
        cursor:pointer
      }

      .ms-price-source {
        display:block;
        font-size:10px;
        color:#9c9197
      }

      .ms-selection-banner {
        padding:10px 12px;
        margin:14px 0;
        border:1px solid #6d9d7d66;
        border-radius:9px;
        color:#c9ead0;
        background:#21533218;
        font-size:12px;
        line-height:1.5
      }

      .ms-table-empty {
        padding:20px;
        text-align:center;
        color:#a99fa3
      }

      .ms-dfc-gallery {
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-top:12px
      }

      .ms-dfc-gallery img {
        width:min(180px,45%);
        height:auto;
        border-radius:9px
      }

      .ms-actions-status {
        font-size:12px;
        color:#b9adad
      }

      .ms-card-image .ms-finish-control {
        font-size:12px
      }

      @media(max-width:600px) {
        .ms-thumbnail img {width:52px}
        .ms-controls {gap:8px}
        .ms-controls label {flex:1 1 120px}
        .ms-controls select {width:100%}
        .ms-card-extra {gap:5px}
      }

      @media(prefers-reduced-motion:reduce) {
        .ms-foil-glint {animation:none!important}
      }
    `;

    document.head.appendChild(style);
  }


  /* ========================================
     FINISHES AND TREATMENTS
     ======================================== */

  function treatments(card) {
    const values = [];
    const effects = card?.frame_effects || [];
    const promos = card?.promo_types || [];

    if (card?.border_color === "borderless") {
      values.push("Borderless");
    }

    if (card?.full_art) {
      values.push("Full art");
    }

    if (card?.textless) {
      values.push("Textless");
    }

    if (card?.promo) {
      values.push("Promo");
    }

    for (const item of effects) {
      values.push(
        TREATMENT_LABELS[item] || title(item)
      );
    }

    for (const item of promos) {
      values.push(
        TREATMENT_LABELS[item] || title(item)
      );
    }

    return [...new Set(values)];
  }

  function treatmentText(card) {
    return treatments(card).join(" · ") ||
      "Standard treatment";
  }

  function finishText(card) {
    const names = {
      nonfoil: "Nonfoil",
      foil: "Foil",
      etched: "Etched foil"
    };

    return (card?.finishes || [])
      .map(f => names[f] || title(f))
      .join(", ") || "—";
  }

  function legalFormats(card) {
    const labels = {
      predh: "PreDH",
      paupercommander: "Pauper Commander",
      standardbrawl: "Standard Brawl",
      oldschool: "Old School"
    };

    return Object.entries(card?.legalities || {})
      .filter(([, value]) => value === "legal")
      .map(([format]) =>
        labels[format] || title(format)
      )
      .join(", ") || "None listed";
  }

  function oracleHtml(card) {
    const faces = card?.card_faces?.length > 1
      ? card.card_faces
      : [card];

    return `
      <div class="oracle">
        ${faces.map(face => `
          <div class="oracle-face">
            ${faces.length > 1 ? `
              <strong class="oracle-face-name">
                ${html(face.name)}
              </strong>
            ` : ""}

            ${String(
              face.oracle_text ||
              "No oracle text available."
            )
              .split("\n")
              .filter(Boolean)
              .map(line => `
                <p>${html(line)}</p>
              `)
              .join("")}
          </div>
        `).join("")}
      </div>
    `;
  }


  /* ========================================
     CARD GUIDES
     ======================================== */

  function guideLink(card) {
    const nameSlug = slug(card?.name);

    const path = nameSlug === "the-theorist"
      ? "the-theorist-jace-beleren"
      : nameSlug;

    if (
      !GUIDE_SLUGS.has(path) ||
      window.location.pathname.replace(/\/+$/, "") ===
      `/card/${path}`
    ) {
      return "";
    }

    return `
      <div class="manascout-guide-link">
        <a href="/card/${html(path)}/">
          ◇ View ManaScout Guide →
        </a>
      </div>
    `;
  }


  /* ========================================
     MARKETPLACE LINKS
     ======================================== */

  function marketplaceLinks(card) {
    const query = encodeURIComponent(
      card?.name || ""
    );

    const scryfall = safeUrl(
      card?.scryfall_uri
    );

    return `
      <div class="marketplace-links">

        <a
          href="https://www.cardmarket.com/en/Magic/Products/Search?searchString=${query}"
          target="_blank"
          rel="noopener noreferrer sponsored"
        >
          Search Cardmarket
        </a>

        <a
          href="https://www.tcgplayer.com/search/magic/product?q=${query}"
          target="_blank"
          rel="noopener noreferrer sponsored"
        >
          Search TCGplayer
        </a>

        ${scryfall ? `
          <a
            href="${html(scryfall)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Scryfall details
          </a>
        ` : ""}

      </div>
    `;
  }


  /* ========================================
     FOIL PREVIEW
     ======================================== */

  function isFoilCapable(card) {
    return (
      finishHas(card, "foil") ||
      finishHas(card, "etched")
    );
  }

  function foilOn(card) {
    return (
      isFoilCapable(card) &&
      !foilDisabled.has(card.id)
    );
  }

  function selectPreviewFinish(card) {
    if (!card) {
      return "nonfoil";
    }

    if (
      !foilOn(card) &&
      finishHas(card, "nonfoil")
    ) {
      return "nonfoil";
    }

    if (
      foilOn(card) &&
      finishHas(card, "foil")
    ) {
      return "foil";
    }

    if (
      foilOn(card) &&
      finishHas(card, "etched")
    ) {
      return "etched";
    }

    return (card.finishes || ["nonfoil"])[0];
  }

  function foilButton(card, small = false) {
    if (!isFoilCapable(card)) {
      return "";
    }

    const active = foilOn(card);
    const hasNonfoil = finishHas(card, "nonfoil");

    const label = active
      ? (hasNonfoil ? "✕ Nonfoil" : "✕ Hide shimmer")
      : "✦ Show foil";

    return `
      <button
        type="button"
        ${small
          ? 'class="ms-thumb-toggle"'
          : 'class="ms-finish-control"'
        }
        data-foil-toggle="${html(card.id)}"
        aria-pressed="${active ? "true" : "false"}"
        aria-label="${html(label)}"
        title="${html(label)}"
      >
        ${small
          ? (active ? "✕" : "✦")
          : html(label)
        }
      </button>
    `;
  }

  function cardImageMarkup(card) {
    const src = imageFor(card);

    const image = src ? `
      <img
        class="card-image"
        src="${html(src)}"
        alt="${html(card.name)} — ${html(card.set_name)} printing #${html(card.collector_number)}"
        decoding="async"
        width="488"
        height="680"
      >
    ` : `
      <div class="empty-state">
        Image unavailable.
      </div>
    `;

    return `
      <div class="card-image-wrap">
        <div class="ms-preview ms-card-image">

          ${image}

          ${foilOn(card) ? `
            <span
              class="ms-foil-glint"
              aria-hidden="true"
            ></span>
          ` : ""}

          ${foilButton(card)}

        </div>
      </div>
    `;
  }


  /* ========================================
     CARD DETAILS
     ======================================== */

  function detailTile(label, value) {
    return `
      <div class="detail">
        <strong>${html(label)}</strong>
        ${html(value || "—")}
      </div>
    `;
  }

  function renderCard(card, { isPick = false } = {}) {
    if (!els.details || !card) {
      return;
    }

    currentCard = card;

    const finish = selectPreviewFinish(card);

    const dfc = (card.card_faces || [])
      .filter(face => face.image_uris?.normal)
      .map(face => `
        <img
          loading="lazy"
          decoding="async"
          src="${html(safeUrl(face.image_uris.normal))}"
          alt="${html(face.name)} card face"
        >
      `)
      .join("");

    els.details.innerHTML = `

      <article class="card-display">

        ${cardImageMarkup(card)}

        <div class="card-text-details">

          <p class="eyebrow">
            ${isPick
              ? "◇ MANASCOUT PICK · FEATURED PRINTING"
              : "CARD & PRINTING"
            }
          </p>

          <h2>
            ${html(card.name || "Unknown card")}
          </h2>

          <p class="card-subtitle">
            ${html(card.type_line || "")}

            ${card.mana_cost ? `
              <span class="mana-cost">
                · ${html(card.mana_cost)}
              </span>
            ` : ""}
          </p>

          ${isPick ? `
            <div class="ms-selection-banner">
              ◇ ManaScout Pick — selected for distinctive
              artwork or collector treatment. Use the
              printings table to choose any other version.
            </div>
          ` : ""}

          <div class="detail-grid">

            ${detailTile("Set", card.set_name)}
            ${detailTile(
              "Set code",
              String(card.set || "").toUpperCase()
            )}
            ${detailTile(
              "Collector number",
              card.collector_number
            )}
            ${detailTile("Released", card.released_at)}
            ${detailTile("Rarity", title(card.rarity))}
            ${detailTile("Artist", card.artist)}
            ${detailTile("Frame", card.frame)}
            ${detailTile("Finishes", finishText(card))}
            ${detailTile("Preview finish", title(finish))}
            ${detailTile("Treatments", treatmentText(card))}

          </div>

          <div class="ms-card-extra">

            ${card.lang ? `
              <span class="ms-pill">
                Language
                <strong>
                  ${html(String(card.lang).toUpperCase())}
                </strong>
              </span>
            ` : ""}

            ${card.reserved ? `
              <span class="ms-pill">
                Reserved List
              </span>
            ` : ""}

            ${card.reprint ? `
              <span class="ms-pill">
                Reprint
              </span>
            ` : `
              <span class="ms-pill">
                First printing
              </span>
            `}

            ${card.promo ? `
              <span class="ms-pill">
                Promo
              </span>
            ` : ""}

            ${card.security_stamp ? `
              <span class="ms-pill">
                Stamp: ${html(card.security_stamp)}
              </span>
            ` : ""}

            ${card.illustration_id ? `
              <span class="ms-pill">
                Unique artwork identifiable
              </span>
            ` : ""}

          </div>

          <p class="ms-help">
            <strong>Legal in:</strong>
            ${html(legalFormats(card))}
          </p>

          ${oracleHtml(card)}

          ${dfc ? `
            <details>
              <summary>
                View card faces
              </summary>

              <div class="ms-dfc-gallery">
                ${dfc}
              </div>
            </details>
          ` : ""}

          ${guideLink(card)}

          ${marketplaceLinks(card)}

          <div
            class="ms-card-actions"
            aria-label="Keep scouting"
          >

            <button
              type="button"
              data-discovery-mode="wild"
            >
              ◇ Surprise me
            </button>

            <button
              type="button"
              data-discovery-mode="colour"
            >
              Same colour identity
            </button>

            <button
              type="button"
              data-discovery-mode="type"
            >
              Same card type
            </button>

            <button
              type="button"
              data-copy-link
            >
              Copy this printing link
            </button>

          </div>

          <p
            class="ms-actions-status"
            role="status"
            aria-live="polite"
          ></p>

        </div>

      </article>
    `;

    els.details
      .querySelector("[data-copy-link]")
      ?.addEventListener("click", async () => {
        const url = new URL(window.location.href);

        url.searchParams.set(
          "q",
          card.name
        );

        url.searchParams.set(
          "printing",
          card.id
        );

        try {
          await navigator.clipboard.writeText(
            url.href
          );

          const status = els.details.querySelector(
            ".ms-actions-status"
          );

          if (status) {
            status.textContent =
              "Printing link copied.";
          }

        } catch {
          const status = els.details.querySelector(
            ".ms-actions-status"
          );

          if (status) {
            status.textContent =
              "Copy the URL from your browser address bar.";
          }
        }
      });

    announce("card", {
      cardName: card.name,
      printingId: card.id
    });
  }


  /* ========================================
     PRICE AND GBP ESTIMATES
     ======================================== */

  async function getRate(base) {
    const response = await fetch(
      `${FX_API}/${base}/GBP`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Exchange rate unavailable"
      );
    }

    const data = await response.json();

    const rate = Number(data.rate);

    if (
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      throw new Error(
        "Invalid exchange rate"
      );
    }

    return rate;
  }

  function rates() {
    if (!ratesPromise) {
      ratesPromise = Promise.all([
        getRate("EUR"),
        getRate("USD")
      ])
        .then(([eur, usd]) => ({
          eur,
          usd
        }))
        .catch(error => {
          ratesPromise = null;
          throw error;
        });
    }

    return ratesPromise;
  }

  function gbpPrice(card, kind, fx) {
    const prices = card?.prices || {};

    const eurKey = kind === "foil"
      ? "eur_foil"
      : "eur";

    const usdKey = kind === "foil"
      ? "usd_foil"
      : kind === "etched"
        ? "usd_etched"
        : "usd";

    if (kind !== "etched") {
      const eur = asNumber(prices[eurKey]);

      if (
        eur !== null &&
        fx?.eur
      ) {
        return eur * fx.eur;
      }
    }

    const usd = asNumber(prices[usdKey]);

    if (
      usd !== null &&
      fx?.usd
    ) {
      return usd * fx.usd;
    }

    return null;
  }

  function displayPrice(card, kind, fx) {
    const gbp = gbpPrice(card, kind, fx);

    if (gbp !== null) {
      return `
        <span class="price">
          <strong>£${gbp.toFixed(2)}</strong>
        </span>
      `;
    }

    const eur = kind === "foil"
      ? card.prices?.eur_foil
      : card.prices?.eur;

    const usd = kind === "foil"
      ? card.prices?.usd_foil
      : kind === "etched"
        ? card.prices?.usd_etched
        : card.prices?.usd;

    if (
      kind !== "etched" &&
      asNumber(eur) !== null
    ) {
      return `
        <span class="price">
          <strong>€${html(eur)}</strong>
        </span>
      `;
    }

    if (asNumber(usd) !== null) {
      return `
        <span class="price">
          <strong>$${html(usd)}</strong>
        </span>
      `;
    }

    return '<span class="muted">—</span>';
  }

  function priceValue(card, kind, fx) {
    const value = gbpPrice(card, kind, fx);

    return Number.isFinite(value) && value > 0
      ? value
      : null;
  }


  /* ========================================
     COLLECT ALL PRINTINGS
     ======================================== */

  function usablePrintings(cards) {
    const images = cards.filter(card =>
      imageFor(card, "small")
    );

    const standard = images.filter(card =>
      ![
        "art_series",
        "token",
        "emblem"
      ].includes(card.layout) &&
      !card.oversized
    );

    const paper = standard.filter(card =>
      (card.games || []).includes("paper")
    );

    const english = paper.filter(card =>
      card.lang === "en"
    );

    return english.length
      ? english
      : paper.length
        ? paper
        : standard.length
          ? standard
          : images;
  }

  async function allPrintings(card, token, signal) {
    let next = safeUrl(card.prints_search_uri);

    if (!next) {
      return [card];
    }

    const found = [];
    const seen = new Set();

    let pages = 0;

    while (
      next &&
      pages < 40
    ) {
      const page = await json(next, signal);

      if (token !== searchToken) {
        return [];
      }

      for (const item of page.data || []) {
        if (
          item?.id &&
          !seen.has(item.id)
        ) {
          seen.add(item.id);
          found.push(item);
        }
      }

      next = page.has_more
        ? safeUrl(page.next_page)
        : "";

      pages++;

      if (next) {
        await wait(110);
      }
    }

    if (next) {
      console.warn(
        "ManaScout: Scryfall printings exceeded 40 pages."
      );
    }

    return usablePrintings(
      found.length ? found : [card]
    );
  }


  /* ========================================
     MANASCOUT PICK SCORING
     ======================================== */

  function pickScore(card, fx) {
    if (!imageFor(card)) {
      return -9999;
    }

    const frames = card.frame_effects || [];
    const promos = card.promo_types || [];

    let score = 0;

    if ((card.games || []).includes("paper")) {
      score += 30;
    }

    if (card.lang === "en") {
      score += 15;
    }

    if (frames.includes("showcase")) {
      score += 70;
    }

    if (card.border_color === "borderless") {
      score += 60;
    }

    if (card.full_art) {
      score += 50;
    }

    if (frames.includes("extendedart")) {
      score += 45;
    }

    for (
      const [type, bonus] of Object.entries({
        boosterfun: 35,
        textured: 34,
        galaxyfoil: 30,
        surgefoil: 29,
        rainbowfoil: 28,
        halofoil: 27,
        stepandcompleat: 26
      })
    ) {
      if (promos.includes(type)) {
        score += bonus;
      }
    }

    if (finishHas(card, "etched")) {
      score += 16;
    }

    if (finishHas(card, "foil")) {
      score += 9;
    }

    if (card.promo) {
      score += 5;
    }

    if (promos.includes("serialized")) {
      score -= 12;
    }

    const price = Math.max(
      priceValue(card, "nonfoil", fx) || 0,
      priceValue(card, "foil", fx) || 0
    );

    if (price) {
      score += Math.min(
        12,
        Math.log10(price + 1) * 5
      );
    }

    return score;
  }

  function choosePick(cards, fx) {
    const key =
      cards[0]?.oracle_id ||
      cards[0]?.name ||
      "";

    const previous = pickCache.get(key);

    if (previous) {
      const chosen = cards.find(
        c => c.id === previous
      );

      if (chosen) {
        return chosen;
      }
    }

    const chosen = [...cards].sort((a, b) =>
      pickScore(b, fx) -
      pickScore(a, fx) ||

      String(b.released_at || "")
        .localeCompare(
          String(a.released_at || "")
        ) ||

      String(a.collector_number || "")
        .localeCompare(
          String(b.collector_number || "")
        )
    )[0];

    if (chosen?.id) {
      pickCache.set(key, chosen.id);
    }

    return chosen;
  }


  /* ========================================
     PRINTING SNAPSHOTS
     ======================================== */

  function priceExtreme(
    cards,
    kind,
    fx,
    highest = false
  ) {
    const list = cards
      .map(card => ({
        card,
        price: priceValue(card, kind, fx)
      }))
      .filter(item => item.price !== null)
      .sort((a, b) =>
        highest
          ? b.price - a.price
          : a.price - b.price
      );

    return list[0] || null;
  }

  function snapshotData(cards, fx) {
    const years = cards
      .map(card =>
        String(
          card.released_at || ""
        ).slice(0, 4)
      )
      .filter(year =>
        /^\d{4}$/.test(year)
      )
      .sort();

    return {
      oldest: years[0] || "",
      newest: years[years.length - 1] || "",

      foil: cards.filter(card =>
        finishHas(card, "foil")
      ),

      etched: cards.filter(card =>
        finishHas(card, "etched")
      ),

      cheapest: priceExtreme(
        cards,
        "nonfoil",
        fx
      ),

      "most-expensive": priceExtreme(
        cards,
        "nonfoil",
        fx,
        true
      ),

      "cheapest-foil": priceExtreme(
        cards,
        "foil",
        fx
      ),

      "most-expensive-foil": priceExtreme(
        cards,
        "foil",
        fx,
        true
      )
    };
  }

  function snapshotButton(
    action,
    value,
    label,
    disabled = false
  ) {
    return `
      <button
        class="snapshot-stat"
        type="button"
        data-snapshot-action="${html(action)}"
        aria-pressed="${action === "all" ? "true" : "false"}"
        ${disabled ? "disabled" : ""}
      >
        <strong>${html(value)}</strong>
        <span>${html(label)}</span>
      </button>
    `;
  }

  function snapshotHtml(cards, fx, data) {
    const priceLabel = entry =>
      entry
        ? `£${entry.price.toFixed(2)}`
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
            priceLabel(data.cheapest),
            "Cheapest",
            !data.cheapest
          )}

          ${snapshotButton(
            "most-expensive",
            priceLabel(data["most-expensive"]),
            "Most expensive",
            !data["most-expensive"]
          )}

          ${snapshotButton(
            "cheapest-foil",
            priceLabel(data["cheapest-foil"]),
            "Cheapest foil",
            !data["cheapest-foil"]
          )}

          ${snapshotButton(
            "most-expensive-foil",
            priceLabel(data["most-expensive-foil"]),
            "Most expensive foil",
            !data["most-expensive-foil"]
          )}

          ${snapshotButton(
            "oldest",
            data.oldest || "—",
            "Oldest",
            !data.oldest
          )}

          ${snapshotButton(
            "newest",
            data.newest || "—",
            "Newest",
            !data.newest
          )}

          ${snapshotButton(
            "foil",
            data.foil.length,
            "Foil versions",
            !data.foil.length
          )}

          ${snapshotButton(
            "etched",
            data.etched.length,
            "Etched versions",
            !data.etched.length
          )}

        </div>

        <p class="snapshot-note">
          Select a tile to browse matching printings.
          GBP estimates are converted from available
          Scryfall price data; these are not live shop quotes.
        </p>

      </section>
    `;
  }


  /* ========================================
     PRINTING ROWS
     ======================================== */

  function printingRow(card, selected, fx) {
    const thumb = imageFor(card, "small");
    const isSelected = selected?.id === card.id;

    const art =
      card.artist || "Artist not listed";

    const finish = treatmentText(card);
    const selector = html(card.id);

    return `
      <tr
        class="${isSelected ? "is-selected-printing" : ""}"
        data-row-id="${selector}"
      >

        <td class="printing-image-cell">

          <div class="ms-thumbnail">

            <button
              type="button"
              class="printing-select-button printing-image-button"
              data-print-id="${selector}"
              aria-label="Select ${html(card.set_name)} ${html(card.collector_number)}"
            >

              <img
                class="printing-card-image"
                src="${html(thumb)}"
                loading="lazy"
                decoding="async"
                alt="${html(card.name)} — ${html(card.set_name)} #${html(card.collector_number)}"
              >

            </button>

            ${foilOn(card) ? `
              <span
                class="ms-foil-glint"
                aria-hidden="true"
              ></span>
            ` : ""}

            ${foilButton(card, true)}

          </div>

        </td>

        <td>

          <button
            type="button"
            class="printing-select-button printing-name-button"
            data-print-id="${selector}"
          >
            <span class="set-name">
              ${html(card.set_name || "—")}
            </span>
          </button>

          <br>

          <span class="muted">
            ${html(String(card.set || "").toUpperCase())}
          </span>

          <span class="ms-printing-note">
            ${html(art)}
          </span>

          ${isSelected ? `
            <span class="ms-printing-note">
              ◇ SELECTED
            </span>
          ` : ""}

        </td>

        <td>
          ${html(card.released_at || "—")}
        </td>

        <td>
          ${html(card.collector_number || "—")}
        </td>

        <td>
          ${html(title(card.rarity) || "—")}
        </td>

        <td>

          <span class="ms-table-information">
            ${html(finishText(card))}
          </span>

          <span class="ms-printing-note ms-treatments">
            ${html(finish)}
          </span>

        </td>

        <td>
          ${displayPrice(card, "nonfoil", fx)}
        </td>

        <td>
          ${displayPrice(card, "foil", fx)}
        </td>

        <td>
          ${displayPrice(card, "etched", fx)}
        </td>

      </tr>
    `;
  }


  /* ========================================
     PRINTING FILTERS
     ======================================== */

  function printingControls(cards) {
    const uniqueSets = [
      ...new Map(
        cards.map(card => [
          card.set,
          card.set_name
        ])
      ).entries()
    ].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]))
    );

    return `
      <div class="ms-controls printing-controls">

        <label>
          Search printings

          <input
            id="ms-print-search"
            type="search"
            placeholder="Set, artist, number…"
            autocomplete="off"
          >
        </label>

        <label>
          Set

          <select id="ms-print-set">
            <option value="all">
              All sets
            </option>

            ${uniqueSets.map(([code, name]) => `
              <option value="${html(code)}">
                ${html(name)}
              </option>
            `).join("")}
          </select>

        </label>

        <label>
          Finish

          <select id="printing-finish-filter">
            <option value="all">All finishes</option>
            <option value="nonfoil">Nonfoil</option>
            <option value="foil">Foil</option>
            <option value="etched">Etched</option>
          </select>

        </label>

        <label>
          Treatment

          <select id="ms-print-treatment">
            <option value="all">All treatments</option>
            <option value="borderless">Borderless</option>
            <option value="showcase">Showcase</option>
            <option value="extendedart">Extended art</option>
            <option value="fullart">Full art</option>
            <option value="surgefoil">Surge foil</option>
            <option value="galaxyfoil">Galaxy foil</option>
            <option value="halofoil">Halo foil</option>
            <option value="textured">Textured foil</option>
            <option value="serialized">Serialized</option>
            <option value="promo">Promo</option>
          </select>

        </label>

        <label>
          Sort

          <select id="printing-sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price-asc">£ Low → High</option>
            <option value="price-desc">£ High → Low</option>
            <option value="name">Set A–Z</option>
            <option value="collector">Collector #</option>
          </select>

        </label>

        <button
          type="button"
          id="ms-reset-filters"
        >
          Reset
        </button>

      </div>
    `;
  }


  /* ========================================
     PRINTING TABLE
     ======================================== */

  function tableMarkup() {
    return `
      <div class="table-wrap">

        <table class="printings-table">

          <thead>
            <tr>
              <th scope="col">Card</th>
              <th scope="col">Set / Artist</th>
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
        id="ms-pagination"
        class="ms-print-pagination"
      ></div>
    `;
  }


  /* ========================================
     PRINTING ARCHIVE CONTROLLER
     ======================================== */

  function renderPrintingArchive(cards, fx, token) {
    if (
      !els.printings ||
      !els.status ||
      token !== searchToken
    ) {
      return;
    }

    const data = snapshotData(cards, fx);

    const st = {
      cards,
      fx,
      data,
      snapshot: "all",
      selected: currentCard,
      pageSize: 50,
      limit: 50,
      token
    };

    printingState = st;

    els.printings.innerHTML =
      snapshotHtml(cards, fx, data) +
      printingControls(cards) +
      tableMarkup();

    const controls = {
      find: $("ms-print-search"),
      set: $("ms-print-set"),
      finish: $("printing-finish-filter"),
      treatment: $("ms-print-treatment"),
      sort: $("printing-sort"),
      body: $("ms-print-body"),
      pagination: $("ms-pagination")
    };


    /* Snapshot matching */

    function snapshotCards() {
      const key = st.snapshot;

      if (key === "all") {
        return cards;
      }

      if ([
        "cheapest",
        "most-expensive",
        "cheapest-foil",
        "most-expensive-foil"
      ].includes(key)) {
        return data[key]?.card
          ? [data[key].card]
          : [];
      }

      if (
        key === "foil" ||
        key === "etched"
      ) {
        return data[key];
      }

      if (
        key === "oldest" ||
        key === "newest"
      ) {
        return cards.filter(card =>
          String(
            card.released_at || ""
          ).startsWith(data[key])
        );
      }

      return cards;
    }


    /* Filters and sorting */

    function visibleCards() {
      let list = snapshotCards();

      const q = (
        controls.find?.value || ""
      ).trim().toLowerCase();

      const set = controls.set?.value || "all";
      const finish = controls.finish?.value || "all";
      const treatment =
        controls.treatment?.value || "all";
      const sort = controls.sort?.value || "newest";

      if (q) {
        list = list.filter(card =>
          [
            card.name,
            card.set_name,
            card.artist,
            card.collector_number,
            card.set,
            treatmentText(card)
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }

      if (set !== "all") {
        list = list.filter(card =>
          card.set === set
        );
      }

      if (finish !== "all") {
        list = list.filter(card =>
          finishHas(card, finish)
        );
      }

      if (treatment !== "all") {
        list = list.filter(card =>
          treatment === "promo"
            ? card.promo
            : treatment === "borderless"
              ? card.border_color === "borderless"
              : treatment === "fullart"
                ? card.full_art
                : (
                  (card.frame_effects || [])
                    .includes(treatment) ||
                  (card.promo_types || [])
                    .includes(treatment)
                )
        );
      }

      const result = [...list];

      result.sort((a, b) => {
        if (sort === "oldest") {
          return String(a.released_at || "")
            .localeCompare(
              String(b.released_at || "")
            );
        }

        if (sort === "name") {
          return String(a.set_name || "")
            .localeCompare(
              String(b.set_name || "")
            );
        }

        if (sort === "collector") {
          return String(a.collector_number || "")
            .localeCompare(
              String(b.collector_number || ""),
              undefined,
              { numeric: true }
            );
        }

        if (
          sort === "price-asc" ||
          sort === "price-desc"
        ) {
          const x = priceValue(
            a,
            "nonfoil",
            fx
          );

          const y = priceValue(
            b,
            "nonfoil",
            fx
          );

          if (
            x === null &&
            y === null
          ) {
            return 0;
          }

          if (x === null) {
            return 1;
          }

          if (y === null) {
            return -1;
          }

          return sort === "price-asc"
            ? x - y
            : y - x;
        }

        return String(b.released_at || "")
          .localeCompare(
            String(a.released_at || "")
          );
      });

      return result;
    }


    /* Update visible rows */

    function update() {
      if (
        token !== searchToken ||
        printingState !== st
      ) {
        return;
      }

      const cardsShown = visibleCards();
      const page = cardsShown.slice(0, st.limit);

      controls.body.innerHTML = page
        .map(card =>
          printingRow(card, st.selected, fx)
        )
        .join("") || `
          <tr>
            <td
              colspan="9"
              class="ms-table-empty"
            >
              No printings match these filters.
            </td>
          </tr>
        `;

      els.status.textContent =
        `${cardsShown.length} of ${cards.length} printings matching · ` +
        (fx
          ? "GBP estimates"
          : "available source currencies"
        );

      controls.pagination.replaceChildren();

      const count = document.createElement("span");

      count.textContent =
        `Showing ${page.length} of ${cardsShown.length}`;

      controls.pagination.appendChild(count);

      if (cardsShown.length > st.limit) {
        const more = document.createElement("button");

        more.type = "button";

        more.textContent =
          `Load next ${Math.min(
            st.pageSize,
            cardsShown.length - st.limit
          )} printings`;

        more.addEventListener(
          "click",
          () => {
            st.limit += st.pageSize;
            update();
          }
        );

        controls.pagination.appendChild(more);
      }

      els.printings
        .querySelectorAll("[data-snapshot-action]")
        .forEach(button => {
          const active =
            button.dataset.snapshotAction === st.snapshot;

          button.classList.toggle(
            "is-active",
            active
          );

          button.setAttribute(
            "aria-pressed",
            String(active)
          );
        });
    }


    /* Select an exact printing */

    function selectCard(
      card,
      {
        scroll = true,
        finish = null
      } = {}
    ) {
      if (
        !card ||
        token !== searchToken
      ) {
        return;
      }

      if (finish === "nonfoil") {
        foilDisabled.add(card.id);
      }

      if (
        finish === "foil" ||
        finish === "etched"
      ) {
        foilDisabled.delete(card.id);
      }

      st.selected = card;

      renderCard(card);

      updateUrl(
        card.name,
        card.id,
        true
      );

      update();

      if (scroll) {
        scrollTo(els.details);
      }
    }


    /* Per-printing image and foil buttons */

    controls.body.addEventListener(
      "click",
      event => {
        const toggle = event.target.closest(
          "[data-foil-toggle]"
        );

        if (toggle) {
          const id = toggle.dataset.foilToggle;

          if (foilDisabled.has(id)) {
            foilDisabled.delete(id);
          } else {
            foilDisabled.add(id);
          }

          if (st.selected?.id === id) {
            renderCard(st.selected);
          }

          update();
          return;
        }

        const button = event.target.closest(
          "[data-print-id]"
        );

        if (button) {
          selectCard(
            cards.find(card =>
              card.id === button.dataset.printId
            )
          );
        }
      }
    );


    /* Snapshot shortcuts */

    els.printings
      .querySelector(".snapshot")
      ?.addEventListener(
        "click",
        event => {
          const button = event.target.closest(
            "[data-snapshot-action]"
          );

          if (
            !button ||
            button.disabled
          ) {
            return;
          }

          st.snapshot =
            button.dataset.snapshotAction;

          st.limit = st.pageSize;

          controls.finish.value = "all";
          controls.set.value = "all";
          controls.treatment.value = "all";
          controls.find.value = "";

          const focused = snapshotCards();

          if (focused.length === 1) {
            selectCard(
              focused[0],
              {
                scroll: false,
                finish: st.snapshot.includes("foil")
                  ? "foil"
                  : null
              }
            );
          }

          update();

          scrollTo(
            els.printings.querySelector(
              ".table-wrap"
            )
          );
        }
      );


    /* Input filtering */

    for (const input of [
      controls.find,
      controls.set,
      controls.finish,
      controls.treatment,
      controls.sort
    ]) {
      input?.addEventListener(
        input === controls.find
          ? "input"
          : "change",
        () => {
          st.limit = st.pageSize;
          update();
        }
      );
    }


    /* Reset all filters */

    $("ms-reset-filters")
      ?.addEventListener(
        "click",
        () => {
          st.snapshot = "all";

          controls.find.value = "";
          controls.set.value = "all";
          controls.finish.value = "all";
          controls.treatment.value = "all";
          controls.sort.value = "newest";

          st.limit = st.pageSize;

          update();
        }
      );

    update();
  }


  /* ========================================
     SELECTED CARD FOIL TOGGLE
     ======================================== */

  document.addEventListener(
    "click",
    async event => {
      const finishToggle = event.target.closest(
        ".ms-card-image [data-foil-toggle]"
      );

      if (
        finishToggle &&
        currentCard?.id ===
          finishToggle.dataset.foilToggle
      ) {
        const id = currentCard.id;

        if (foilDisabled.has(id)) {
          foilDisabled.delete(id);
        } else {
          foilDisabled.add(id);
        }

        renderCard(currentCard);

        if (printingState) {
          const active = printingState.cards.find(
            card => card.id === id
          );

          const row = active &&
            els.printings?.querySelector(
              `[data-row-id="${id}"]`
            );

          if (row) {
            const oldThumb = row.querySelector(
              ".ms-thumbnail"
            );

            if (oldThumb) {
              const fresh = document.createElement(
                "div"
              );

              fresh.innerHTML = printingRow(
                active,
                currentCard,
                printingState.fx
              );

              const newThumb = fresh.querySelector(
                ".ms-thumbnail"
              );

              if (newThumb) {
                oldThumb.replaceWith(newThumb);
              }
            }
          }
        }

        return;
      }


      /* ========================================
         KEEP SCOUTING
         ======================================== */

      const button = event.target.closest(
        "[data-discovery-mode]"
      );

      if (
        !button ||
        !currentCard ||
        !els.details?.contains(button)
      ) {
        return;
      }

      const previous = currentCard;
      const mode = button.dataset.discoveryMode;
      const currentId = previous.oracle_id;

      const exclude = currentId
        ? ` -oracleid:${currentId}`
        : "";

      let query = "game:paper";

      if (mode === "colour") {
        const colours = (
          previous.color_identity || []
        ).join("") || "c";

        query += ` id:${colours}`;

      } else if (mode === "type") {
        const type = [
          "Creature",
          "Artifact",
          "Enchantment",
          "Instant",
          "Sorcery",
          "Planeswalker",
          "Land",
          "Battle"
        ].find(t =>
          (previous.type_line || "").includes(t)
        );

        if (type) {
          query += ` t:${type.toLowerCase()}`;
        }
      }

      query += exclude;

      const allButtons = [
        ...els.details.querySelectorAll(
          "[data-discovery-mode]"
        )
      ];

      allButtons.forEach(b => {
        b.disabled = true;
      });

      const status = els.details.querySelector(
        ".ms-actions-status"
      );

      if (status) {
        status.textContent =
          "Scouting another card…";
      }

      try {
        const card = await json(
          `${API}/cards/random?q=${encodeURIComponent(query)}`
        );

        if (!card?.name) {
          throw new Error(
            "No card returned"
          );
        }

        await loadCard(card.name);

      } catch (error) {
        console.warn(
          "Keep scouting failed:",
          error
        );

        if (status?.isConnected) {
          status.textContent =
            "Could not find another card. Try again.";
        }

      } finally {
        allButtons.forEach(b => {
          if (b.isConnected) {
            b.disabled = false;
          }
        });
      }
    }
  );


  /* ========================================
     SEARCH AND EXACT PRINTING LOAD
     ======================================== */

  async function loadCard(name, options = {}) {
    const query = String(name || "").trim();

    if (!query) {
      return null;
    }

    stopRequests();

    const token = searchToken;

    requestController =
      new AbortController();

    const signal =
      requestController.signal;

    const requested = String(
      options.printingId || ""
    ).trim();

    if (!options.fromHistory) {
      updateUrl(
        query,
        requested,
        Boolean(options.replace)
      );
    }

    if (els.input) {
      els.input.value = query;
    }

    clearSuggestions();

    announce("loading", {
      cardName: query
    });

    setLoading();

    try {
      let card = null;
      let exact = false;

      if (requested) {
        try {
          const candidate = await cardId(
            requested,
            signal
          );

          if (
            sameCardName(candidate.name, query)
          ) {
            card = candidate;
            exact = true;
          }

        } catch (error) {
          if (error.name === "AbortError") {
            throw error;
          }
        }
      }

      if (!card) {
        card = await cardNamed(
          query,
          signal
        );
      }

      if (token !== searchToken) {
        return null;
      }

      renderCard(card);

      const cards = await allPrintings(
        card,
        token,
        signal
      );

      if (token !== searchToken) {
        return null;
      }

      let fx = null;

      try {
        fx = await rates();

      } catch (error) {
        console.warn(
          "GBP estimate currently unavailable:",
          error
        );
      }

      if (token !== searchToken) {
        return null;
      }

      if (
        !exact &&
        cards.length
      ) {
        const pick = choosePick(
          cards,
          fx
        );

        if (pick) {
          card = pick;

          renderCard(card, {
            isPick: true
          });

          updateUrl(
            card.name,
            card.id,
            true
          );
        }
      }

      renderPrintingArchive(
        cards,
        fx,
        token
      );

      document.title =
        `${card.name} Printings, Foils & Art | ManaScout`;

      return card;

    } catch (error) {
      if (
        error.name === "AbortError" ||
        token !== searchToken
      ) {
        return null;
      }

      console.error(
        "ManaScout card load error:",
        error
      );

      setError(
        error.status === 404
          ? `No card matched “${query}”. Check the spelling and try again.`
          : "Could not reach Scryfall. Please try again."
      );

      return null;
    }
  }


  /* ========================================
     AUTOCOMPLETE
     ======================================== */

  function suggestionItems() {
    return [
      ...(
        els.autocomplete?.querySelectorAll(
          ".autocomplete-item"
        ) || []
      )
    ];
  }

  function markSuggestion(index) {
    const items = suggestionItems();

    if (!items.length) {
      return;
    }

    activeSuggestion =
      (index + items.length) % items.length;

    items.forEach((item, i) =>
      item.setAttribute(
        "aria-selected",
        String(i === activeSuggestion)
      )
    );

    const active = items[activeSuggestion];

    els.input.setAttribute(
      "aria-activedescendant",
      active.id
    );

    active.scrollIntoView({
      block: "nearest"
    });
  }

  async function suggest(query) {
    suggestController?.abort();

    suggestController =
      new AbortController();

    const signal =
      suggestController.signal;

    try {
      const results = await json(
        `${API}/cards/autocomplete?q=${encodeURIComponent(query)}`,
        signal
      );

      if (
        els.input?.value.trim() !== query
      ) {
        return;
      }

      const names = (
        results.data || []
      ).slice(0, 8);

      if (!names.length) {
        clearSuggestions();
        return;
      }

      activeSuggestion = -1;

      els.autocomplete.innerHTML =
        names.map((name, i) => `
          <button
            type="button"
            role="option"
            aria-selected="false"
            id="ms-autocomplete-${i}"
            class="autocomplete-item"
            data-name="${html(name)}"
          >
            ${html(name)}
          </button>
        `).join("");

      els.autocomplete.hidden = false;

      els.input.setAttribute(
        "aria-expanded",
        "true"
      );

      els.input.removeAttribute(
        "aria-activedescendant"
      );

    } catch (error) {
      if (error.name !== "AbortError") {
        clearSuggestions();
      }
    }
  }


  /* ========================================
     SEARCH EVENTS
     ======================================== */

  if (els.form && els.input) {
    els.form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const selected =
          suggestionItems()[activeSuggestion];

        const query =
          selected?.dataset.name ||
          els.input.value.trim();

        if (query) {
          void loadCard(query);
        }
      }
    );

    els.input.addEventListener(
      "input",
      () => {
        const q = els.input.value.trim();

        window.clearTimeout(
          suggestTimer
        );

        if (q.length < 2) {
          suggestController?.abort();
          clearSuggestions();
          return;
        }

        suggestTimer = window.setTimeout(
          () => void suggest(q),
          220
        );
      }
    );

    els.input.addEventListener(
      "keydown",
      event => {
        const items = suggestionItems();

        if (
          event.key === "ArrowDown" &&
          items.length
        ) {
          event.preventDefault();

          markSuggestion(
            activeSuggestion + 1
          );

        } else if (
          event.key === "ArrowUp" &&
          items.length
        ) {
          event.preventDefault();

          markSuggestion(
            activeSuggestion - 1
          );

        } else if (
          event.key === "Escape"
        ) {
          clearSuggestions();
        }
      }
    );

    els.autocomplete?.addEventListener(
      "click",
      event => {
        const item = event.target.closest(
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
        if (!els.form.contains(event.target)) {
          clearSuggestions();
        }
      }
    );
  }


  /* ========================================
     BROWSER HISTORY
     ======================================== */

  window.addEventListener(
    "popstate",
    () => {
      const params = urlParams();

      const name =
        params.get("q")?.trim();

      if (name) {
        void loadCard(name, {
          fromHistory: true,
          printingId:
            params.get("printing") || ""
        });

      } else {
        setHome();
      }
    }
  );


  /* ========================================
     PUBLIC API
     Used by homepage and guide pages
     ======================================== */

  window.ManaScout = Object.freeze({
    loadCard,

    scoutRandom: async () => {
      const card = await json(
        `${API}/cards/random?q=${encodeURIComponent("game:paper")}`
      );

      if (!card?.name) {
        throw new Error(
          "Random card unavailable"
        );
      }

      await loadCard(card.name);

      return card;
    }
  });


  /* ========================================
     INITIALISE
     ======================================== */

  installStyles();

  const initial = urlParams();

  const initialName =
    initial.get("q")?.trim();

  if (initialName) {
    void loadCard(initialName, {
      fromHistory: true,
      printingId:
        initial.get("printing") || ""
    });
  }

})();
