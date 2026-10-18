(() => {
  "use strict";


  /* ========================================
     CONFIG
     ======================================== */

  const API =
    "https://api.scryfall.com";

  const FX_API =
    "https://api.frankfurter.dev/v2/rate";

  const REDUCED_MOTION_QUERY =
    "(prefers-reduced-motion: reduce)";


  const els = {
    form:
      document.getElementById(
        "search-form"
      ),

    input:
      document.getElementById(
        "search-input"
      ),

    autocomplete:
      document.getElementById(
        "autocomplete-list"
      ),

    details:
      document.getElementById(
        "card-details"
      ),

    status:
      document.getElementById(
        "printings-status"
      ),

    printings:
      document.getElementById(
        "printings-container"
      )
  };


  let searchController = null;
  let autocompleteController = null;
  let autocompleteTimer = null;

  let searchToken = 0;

  let activeAutocompleteIndex =
    -1;

  let fxRatesPromise = null;


  /*
   * Keep the ManaScout Pick stable for the
   * current browser session.
   *
   * Picks themselves are deterministic. This
   * cache additionally prevents an FX outage
   * or temporary data change from swapping the
   * selected version halfway through a session.
   */

  const manaScoutPickCache =
    new Map();


  /* ========================================
     CARD GUIDE INDEX
     ======================================== */

  const GUIDE_SLUGS = {
    "ancient tomb":
      "ancient-tomb",

    "birds of paradise":
      "birds-of-paradise",

    "black lotus":
      "black-lotus",

    "counterspell":
      "counterspell",

    "cyclonic rift":
      "cyclonic-rift",

    "deflecting swat":
      "deflecting-swat",

    "demonic consultation":
      "demonic-consultation",

    "demonic tutor":
      "demonic-tutor",

    "dockside extortionist":
      "dockside-extortionist",

    "force of will":
      "force-of-will",

    "jace, the mind sculptor":
      "jace-the-mind-sculptor",

    "jeska's will":
      "jeskas-will",

    "lightning greaves":
      "lightning-greaves",

    "mana crypt":
      "mana-crypt",

    "mana drain":
      "mana-drain",

    "mystic remora":
      "mystic-remora",

    "rhystic study":
      "rhystic-study",

    "smaug, wicked worm":
      "smaug-wicked-worm",

    "smothering tithe":
      "smothering-tithe",

    "sol ring":
      "sol-ring",

    "swords to plowshares":
      "swords-to-plowshares",

    "teferi's protection":
      "teferis-protection",

    "the one ring":
      "the-one-ring",

    "the theorist, jace beleren":
      "the-theorist-jace-beleren",

    "the theorist":
      "the-theorist-jace-beleren",

    "vampiric tutor":
      "vampiric-tutor"
  };


  /* ========================================
     BASIC HELPERS
     ======================================== */

  function escapeHtml(value) {
    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }


  function safeUrl(value) {
    try {
      const url =
        new URL(value);

      return /^https?:$/.test(
        url.protocol
      )
        ? url.href
        : "";

    } catch {
      return "";
    }
  }


  function reducedMotion() {
    return window.matchMedia(
      REDUCED_MOTION_QUERY
    ).matches;
  }


  function smoothBehaviour() {
    return reducedMotion()
      ? "auto"
      : "smooth";
  }


  function getQueryName() {
    return (
      new URLSearchParams(
        window.location.search
      )
        .get("q")
        ?.trim() ||
      ""
    );
  }


  function getPrintingId() {
    return (
      new URLSearchParams(
        window.location.search
      )
        .get("printing")
        ?.trim() ||
      ""
    );
  }


  function setQuery(
    name,
    replace = false,
    printingId = ""
  ) {
    const url =
      new URL(
        window.location.href
      );


    if (name) {
      url.searchParams.set(
        "q",
        name
      );

    } else {
      url.searchParams.delete(
        "q"
      );
    }


    if (printingId) {
      url.searchParams.set(
        "printing",
        printingId
      );

    } else {
      url.searchParams.delete(
        "printing"
      );
    }


    history[
      replace
        ? "replaceState"
        : "pushState"
    ](
      {},
      "",
      url
    );
  }


  function replacePreferredPrintingInUrl(
    card
  ) {
    if (!card?.id) {
      return;
    }


    const url =
      new URL(
        window.location.href
      );


    /*
     * Permanent guide URLs stay clean:
     *
     * /card/sol-ring/?printing=...
     *
     * Homepage searches preserve their q=
     * parameter.
     */

    if (
      url.searchParams.has("q")
    ) {
      url.searchParams.set(
        "q",
        card.name || ""
      );
    }


    url.searchParams.set(
      "printing",
      card.id
    );


    history.replaceState(
      {},
      "",
      url
    );
  }


  function titleCase(value) {
    const text =
      String(
        value || ""
      );

    if (!text) {
      return "";
    }


    return (
      text
        .charAt(0)
        .toUpperCase() +
      text
        .slice(1)
        .toLowerCase()
    );
  }


  function formatLegalFormat(
    format
  ) {
    const specialFormats = {
      predh:
        "PreDH",

      paupercommander:
        "Pauper Commander",

      standardbrawl:
        "Standard Brawl",

      oldschool:
        "Old School",

      penny:
        "Penny Dreadful"
    };


    if (
      specialFormats[
        format
      ]
    ) {
      return specialFormats[
        format
      ];
    }


    return String(
      format || ""
    )
      .replace(
        /_/g,
        " "
      )
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      );
  }


  function oracleTextHtml(
    text
  ) {
    const value =
      String(
        text ||
        "No oracle text supplied."
      );


    return value
      .split("\n")
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean)
      .map(
        line =>
          `<p>${escapeHtml(
            line
          )}</p>`
      )
      .join("");
  }


  function sleep(
    milliseconds
  ) {
    return new Promise(
      resolve =>
        window.setTimeout(
          resolve,
          milliseconds
        )
    );
  }


  function scrollToElement(
    element
  ) {
    if (!element) {
      return;
    }


    element.scrollIntoView({
      behavior:
        smoothBehaviour(),

      block:
        "start"
    });
  }


  /* ========================================
     APPLICATION STATE
     ======================================== */

  function emitManaScoutState(
    state,
    detail = {}
  ) {
    window.dispatchEvent(
      new CustomEvent(
        "manascout:statechange",
        {
          detail: {
            state,
            ...detail
          }
        }
      )
    );
  }


  function clearPrintingArea() {
    if (els.status) {
      els.status.textContent =
        "";
    }


    if (els.printings) {
      els.printings.innerHTML =
        "";
    }
  }


  function setLoading() {
    if (!els.details) {
      return;
    }


    els.details.innerHTML = `
      <div
        class="loading-state"
        role="status"
        aria-live="polite"
      >
        Searching Scryfall…
      </div>
    `;


    clearPrintingArea();
  }


  function setError(
    message
  ) {
    if (!els.details) {
      return;
    }


    els.details.innerHTML = `
      <div
        class="error-state"
        role="alert"
      >
        <h2>
          We couldn't find that card
        </h2>

        <p>
          ${escapeHtml(
            message
          )}
        </p>
      </div>
    `;


    clearPrintingArea();
  }


  function setHomeState() {
    if (els.input) {
      els.input.value =
        "";
    }


    clearAutocomplete();

    clearPrintingArea();


    if (els.details) {
      els.details.innerHTML =
        "";
    }


    emitManaScoutState(
      "home"
    );
  }


  /* ========================================
     CARD DISPLAY
     ======================================== */

  function primaryImage(card) {
    return safeUrl(
      card.image_uris
        ?.normal ||
      card.image_uris
        ?.large ||
      card.card_faces?.[0]
        ?.image_uris?.normal ||
      card.card_faces?.[0]
        ?.image_uris?.large ||
      ""
    );
  }


  function renderFaces(card) {
    if (
      !Array.isArray(
        card.card_faces
      ) ||
      card.card_faces.length <
        2
    ) {
      return `
        <div class="oracle">
          ${oracleTextHtml(
            card.oracle_text
          )}
        </div>
      `;
    }


    return `
      <div class="oracle">

        ${card.card_faces
          .map(
            face => `
              <div class="oracle-face">

                <strong
                  class="oracle-face-name"
                >
                  ${escapeHtml(
                    face.name ||
                    ""
                  )}
                </strong>

                ${oracleTextHtml(
                  face.oracle_text ||
                  ""
                )}

              </div>
            `
          )
          .join("")}

      </div>
    `;
  }


  /* ========================================
     MANASCOUT GUIDE LINK
     ======================================== */

  function manaScoutGuideLink(
    card
  ) {
    const key =
      String(
        card?.name || ""
      )
        .trim()
        .toLowerCase();


    const slug =
      GUIDE_SLUGS[
        key
      ];


    if (!slug) {
      return "";
    }


    const currentPath =
      window.location.pathname
        .replace(
          /\/+$/,
          ""
        );


    const guidePath =
      `/card/${slug}`;


    if (
      currentPath ===
      guidePath
    ) {
      return "";
    }


    return `
      <div class="manascout-guide-link">

        <a
          href="/card/${escapeHtml(
            slug
          )}/"
        >
          <span aria-hidden="true">
            ◇
          </span>

          View ManaScout Guide

          <span aria-hidden="true">
            →
          </span>
        </a>

      </div>
    `;
  }


  /* ========================================
     MARKETPLACE LINKS
     ======================================== */

  function marketplaceLinks(
    card
  ) {
    const name =
      encodeURIComponent(
        card.name || ""
      );


    return `
      <div class="marketplace-links">

        <a
          href="https://www.cardmarket.com/en/Magic/Products/Search?searchString=${name}"
          target="_blank"
          rel="noopener noreferrer sponsored"
          data-outbound-marketplace="cardmarket"
        >
          Search Cardmarket
        </a>

        <a
          href="https://www.tcgplayer.com/search/magic/product?q=${name}"
          target="_blank"
          rel="noopener noreferrer sponsored"
          data-outbound-marketplace="tcgplayer"
        >
          Search TCGplayer
        </a>

      </div>
    `;
  }


  /* ========================================
     MANASCOUT PICK EXPLANATION
     ======================================== */

  function manaScoutPickReasons(
    card
  ) {
    if (!card) {
      return [];
    }


    const reasons = [];


    const frameEffects =
      Array.isArray(
        card.frame_effects
      )
        ? card.frame_effects
        : [];


    const promoTypes =
      Array.isArray(
        card.promo_types
      )
        ? card.promo_types
        : [];


    const finishes =
      Array.isArray(
        card.finishes
      )
        ? card.finishes
        : [];


    if (
      frameEffects.includes(
        "showcase"
      )
    ) {
      reasons.push(
        "Showcase treatment"
      );
    }


    if (
      card.border_color ===
      "borderless"
    ) {
      reasons.push(
        "Borderless artwork"
      );
    }


    if (
      card.full_art
    ) {
      reasons.push(
        "Full-art treatment"
      );
    }


    if (
      frameEffects.includes(
        "extendedart"
      )
    ) {
      reasons.push(
        "Extended artwork"
      );
    }


    if (
      promoTypes.includes(
        "textured"
      )
    ) {
      reasons.push(
        "Textured treatment"
      );
    }


    if (
      promoTypes.includes(
        "galaxyfoil"
      )
    ) {
      reasons.push(
        "Galaxy foil"
      );
    }


    if (
      promoTypes.includes(
        "surgefoil"
      )
    ) {
      reasons.push(
        "Surge foil"
      );
    }


    if (
      promoTypes.includes(
        "rainbowfoil"
      )
    ) {
      reasons.push(
        "Rainbow foil"
      );
    }


    if (
      promoTypes.includes(
        "halofoil"
      )
    ) {
      reasons.push(
        "Halo foil"
      );
    }


    if (
      promoTypes.includes(
        "stepandcompleat"
      )
    ) {
      reasons.push(
        "Step-and-compleat foil"
      );
    }


    if (
      finishes.includes(
        "etched"
      )
    ) {
      reasons.push(
        "Etched finish"
      );
    }


    if (
      finishes.includes(
        "foil"
      ) &&
      reasons.length < 3
    ) {
      reasons.push(
        "Foil available"
      );
    }


    if (
      card.promo &&
      reasons.length < 3
    ) {
      reasons.push(
        "Special promo printing"
      );
    }


    if (
      !reasons.length
    ) {
      reasons.push(
        "ManaScout's standout printing"
      );
    }


    return reasons.slice(
      0,
      3
    );
  }


  function manaScoutPickExplanation(
    card,
    enabled
  ) {
    if (!enabled) {
      return "";
    }


    const reasons =
      manaScoutPickReasons(
        card
      );


    return `
      <div
        class="manascout-pick-reason"
        aria-label="Why ManaScout selected this printing"
      >

        <strong>
          Why this one?
        </strong>

        <span>
          ${reasons
            .map(
              reason =>
                escapeHtml(
                  reason
                )
            )
            .join(" · ")}
        </span>

      </div>
    `;
  }


  /* ========================================
     DISCOVERY / KEEP SCOUTING
     ======================================== */

  function discoverySearchQuery(
    card,
    mode
  ) {
    const oracleId =
      String(
        card?.oracle_id ||
        ""
      ).trim();


    const exclusions = [];


    if (oracleId) {
      exclusions.push(
        `-oracleid:${oracleId}`
      );
    }


    if (
      mode ===
      "colour"
    ) {
      const colours =
        Array.isArray(
          card?.color_identity
        )
          ? card.color_identity
          : [];


      if (
        colours.length
      ) {
        return [
          "game:paper",
          `id:${colours.join(
            ""
          )}`,
          ...exclusions
        ].join(" ");
      }


      return [
        "game:paper",
        "id:c",
        ...exclusions
      ].join(" ");
    }


    if (
      mode ===
      "type"
    ) {
      const typeLine =
        String(
          card?.type_line ||
          ""
        );


      const knownTypes = [
        "Creature",
        "Artifact",
        "Enchantment",
        "Instant",
        "Sorcery",
        "Planeswalker",
        "Land",
        "Battle"
      ];


      const selectedType =
        knownTypes.find(
          type =>
            typeLine.includes(
              type
            )
        );


      if (
        selectedType
      ) {
        return [
          "game:paper",
          `t:${selectedType.toLowerCase()}`,
          ...exclusions
        ].join(" ");
      }
    }


    return [
      "game:paper",
      ...exclusions
    ].join(" ");
  }


  function resultDiscoveryActions(
    card
  ) {
    const name =
      escapeHtml(
        card?.name ||
        "this card"
      );


    return `
      <section
        class="scout-more"
        aria-labelledby="scout-more-heading"
      >

        <div class="scout-more-heading">

          <div>

            <p class="eyebrow">
              KEEP SCOUTING
            </p>

            <h3 id="scout-more-heading">
              Where next?
            </h3>

            <p>
              Let ManaScout take you somewhere new from ${name}.
            </p>

          </div>


          <button
            class="scout-another-button"
            type="button"
            data-discovery-mode="wild"
          >
            <span aria-hidden="true">
              ◇
            </span>

            Scout Another
          </button>

        </div>


        <div
          class="scout-more-grid"
          aria-label="Discover another Magic card"
        >

          <button
            type="button"
            class="scout-more-option"
            data-discovery-mode="colour"
          >
            <span
              class="scout-more-mark"
              aria-hidden="true"
            >
              ◇
            </span>

            <strong>
              Same colour
            </strong>

            <span>
              Explore a random card with a matching colour identity.
            </span>
          </button>


          <button
            type="button"
            class="scout-more-option"
            data-discovery-mode="type"
          >
            <span
              class="scout-more-mark"
              aria-hidden="true"
            >
              ◈
            </span>

            <strong>
              Same type
            </strong>

            <span>
              Jump to another card from the same broad card type.
            </span>
          </button>


          <button
            type="button"
            class="scout-more-option"
            data-discovery-mode="wild"
          >
            <span
              class="scout-more-mark"
              aria-hidden="true"
            >
              ✦
            </span>

            <strong>
              Wildcard
            </strong>

            <span>
              No rules. Pull something random from paper Magic.
            </span>
          </button>

        </div>


        <p
          class="scout-more-status"
          role="status"
          aria-live="polite"
        ></p>

      </section>
    `;
  }


  async function randomDiscoveryCard(
    sourceCard,
    mode,
    statusElement,
    buttons
  ) {
    const query =
      discoverySearchQuery(
        sourceCard,
        mode
      );


    buttons.forEach(
      button => {
        button.disabled =
          true;

        button.setAttribute(
          "aria-busy",
          "true"
        );
      }
    );


    if (statusElement) {
      statusElement.textContent =
        "Scouting the archive…";
    }


    try {
      const randomCard =
        await fetchJson(
          `${API}/cards/random?q=${encodeURIComponent(
            query
          )}`
        );


      if (
        !randomCard?.name
      ) {
        throw new Error(
          "Random card unavailable."
        );
      }


      if (statusElement) {
        statusElement.textContent =
          `Found ${randomCard.name}.`;
      }


      await loadCard(
        randomCard.name
      );


      scrollToElement(
        els.details
      );

    } catch (error) {
      console.error(
        "ManaScout discovery failed:",
        error
      );


      if (statusElement) {
        statusElement.textContent =
          "ManaScout couldn't scout another card this time. Try again.";
      }

    } finally {
      buttons.forEach(
        button => {
          button.disabled =
            false;

          button.removeAttribute(
            "aria-busy"
          );
        }
      );
    }
  }


  /* ========================================
     RENDER CARD
     ======================================== */

  function renderCard(
    card,
    options = {}
  ) {
    if (!els.details) {
      return;
    }


    const image =
      primaryImage(
        card
      );


    const imageHtml =
      image
        ? `
          <div class="card-image-wrap">

            <img
              class="card-image"
              src="${escapeHtml(
                image
              )}"
              alt="${escapeHtml(
                card.name ||
                "Magic card"
              )}"
              decoding="async"
            >

          </div>
        `
        : `
          <div class="card-image-wrap">

            <div class="empty-state">
              No card image supplied.
            </div>

          </div>
        `;


    const legalities =
      card.legalities
        ? Object.entries(
            card.legalities
          )
            .filter(
              ([, value]) =>
                value ===
                "legal"
            )
            .map(
              ([key]) =>
                formatLegalFormat(
                  key
                )
            )
            .join(", ")
        : "Not available";


    const eyebrow =
      options.manaScoutPick
        ? "◇ MANASCOUT PICK · CARD"
        : "CARD";


    els.details.innerHTML = `
      <article class="card-display">

        ${imageHtml}


        <div class="card-text-details">

          <p class="eyebrow">
            ${eyebrow}
          </p>


          <h2>
            ${escapeHtml(
              card.name ||
              "Unknown card"
            )}
          </h2>


          <p class="card-subtitle">

            ${escapeHtml(
              card.type_line ||
              ""
            )}

            ${
              card.mana_cost
                ? `
                  ·
                  <span class="mana-cost">
                    ${escapeHtml(
                      card.mana_cost
                    )}
                  </span>
                `
                : ""
            }

          </p>


          ${manaScoutPickExplanation(
            card,
            Boolean(
              options.manaScoutPick
            )
          )}


          <div class="detail-grid">

            <div class="detail">

              <strong>
                Set
              </strong>

              ${escapeHtml(
                card.set_name ||
                "—"
              )}

            </div>


            <div class="detail">

              <strong>
                Collector number
              </strong>

              ${escapeHtml(
                card.collector_number ||
                "—"
              )}

            </div>


            <div class="detail">

              <strong>
                Rarity
              </strong>

              ${escapeHtml(
                titleCase(
                  card.rarity ||
                  "—"
                )
              )}

            </div>


            <div class="detail">

              <strong>
                Legal in
              </strong>

              ${escapeHtml(
                legalities ||
                "—"
              )}

            </div>

          </div>


          ${renderFaces(
            card
          )}


          ${manaScoutGuideLink(
            card
          )}


          ${marketplaceLinks(
            card
          )}

        </div>

      </article>


      ${resultDiscoveryActions(
        card
      )}
    `;


    const discoveryButtons =
      [
        ...els.details
          .querySelectorAll(
            "[data-discovery-mode]"
          )
      ];


    const discoveryStatus =
      els.details.querySelector(
        ".scout-more-status"
      );


    discoveryButtons.forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            randomDiscoveryCard(
              card,
              button.dataset
                .discoveryMode ||
                "wild",
              discoveryStatus,
              discoveryButtons
            );
          }
        );
      }
    );


    emitManaScoutState(
      "card",
      {
        cardName:
          card.name ||
          "",

        printingId:
          card.id ||
          ""
      }
    );
  }


  /* ========================================
     PRICE / FX HELPERS
     ======================================== */

  function priceCell(
    value,
    symbol = ""
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return `
        <span class="muted">
          —
        </span>
      `;
    }


    return `
      <span class="price">

        <strong>
          ${escapeHtml(
            `${symbol}${value}`
          )}
        </strong>

      </span>
    `;
  }


  async function fetchFxRate(
    base
  ) {
    const response =
      await fetch(
        `${FX_API}/${encodeURIComponent(
          base
        )}/GBP`,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (!response.ok) {
      throw new Error(
        `FX HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    const rate =
      Number(
        data.rate
      );


    if (
      !Number.isFinite(
        rate
      ) ||
      rate <= 0
    ) {
      throw new Error(
        "Invalid FX rate."
      );
    }


    return rate;
  }


  async function getFxRates() {
    if (!fxRatesPromise) {
      fxRatesPromise =
        Promise.all([
          fetchFxRate(
            "EUR"
          ),

          fetchFxRate(
            "USD"
          )
        ])
          .then(
            ([
              eurToGbp,
              usdToGbp
            ]) => ({
              eurToGbp,
              usdToGbp
            })
          )
          .catch(
            error => {
              /*
               * Allow a later search to retry
               * instead of permanently caching
               * a rejected Promise.
               */

              fxRatesPromise =
                null;

              throw error;
            }
          );
    }


    return fxRatesPromise;
  }


  function convertToGbp(
    value,
    rate
  ) {
    const amount =
      Number.parseFloat(
        value
      );


    if (
      !Number.isFinite(
        amount
      ) ||
      !Number.isFinite(
        rate
      )
    ) {
      return null;
    }


    return (
      amount *
      rate
    ).toFixed(2);
  }


  function regularGbpValue(
    print,
    rates
  ) {
    const eur =
      Number.parseFloat(
        print.prices?.eur
      );


    const usd =
      Number.parseFloat(
        print.prices?.usd
      );


    if (
      Number.isFinite(
        eur
      ) &&
      eur > 0 &&
      rates?.eurToGbp
    ) {
      return (
        eur *
        rates.eurToGbp
      );
    }


    if (
      Number.isFinite(
        usd
      ) &&
      usd > 0 &&
      rates?.usdToGbp
    ) {
      return (
        usd *
        rates.usdToGbp
      );
    }


    return null;
  }


  function foilGbpValue(
    print,
    rates
  ) {
    const eur =
      Number.parseFloat(
        print.prices?.eur_foil
      );


    const usd =
      Number.parseFloat(
        print.prices?.usd_foil
      );


    if (
      Number.isFinite(
        eur
      ) &&
      eur > 0 &&
      rates?.eurToGbp
    ) {
      return (
        eur *
        rates.eurToGbp
      );
    }


    if (
      Number.isFinite(
        usd
      ) &&
      usd > 0 &&
      rates?.usdToGbp
    ) {
      return (
        usd *
        rates.usdToGbp
      );
    }


    return null;
  }


  function sourceCurrencyCell(
    eur,
    usd
  ) {
    if (eur) {
      return priceCell(
        eur,
        "€"
      );
    }


    if (usd) {
      return priceCell(
        usd,
        "$"
      );
    }


    return priceCell(
      null
    );
  }


  function regularPriceCell(
    print,
    rates
  ) {
    if (rates) {
      const value =
        regularGbpValue(
          print,
          rates
        );


      return priceCell(
        Number.isFinite(
          value
        )
          ? value.toFixed(
              2
            )
          : null,
        "£"
      );
    }


    return sourceCurrencyCell(
      print.prices?.eur,
      print.prices?.usd
    );
  }


  function foilPriceCell(
    print,
    rates
  ) {
    if (rates) {
      const value =
        foilGbpValue(
          print,
          rates
        );


      return priceCell(
        Number.isFinite(
          value
        )
          ? value.toFixed(
              2
            )
          : null,
        "£"
      );
    }


    return sourceCurrencyCell(
      print.prices?.eur_foil,
      print.prices?.usd_foil
    );
  }


  function etchedPriceCell(
    print,
    rates
  ) {
    const usd =
      print.prices
        ?.usd_etched;


    if (!usd) {
      return priceCell(
        null
      );
    }


    if (rates) {
      return priceCell(
        convertToGbp(
          usd,
          rates.usdToGbp
        ),
        "£"
      );
    }


    return priceCell(
      usd,
      "$"
    );
  }


  /* ========================================
     PRINTING HELPERS
     ======================================== */

  function finishText(
    card
  ) {
    return (
      Array.isArray(
        card.finishes
      ) &&
      card.finishes.length
    )
      ? card.finishes
          .map(
            finish =>
              titleCase(
                finish
              )
          )
          .join(", ")
      : "—";
  }


  function printingImage(
    print
  ) {
    return (
      print.image_uris
        ?.small ||
      print.image_uris
        ?.normal ||
      print.card_faces?.[0]
        ?.image_uris?.small ||
      print.card_faces?.[0]
        ?.image_uris?.normal ||
      ""
    );
  }


  function hasFinish(
    print,
    finish
  ) {
    return (
      Array.isArray(
        print.finishes
      ) &&
      print.finishes.includes(
        finish
      )
    );
  }


  function isStandardPrinting(
    print
  ) {
    return (
      print.layout !==
        "art_series" &&
      print.layout !==
        "token" &&
      print.layout !==
        "emblem" &&
      !print.oversized
    );
  }


  function isPaperPrinting(
    print
  ) {
    return (
      Array.isArray(
        print.games
      ) &&
      print.games.includes(
        "paper"
      )
    );
  }


  /*
   * The site is primarily a physical-card
   * printing explorer.
   *
   * Prefer ordinary paper printings whenever
   * Scryfall supplies them. Fall back gracefully
   * for unusual cards where no paper version is
   * available.
   */

  function meaningfulPrintings(
    printings
  ) {
    const withImages =
      printings.filter(
        print =>
          printingImage(
            print
          )
      );


    const standard =
      withImages.filter(
        isStandardPrinting
      );


    const paper =
      standard.filter(
        isPaperPrinting
      );


    if (paper.length) {
      return paper;
    }


    if (standard.length) {
      return standard;
    }


    if (withImages.length) {
      return withImages;
    }


    return [
      ...printings
    ];
  }


  /* ========================================
     MANASCOUT PICK SCORING
     ======================================== */

  function preferredPrintingScore(
    print
  ) {
    if (
      !printingImage(
        print
      )
    ) {
      return -Infinity;
    }


    let score = 0;


    const frameEffects =
      Array.isArray(
        print.frame_effects
      )
        ? print.frame_effects
        : [];


    const promoTypes =
      Array.isArray(
        print.promo_types
      )
        ? print.promo_types
        : [];


    const finishes =
      Array.isArray(
        print.finishes
      )
        ? print.finishes
        : [];


    if (
      isPaperPrinting(
        print
      )
    ) {
      score += 30;

    } else {
      score -= 120;
    }


    if (
      print.lang ===
      "en"
    ) {
      score += 15;

    } else {
      score -= 25;
    }


    if (
      !isStandardPrinting(
        print
      )
    ) {
      score -= 150;
    }


    if (
      frameEffects.includes(
        "showcase"
      )
    ) {
      score += 70;
    }


    if (
      print.border_color ===
      "borderless"
    ) {
      score += 60;
    }


    if (
      print.full_art
    ) {
      score += 52;
    }


    if (
      frameEffects.includes(
        "extendedart"
      )
    ) {
      score += 45;
    }


    if (
      frameEffects.includes(
        "inverted"
      )
    ) {
      score += 32;
    }


    if (
      promoTypes.includes(
        "boosterfun"
      )
    ) {
      score += 35;
    }


    if (
      promoTypes.includes(
        "textured"
      )
    ) {
      score += 34;
    }


    if (
      promoTypes.includes(
        "galaxyfoil"
      )
    ) {
      score += 30;
    }


    if (
      promoTypes.includes(
        "surgefoil"
      )
    ) {
      score += 28;
    }


    if (
      promoTypes.includes(
        "rainbowfoil"
      )
    ) {
      score += 28;
    }


    if (
      promoTypes.includes(
        "stepandcompleat"
      )
    ) {
      score += 26;
    }


    if (
      promoTypes.includes(
        "halofoil"
      )
    ) {
      score += 26;
    }


    if (
      finishes.includes(
        "etched"
      )
    ) {
      score += 16;
    }


    if (
      finishes.includes(
        "foil"
      )
    ) {
      score += 9;
    }


    if (
      print.promo
    ) {
      score += 5;
    }


    /*
     * Serialised cards are fascinating but
     * shouldn't automatically become the normal
     * ManaScout Pick simply because they are rare.
     */

    if (
      promoTypes.includes(
        "serialized"
      )
    ) {
      score -= 12;
    }


    return score;
  }


  function preferredPrintingPriceBonus(
    print,
    rates
  ) {
    if (!rates) {
      return 0;
    }


    const regularPrice =
      regularGbpValue(
        print,
        rates
      );


    const foilPrice =
      foilGbpValue(
        print,
        rates
      );


    const available =
      [
        regularPrice,
        foilPrice
      ]
        .filter(
          value =>
            Number.isFinite(
              value
            ) &&
            value > 0
        );


    if (
      !available.length
    ) {
      return 0;
    }


    const price =
      Math.max(
        ...available
      );


    /*
     * Mild collector signal only.
     *
     * Treatment/art should dominate the score,
     * not the market price.
     */

    return Math.min(
      12,
      Math.log10(
        price + 1
      ) * 5
    );
  }


  function manaScoutPrintingScore(
    print,
    rates
  ) {
    return (
      preferredPrintingScore(
        print
      ) +
      preferredPrintingPriceBonus(
        print,
        rates
      )
    );
  }


  function preferredPrintingCandidates(
    printings
  ) {
    const imageBearing =
      printings.filter(
        print =>
          printingImage(
            print
          )
      );


    const standard =
      imageBearing.filter(
        isStandardPrinting
      );


    const paper =
      standard.filter(
        isPaperPrinting
      );


    const englishPaper =
      paper.filter(
        print =>
          print.lang ===
          "en"
      );


    if (
      englishPaper.length
    ) {
      return englishPaper;
    }


    if (
      paper.length
    ) {
      return paper;
    }


    if (
      standard.length
    ) {
      return standard;
    }


    return imageBearing;
  }


  function rankedPreferredPrintings(
    printings,
    rates
  ) {
    const usable =
      preferredPrintingCandidates(
        printings
      );


    return [
      ...usable
    ].sort(
      (a, b) => {
        const scoreDifference =
          manaScoutPrintingScore(
            b,
            rates
          ) -
          manaScoutPrintingScore(
            a,
            rates
          );


        if (
          scoreDifference !== 0
        ) {
          return scoreDifference;
        }


        const dateDifference =
          String(
            b.released_at ||
            ""
          ).localeCompare(
            String(
              a.released_at ||
              ""
            )
          );


        if (
          dateDifference !== 0
        ) {
          return dateDifference;
        }


        return String(
          a.collector_number ||
          ""
        ).localeCompare(
          String(
            b.collector_number ||
            ""
          )
        );
      }
    );
  }


  function manaScoutPickKey(
    printings
  ) {
    const first =
      printings?.[0];


    return (
      first?.oracle_id ||
      first?.name
        ?.toLowerCase() ||
      ""
    );
  }


  function preferredPrinting(
    printings,
    rates
  ) {
    const ranked =
      rankedPreferredPrintings(
        printings,
        rates
      );


    if (
      !ranked.length
    ) {
      return null;
    }


    const cacheKey =
      manaScoutPickKey(
        ranked
      );


    if (
      cacheKey &&
      manaScoutPickCache.has(
        cacheKey
      )
    ) {
      const cachedId =
        manaScoutPickCache.get(
          cacheKey
        );


      const cached =
        ranked.find(
          print =>
            print.id ===
            cachedId
        );


      if (cached) {
        return cached;
      }
    }


    /*
     * Stable and deterministic.
     *
     * Previous behaviour randomly picked from
     * the top three, which meant the same search
     * could promote a different printing later.
     */

    const selected =
      ranked[0];


    if (
      cacheKey &&
      selected?.id
    ) {
      manaScoutPickCache.set(
        cacheKey,
        selected.id
      );
    }


    return selected;
  }


  /* ========================================
     SNAPSHOT HELPERS
     ======================================== */

  function oldestYear(
    printings
  ) {
    const years =
      printings
        .map(
          print =>
            String(
              print.released_at ||
              ""
            ).slice(
              0,
              4
            )
        )
        .filter(
          year =>
            /^\d{4}$/.test(
              year
            )
        );


    return years.length
      ? [
          ...years
        ].sort()[0]
      : null;
  }


  function newestYear(
    printings
  ) {
    const years =
      printings
        .map(
          print =>
            String(
              print.released_at ||
              ""
            ).slice(
              0,
              4
            )
        )
        .filter(
          year =>
            /^\d{4}$/.test(
              year
            )
        );


    return years.length
      ? [
          ...years
        ]
          .sort()
          .reverse()[0]
      : null;
  }


  function extremePrinting(
    printings,
    rates,
    priceGetter,
    direction =
      "cheapest"
  ) {
    let winner =
      null;


    let winnerPrice =
      direction ===
      "most-expensive"
        ? -Infinity
        : Infinity;


    printings.forEach(
      print => {
        const price =
          priceGetter(
            print,
            rates
          );


        if (
          !Number.isFinite(
            price
          ) ||
          price <= 0
        ) {
          return;
        }


        const better =
          direction ===
          "most-expensive"
            ? price >
              winnerPrice
            : price <
              winnerPrice;


        if (better) {
          winner =
            print;

          winnerPrice =
            price;
        }
      }
    );


    return winner
      ? {
          print:
            winner,

          price:
            winnerPrice
        }
      : null;
  }


  function getSnapshotData(
    printings,
    rates
  ) {
    const foilPrintings =
      printings.filter(
        print =>
          hasFinish(
            print,
            "foil"
          )
      );


    const etchedPrintings =
      printings.filter(
        print =>
          hasFinish(
            print,
            "etched"
          )
      );


    return {
      oldest:
        oldestYear(
          printings
        ),

      newest:
        newestYear(
          printings
        ),

      foilPrintings,

      etchedPrintings,

      cheapest:
        extremePrinting(
          printings,
          rates,
          regularGbpValue,
          "cheapest"
        ),

      mostExpensive:
        extremePrinting(
          printings,
          rates,
          regularGbpValue,
          "most-expensive"
        ),

      cheapestFoil:
        extremePrinting(
          printings,
          rates,
          foilGbpValue,
          "cheapest"
        ),

      mostExpensiveFoil:
        extremePrinting(
          printings,
          rates,
          foilGbpValue,
          "most-expensive"
        )
    };
  }


  function snapshotButton({
    action,
    value,
    label,
    disabled = false
  }) {
    return `
      <button
        class="snapshot-stat"
        type="button"
        data-snapshot-action="${escapeHtml(
          action
        )}"
        ${
          disabled
            ? "disabled"
            : ""
        }
        aria-pressed="false"
      >

        <strong>
          ${escapeHtml(
            value
          )}
        </strong>

        <span>
          ${escapeHtml(
            label
          )}
        </span>

      </button>
    `;
  }


  function buildSnapshot(
    printings,
    rates
  ) {
    if (
      !Array.isArray(
        printings
      ) ||
      !printings.length
    ) {
      return "";
    }


    const data =
      getSnapshotData(
        printings,
        rates
      );


    return `
      <section class="snapshot">

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

          ${snapshotButton({
            action:
              "all",

            value:
              printings.length,

            label:
              "Printings"
          })}


          ${snapshotButton({
            action:
              "cheapest",

            value:
              data.cheapest
                ? `£${data.cheapest.price.toFixed(
                    2
                  )}`
                : "—",

            label:
              "Cheapest",

            disabled:
              !data.cheapest
          })}


          ${snapshotButton({
            action:
              "most-expensive",

            value:
              data.mostExpensive
                ? `£${data.mostExpensive.price.toFixed(
                    2
                  )}`
                : "—",

            label:
              "Most expensive",

            disabled:
              !data.mostExpensive
          })}


          ${snapshotButton({
            action:
              "cheapest-foil",

            value:
              data.cheapestFoil
                ? `£${data.cheapestFoil.price.toFixed(
                    2
                  )}`
                : "—",

            label:
              "Cheapest foil",

            disabled:
              !data.cheapestFoil
          })}


          ${snapshotButton({
            action:
              "most-expensive-foil",

            value:
              data.mostExpensiveFoil
                ? `£${data.mostExpensiveFoil.price.toFixed(
                    2
                  )}`
                : "—",

            label:
              "Most expensive foil",

            disabled:
              !data.mostExpensiveFoil
          })}


          ${snapshotButton({
            action:
              "oldest",

            value:
              data.oldest ||
              "—",

            label:
              "Oldest",

            disabled:
              !data.oldest
          })}


          ${snapshotButton({
            action:
              "newest",

            value:
              data.newest ||
              "—",

            label:
              "Newest",

            disabled:
              !data.newest
          })}


          ${snapshotButton({
            action:
              "foil",

            value:
              data.foilPrintings
                .length,

            label:
              "Foil versions",

            disabled:
              !data.foilPrintings
                .length
          })}


          ${snapshotButton({
            action:
              "etched",

            value:
              data.etchedPrintings
                .length,

            label:
              "Etched versions",

            disabled:
              !data.etchedPrintings
                .length
          })}

        </div>


        <p class="snapshot-note">
          Tap a Snapshot tile to explore matching printings. GBP figures are approximate conversions from available Scryfall price data.
        </p>

      </section>
    `;
  }


  /* ========================================
     NETWORK
     ======================================== */

  async function fetchJson(
    url,
    signal
  ) {
    const response =
      await fetch(
        url,
        {
          signal,

          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `HTTP ${response.status}`
        );


      error.status =
        response.status;


      throw error;
    }


    return response.json();
  }


  async function namedCard(
    name,
    signal
  ) {
    const exact =
      `${API}/cards/named?exact=${encodeURIComponent(
        name
      )}`;


    try {
      return await fetchJson(
        exact,
        signal
      );

    } catch (error) {
      if (
        error.name ===
          "AbortError" ||
        error.status !==
          404
      ) {
        throw error;
      }


      const fuzzy =
        `${API}/cards/named?fuzzy=${encodeURIComponent(
          name
        )}`;


      return fetchJson(
        fuzzy,
        signal
      );
    }
  }


  async function cardById(
    printingId,
    signal
  ) {
    return fetchJson(
      `${API}/cards/${encodeURIComponent(
        printingId
      )}`,
      signal
    );
  }


  /* ========================================
     PRINTING TABLE
     ======================================== */

  async function renderPrintings(
    initialCard,
    token,
    signal,
    options = {}
  ) {
    if (
      !els.status ||
      !els.printings
    ) {
      return;
    }


    const uri =
      safeUrl(
        initialCard
          .prints_search_uri
      );


    if (!uri) {
      els.status.textContent =
        "Printing information is not available for this card.";

      return;
    }


    els.status.textContent =
      "Loading printings…";


    const fetchedPrintings = [];


    let next =
      uri;

    let pages =
      0;


    try {
      while (
        next &&
        pages < 40
      ) {
        const page =
          await fetchJson(
            next,
            signal
          );


        if (
          token !==
          searchToken
        ) {
          return;
        }


        if (
          Array.isArray(
            page.data
          )
        ) {
          fetchedPrintings.push(
            ...page.data
          );
        }


        next =
          safeUrl(
            page.next_page ||
            ""
          );


        pages +=
          1;


        /*
         * Scryfall asks clients not to hammer
         * requests. Printing pagination rarely
         * needs many pages, but pause briefly.
         */

        if (next) {
          await sleep(
            80
          );
        }
      }

    } catch (error) {
      if (
        error.name ===
        "AbortError"
      ) {
        return;
      }


      console.warn(
        "ManaScout printing fetch incomplete:",
        error
      );


      if (
        !fetchedPrintings.length
      ) {
        els.status.textContent =
          "Printing data could not be loaded.";

        return;
      }
    }


    if (
      token !==
      searchToken
    ) {
      return;
    }


    const all =
      meaningfulPrintings(
        fetchedPrintings
      );


    all.sort(
      (a, b) =>
        String(
          b.released_at ||
          ""
        ).localeCompare(
          String(
            a.released_at ||
            ""
          )
        )
    );


    let rates =
      null;


    try {
      rates =
        await getFxRates();

    } catch (error) {
      console.warn(
        "GBP conversion unavailable:",
        error
      );
    }


    if (
      token !==
      searchToken
    ) {
      return;
    }


    /*
     * selectedCard belongs to THIS rendering
     * session.
     *
     * Updating this local variable means the
     * highlighted table row correctly follows
     * the printing the user selects.
     */

    let selectedCard =
      initialCard;


    /*
     * Automatic ManaScout Pick only happens when
     * an explicit printing has NOT been requested.
     */

    if (
      options.choosePreferred
    ) {
      const preferred =
        preferredPrinting(
          all,
          rates
        );


      if (preferred) {
        selectedCard =
          preferred;


        renderCard(
          selectedCard,
          {
            manaScoutPick:
              true
          }
        );


        replacePreferredPrintingInUrl(
          selectedCard
        );
      }
    }


    const snapshotData =
      getSnapshotData(
        all,
        rates
      );


    let snapshotMode =
      "all";


    function normalStatusText() {
      const count =
        all.length;


      if (rates) {
        return `${count} printing${
          count === 1
            ? ""
            : "s"
        } found · GBP estimates`;
      }


      return `${count} printing${
        count === 1
          ? ""
          : "s"
      } found · source currencies`;
    }


    function buildRows(
      printings
    ) {
      return printings
        .map(
          print => `
            <tr
              ${
                print.id ===
                selectedCard.id
                  ? 'class="is-selected-printing"'
                  : ""
              }
            >

              <td class="printing-image-cell">

                ${
                  printingImage(
                    print
                  )
                    ? `
                      <button
                        class="printing-select-button printing-image-button"
                        type="button"
                        data-print-id="${escapeHtml(
                          print.id ||
                          ""
                        )}"
                        aria-label="Select ${escapeHtml(
                          print.set_name ||
                          print.name ||
                          "this"
                        )} printing"
                        title="Select this printing"
                      >

                        <img
                          class="printing-card-image"
                          src="${escapeHtml(
                            printingImage(
                              print
                            )
                          )}"
                          alt="${escapeHtml(
                            print.name ||
                            "Magic card"
                          )} — ${escapeHtml(
                            print.set_name ||
                            "printing"
                          )}"
                          loading="lazy"
                          decoding="async"
                        >

                      </button>
                    `
                    : `
                      <span class="muted">
                        —
                      </span>
                    `
                }

              </td>


              <td>

                <button
                  class="printing-select-button printing-name-button"
                  type="button"
                  data-print-id="${escapeHtml(
                    print.id ||
                    ""
                  )}"
                >

                  <span class="set-name">
                    ${escapeHtml(
                      print.set_name ||
                      "—"
                    )}
                  </span>

                </button>

                <br>

                <span class="muted">
                  ${escapeHtml(
                    String(
                      print.set ||
                      ""
                    ).toUpperCase()
                  )}
                </span>

              </td>


              <td>
                ${escapeHtml(
                  print.released_at ||
                  "—"
                )}
              </td>


              <td>
                ${escapeHtml(
                  print.collector_number ||
                  "—"
                )}
              </td>


              <td>
                ${escapeHtml(
                  titleCase(
                    print.rarity ||
                    "—"
                  )
                )}
              </td>


              <td>
                ${escapeHtml(
                  finishText(
                    print
                  )
                )}
              </td>


              <td>
                ${regularPriceCell(
                  print,
                  rates
                )}
              </td>


              <td>
                ${foilPriceCell(
                  print,
                  rates
                )}
              </td>


              <td>
                ${etchedPriceCell(
                  print,
                  rates
                )}
              </td>

            </tr>
          `
        )
        .join("");
    }


    const showFilters =
      all.length >=
      8;


    const filterControls =
      showFilters
        ? `
          <div class="printing-controls">

            <label>
              Finish

              <select
                id="printing-finish-filter"
                aria-label="Filter printings by finish"
              >
                <option value="all">
                  All
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
              Sort

              <select
                id="printing-sort"
                aria-label="Sort printings"
              >
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
              </select>
            </label>

          </div>
        `
        : "";


    els.printings.innerHTML = `
      ${buildSnapshot(
        all,
        rates
      )}

      ${filterControls}


      <div class="table-wrap">

        <table class="printings-table">

          <thead>

            <tr>
              <th scope="col">
                Card
              </th>

              <th scope="col">
                Set
              </th>

              <th scope="col">
                Released
              </th>

              <th scope="col">
                Collector #
              </th>

              <th scope="col">
                Rarity
              </th>

              <th scope="col">
                Finishes
              </th>

              <th scope="col">
                Price
              </th>

              <th scope="col">
                Foil
              </th>

              <th scope="col">
                Etched
              </th>
            </tr>

          </thead>


          <tbody>
            ${
              buildRows(
                all
              ) ||
              `
                <tr>
                  <td colspan="9">
                    No printings returned.
                  </td>
                </tr>
              `
            }
          </tbody>

        </table>

      </div>
    `;


    els.status.textContent =
      normalStatusText();


    const tbody =
      els.printings.querySelector(
        "tbody"
      );


    const finishFilter =
      els.printings.querySelector(
        "#printing-finish-filter"
      );


    const sortSelect =
      els.printings.querySelector(
        "#printing-sort"
      );


    const tableWrap =
      els.printings.querySelector(
        ".table-wrap"
      );


    function snapshotResults() {
      if (
        snapshotMode ===
        "cheapest"
      ) {
        return snapshotData
          .cheapest
          ? [
              snapshotData
                .cheapest
                .print
            ]
          : [];
      }


      if (
        snapshotMode ===
        "most-expensive"
      ) {
        return snapshotData
          .mostExpensive
          ? [
              snapshotData
                .mostExpensive
                .print
            ]
          : [];
      }


      if (
        snapshotMode ===
        "cheapest-foil"
      ) {
        return snapshotData
          .cheapestFoil
          ? [
              snapshotData
                .cheapestFoil
                .print
            ]
          : [];
      }


      if (
        snapshotMode ===
        "most-expensive-foil"
      ) {
        return snapshotData
          .mostExpensiveFoil
          ? [
              snapshotData
                .mostExpensiveFoil
                .print
            ]
          : [];
      }


      if (
        snapshotMode ===
        "oldest"
      ) {
        return all.filter(
          print =>
            String(
              print.released_at ||
              ""
            ).startsWith(
              snapshotData
                .oldest ||
              "----"
            )
        );
      }


      if (
        snapshotMode ===
        "newest"
      ) {
        return all.filter(
          print =>
            String(
              print.released_at ||
              ""
            ).startsWith(
              snapshotData
                .newest ||
              "----"
            )
        );
      }


      if (
        snapshotMode ===
        "foil"
      ) {
        return all.filter(
          print =>
            hasFinish(
              print,
              "foil"
            )
        );
      }


      if (
        snapshotMode ===
        "etched"
      ) {
        return all.filter(
          print =>
            hasFinish(
              print,
              "etched"
            )
        );
      }


      return [
        ...all
      ];
    }


    function updateActiveSnapshotButton() {
      const buttons =
        els.printings
          .querySelectorAll(
            "[data-snapshot-action]"
          );


      buttons.forEach(
        button => {
          const active =
            button.dataset
              .snapshotAction ===
            snapshotMode;


          button.classList.toggle(
            "is-active",
            active
          );


          button.setAttribute(
            "aria-pressed",
            active
              ? "true"
              : "false"
          );
        }
      );
    }


    function updateStatus(
      displayed
    ) {
      if (!els.status) {
        return;
      }


      if (
        snapshotMode ===
        "all"
      ) {
        els.status.textContent =
          normalStatusText();

        return;
      }


      const labels = {
        cheapest:
          "cheapest printing",

        "most-expensive":
          "most expensive printing",

        "cheapest-foil":
          "cheapest foil printing",

        "most-expensive-foil":
          "most expensive foil printing",

        oldest:
          "oldest printings",

        newest:
          "newest printings",

        foil:
          "foil printings",

        etched:
          "etched printings"
      };


      els.status.textContent =
        `${displayed.length} ${
          labels[
            snapshotMode
          ] ||
          "printing"
        } shown`;
    }


    function applyFinishFilter(
      printings
    ) {
      const finish =
        finishFilter?.value ||
        "all";


      if (
        finish ===
        "all"
      ) {
        return [
          ...printings
        ];
      }


      return printings.filter(
        print =>
          hasFinish(
            print,
            finish
          )
      );
    }


    function sortPrintings(
      printings
    ) {
      const sort =
        sortSelect?.value ||
        "newest";


      return [
        ...printings
      ].sort(
        (a, b) => {
          if (
            sort ===
            "oldest"
          ) {
            return String(
              a.released_at ||
              ""
            ).localeCompare(
              String(
                b.released_at ||
                ""
              )
            );
          }


          if (
            sort ===
              "price-asc" ||
            sort ===
              "price-desc"
          ) {
            const aPrice =
              regularGbpValue(
                a,
                rates
              );


            const bPrice =
              regularGbpValue(
                b,
                rates
              );


            if (
              aPrice === null &&
              bPrice === null
            ) {
              return 0;
            }


            if (
              aPrice === null
            ) {
              return 1;
            }


            if (
              bPrice === null
            ) {
              return -1;
            }


            return sort ===
              "price-asc"
              ? aPrice -
                bPrice
              : bPrice -
                aPrice;
          }


          return String(
            b.released_at ||
            ""
          ).localeCompare(
            String(
              a.released_at ||
              ""
            )
          );
        }
      );
    }


    function displayedPrintings() {
      return sortPrintings(
        applyFinishFilter(
          snapshotResults()
        )
      );
    }


    function updatePrintings() {
      const displayed =
        displayedPrintings();


      if (tbody) {
        tbody.innerHTML =
          buildRows(
            displayed
          ) ||
          `
            <tr>
              <td colspan="9">
                No printings match these filters.
              </td>
            </tr>
          `;
      }


      updateActiveSnapshotButton();

      updateStatus(
        displayed
      );
    }


    function selectPrinting(
      print,
      {
        scrollToCard =
          true,
        replaceUrl =
          true
      } = {}
    ) {
      if (!print) {
        return;
      }


      selectedCard =
        print;


      renderCard(
        selectedCard
      );


      if (replaceUrl) {
        setQuery(
          selectedCard.name,
          true,
          selectedCard.id
        );
      }


      updatePrintings();


      if (scrollToCard) {
        scrollToElement(
          els.details
        );
      }
    }


    /*
     * Filters are attached to elements created
     * during this render. They disappear when the
     * next card replaces the printing area, so no
     * event handlers accumulate across searches.
     */

    finishFilter?.addEventListener(
      "change",
      updatePrintings
    );


    sortSelect?.addEventListener(
      "change",
      updatePrintings
    );


    /*
     * Snapshot controls.
     */

    const snapshotButtons =
      [
        ...els.printings
          .querySelectorAll(
            "[data-snapshot-action]"
          )
      ];


    snapshotButtons.forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            if (
              button.disabled
            ) {
              return;
            }


            snapshotMode =
              button.dataset
                .snapshotAction ||
              "all";


            if (
              finishFilter
            ) {
              finishFilter.value =
                "all";
            }


            const exactPricePrintings = {
              cheapest:
                snapshotData
                  .cheapest
                  ?.print,

              "most-expensive":
                snapshotData
                  .mostExpensive
                  ?.print,

              "cheapest-foil":
                snapshotData
                  .cheapestFoil
                  ?.print,

              "most-expensive-foil":
                snapshotData
                  .mostExpensiveFoil
                  ?.print
            };


            const exactPrinting =
              exactPricePrintings[
                snapshotMode
              ];


            if (
              exactPrinting
            ) {
              selectedCard =
                exactPrinting;


              renderCard(
                selectedCard
              );


              setQuery(
                selectedCard.name,
                true,
                selectedCard.id
              );
            }


            const matches =
              snapshotResults();


            if (
              ![
                "cheapest",
                "most-expensive",
                "cheapest-foil",
                "most-expensive-foil",
                "all"
              ].includes(
                snapshotMode
              ) &&
              matches.length ===
                1
            ) {
              selectedCard =
                matches[0];


              renderCard(
                selectedCard
              );


              setQuery(
                selectedCard.name,
                true,
                selectedCard.id
              );
            }


            updatePrintings();


            scrollToElement(
              tableWrap
            );
          }
        );
      }
    );


    /*
     * Exact printing selection.
     *
     * One listener is attached to this freshly
     * generated tbody only. This fixes the old
     * behaviour where every card search added
     * another delegated handler to the permanent
     * #printings-container element.
     */

    tbody?.addEventListener(
      "click",
      event => {
        const trigger =
          event.target.closest(
            "[data-print-id]"
          );


        if (!trigger) {
          return;
        }


        const selected =
          all.find(
            print =>
              print.id ===
              trigger.dataset
                .printId
          );


        if (!selected) {
          return;
        }


        selectPrinting(
          selected
        );
      }
    );


    updateActiveSnapshotButton();
  }


  /* ========================================
     LOAD CARD
     ======================================== */

  async function loadCard(
    name,
    options = {}
  ) {
    const query =
      String(
        name || ""
      ).trim();


    if (!query) {
      return null;
    }


    const requestedPrintingId =
      String(
        options.printingId ||
        (
          options.fromHistory
            ? getPrintingId()
            : ""
        ) ||
        ""
      ).trim();


    const token =
      ++searchToken;


    searchController?.abort();

    autocompleteController?.abort();


    searchController =
      new AbortController();


    if (
      !options.fromHistory
    ) {
      setQuery(
        query,
        Boolean(
          options.replace
        ),
        requestedPrintingId
      );
    }


    if (els.input) {
      els.input.value =
        query;
    }


    clearAutocomplete();


    emitManaScoutState(
      "loading",
      {
        cardName:
          query
      }
    );


    setLoading();


    try {
      let card;

      let exactPrintingResolved =
        false;


      if (
        requestedPrintingId
      ) {
        try {
          card =
            await cardById(
              requestedPrintingId,
              searchController
                .signal
            );


          /*
           * A printing= URL must belong to the
           * card being requested.
           */

          if (
            !card?.name ||
            card.name
              .toLowerCase() !==
            query
              .toLowerCase()
          ) {
            card =
              await namedCard(
                query,
                searchController
                  .signal
              );

          } else {
            exactPrintingResolved =
              true;
          }

        } catch (error) {
          if (
            error.name ===
            "AbortError"
          ) {
            throw error;
          }


          card =
            await namedCard(
              query,
              searchController
                .signal
            );
        }

      } else {
        card =
          await namedCard(
            query,
            searchController
              .signal
          );
      }


      if (
        token !==
        searchToken
      ) {
        return null;
      }


      renderCard(
        card
      );


      await renderPrintings(
        card,
        token,
        searchController
          .signal,
        {
          choosePreferred:
            !exactPrintingResolved
        }
      );


      return card;

    } catch (error) {
      if (
        error.name ===
          "AbortError" ||
        token !==
          searchToken
      ) {
        return null;
      }


      console.error(
        "ManaScout card load failed:",
        error
      );


      setError(
        error.status ===
          404
          ? `No card matched “${query}”. Try the card's full name.`
          : "Scryfall could not be reached. Please try again."
      );


      return null;
    }
  }


  /* ========================================
     AUTOCOMPLETE
     ======================================== */

  function clearAutocomplete() {
    if (
      !els.autocomplete ||
      !els.input
    ) {
      return;
    }


    els.autocomplete.hidden =
      true;


    els.autocomplete.innerHTML =
      "";


    els.input.setAttribute(
      "aria-expanded",
      "false"
    );


    els.input.removeAttribute(
      "aria-activedescendant"
    );


    activeAutocompleteIndex =
      -1;
  }


  function autocompleteItems() {
    if (
      !els.autocomplete
    ) {
      return [];
    }


    return [
      ...els.autocomplete
        .querySelectorAll(
          ".autocomplete-item"
        )
    ];
  }


  function setActiveAutocomplete(
    index
  ) {
    const items =
      autocompleteItems();


    if (
      !items.length
    ) {
      return;
    }


    if (
      index < 0
    ) {
      index =
        items.length - 1;
    }


    if (
      index >=
      items.length
    ) {
      index =
        0;
    }


    activeAutocompleteIndex =
      index;


    items.forEach(
      (item, itemIndex) => {
        const active =
          itemIndex ===
          index;


        item.setAttribute(
          "aria-selected",
          active
            ? "true"
            : "false"
        );
      }
    );


    const activeItem =
      items[
        index
      ];


    if (
      activeItem?.id &&
      els.input
    ) {
      els.input.setAttribute(
        "aria-activedescendant",
        activeItem.id
      );
    }


    activeItem?.scrollIntoView({
      block:
        "nearest"
    });
  }


  function renderAutocomplete(
    names
  ) {
    if (
      !els.autocomplete ||
      !els.input
    ) {
      return;
    }


    activeAutocompleteIndex =
      -1;


    els.input.removeAttribute(
      "aria-activedescendant"
    );


    if (
      !names.length
    ) {
      clearAutocomplete();

      return;
    }


    els.autocomplete.innerHTML =
      names
        .map(
          (
            name,
            index
          ) => `
            <button
              id="autocomplete-option-${index}"
              class="autocomplete-item"
              type="button"
              role="option"
              aria-selected="false"
              data-name="${escapeHtml(
                name
              )}"
            >
              <span>
                ${escapeHtml(
                  name
                )}
              </span>
            </button>
          `
        )
        .join("");


    els.autocomplete.hidden =
      false;


    els.input.setAttribute(
      "aria-expanded",
      "true"
    );
  }


  async function autocomplete(
    query
  ) {
    autocompleteController?.abort();


    autocompleteController =
      new AbortController();


    try {
      const url =
        `${API}/cards/autocomplete?q=${encodeURIComponent(
          query
        )}`;


      const data =
        await fetchJson(
          url,
          autocompleteController
            .signal
        );


      renderAutocomplete(
        Array.isArray(
          data.data
        )
          ? data.data.slice(
              0,
              8
            )
          : []
      );

    } catch (error) {
      if (
        error.name !==
        "AbortError"
      ) {
        clearAutocomplete();
      }
    }
  }


  /* ========================================
     SEARCH EVENTS
     ======================================== */

  if (
    els.form &&
    els.input
  ) {
    els.form.addEventListener(
      "submit",
      event => {
        event.preventDefault();


        const value =
          els.input.value
            .trim();


        if (value) {
          loadCard(
            value
          );
        }
      }
    );


    els.input.addEventListener(
      "input",
      () => {
        const query =
          els.input.value
            .trim();


        window.clearTimeout(
          autocompleteTimer
        );


        if (
          query.length <
          2
        ) {
          autocompleteController
            ?.abort();

          clearAutocomplete();

          return;
        }


        autocompleteTimer =
          window.setTimeout(
            () =>
              autocomplete(
                query
              ),
            180
          );
      }
    );


    els.input.addEventListener(
      "keydown",
      event => {
        const items =
          autocompleteItems();


        if (
          event.key ===
            "ArrowDown" &&
          items.length
        ) {
          event.preventDefault();


          setActiveAutocomplete(
            activeAutocompleteIndex +
            1
          );


        } else if (
          event.key ===
            "ArrowUp" &&
          items.length
        ) {
          event.preventDefault();


          setActiveAutocomplete(
            activeAutocompleteIndex -
            1
          );


        } else if (
          event.key ===
            "Enter" &&
          activeAutocompleteIndex >=
            0 &&
          items[
            activeAutocompleteIndex
          ]
        ) {
          event.preventDefault();


          loadCard(
            items[
              activeAutocompleteIndex
            ].dataset.name
          );


        } else if (
          event.key ===
          "Escape"
        ) {
          clearAutocomplete();
        }
      }
    );
  }


  if (
    els.autocomplete
  ) {
    els.autocomplete.addEventListener(
      "click",
      event => {
        const item =
          event.target.closest(
            "[data-name]"
          );


        if (item) {
          loadCard(
            item.dataset.name
          );
        }
      }
    );
  }


  document.addEventListener(
    "click",
    event => {
      if (
        els.form &&
        !els.form.contains(
          event.target
        )
      ) {
        clearAutocomplete();
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
        getQueryName();


      const printingId =
        getPrintingId();


      if (query) {
        loadCard(
          query,
          {
            fromHistory:
              true,

            printingId
          }
        );

      } else {
        searchController
          ?.abort();


        ++searchToken;


        setHomeState();
      }
    }
  );


  /* ========================================
     PUBLIC MANASCOUT API
     ======================================== */

  window.ManaScout =
    Object.freeze({
      loadCard,


      scoutRandom:
        async () => {
          const randomCard =
            await fetchJson(
              `${API}/cards/random?q=${encodeURIComponent(
                "game:paper"
              )}`
            );


          if (
            !randomCard?.name
          ) {
            throw new Error(
              "Random card unavailable."
            );
          }


          await loadCard(
            randomCard.name
          );


          return randomCard;
        }
    });


  /* ========================================
     INITIAL URL STATE
     ======================================== */

  const initial =
    getQueryName();


  const initialPrintingId =
    getPrintingId();


  if (initial) {
    loadCard(
      initial,
      {
        fromHistory:
          true,

        printingId:
          initialPrintingId
      }
    );
  }

})();
