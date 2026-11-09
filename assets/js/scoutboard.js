
/*
 * ManaScout — Homepage Controller
 * File: assets/js/scoutboard.js
 * Branch: DEVELOPMENT
 *
 * Complete replacement based on the DEVELOPMENT homepage.
 *
 * - Preserve the 12 rotating featured cards
 * - Search paginated Scryfall printings for featured art
 * - Preserve exact printing IDs in featured links
 * - Resolve exact printings for archived Cards of the Week
 * - Verify Ulamog MH3 #383 concept traditional foil (not #383z)
 * - Preserve Discover a Card
 * - Preserve pointer-based card atmosphere
 * - No roulette, tabs or floating dock
 *
 * Card search and printing tables belong to app.js.
 */

(() => {
  "use strict";

  const API = "https://api.scryfall.com";

  const $ = id =>
    document.getElementById(id);

  const root = $("scoutboard");

  const cardSection =
    $("card-details-section");

  const results =
    document.querySelector(
      ".printings-section"
    );

  const editorial =
    document.querySelector(
      ".home-editorial"
    );

  const discover =
    $("discover-card-button");

  const weekly =
    $("card-of-the-week");

  const weeklyImage =
    $("card-week-image");

  const weeklyPrinting =
    $("card-week-printing");

  const weeklyLink =
    $("card-week-link");

  const weeklyShell =
    $("weekly-card-shell");

  const featureElements = [
    ...document.querySelectorAll(
      "[data-feature-card]"
    )
  ];

  const reducedMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

  const finePointer =
    window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    );

  const cache = new Map();


  /* ========================================
     BASIC HELPERS
     ======================================== */

  const pause = ms =>
    new Promise(resolve =>
      setTimeout(resolve, ms)
    );

  const norm = value =>
    String(value || "")
      .trim()
      .toLowerCase();

  const guideSlug = name =>
    norm(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");


  function safeUrl(value) {
    try {
      const parsed = new URL(value);

      return /^https?:$/.test(
        parsed.protocol
      )
        ? parsed.href
        : "";

    } catch {
      return "";
    }
  }


  function cardImage(card) {
    return safeUrl(
      card?.image_uris?.normal ||
      card?.image_uris?.large ||
      card?.card_faces?.[0]?.image_uris?.normal ||
      card?.card_faces?.[0]?.image_uris?.large ||
      ""
    );
  }


  /* ========================================
     EXACT PRINTING LINKS
     ======================================== */

  function linkToCard(
    name,
    card = null,
    guide = false
  ) {
    const target = guide
      ? `/card/${guideSlug(name)}/`
      : "/";

    const query =
      new URLSearchParams();

    if (!guide) {
      query.set("q", name);
    }

    if (card?.id) {
      query.set(
        "printing",
        card.id
      );
    }

    if (
      card?.finishes?.includes("foil")
    ) {
      query.set(
        "finish",
        "foil"
      );

    } else if (
      card?.finishes?.includes("etched")
    ) {
      query.set(
        "finish",
        "etched"
      );

    } else if (
      card?.finishes?.includes("nonfoil")
    ) {
      query.set(
        "finish",
        "nonfoil"
      );
    }

    return target +
      (
        query.size
          ? `?${query.toString()}`
          : ""
      );
  }


  /* ========================================
     SCRYFALL NETWORK + CACHE
     ======================================== */

  async function getJson(url, timeout = 12000) {
    const key =
      safeUrl(url);

    const endpoint=key ? new URL(key) : null;
    if (!endpoint || endpoint.username || endpoint.password || endpoint.origin !== API) {
      throw new Error(
        "Invalid Scryfall URL"
      );
    }

    if (
      cache.has(key)
    ) {
      return cache.get(key);
    }

    const request = (async () => {
      const controller = new AbortController();
      let timer;
      const boundary = new Promise((_,reject) => { timer=setTimeout(() => { controller.abort(); reject(new Error("Featured card request timed out.")); },timeout); });
      try {
        const work=(async()=>{
          const response=await fetch(key,{signal:controller.signal,headers:{Accept:"application/json"}});
          if(!response.ok)throw Object.assign(new Error(`Scryfall request failed (${response.status})`),{status:response.status});
          return response.json();
        })();
        return await Promise.race([work,boundary]);
      } finally { clearTimeout(timer); }
    })();

    cache.set(
      key,
      request
    );

    while (cache.size > 64) cache.delete(cache.keys().next().value);
    try {
      return await request;

    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }


  /* ========================================
     HOMEPAGE / RESULT STATES
     ======================================== */

  function showState(state) {
    const home =
      state === "home";

    if (root) {
      root.hidden = !home;
    }

    if (editorial) {
      editorial.hidden = !home;
    }

    if (cardSection) {
      cardSection.hidden = home;
    }

    if (results) {
      results.hidden =
        state !== "card";
    }
  }


  const initialQuery =
    new URLSearchParams(
      window.location.search
    ).get("q");

  showState(
    initialQuery?.trim()
      ? "loading"
      : "home"
  );


  window.addEventListener(
    "manascout:statechange",
    event => {
      const state =
        event?.detail?.state;

      if (
        [
          "home",
          "loading",
          "card"
        ].includes(state)
      ) {
        showState(state);
      }
    }
  );


  /* ========================================
     DISCOVER A CARD
     ======================================== */

  if (discover) {
    const originalLabel =
      discover.innerHTML;

    discover.addEventListener(
      "click",
      async () => {
        if (discover.disabled) {
          return;
        }

        discover.disabled = true;

        discover.textContent =
          "Scouting a card…";

        try {
          if (
            typeof window.ManaScout
              ?.scoutRandom !==
            "function"
          ) {
            throw new Error(
              "The card explorer is unavailable"
            );
          }

          await window.ManaScout
            .scoutRandom();

          cardSection
            ?.scrollIntoView({
              behavior:
                reducedMotion.matches
                  ? "auto"
                  : "smooth",

              block: "start"
            });

        } catch (error) {
          console.warn(
            "Discover a Card failed:",
            error
          );

          discover.textContent =
            "Could not scout — try again";

          await pause(1000);

        } finally {
          discover.disabled = false;

          discover.innerHTML =
            originalLabel;
        }
      }
    );
  }


  /* ========================================
     FEATURED CARD CATALOGUE
     ALL 12 CARDS
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
     FEATURED PRINTING SCORING
     ======================================== */

  function isUsableArt(card) {
    return Boolean(
      card?.id &&
      cardImage(card) &&
      !card.digital &&
      (
        card.games || []
      ).includes("paper") &&
      ![
        "art_series",
        "token",
        "emblem",
        "double_faced_token"
      ].includes(card.layout) &&
      !card.oversized
    );
  }


  function scorePrinting(
    card,
    preference
  ) {
    if (
      !isUsableArt(card)
    ) {
      return -100000;
    }

    const effects =
      card.frame_effects || [];

    const promos =
      card.promo_types || [];

    const finishes =
      card.finishes || [];

    let score =
      card.lang === "en"
        ? 20
        : 0;

    if (
      effects.includes("showcase")
    ) {
      score += 95;
    }

    if (
      card.border_color === "borderless"
    ) {
      score += 90;
    }

    if (
      card.full_art
    ) {
      score += 80;
    }

    if (
      effects.includes("extendedart")
    ) {
      score += 70;
    }

    if (
      effects.includes("inverted")
    ) {
      score += 35;
    }

    if (
      card.textless
    ) {
      score += 30;
    }

    for (
      const [type, bonus] of
      Object.entries({
        textured: 45,
        surgefoil: 42,
        galaxyfoil: 40,
        halofoil: 40,
        confettifoil: 40,
        rainbowfoil: 36,
        stepandcompleat: 34,
        boosterfun: 22
      })
    ) {
      if (
        promos.includes(type)
      ) {
        score += bonus;
      }
    }

    if (
      finishes.includes("etched")
    ) {
      score += 25;
    }

    if (
      finishes.includes("foil")
    ) {
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

    if (
      promos.includes("serialized")
    ) {
      score -= 25;
    }

    return score;
  }


  /* ========================================
     PAGINATED FEATURED ARTWORK
     ======================================== */

  async function artFor(
    name,
    preference
  ) {
    const query =
      new URLSearchParams({
        q:
          `!"${name.replace(/"/g, "")}" game:paper`,

        unique: "prints",

        order: "released",

        dir: "desc",

        include_extras: "true",

        include_multilingual: "true",

        include_variations: "true"
      });

    let next =
      `${API}/cards/search?${query}`;

    const visited =
      new Set();

    let pageCount = 0;

    let best = null;

    let bestScore =
      -Infinity;

    while (
      next &&
      pageCount < 24 &&
      !visited.has(next)
    ) {
      visited.add(next);

      let data;

      try {
        data =
          await getJson(next);

      } catch (error) {
        if (
          pageCount === 0
        ) {
          try {
            const fallback =
              await getJson(
                `${API}/cards/named?exact=${encodeURIComponent(name)}`
              );

            data = {
              data: [fallback]
            };

          } catch {
            throw error;
          }

        } else {
          console.warn(
            `Some featured printings for ${name} were unavailable`,
            error
          );

          break;
        }
      }

      for (
        const card of data.data || []
      ) {
        if (norm(card?.name) !== norm(name)) continue;
        const score =
          scorePrinting(
            card,
            preference
          );

        if (
          score > bestScore ||
          (
            score === bestScore &&
            best &&
            String(
              card.released_at || ""
            ) >
            String(
              best.released_at || ""
            )
          )
        ) {
          best = card;

          bestScore =
            score;
        }
      }

      next =
        data.has_more
          ? safeUrl(data.next_page)
          : "";

      pageCount++;

      if (next) {
        await pause(120);
      }
    }

    return best;
  }


  /* ========================================
     FEATURED CARD ROTATION
     FOUR AT A TIME
     ======================================== */

  let featureGeneration = 0;

  let featurePainted = false;

  let featuredPage = 0;


  function fillText(
    element,
    selector,
    value
  ) {
    const target =
      element.querySelector(
        selector
      );

    if (target) {
      target.textContent =
        value;
    }
  }


  function featureFallback(
    item,
    element
  ) {
    fillText(
      element,
      "small",
      item.tag
    );

    fillText(
      element,
      "h4",
      item.name
    );

    fillText(
      element,
      ".scoutboard-feature-copy p",
      item.description
    );

    const anchor =
      element.querySelector(
        ".scoutboard-feature-link"
      );

    if (anchor) {
      anchor.href =
        linkToCard(
          item.name,
          null,
          true
        );

      anchor.innerHTML =
        'Scout the printings ' +
        '<span aria-hidden="true">→</span>';
    }

    const art =
      element.querySelector(
        ".scoutboard-feature-art"
      );

    if (art) {
      art.innerHTML =
        '<div class="scoutboard-feature-placeholder">◇</div>';
    }
  }


  async function paintFeatures(page) {
    const job =
      ++featureGeneration;

    featurePainted = true;

    const start =
      page * featureElements.length;

    featureElements.forEach(
      (element, index) => {
        const item =
          featured[
            (
              start + index
            ) % featured.length
          ];

        if (!item) {
          return;
        }

        element.dataset.featureCard =
          item.name;

        element.dataset.featurePreference =
          item.preference;

        featureFallback(
          item,
          element
        );
      }
    );

    for (
      let index = 0;
      index < featureElements.length;
      index++
    ) {
      if (
        job !== featureGeneration
      ) {
        return;
      }

      const element =
        featureElements[index];

      const item =
        featured[
          (
            start + index
          ) % featured.length
        ];

      if (!item) {
        continue;
      }

      try {
        const card =
          await artFor(
            item.name,
            item.preference
          );

        if (
          job !== featureGeneration
        ) {
          return;
        }

        if (
          !card ||
          !cardImage(card)
        ) {
          continue;
        }

        const art =
          element.querySelector(
            ".scoutboard-feature-art"
          );

        const anchor =
          element.querySelector(
            ".scoutboard-feature-link"
          );

        if (art) {
          const picture =
            document.createElement(
              "img"
            );

          picture.src =
            cardImage(card);

          picture.alt =
            `${item.name} — ` +
            `${card.set_name || "Magic printing"}, ` +
            `#${card.collector_number || "?"}`;

          picture.loading =
            "lazy";

          picture.decoding =
            "async";

          picture.width = 488;

          picture.height = 680;

          picture.addEventListener(
            "error",
            () => {
              if (
                picture.isConnected
              ) {
                featureFallback(
                  item,
                  element
                );
              }
            },
            {
              once: true
            }
          );

          art.replaceChildren(
            picture
          );
        }

        if (anchor) {
          anchor.href =
            linkToCard(
              item.name,
              card,
              true
            );
        }

      } catch (error) {
        if (
          job !== featureGeneration
        ) {
          return;
        }

        console.warn(
          `Featured printing unavailable: ${item.name}`,
          error
        );
      }

      await pause(125);
    }
  }


  /* ========================================
     ROTATION BUTTON
     ======================================== */

  if (
    featureElements.length
  ) {
    const grid =
      document.querySelector(
        ".scoutboard-feature-grid"
      );

    if (
      grid &&
      featured.length >
        featureElements.length
    ) {
      const more =
        document.createElement(
          "button"
        );

      more.type =
        "button";

      more.textContent =
        `Explore ${featureElements.length} more cards ↻`;

      more.className =
        "scoutboard-heading-link";

      more.setAttribute(
        "aria-label",
        `Show ${featureElements.length} more featured Magic cards`
      );

      grid.insertAdjacentElement(
        "afterend",
        more
      );

      more.addEventListener(
        "click",
        () => {
          featuredPage =
            (
              featuredPage + 1
            ) %
            Math.ceil(
              featured.length /
                featureElements.length
            );

          void paintFeatures(
            featuredPage
          );
        }
      );
    }

    if (
      !initialQuery?.trim()
    ) {
      void paintFeatures(
        featuredPage
      );
    }

    window.addEventListener(
      "manascout:statechange",
      event => {
        if (
          event?.detail?.state === "home" &&
          !featurePainted
        ) {
          void paintFeatures(
            featuredPage
          );
        }
      }
    );
  }


  /* Card of the Week — exact MH3 #383 concept / traditional foil.
     API failures retain the independent static image and catalogue link. */

  async function loadWeekly() {
    if (!weekly) {
      return;
    }

    const set =
      String(
        weekly.dataset.weeklySet ||
        "mh3"
      )
        .trim()
        .toLowerCase();

    const number =
      String(
        weekly.dataset.weeklyNumber ||
        "383"
      ).trim();

    try {
      const card =
        await getJson(
          `${API}/cards/` +
          `${encodeURIComponent(set)}/` +
          `${encodeURIComponent(number)}`
        );

      if (
        norm(card?.set) !== set ||
        String(
          card?.collector_number
        ) !== number
      ) {
        throw new Error(
          "Card of the Week printing mismatch"
        );
      }

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card.id || "") || set !== "mh3" || number !== "383" || card.name !== "Ulamog, the Defiler" || card.artist !== "Vincent Proce" || !card.finishes?.includes("foil") || !card.promo_types?.includes("concept") || card.promo_types?.includes("serialized")) {
        throw new Error("Featured artwork/treatment mismatch; retaining the exact static fallback.");
      }
      if (card.id) weekly.dataset.weeklyPrintingId = card.id;

      const art =
        cardImage(card);

      if (
        weeklyImage &&
        art
      ) {
        if (weeklyImage.src !== art) weekly.dataset.weeklyArtReady = "false";
        weeklyImage.src =
          art;
        weekly.dataset.weeklyArtReady = String(!!(weeklyImage.complete && weeklyImage.naturalWidth));

        weeklyImage.alt =
          `Ulamog, the Defiler — ${card.set_name}, ` +
          `borderless concept traditional foil #${number}, Vincent Proce`;
      }

      if (
        weeklyPrinting
      ) {
        weeklyPrinting.textContent =
          (
            `${card.set_name || "Modern Horizons 3"}` +
            ` · #${number}`
          ).toUpperCase();
      }

      if (
        weeklyLink &&
        card.id
      ) {
        weeklyLink.href =
          linkToCard(
            card.name ||
              "Ulamog, the Defiler",
            card
          );
      }

    } catch (error) {
      /*
       * Keep the static image and exact
       * URL supplied by index.html.
       */
      console.warn(
        "Card of the Week lookup unavailable; static fallback retained:",
        error
      );
    }
  }

  void loadWeekly();


  /* ========================================
     CARD OF THE WEEK ARCHIVE

     Existing homepage entries store
     full set names, not Scryfall set
     codes or card UUIDs.

     Resolve the precise set and
     collector number through Scryfall.

     Never invent a printing ID.
     ======================================== */

  const setCodes = {
    "theros beyond death":
      "thb",

    "wilds of eldraine: enchanting tales":
      "wot",

    "urza's saga":
      "usg",

    "innistrad remastered":
      "inr",

    "secret lair drop":
      "sld",

    "tales of middle-earth commander":
      "ltc"
  };


  function codeFor(entry) {
    const explicit =
      String(
        entry?.setCode ||
        entry?.set_code ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      /^[a-z0-9]{2,8}$/.test(
        explicit
      )
    ) {
      return explicit;
    }

    return (
      setCodes[
        norm(entry?.set)
      ] || ""
    );
  }


  function exactArchivedCard(entry) {
    const code =
      codeFor(entry);

    const number =
      String(
        entry?.collectorNumber ||
        entry?.collector_number ||
        ""
      ).trim();

    if (
      !code ||
      !/^[a-z0-9★]+$/i.test(
        number
      )
    ) {
      return null;
    }

    return {
      code,
      number
    };
  }


  /* ========================================
     RESOLVE AN ARCHIVED PRINTING
     ======================================== */

  async function hydrateArchiveLink(
    link,
    entry
  ) {
    const key =
      exactArchivedCard(
        entry
      );

    if (!key) {
      return;
    }

    try {
      const card =
        await getJson(
          `${API}/cards/` +
          `${encodeURIComponent(key.code)}/` +
          `${encodeURIComponent(key.number)}`
        );

      if (
        norm(card.set) !== key.code ||
        String(
          card.collector_number
        ) !== key.number ||
        norm(card.name) !==
          norm(entry.card)
      ) {
        throw new Error(
          "Archived printing did not match its entry"
        );
      }

      link.href =
        linkToCard(
          entry.card,
          card
        );

      link.title =
        `${card.set_name} · ` +
        `#${card.collector_number} · ` +
        "View exact printing";

      link.dataset.printingResolved =
        "true";

    } catch (error) {
      /*
       * Keep the ordinary card-search
       * fallback rather than linking
       * to an incorrect printing.
       */
      console.warn(
        `Week ${entry.week} exact printing unavailable:`,
        error
      );
    }
  }


  /* ========================================
     BUILD THE ARCHIVE
     ======================================== */

  async function loadArchive() {
    const archiveData =
      $("card-week-archive-data");

    const section =
      $("scoutboard-panel-weekly");

    if (
      !archiveData ||
      !section
    ) {
      return;
    }

    let entries;

    try {
      const parsed =
        JSON.parse(
          archiveData.textContent
        );

      entries =
        Array.isArray(
          parsed.entries
        )
          ? parsed.entries.filter(
              entry =>
                entry?.status ===
                  "archived" &&
                typeof entry.card ===
                  "string" &&
                entry.card.trim()
            )
          : [];

    } catch (error) {
      console.warn(
        "Card of the Week archive JSON unavailable:",
        error
      );

      return;
    }

    if (
      !entries.length ||
      $("ms-weekly-archive")
    ) {
      return;
    }

    entries.sort(
      (a, b) =>
        Number(b.week) -
        Number(a.week)
    );

    const wrap =
      document.createElement(
        "div"
      );

    wrap.id =
      "ms-weekly-archive";

    wrap.style.cssText =
      "margin:1.6rem 0 0;" +
      "padding:1rem 0 0;" +
      "border-top:1px solid rgba(255,255,255,.09);";

    const heading =
      document.createElement(
        "h4"
      );

    heading.textContent =
      "Previous Cards of the Week";

    heading.style.cssText =
      "font-size:1rem;" +
      "margin:0 0 .8rem;";

    wrap.appendChild(
      heading
    );

    const links =
      document.createElement(
        "nav"
      );

    links.setAttribute(
      "aria-label",
      "Previous Cards of the Week"
    );

    links.style.cssText =
      "display:flex;" +
      "flex-wrap:wrap;" +
      "gap:.6rem;";

    const jobs = [];

    for (
      const entry of entries
    ) {
      const link =
        document.createElement(
          "a"
        );

      link.href =
        linkToCard(
          entry.card
        );

      link.textContent =
        `Week ${String(entry.week).padStart(3, "0")}` +
        ` · ${entry.card}`;

      link.title =
        `${entry.set || "Magic printing"}` +
        ` #${entry.collectorNumber || ""}`;

      link.style.cssText =
        "display:inline-block;" +
        "padding:.6rem .75rem;" +
        "border:1px solid rgba(255,255,255,.1);" +
        "border-radius:7px;" +
        "color:#d7d6d5;" +
        "text-decoration:none;" +
        "font-size:.72rem;";

      links.appendChild(
        link
      );

      jobs.push({
        link,
        entry
      });
    }

    wrap.appendChild(
      links
    );

    section.appendChild(
      wrap
    );

    /*
     * Stagger independent Scryfall
     * requests to avoid burst traffic.
     */

    for (
      const job of jobs
    ) {
      await hydrateArchiveLink(
        job.link,
        job.entry
      );

      await pause(125);
    }
  }

  void loadArchive();


  /* One input system on the stationary perspective stage; no continuous JS loop. */
  if (weekly && weeklyShell) {
    const stage = weeklyShell.closest(".weekly-card-stage") || weeklyShell;
    const floating = weeklyShell.parentElement;
    let presentationPose = null;
    let handoff = null;
    let handoffVersion = 0;
    // Keep the historical CSS idle clock authoritative. Web Animations is used
    // only for bounded takeover/return transitions, never a second idle loop.
    const samplePose = () => typeof window.getComputedStyle === "function" ? window.getComputedStyle(floating).transform : null;
    const translation = pose => {
      const match = /^(matrix3d|matrix)\(([^)]+)\)$/.exec(pose || "");
      if (!match) return null;
      const values = match[2].split(",").map(Number);
      if (!values.every(Number.isFinite) || values.length !== (match[1] === "matrix3d" ? 16 : 6)) return null;
      const xyz = match[1] === "matrix3d" ? values.slice(12, 15) : [values[4], values[5], 0];
      return `translate3d(${xyz[0]}px,${xyz[1]}px,${xyz[2]}px)`;
    };
    const cancelHandoff = () => {
      handoffVersion++;
      const previous = handoff;
      handoff = null;
      previous?.cancel();
    };
    const takeControl = () => {
      if (weekly.dataset.weeklyPresentation === "interactive") return;
      weekly.dataset.weeklyPresentation = "interactive"; // Pause at this CSS phase before sampling.
      if (typeof floating?.animate !== "function") return;
      try {
        const current = samplePose();
        if (!presentationPose) presentationPose = current;
        const forward = translation(presentationPose);
        if (!forward || !current) { presentationPose = null; return; }
        cancelHandoff();
        handoff = floating.animate([{ transform: current }, { transform: forward }], {
          duration: 320, easing: "cubic-bezier(.2,.7,.25,1)", fill: "forwards"
        });
        handoff.finished?.catch?.(() => {}); // Cancellation is expected on release/re-entry.
      } catch (_) { cancelHandoff(); presentationPose = null; }
    };
    let visible = false;
    let homeVisible = !initialQuery?.trim();
    let touchPointer = null;
    const exactEldrazi = () => weekly.dataset.weeklySet === "mh3" && weekly.dataset.weeklyNumber === "383" && weekly.dataset.weeklyCard === "Ulamog, the Defiler";
    const syncEffects = () => {
      weekly.dataset.weeklyEffectsPaused = String(!visible || !homeVisible || document.hidden || reducedMotion.matches);
    };
    const reset = (immediate = false) => {
      if (!immediate && weekly.dataset.weeklyPresentation === "returning" && handoff) return;
      touchPointer = null;
      weekly.dataset.weeklyInteracting = "false";
      const style = typeof window.getComputedStyle === "function" ? window.getComputedStyle(weekly) : null;
      const restX = style?.getPropertyValue("--weekly-idle-xa").trim() || "2.8deg";
      const restY = style?.getPropertyValue("--weekly-idle-ya").trim() || "-5.5deg";
      const values = { "--weekly-x": "50%", "--weekly-y": "42%", "--weekly-rx": restX, "--weekly-ry": restY };
      if (exactEldrazi()) Object.assign(values, {
        "--weekly-reflection": ".70", "--weekly-light-x": "-2%", "--weekly-light-y": "1%",
        "--weekly-light-angle": "-6deg", "--weekly-shadow-x": "0px", "--weekly-shadow-y": "0px", "--weekly-edge": ".78"
      });
      for (const [name, value] of Object.entries(values)) weekly.style.setProperty(name, value);
      if (!immediate && presentationPose && !reducedMotion.matches && visible && homeVisible && !document.hidden) {
        const target = presentationPose;
        const current = samplePose();
        cancelHandoff();
        const version = handoffVersion;
        weekly.dataset.weeklyPresentation = "returning";
        try {
          const returning = floating.animate([{ transform: current }, { transform: target }], {
            duration: 550, easing: "cubic-bezier(.2,.7,.25,1)", fill: "forwards"
          });
          handoff = returning;
          const finish = () => {
            if (version !== handoffVersion || handoff !== returning) return;
            cancelHandoff();
            presentationPose = null;
            weekly.dataset.weeklyPresentation = "idle"; // Resume the same paused idle/shadow phase.
          };
          if (returning.finished?.then) returning.finished.then(finish, finish);
          else returning.onfinish = finish;
          return;
        } catch (_) { /* Older/failed animation implementations retain the CSS presentation. */ }
      }
      cancelHandoff();
      presentationPose = null;
      weekly.dataset.weeklyPresentation = "idle";
    };
    const checkVisibility = () => {
      const rect = stage.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
      const rendered = !stage.getClientRects || stage.getClientRects().length > 0;
      visible = !!(rendered && rect.width && rect.height && rect.top < viewportHeight && rect.top + rect.height > 0 && rect.left < viewportWidth && rect.left + rect.width > 0);
      if (!visible) reset(true);
      syncEffects();
    };
    const artReady = () => {
      if (weeklyImage?.complete && weeklyImage.naturalWidth) weeklyImage.style.visibility = "visible";
      weekly.dataset.weeklyArtReady = String(!!(weeklyImage?.complete && weeklyImage.naturalWidth));
      checkVisibility();
    };
    weeklyImage?.addEventListener("load", artReady);
    weeklyImage?.addEventListener("error", () => { weekly.dataset.weeklyArtReady = "false"; weeklyImage.style.visibility = "hidden"; });
    artReady();
    if (typeof IntersectionObserver === "function") {
      // Observer notifications can be queued before a panel/layout change. Measure
      // the stationary stage now instead of trusting an old transformed-shell entry.
      const observer = new IntersectionObserver(checkVisibility, { threshold: 0 });
      observer.observe(stage);
    }
    let visibilityFrame = null;
    const scheduleVisibility = () => {
      if (typeof window.requestAnimationFrame !== "function") { checkVisibility(); return; }
      if (visibilityFrame !== null) return;
      visibilityFrame = window.requestAnimationFrame(() => { visibilityFrame = null; checkVisibility(); });
    };
    window.addEventListener("scroll", scheduleVisibility, { passive: true });
    window.addEventListener("resize", scheduleVisibility, { passive: true });
    window.addEventListener("pageshow", artReady);
    document.addEventListener("visibilitychange", () => { if (document.hidden) reset(true); artReady(); });
    window.addEventListener("manascout:statechange", event => {
      if (["home", "loading", "card"].includes(event.detail?.state)) {
        homeVisible = event.detail.state === "home";
        if (!homeVisible) reset(true);
        artReady();
      }
    });
    // Older MediaQueryList implementations use addListener. Neither hover nor
    // pointer-coarseness is a reduced-motion preference.
    const watchMedia = (media, listener) => {
      if (typeof media.addEventListener === "function") media.addEventListener("change", listener);
      else if (typeof media.addListener === "function") media.addListener(listener);
    };
    watchMedia(reducedMotion, () => { reset(true); artReady(); });
    watchMedia(finePointer, () => reset(true));
    const canTilt = () => {
      artReady(); // Repairs stale visibility/image flags at the point of interaction.
      return !reducedMotion.matches && visible && homeVisible && !document.hidden;
    };
    const tilt = event => {
      if (!canTilt()) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
      const touch = event.pointerType === "touch";
      takeControl();
      weekly.dataset.weeklyInteracting = "true";
      weekly.style.setProperty("--weekly-x", `${x}%`);
      weekly.style.setProperty("--weekly-y", `${y}%`);
      weekly.style.setProperty("--weekly-rx", `${Number(((50 - y) * (touch ? .12 : .22)).toFixed(2))}deg`);
      weekly.style.setProperty("--weekly-ry", `${Number(((x - 50) * (touch ? .14 : .28)).toFixed(2))}deg`);
      if (exactEldrazi()) {
        const incidence = Math.min(1, Math.hypot(x - 50, y - 50) / Math.hypot(50, 50));
        weekly.style.setProperty("--weekly-reflection", (.76 + .24 * incidence).toFixed(3));
        weekly.style.setProperty("--weekly-light-x", `${((x - 50) * .24).toFixed(2)}%`);
        weekly.style.setProperty("--weekly-light-y", `${((y - 50) * .20).toFixed(2)}%`);
        weekly.style.setProperty("--weekly-light-angle", `${((x - 50) * .36).toFixed(2)}deg`);
        weekly.style.setProperty("--weekly-shadow-x", `${((50 - x) * .20).toFixed(2)}px`);
        weekly.style.setProperty("--weekly-shadow-y", `${((50 - y) * .12).toFixed(2)}px`);
        weekly.style.setProperty("--weekly-edge", (.78 + .22 * incidence).toFixed(3));
      }
    };
    stage.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" || !event.isPrimary || !canTilt()) return;
      touchPointer = event.pointerId;
      tilt(event); // Passive: vertical scrolling and pinch zoom remain available.
    }, { passive: true });
    stage.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") { if (event.pointerId === touchPointer) tilt(event); }
      else if (finePointer.matches || ["mouse", "pen"].includes(event.pointerType)) tilt(event);
    }, { passive: true });
    const endInteraction = event => {
      if (event.pointerType === "touch" && touchPointer !== null && event.pointerId !== touchPointer) return;
      reset();
    };
    for (const name of ["pointerleave", "pointercancel", "pointerup", "lostpointercapture"]) stage.addEventListener(name, endInteraction, { passive: true });
    reset();
    checkVisibility();
  }


  /* ========================================
     END

     No retired tabs, roulette or
     floating dock.

     Search and printing explorer
     remain in app.js.
     ======================================== */

})();
