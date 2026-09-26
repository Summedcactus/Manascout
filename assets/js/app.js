(() => {
  "use strict";

  const API = "https://api.scryfall.com";
  const FX_API = "https://api.frankfurter.dev/v2/rate";

  const els = {
    form: document.getElementById("search-form"),
    input: document.getElementById("search-input"),
    autocomplete: document.getElementById("autocomplete-list"),
    details: document.getElementById("card-details"),
    status: document.getElementById("printings-status"),
    printings: document.getElementById("printings-container")
  };

  let searchController = null;
  let autocompleteController = null;
  let autocompleteTimer = null;
  let searchToken = 0;
  let activeAutocompleteIndex = -1;
  let fxRatesPromise = null;


  /* ------------------------------
     BASIC HELPERS
     ------------------------------ */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function getQueryName() {
    return new URLSearchParams(window.location.search)
      .get("q")
      ?.trim() || "";
  }

  function getPrintingId() {
    return new URLSearchParams(window.location.search)
      .get("printing")
      ?.trim() || "";
  }

  function setQuery(
    name,
    replace = false,
    printingId = ""
  ) {
    const url =
      new URL(window.location.href);

    if (name) {
      url.searchParams.set("q", name);
    } else {
      url.searchParams.delete("q");
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
    ]({}, "", url);
  }

  /*
   * When ManaScout automatically chooses a preferred
   * printing, preserve the current page structure.
   *
   * Homepage/search URLs keep their q parameter.
   * Permanent /card/.../ pages do NOT suddenly gain one.
   */

  function replacePreferredPrintingInUrl(card) {
    if (!card?.id) {
      return;
    }

    const url =
      new URL(window.location.href);

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
      String(value || "");

    if (!text) {
      return "";
    }

    return (
      text.charAt(0).toUpperCase() +
      text.slice(1).toLowerCase()
    );
  }

  function formatLegalFormat(format) {
    const specialFormats = {
      predh: "PreDH",
      paupercommander: "Pauper Commander",
      standardbrawl: "Standard Brawl",
      oldschool: "Old School",
      penny: "Penny Dreadful"
    };

    if (specialFormats[format]) {
      return specialFormats[format];
    }

    return String(format || "")
      .replace(/_/g, " ")
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      );
  }

  function oracleTextHtml(text) {
    const value =
      String(
        text ||
        "No oracle text supplied."
      );

    return value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(
        line =>
          `<p>${escapeHtml(line)}</p>`
      )
      .join("");
  }


  /* ------------------------------
     SEARCH STATES
     ------------------------------ */

  function setLoading() {
    if (!els.details) {
      return;
    }

    els.details.innerHTML =
      '<div class="loading-state">Searching Scryfall…</div>';

    if (els.status) {
      els.status.textContent = "";
    }

    if (els.printings) {
      els.printings.innerHTML = "";
    }
  }

  function setError(message) {
    if (!els.details) {
      return;
    }

    els.details.innerHTML = `
      <div class="error-state">
        <h2>We couldn't find that card</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `;

    if (els.status) {
      els.status.textContent = "";
    }

    if (els.printings) {
      els.printings.innerHTML = "";
    }
  }


  /* ------------------------------
     CARD DISPLAY
     ------------------------------ */

  function renderFaces(card) {
    if (
      !Array.isArray(card.card_faces) ||
      card.card_faces.length < 2
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
                <strong class="oracle-face-name">
                  ${escapeHtml(
                    face.name || ""
                  )}
                </strong>

                ${oracleTextHtml(
                  face.oracle_text || ""
                )}
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function primaryImage(card) {
    return safeUrl(
      card.image_uris?.normal ||
      card.card_faces?.[0]
        ?.image_uris?.normal ||
      ""
    );
  }

  function marketplaceLinks(card) {
    const name =
      encodeURIComponent(
        card.name || ""
      );

    return `
      <div class="marketplace-links">
        <a
          href="https://www.cardmarket.com/en/Magic/Products/Search?searchString=${name}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Search Cardmarket
        </a>

        <a
          href="https://www.tcgplayer.com/search/magic/product?q=${name}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Search TCGplayer
        </a>
      </div>
    `;
  }

  function renderCard(card) {
    if (!els.details) {
      return;
    }

    const image =
      primaryImage(card);

    const imageHtml =
      image
        ? `
          <div class="card-image-wrap">
            <img
              class="card-image"
              src="${escapeHtml(image)}"
              alt="${escapeHtml(
                card.name ||
                "Magic card"
              )}"
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
                value === "legal"
            )
            .map(
              ([key]) =>
                formatLegalFormat(key)
            )
            .join(", ")
        : "Not available";

    els.details.innerHTML = `
      <article class="card-display">

        ${imageHtml}

        <div class="card-text-details">

          <p class="eyebrow">CARD</p>

          <h2>
            ${escapeHtml(
              card.name ||
              "Unknown card"
            )}
          </h2>

          <p class="card-subtitle">
            ${escapeHtml(
              card.type_line || ""
            )}

            ${
              card.mana_cost
                ? ` · <span class="mana-cost">${escapeHtml(
                    card.mana_cost
                  )}</span>`
                : ""
            }
          </p>

          <div class="detail-grid">

            <div class="detail">
              <strong>Set</strong>
              ${escapeHtml(
                card.set_name || "—"
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
              <strong>Rarity</strong>
              ${escapeHtml(
                titleCase(
                  card.rarity || "—"
                )
              )}
            </div>

            <div class="detail">
              <strong>Legal in</strong>
              ${escapeHtml(
                legalities || "—"
              )}
            </div>

          </div>

          ${renderFaces(card)}

          ${marketplaceLinks(card)}

        </div>

      </article>
    `;
  }


  /* ------------------------------
     PRICES + FX
     ------------------------------ */

  function priceCell(
    value,
    symbol = ""
  ) {
    if (!value) {
      return (
        '<span class="muted">—</span>'
      );
    }

    return `
      <span class="price">
        <strong>
          ${escapeHtml(
            symbol + value
          )}
        </strong>
      </span>
    `;
  }

  async function fetchFxRate(base) {
    const response =
      await fetch(
        `${FX_API}/${base}/GBP`,
        {
          headers: {
            "Accept":
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

    return Number(data.rate);
  }

  async function getFxRates() {
    if (!fxRatesPromise) {
      fxRatesPromise =
        Promise.all([
          fetchFxRate("EUR"),
          fetchFxRate("USD")
        ]).then(
          ([
            eurToGbp,
            usdToGbp
          ]) => ({
            eurToGbp,
            usdToGbp
          })
        );
    }

    return fxRatesPromise;
  }

  function convertToGbp(
    value,
    rate
  ) {
    const amount =
      Number.parseFloat(value);

    if (
      !Number.isFinite(amount) ||
      !Number.isFinite(rate)
    ) {
      return null;
    }

    return (
      amount * rate
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
      Number.isFinite(eur) &&
      eur > 0 &&
      rates?.eurToGbp
    ) {
      return (
        eur *
        rates.eurToGbp
      );
    }

    if (
      Number.isFinite(usd) &&
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
      Number.isFinite(eur) &&
      eur > 0 &&
      rates?.eurToGbp
    ) {
      return (
        eur *
        rates.eurToGbp
      );
    }

    if (
      Number.isFinite(usd) &&
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


  /* ------------------------------
     CARD / PRINTING HELPERS
     ------------------------------ */

  function finishText(card) {
    return (
      Array.isArray(
        card.finishes
      ) &&
      card.finishes.length
    )
      ? card.finishes
          .map(
            finish =>
              titleCase(finish)
          )
          .join(", ")
      : "—";
  }

  function printingImage(print) {
    return (
      print.image_uris?.small ||
      print.image_uris?.normal ||
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


  /* ------------------------------
     PREFERRED PRINTING
     ------------------------------ */

  function preferredPrintingScore(
    print
  ) {
    if (!printingImage(print)) {
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

    const games =
      Array.isArray(
        print.games
      )
        ? print.games
        : [];


    /*
     * Prefer physical tabletop printings.
     */

    if (
      games.includes("paper")
    ) {
      score += 20;
    } else {
      score -= 80;
    }


    /*
     * Avoid non-standard curiosities becoming
     * the default hero simply because they are
     * unusual.
     */

    if (
      print.layout === "art_series"
    ) {
      score -= 100;
    }

    if (
      print.layout === "token" ||
      print.layout === "emblem"
    ) {
      score -= 100;
    }

    if (
      print.oversized
    ) {
      score -= 35;
    }


    /*
     * Premium visual treatments.
     */

    if (
      frameEffects.includes(
        "showcase"
      )
    ) {
      score += 60;
    }

    if (
      print.border_color ===
      "borderless"
    ) {
      score += 48;
    }

    if (
      print.full_art
    ) {
      score += 42;
    }

    if (
      frameEffects.includes(
        "extendedart"
      )
    ) {
      score += 38;
    }

    if (
      frameEffects.includes(
        "inverted"
      )
    ) {
      score += 28;
    }

    if (
      frameEffects.includes(
        "etched"
      )
    ) {
      score += 20;
    }

    if (
      frameEffects.includes(
        "legendary"
      )
    ) {
      score += 5;
    }


    /*
     * Booster-fun / unusual treatments.
     */

    if (
      promoTypes.includes(
        "boosterfun"
      )
    ) {
      score += 30;
    }

    if (
      promoTypes.includes(
        "textured"
      )
    ) {
      score += 28;
    }

    if (
      promoTypes.includes(
        "galaxyfoil"
      )
    ) {
      score += 20;
    }

    if (
      promoTypes.includes(
        "surgefoil"
      )
    ) {
      score += 18;
    }

    if (
      promoTypes.includes(
        "rainbowfoil"
      )
    ) {
      score += 18;
    }

    if (
      promoTypes.includes(
        "stepandcompleat"
      )
    ) {
      score += 18;
    }

    if (
      promoTypes.includes(
        "halofoil"
      )
    ) {
      score += 18;
    }


    /*
     * Finishes are useful signals, but should
     * never overpower the artwork/frame itself.
     */

    if (
      finishes.includes(
        "etched"
      )
    ) {
      score += 12;
    }

    if (
      finishes.includes(
        "foil"
      )
    ) {
      score += 6;
    }


    /*
     * Promo gets only a small bonus.
     */

    if (
      print.promo
    ) {
      score += 5;
    }


    /*
     * Serialized cards should NOT automatically
     * become the hero simply because they are
     * rare or expensive.
     */

    if (
      promoTypes.includes(
        "serialized"
      )
    ) {
      score -= 8;
    }


    /*
     * Prefer English where possible.
     */

    if (
      print.lang === "en"
    ) {
      score += 12;
    } else {
      score -= 20;
    }

    return score;
  }


  function preferredPrinting(
    printings
  ) {
    const usable =
      printings.filter(
        print =>
          printingImage(print)
      );

    if (!usable.length) {
      return null;
    }

    return [...usable]
      .sort(
        (a, b) => {
          const scoreDifference =
            preferredPrintingScore(b) -
            preferredPrintingScore(a);

          if (
            scoreDifference !== 0
          ) {
            return scoreDifference;
          }

          const dateDifference =
            String(
              b.released_at || ""
            ).localeCompare(
              String(
                a.released_at || ""
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
      )[0];
  }


  function oldestYear(printings) {
    const years =
      printings
        .map(
          print =>
            String(
              print.released_at ||
              ""
            ).slice(0, 4)
        )
        .filter(
          year =>
            /^\d{4}$/.test(year)
        );

    return years.length
      ? years.sort()[0]
      : null;
  }

  function newestYear(printings) {
    const years =
      printings
        .map(
          print =>
            String(
              print.released_at ||
              ""
            ).slice(0, 4)
        )
        .filter(
          year =>
            /^\d{4}$/.test(year)
        );

    return years.length
      ? years
          .sort()
          .reverse()[0]
      : null;
  }

  function extremePrinting(
    printings,
    rates,
    priceGetter,
    direction = "cheapest"
  ) {
    let winner = null;

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
          !Number.isFinite(price) ||
          price <= 0
        ) {
          return;
        }

        const better =
          direction ===
          "most-expensive"
            ? price > winnerPrice
            : price < winnerPrice;

        if (better) {
          winner = print;
          winnerPrice = price;
        }
      }
    );

    return winner
      ? {
          print: winner,
          price: winnerPrice
        }
      : null;
  }


  /* ------------------------------
     MANASCOUT SNAPSHOT
     ------------------------------ */

  function getSnapshotData(
    printings,
    rates
  ) {
    const oldest =
      oldestYear(printings);

    const newest =
      newestYear(printings);

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

    const cheapest =
      extremePrinting(
        printings,
        rates,
        regularGbpValue,
        "cheapest"
      );

    const mostExpensive =
      extremePrinting(
        printings,
        rates,
        regularGbpValue,
        "most-expensive"
      );

    const cheapestFoil =
      extremePrinting(
        printings,
        rates,
        foilGbpValue,
        "cheapest"
      );

    const mostExpensiveFoil =
      extremePrinting(
        printings,
        rates,
        foilGbpValue,
        "most-expensive"
      );

    return {
      oldest,
      newest,
      foilPrintings,
      etchedPrintings,
      cheapest,
      mostExpensive,
      cheapestFoil,
      mostExpensiveFoil
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
          ${escapeHtml(value)}
        </strong>

        <span>
          ${escapeHtml(label)}
        </span>
      </button>
    `;
  }

  function buildSnapshot(
    printings,
    rates
  ) {
    if (
      !Array.isArray(printings) ||
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

            <h3>At a glance</h3>
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
            action: "all",
            value:
              printings.length,
            label: "Printings"
          })}

          ${snapshotButton({
            action: "cheapest",
            value:
              data.cheapest
                ? `£${data.cheapest.price.toFixed(2)}`
                : "—",
            label: "Cheapest",
            disabled:
              !data.cheapest
          })}

          ${snapshotButton({
            action:
              "most-expensive",
            value:
              data.mostExpensive
                ? `£${data.mostExpensive.price.toFixed(2)}`
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
                ? `£${data.cheapestFoil.price.toFixed(2)}`
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
                ? `£${data.mostExpensiveFoil.price.toFixed(2)}`
                : "—",
            label:
              "Most expensive foil",
            disabled:
              !data.mostExpensiveFoil
          })}

          ${snapshotButton({
            action: "oldest",
            value:
              data.oldest || "—",
            label: "Oldest",
            disabled:
              !data.oldest
          })}

          ${snapshotButton({
            action: "newest",
            value:
              data.newest || "—",
            label: "Newest",
            disabled:
              !data.newest
          })}

          ${snapshotButton({
            action: "foil",
            value:
              data.foilPrintings.length,
            label:
              "Foil versions",
            disabled:
              !data.foilPrintings.length
          })}

          ${snapshotButton({
            action: "etched",
            value:
              data.etchedPrintings.length,
            label:
              "Etched versions",
            disabled:
              !data.etchedPrintings.length
          })}

        </div>

        <p class="snapshot-note">
          Tap a Snapshot tile to explore matching printings. Prices are approximate GBP conversions from available Scryfall price data.
        </p>

      </section>
    `;
  }


  /* ------------------------------
     API
     ------------------------------ */

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
            "Accept":
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
        error.status !== 404
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


  /* ------------------------------
     PRINTINGS
     ------------------------------ */

  async function renderPrintings(
    card,
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
        card.prints_search_uri
      );

    if (!uri) {
      els.status.textContent =
        "Printing information is not available for this card.";

      return;
    }

    els.status.textContent =
      "Loading printings…";

    const all = [];

    let next = uri;
    let pages = 0;

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
          token !== searchToken
        ) {
          return;
        }

        if (
          Array.isArray(
            page.data
          )
        ) {
          all.push(
            ...page.data
          );
        }

        next =
          safeUrl(
            page.next_page ||
            ""
          );

        pages += 1;
      }
    } catch (error) {
      if (
        error.name ===
        "AbortError"
      ) {
        return;
      }

      els.status.textContent =
        all.length
          ? `Showing ${all.length} printings. Some additional results could not be loaded.`
          : "Printing data could not be loaded.";

      if (!all.length) {
        return;
      }
    }

    all.sort(
      (a, b) =>
        String(
          b.released_at || ""
        ).localeCompare(
          String(
            a.released_at || ""
          )
        )
    );


    /*
     * NORMAL / NON-EXACT SEARCH:
     *
     * If no valid exact printing was resolved,
     * ManaScout chooses its preferred visual
     * printing from the complete printings list.
     *
     * This now works for:
     * - typed searches
     * - autocomplete
     * - Try links
     * - initial ?q= links
     * - permanent card pages
     * - stale/invalid printing IDs
     *
     * A valid exact printing supplied by
     * Featured, COTW, Discover or the URL
     * bypasses this block.
     */

    if (
      options.choosePreferred
    ) {
      const preferred =
        preferredPrinting(all);

      if (preferred) {
        card = preferred;

        renderCard(card);

        /*
         * Preserve the current page structure
         * while storing the chosen exact printing.
         */

        replacePreferredPrintingInUrl(
          card
        );
      }
    }


    let rates = null;

    try {
      rates =
        await getFxRates();
    } catch (error) {
      console.warn(
        "GBP conversion unavailable",
        error
      );
    }

    els.status.textContent =
      rates
        ? `${all.length} printing${all.length === 1 ? "" : "s"} found · GBP estimates`
        : `${all.length} printing${all.length === 1 ? "" : "s"} found`;

    const snapshotData =
      getSnapshotData(
        all,
        rates
      );


    /* BUILD PRINTING ROWS */

    const buildRows =
      printings =>
        printings
          .map(
            print => `
              <tr
                ${
                  print.id === card.id
                    ? 'class="is-selected-printing"'
                    : ""
                }
              >

                <td class="printing-image-cell">
                  ${
                    printingImage(print)
                      ? `
                        <button
                          class="printing-select-button printing-image-button"
                          type="button"
                          data-print-id="${escapeHtml(
                            print.id || ""
                          )}"
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
                            )} printing"
                            loading="lazy"
                          >
                        </button>
                      `
                      : "—"
                  }
                </td>

                <td>
                  <button
                    class="printing-select-button printing-name-button"
                    type="button"
                    data-print-id="${escapeHtml(
                      print.id || ""
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
                      (
                        print.set || ""
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
                    finishText(print)
                  )}
                </td>

                <td>
                  ${priceCell(
                    print.prices?.eur
                      ? convertToGbp(
                          print.prices.eur,
                          rates?.eurToGbp
                        )
                      : convertToGbp(
                          print.prices?.usd,
                          rates?.usdToGbp
                        ),
                    "£"
                  )}
                </td>

                <td>
                  ${priceCell(
                    print.prices?.eur_foil
                      ? convertToGbp(
                          print.prices.eur_foil,
                          rates?.eurToGbp
                        )
                      : convertToGbp(
                          print.prices?.usd_foil,
                          rates?.usdToGbp
                        ),
                    "£"
                  )}
                </td>

                <td>
                  ${priceCell(
                    convertToGbp(
                      print.prices?.usd_etched,
                      rates?.usdToGbp
                    ),
                    "£"
                  )}
                </td>

              </tr>
            `
          )
          .join("");


    /* FILTERS */

    const showFilters =
      all.length >= 8;

    const filterControls =
      showFilters
        ? `
          <div class="printing-controls">

            <label>
              Finish

              <select id="printing-finish-filter">
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
              </select>
            </label>

          </div>
        `
        : "";

    const snapshot =
      buildSnapshot(
        all,
        rates
      );


    /* RENDER SNAPSHOT + PRINTINGS */

    els.printings.innerHTML = `
      ${snapshot}
      ${filterControls}

      <div class="table-wrap">

        <table class="printings-table">

          <thead>
            <tr>
              <th>Card</th>
              <th>Set</th>
              <th>Released</th>
              <th>Collector #</th>
              <th>Rarity</th>
              <th>Finishes</th>
              <th>Price</th>
              <th>Foil</th>
              <th>Etched</th>
            </tr>
          </thead>

          <tbody>
            ${
              buildRows(all) ||
              '<tr><td colspan="9">No printings returned.</td></tr>'
            }
          </tbody>

        </table>

      </div>
    `;


    /* INTERACTIVE TABLE STATE */

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

    let snapshotMode =
      "all";


    function snapshotResults() {
      if (
        snapshotMode ===
        "cheapest"
      ) {
        return snapshotData.cheapest
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
              snapshotData.oldest ||
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
              snapshotData.newest ||
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

      return [...all];
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
          rates
            ? `${all.length} printing${all.length === 1 ? "" : "s"} found · GBP estimates`
            : `${all.length} printing${all.length === 1 ? "" : "s"} found`;

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
          labels[snapshotMode] ||
          "printing"
        } shown`;
    }


    function updatePrintings() {
      let displayed =
        snapshotResults();

      const finish =
        finishFilter?.value ||
        "all";

      const sort =
        sortSelect?.value ||
        "newest";


      if (finish !== "all") {
        displayed =
          displayed.filter(
            print =>
              hasFinish(
                print,
                finish
              )
          );
      }


      displayed.sort(
        (a, b) => {
          if (
            sort === "oldest"
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

            return (
              sort ===
              "price-asc"
                ? aPrice -
                  bPrice
                : bPrice -
                  aPrice
            );
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


      tbody.innerHTML =
        buildRows(displayed) ||
        '<tr><td colspan="9">No printings match these filters.</td></tr>';

      updateActiveSnapshotButton();
      updateStatus(displayed);
    }


    /* EXISTING FILTER + SORT BEHAVIOUR */

    if (finishFilter) {
      finishFilter.addEventListener(
        "change",
        updatePrintings
      );
    }

    if (sortSelect) {
      sortSelect.addEventListener(
        "change",
        updatePrintings
      );
    }


    /* SNAPSHOT BEHAVIOUR */

    const initialAllButton =
      els.printings
        .querySelector(
          '[data-snapshot-action="all"]'
        );

    if (initialAllButton) {
      initialAllButton
        .classList
        .add("is-active");

      initialAllButton
        .setAttribute(
          "aria-pressed",
          "true"
        );
    }


    els.printings.addEventListener(
      "click",
      event => {
        const snapshotTrigger =
          event.target.closest(
            "[data-snapshot-action]"
          );

        if (!snapshotTrigger) {
          return;
        }

        if (
          snapshotTrigger.disabled
        ) {
          return;
        }

        snapshotMode =
          snapshotTrigger.dataset
            .snapshotAction ||
          "all";


        if (finishFilter) {
          finishFilter.value =
            "all";
        }

        updatePrintings();


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

        if (exactPrinting) {
          renderCard(
            exactPrinting
          );

          setQuery(
            exactPrinting.name,
            true,
            exactPrinting.id
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
          matches.length === 1
        ) {
          renderCard(
            matches[0]
          );

          setQuery(
            matches[0].name,
            true,
            matches[0].id
          );
        }


        const tableWrap =
          els.printings
            .querySelector(
              ".table-wrap"
            );

        if (tableWrap) {
          tableWrap.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      }
    );


    /* SELECT EXACT PRINTING */

    els.printings.addEventListener(
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

        renderCard(selected);

        setQuery(
          selected.name,
          true,
          selected.id
        );

        if (els.details) {
          els.details.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      }
    );
  }


  /* ------------------------------
     LOAD CARD
     ------------------------------ */

  async function loadCard(
    name,
    options = {}
  ) {
    const query =
      String(
        name || ""
      ).trim();

    if (!query) {
      return;
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


    if (searchController) {
      searchController.abort();
    }

    if (
      autocompleteController
    ) {
      autocompleteController.abort();
    }


    searchController =
      new AbortController();


    if (!options.fromHistory) {
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
    setLoading();


    try {
      let card;

      /*
       * IMPORTANT:
       *
       * This tracks whether the requested exact
       * printing genuinely resolved to the card
       * being requested.
       *
       * Previously the code only checked whether
       * a printing ID STRING existed and whether
       * fromHistory was true. That prevented the
       * preferred-printing system from running on
       * Try links, permanent pages and initial
       * ?q= searches.
       */

      let exactPrintingResolved =
        false;


      if (requestedPrintingId) {
        try {
          card =
            await cardById(
              requestedPrintingId,
              searchController.signal
            );

          /*
           * Guard against a stale or incorrect
           * printing ID.
           */

          if (
            !card?.name ||
            card.name.toLowerCase() !==
              query.toLowerCase()
          ) {
            card =
              await namedCard(
                query,
                searchController.signal
              );
          } else {
            /*
             * The exact requested printing is
             * valid. It must NOT be replaced by
             * ManaScout's automatic preference.
             */

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

          /*
           * Invalid/stale printing ID:
           * recover the named card and allow
           * preferred-printing selection below.
           */

          card =
            await namedCard(
              query,
              searchController.signal
            );
        }
      } else {
        card =
          await namedCard(
            query,
            searchController.signal
          );
      }


      if (
        token !== searchToken
      ) {
        return;
      }


      /*
       * Show the initial result immediately.
       *
       * If this was not a valid exact-printing
       * request, renderPrintings() will replace
       * it with ManaScout's preferred visual
       * printing after all printings have loaded.
       */

      renderCard(card);


      await renderPrintings(
        card,
        token,
        searchController.signal,
        {
          choosePreferred:
            !exactPrintingResolved
        }
      );

    } catch (error) {
      if (
        error.name ===
          "AbortError" ||
        token !== searchToken
      ) {
        return;
      }

      setError(
        error.status === 404
          ? `No card matched “${query}”. Try the card's full name.`
          : "Scryfall could not be reached. Please try again."
      );
    }
  }


  /* ------------------------------
     AUTOCOMPLETE
     ------------------------------ */

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

    activeAutocompleteIndex =
      -1;
  }

  function autocompleteItems() {
    if (!els.autocomplete) {
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

    if (!items.length) {
      return;
    }

    if (index < 0) {
      index =
        items.length - 1;
    }

    if (
      index >= items.length
    ) {
      index = 0;
    }

    activeAutocompleteIndex =
      index;

    items.forEach(
      (item, i) => {
        item.setAttribute(
          "aria-selected",
          i === index
            ? "true"
            : "false"
        );
      }
    );

    items[index]
      .scrollIntoView({
        block: "nearest"
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

    if (!names.length) {
      clearAutocomplete();
      return;
    }

    els.autocomplete.innerHTML =
      names
        .map(
          name => `
            <button
              class="autocomplete-item"
              type="button"
              role="option"
              aria-selected="false"
              data-name="${escapeHtml(
                name
              )}"
            >
              <span>
                ${escapeHtml(name)}
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
    if (
      autocompleteController
    ) {
      autocompleteController.abort();
    }

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
          autocompleteController.signal
        );

      renderAutocomplete(
        Array.isArray(data.data)
          ? data.data.slice(0, 8)
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


  /* ------------------------------
     SEARCH EVENTS
     ------------------------------ */

  if (
    els.form &&
    els.input
  ) {
    els.form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const value =
          els.input.value.trim();

        if (value) {
          loadCard(value);
        }
      }
    );


    els.input.addEventListener(
      "input",
      () => {
        const query =
          els.input.value.trim();

        clearTimeout(
          autocompleteTimer
        );

        if (
          query.length < 2
        ) {
          clearAutocomplete();
          return;
        }

        autocompleteTimer =
          setTimeout(
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


  if (els.autocomplete) {
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


  /* ------------------------------
     BROWSER HISTORY
     ------------------------------ */

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
            fromHistory: true,
            printingId
          }
        );
      } else if (els.details) {
        if (els.input) {
          els.input.value = "";
        }

        els.details.innerHTML = `
          <div class="empty-state">
            <div class="empty-mark">
              ◇
            </div>

            <h2>
              Search any MTG card
            </h2>

            <p>
              Explore artwork, finishes, printings and available Scryfall price data.
            </p>
          </div>
        `;

        if (els.status) {
          els.status.textContent =
            "";
        }

        if (els.printings) {
          els.printings.innerHTML =
            "";
        }
      }
    }
  );


  /* ------------------------------
     PUBLIC API + INITIAL SEARCH
     ------------------------------ */

  window.ManaScout =
    Object.freeze({
      loadCard
    });


  const initial =
    getQueryName();

  const initialPrintingId =
    getPrintingId();


  if (initial) {
    loadCard(
      initial,
      {
        fromHistory: true,
        printingId:
          initialPrintingId
      }
    );
  }

})();
