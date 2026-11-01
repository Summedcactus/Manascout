
/*
 * ManaScout — Homepage Controller
 * Complete replacement:
 * /assets/js/scoutboard.js
 *
 * Designed for the new homepage:
 * - No roulette
 * - No tabs
 * - 12 rotating featured cards
 * - Discover a Card
 * - Minas Morgul Card of the Week
 * - Weekly archive
 * - Accessible reduced-motion support
 *
 * The main card search remains in app.js.
 */

(() => {
  "use strict";

  const API = "https://api.scryfall.com";

  const root =
    document.getElementById("scoutboard");

  const results =
    document.querySelector(".printings-section");

  const editorial =
    document.querySelector(".home-editorial");

  const discover =
    document.getElementById("discover-card-button");

  const weekly =
    document.getElementById("card-of-the-week");

  const weeklyImage =
    document.getElementById("card-week-image");

  const weeklyPrinting =
    document.getElementById("card-week-printing");

  const weeklyLink =
    document.getElementById("card-week-link");

  const weeklyShell =
    document.getElementById("weekly-card-shell");

  const featureElements = [
    ...document.querySelectorAll(
      "[data-feature-card]"
    )
  ];

  const reduceMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

  const finePointer =
    window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    );

  const cache = new Map();


  /* ========================================
     HELPERS
     ======================================== */

  const pause = ms =>
    new Promise(resolve =>
      window.setTimeout(resolve, ms)
    );


  const cardImage = card => (
    card?.image_uris?.normal ||
    card?.image_uris?.large ||
    card?.card_faces?.[0]?.image_uris?.normal ||
    card?.card_faces?.[0]?.image_uris?.large ||
    ""
  );


  const guideSlug = name =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");


  const queryHref = name =>
    `/?q=${encodeURIComponent(name)}`;


  async function getJson(url) {
    if (cache.has(url)) {
      return cache.get(url);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Scryfall request failed (${response.status})`
      );
    }

    const data = await response.json();

    cache.set(url, data);

    return data;
  }


  /* ========================================
     HOMEPAGE / SEARCH STATE
     ======================================== */

  function showState(state) {
    const home = state === "home";

    if (root) {
      root.hidden = !home;
    }

    if (editorial) {
      editorial.hidden = !home;
    }

    if (results) {
      results.hidden = state !== "card";
    }
  }


  window.addEventListener(
    "manascout:statechange",
    event => {
      const state = event?.detail?.state;

      if (
        ["home", "loading", "card"].includes(state)
      ) {
        showState(state);
      }
    }
  );


  const initialQuery =
    new URLSearchParams(
      window.location.search
    ).get("q");

  showState(
    initialQuery?.trim()
      ? "loading"
      : "home"
  );


  /* ========================================
     DISCOVER A CARD
     ======================================== */

  if (discover) {
    const defaultContent = discover.innerHTML;

    discover.addEventListener(
      "click",
      async () => {
        if (discover.disabled) {
          return;
        }

        discover.disabled = true;
        discover.textContent = "Scouting a card…";

        try {
          if (
            typeof window.ManaScout?.scoutRandom !==
            "function"
          ) {
            throw new Error(
              "ManaScout search is unavailable."
            );
          }

          await window.ManaScout.scoutRandom();

          document
            .getElementById(
              "card-details-section"
            )
            ?.scrollIntoView({
              behavior: reduceMotion.matches
                ? "auto"
                : "smooth",
              block: "start"
            });

        } catch (error) {
          console.warn(
            "Discover a Card:",
            error
          );

          discover.textContent =
            "Could not scout — try again";

          await pause(1100);

        } finally {
          discover.disabled = false;
          discover.innerHTML = defaultContent;
        }
      }
    );
  }


  /* ========================================
     FEATURED CARD CATALOGUE
     ======================================== */

  const featured = [
    {
      name: "Rhystic Study",
      tag: "CARD ADVANTAGE",
      preference: "premium",
      description:
        "From Prophecy to Enchanting Tales, compare the iconic blue enchantment's many treatments."
    },
    {
      name: "Sol Ring",
      tag: "COMMANDER ICON",
      preference: "alternate",
      description:
        "Discover decades of art, special frames and collector versions of a Commander staple."
    },
    {
      name: "The One Ring",
      tag: "COLLECTOR FAVOURITE",
      preference: "premium",
      description:
        "Explore the different Lord of the Rings frames and collector-focused printings."
    },
    {
      name: "Force of Will",
      tag: "BLUE ICON",
      preference: "premium",
      description:
        "Compare the Alliances original with striking modern alternate artwork."
    },
    {
      name: "Demonic Tutor",
      tag: "BLACK TUTOR",
      preference: "premium",
      description:
        "A legendary black tutor with numerous iconic and premium versions."
    },
    {
      name: "Mystic Remora",
      tag: "CARD DRAW",
      preference: "alternate",
      description:
        "Explore the art and printing history of this Commander favourite."
    },
    {
      name: "Ancient Tomb",
      tag: "FAST MANA",
      preference: "premium",
      description:
        "A powerful land with distinctive special and borderless printings."
    },
    {
      name: "Smothering Tithe",
      tag: "WHITE STAPLE",
      preference: "premium",
      description:
        "Trace its original printing and rich collection of showcase designs."
    },
    {
      name: "Cyclonic Rift",
      tag: "BLUE STAPLE",
      preference: "alternate",
      description:
        "Discover the notorious board-reset spell across its different releases."
    },
    {
      name: "Swords to Plowshares",
      tag: "WHITE REMOVAL",
      preference: "alternate",
      description:
        "An enduring Magic classic with decades of alternate card artwork."
    },
    {
      name: "Vampiric Tutor",
      tag: "BLACK TUTOR",
      preference: "premium",
      description:
        "Explore printings of one of Magic's best-known instant-speed tutors."
    },
    {
      name: "Mana Drain",
      tag: "COUNTERSPELL ICON",
      preference: "premium",
      description:
        "From an early Magic rarity to modern premium collector treatments."
    }
  ];


  /* ========================================
     PRINTING SELECTION
     ======================================== */

  function scorePrinting(card, preference) {
    if (
      card.digital ||
      !cardImage(card)
    ) {
      return -9999;
    }

    const effects = card.frame_effects || [];
    const finishes = card.finishes || [];

    let score = 0;

    if (effects.includes("showcase")) {
      score += 95;
    }

    if (card.border_color === "borderless") {
      score += 90;
    }

    if (card.full_art) {
      score += 80;
    }

    if (effects.includes("extendedart")) {
      score += 70;
    }

    if (finishes.includes("etched")) {
      score += 25;
    }

    if (finishes.includes("foil")) {
      score += 12;
    }

    if (
      preference === "premium" &&
      card.promo
    ) {
      score += 12;
    }

    if (
      preference === "alternate" &&
      card.border_color === "borderless"
    ) {
      score += 10;
    }

    const release = Date.parse(
      card.released_at || ""
    );

    if (Number.isFinite(release)) {
      score += release / 1e13;
    }

    return score;
  }


  async function artFor(name, preference) {
    const search = encodeURIComponent(
      `!"${name}" game:paper`
    );

    const url =
      `${API}/cards/search?q=${search}` +
      "&unique=prints" +
      "&order=released" +
      "&dir=desc" +
      "&include_extras=true";

    const data = await getJson(url);

    const cards = Array.isArray(data.data)
      ? data.data
      : [];

    return cards
      .filter(card =>
        cardImage(card) &&
        !card.digital
      )
      .sort((a, b) =>
        scorePrinting(b, preference) -
        scorePrinting(a, preference)
      )[0] || null;
  }


  /* ========================================
     RENDER FEATURED PRINTINGS
     ======================================== */

  let featureGeneration = 0;


  async function paintFeatures(page) {
    const generation = ++featureGeneration;

    for (
      let i = 0;
      i < featureElements.length;
      i++
    ) {
      const element = featureElements[i];

      const item = featured[
        (page * featureElements.length + i) %
        featured.length
      ];

      if (!item) {
        continue;
      }

      element.dataset.featureCard = item.name;

      element.dataset.featurePreference =
        item.preference;

      element
        .querySelector("small")
        ?.replaceChildren(
          document.createTextNode(item.tag)
        );

      element
        .querySelector("h4")
        ?.replaceChildren(
          document.createTextNode(item.name)
        );

      element
        .querySelector(
          ".scoutboard-feature-copy p"
        )
        ?.replaceChildren(
          document.createTextNode(
            item.description
          )
        );

      const anchor =
        element.querySelector(
          ".scoutboard-feature-link"
        );

      if (anchor) {
        anchor.href =
          `/card/${guideSlug(item.name)}/`;

        anchor.innerHTML =
          'Scout the printings ' +
          '<span aria-hidden="true">→</span>';
      }

      const artwork =
        element.querySelector(
          ".scoutboard-feature-art"
        );

      if (artwork) {
        artwork.innerHTML =
          '<div class="scoutboard-feature-placeholder">◇</div>';
      }

      try {
        const card = await artFor(
          item.name,
          item.preference
        );

        if (generation !== featureGeneration) {
          return;
        }

        if (card && artwork) {
          const img =
            document.createElement("img");

          img.src = cardImage(card);

          img.alt =
            `${item.name} — ` +
            `${card.set_name || "Magic printing"}, ` +
            `#${card.collector_number || "?"}`;

          img.loading = "lazy";
          img.decoding = "async";

          img.width = 488;
          img.height = 680;

          artwork.replaceChildren(img);

          if (anchor && card.id) {
            anchor.href =
              `/card/${guideSlug(item.name)}/` +
              `?printing=${encodeURIComponent(card.id)}`;
          }
        }

      } catch (error) {
        console.warn(
          `Featured printing unavailable: ${item.name}`,
          error
        );
      }

      await pause(125);
    }
  }


  /* ========================================
     FEATURED CARD ROTATION
     ======================================== */

  if (featureElements.length) {
    let page = 0;

    const grid = document.querySelector(
      ".scoutboard-feature-grid"
    );

    if (grid) {
      const more =
        document.createElement("button");

      more.type = "button";

      more.textContent =
        "Explore four more cards ↻";

      more.className =
        "scoutboard-heading-link";

      more.style.cssText =
        "display:block;" +
        "max-width:max-content;" +
        "margin:1.35rem auto 0;" +
        "padding:.7rem 1rem;" +
        "background:transparent;" +
        "border:1px solid rgba(255,255,255,.18);" +
        "border-radius:8px;" +
        "cursor:pointer;" +
        "font:inherit;" +
        "color:inherit;";

      more.setAttribute(
        "aria-label",
        "Show four more featured Magic cards"
      );

      grid.insertAdjacentElement(
        "afterend",
        more
      );

      more.addEventListener(
        "click",
        () => {
          page =
            (page + 1) %
            Math.ceil(
              featured.length /
              featureElements.length
            );

          void paintFeatures(page);
        }
      );
    }

    if (!initialQuery?.trim()) {
      void paintFeatures(page);
    }

    window.addEventListener(
      "manascout:statechange",
      event => {
        if (
          event?.detail?.state === "home" &&
          featureGeneration === 0
        ) {
          void paintFeatures(page);
        }
      }
    );
  }


  /* ========================================
     CARD OF THE WEEK — MINAS MORGUL
     ========================================

     Actual card: Cabal Coffers
     Display name: Minas Morgul
     Set: LTC
     Collector number: 390
     Treatment: Surge foil

     Do not substitute #390z, which is
     the serialized printing.

     The HTML contains the story and
     animated shadow/foil effects.
  */

  async function loadWeekly() {
    if (!weekly) {
      return;
    }

    const set =
      weekly.dataset.weeklySet || "ltc";

    const number =
      weekly.dataset.weeklyNumber || "390";

    try {
      const card = await getJson(
        `${API}/cards/` +
        `${encodeURIComponent(set)}/` +
        `${encodeURIComponent(number)}`
      );

      const url = cardImage(card);

      if (weeklyImage && url) {
        weeklyImage.src = url;

        weeklyImage.alt =
          "Minas Morgul (Cabal Coffers) — " +
          `${card.set_name}, ` +
          `surge foil #${card.collector_number}`;
      }

      if (weeklyPrinting) {
        weeklyPrinting.textContent =
          (
            `${card.set_name || "Tales of Middle-earth Commander"}` +
            ` · #${card.collector_number || number}`
          ).toUpperCase();
      }

      if (weeklyLink && card.id) {
        const params = new URLSearchParams({
          q: card.name || "Cabal Coffers",
          printing: card.id
        });

        weeklyLink.href = `/?${params}`;
      }

    } catch (error) {
      console.warn(
        "Card of the Week lookup unavailable:",
        error
      );
    }
  }


  void loadWeekly();


  /* ========================================
     CARD OF THE WEEK ARCHIVE
     ======================================== */

  const archiveData =
    document.getElementById(
      "card-week-archive-data"
    );

  if (archiveData) {
    try {
      const parsed = JSON.parse(
        archiveData.textContent
      );

      const entries =
        Array.isArray(parsed.entries)
          ? parsed.entries.filter(
              item => item.status === "archived"
            )
          : [];

      if (entries.length) {
        const section =
          document.getElementById(
            "scoutboard-panel-weekly"
          );

        const wrap =
          document.createElement("div");

        wrap.style.cssText =
          "margin:1.6rem 0 0;" +
          "padding:1rem 0 0;" +
          "border-top:1px solid rgba(255,255,255,.09);";

        const heading =
          document.createElement("h4");

        heading.textContent =
          "Previous Cards of the Week";

        heading.style.cssText =
          "font-size:1rem;" +
          "margin:0 0 .8rem;";

        wrap.appendChild(heading);

        const links =
          document.createElement("div");

        links.style.cssText =
          "display:flex;" +
          "flex-wrap:wrap;" +
          "gap:.6rem;";

        entries
          .sort((a, b) => b.week - a.week)
          .forEach(entry => {
            const a =
              document.createElement("a");

            a.href = queryHref(
              entry.card
            );

            a.textContent =
              `Week ${String(entry.week).padStart(3, "0")}` +
              ` · ${entry.card}`;

            a.style.cssText =
              "display:inline-block;" +
              "padding:.6rem .75rem;" +
              "border:1px solid rgba(255,255,255,.1);" +
              "border-radius:7px;" +
              "color:#d7d6d5;" +
              "text-decoration:none;" +
              "font-size:.72rem;";

            a.title =
              `${entry.set || "Magic printing"}` +
              ` #${entry.collectorNumber || ""}`;

            links.appendChild(a);
          });

        wrap.appendChild(links);

        section?.appendChild(wrap);
      }

    } catch (error) {
      console.warn(
        "Weekly archive could not be read:",
        error
      );
    }
  }


  /* ========================================
     CARD PARALLAX
     ======================================== */

  if (
    weekly &&
    weeklyShell &&
    finePointer.matches &&
    !reduceMotion.matches
  ) {
    weeklyShell.addEventListener(
      "pointermove",
      event => {
        const rect =
          weeklyShell.getBoundingClientRect();

        if (!rect.width || !rect.height) {
          return;
        }

        const x = Math.max(
          0,
          Math.min(
            100,
            (event.clientX - rect.left) /
            rect.width * 100
          )
        );

        const y = Math.max(
          0,
          Math.min(
            100,
            (event.clientY - rect.top) /
            rect.height * 100
          )
        );

        weekly.style.setProperty(
          "--weekly-x",
          `${x}%`
        );

        weekly.style.setProperty(
          "--weekly-y",
          `${y}%`
        );

        weekly.style.setProperty(
          "--weekly-rx",
          `${(50 - y) * .045}deg`
        );

        weekly.style.setProperty(
          "--weekly-ry",
          `${(x - 50) * .05}deg`
        );
      },
      { passive: true }
    );

    weeklyShell.addEventListener(
      "pointerleave",
      () => {
        weekly.style.setProperty(
          "--weekly-x",
          "50%"
        );

        weekly.style.setProperty(
          "--weekly-y",
          "42%"
        );

        weekly.style.setProperty(
          "--weekly-rx",
          "0deg"
        );

        weekly.style.setProperty(
          "--weekly-ry",
          "0deg"
        );
      }
    );
  }


  /* ========================================
     END

     Old tab switching, roulette controls
     and retired floating dock behaviour
     are intentionally excluded.

     Main card search, printings and
     filtering remain in app.js.
     ======================================== */

})();
