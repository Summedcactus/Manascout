(() => {
  "use strict";


  /* ========================================
     CONFIG
     ======================================== */

  const API =
    "https://api.scryfall.com";

  const reducedMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );


  /* ========================================
     ELEMENTS
     ======================================== */

  const scoutboard =
    document.getElementById(
      "scoutboard"
    );

  const tabs = [
    ...document.querySelectorAll(
      "[data-scoutboard-tab]"
    )
  ];

  const panels = [
    ...document.querySelectorAll(
      "[data-scoutboard-panel]"
    )
  ];

  const dock =
    document.getElementById(
      "home-dock"
    );

  const printingsSection =
    document.querySelector(
      ".printings-section"
    );

  const discoverButton =
    document.getElementById(
      "discover-card-button"
    );


  /* ========================================
     HELPERS
     ======================================== */

  function sleep(
    milliseconds
  ) {
    return new Promise(
      resolve => {
        window.setTimeout(
          resolve,
          milliseconds
        );
      }
    );
  }


  function imageFor(
    card
  ) {
    return (
      card?.image_uris?.normal ||
      card?.image_uris?.large ||
      card?.card_faces?.[0]
        ?.image_uris?.normal ||
      card?.card_faces?.[0]
        ?.image_uris?.large ||
      ""
    );
  }


  function hasQuery() {
    const value =
      new URLSearchParams(
        window.location.search
      ).get("q");

    return Boolean(
      value &&
      value.trim()
    );
  }


  function exactCardHref(
    card
  ) {
    if (
      !card?.name ||
      !card?.id
    ) {
      return "/";
    }


    const params =
      new URLSearchParams();


    params.set(
      "q",
      card.name
    );

    params.set(
      "printing",
      card.id
    );


    return (
      `/?${params.toString()}`
    );
  }


  async function fetchJson(
    url
  ) {
    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Scryfall returned ${response.status}`
        );

      error.status =
        response.status;

      throw error;
    }


    return response.json();
  }


  /* ========================================
     SCOUTBOARD TABS
     ======================================== */

  function wakeWeekly() {
    const weekly =
      document.getElementById(
        "card-of-the-week"
      );


    if (!weekly) {
      return;
    }


    weekly.classList.remove(
      "is-awake"
    );


    void weekly.offsetWidth;


    weekly.classList.add(
      "is-awake"
    );
  }


  function activatePanel(
    name,
    options = {}
  ) {
    const selectedTab =
      tabs.find(
        tab =>
          tab.dataset
            .scoutboardTab ===
          name
      );


    const selectedPanel =
      panels.find(
        panel =>
          panel.dataset
            .scoutboardPanel ===
          name
      );


    if (
      !selectedTab ||
      !selectedPanel
    ) {
      return;
    }


    tabs.forEach(
      tab => {
        const active =
          tab ===
          selectedTab;


        tab.classList.toggle(
          "is-active",
          active
        );


        tab.setAttribute(
          "aria-selected",
          active
            ? "true"
            : "false"
        );


        tab.tabIndex =
          active
            ? 0
            : -1;
      }
    );


    panels.forEach(
      panel => {
        panel.hidden =
          panel !==
          selectedPanel;
      }
    );


    if (
      name ===
      "weekly"
    ) {
      wakeWeekly();
    }


    if (
      options.focus
    ) {
      selectedTab.focus();
    }


    if (
      options.scroll &&
      scoutboard
    ) {
      scoutboard.scrollIntoView({
        behavior:
          reducedMotion.matches
            ? "auto"
            : "smooth",

        block:
          "start"
      });
    }
  }


  tabs.forEach(
    (
      tab,
      index
    ) => {

      tab.addEventListener(
        "click",
        () => {
          activatePanel(
            tab.dataset
              .scoutboardTab
          );
        }
      );


      tab.addEventListener(
        "keydown",
        event => {

          if (
            event.key !==
              "ArrowRight" &&
            event.key !==
              "ArrowLeft" &&
            event.key !==
              "Home" &&
            event.key !==
              "End"
          ) {
            return;
          }


          event.preventDefault();


          let nextIndex =
            index;


          if (
            event.key ===
            "ArrowRight"
          ) {
            nextIndex =
              (
                index + 1
              ) %
              tabs.length;
          }


          if (
            event.key ===
            "ArrowLeft"
          ) {
            nextIndex =
              (
                index -
                1 +
                tabs.length
              ) %
              tabs.length;
          }


          if (
            event.key ===
            "Home"
          ) {
            nextIndex = 0;
          }


          if (
            event.key ===
            "End"
          ) {
            nextIndex =
              tabs.length - 1;
          }


          activatePanel(
            tabs[nextIndex]
              .dataset
              .scoutboardTab,
            {
              focus:
                true
            }
          );
        }
      );

    }
  );


  document.addEventListener(
    "click",
    event => {

      const trigger =
        event.target.closest(
          "[data-scoutboard-open]"
        );


      if (!trigger) {
        return;
      }


      activatePanel(
        trigger.dataset
          .scoutboardOpen,
        {
          scroll:
            true
        }
      );
    }
  );


  /* ========================================
     HOMEPAGE / SEARCH STATE
     ======================================== */

  function setHomepageState(
    state
  ) {
    const home =
      state ===
      "home";


    if (scoutboard) {
      scoutboard.hidden =
        !home;
    }


    if (
      printingsSection
    ) {
      printingsSection.hidden =
        state !==
        "card";
    }


    if (
      dock &&
      !home
    ) {
      dock.hidden =
        true;
    }
  }


  window.addEventListener(
    "manascout:statechange",
    event => {

      const state =
        event?.detail?.state;


      if (
        state === "home" ||
        state === "loading" ||
        state === "card"
      ) {
        setHomepageState(
          state
        );
      }
    }
  );


  setHomepageState(
    hasQuery()
      ? "loading"
      : "home"
  );


  /* ========================================
     HOME DOCK
     ======================================== */

  function updateDock() {
    if (
      !dock ||
      !scoutboard ||
      scoutboard.hidden
    ) {
      if (dock) {
        dock.hidden =
          true;
      }

      return;
    }


    dock.hidden =
      window.scrollY <
      520;
  }


  window.addEventListener(
    "scroll",
    updateDock,
    {
      passive: true
    }
  );


  window.addEventListener(
    "resize",
    updateDock
  );


  updateDock();


  /* ========================================
     DISCOVER A CARD
     ======================================== */

  if (discoverButton) {

    const originalText =
      discoverButton.innerHTML;


    discoverButton.addEventListener(
      "click",
      async () => {

        if (
          discoverButton.disabled
        ) {
          return;
        }


        discoverButton.disabled =
          true;


        discoverButton.innerHTML =
          "<span>◇</span> Scouting…";


        try {

          if (
            !window.ManaScout ||
            typeof window.ManaScout
              .scoutRandom !==
              "function"
          ) {
            throw new Error(
              "ManaScout API unavailable."
            );
          }


          await window.ManaScout
            .scoutRandom();


          document
            .getElementById(
              "card-details-section"
            )
            ?.scrollIntoView({
              behavior:
                reducedMotion.matches
                  ? "auto"
                  : "smooth",

              block:
                "start"
            });


        } catch (error) {

          console.error(
            "ManaScout Discover failed:",
            error
          );


          discoverButton.innerHTML =
            "<span>◇</span> Try Again";


          await sleep(
            1400
          );


        } finally {

          discoverButton.disabled =
            false;


          discoverButton.innerHTML =
            originalText;

        }

      }
    );

  }


  /* ========================================
     EXPLORE FEATURE ART
     ======================================== */

  const featureCards = [
    ...document.querySelectorAll(
      "[data-feature-card]"
    )
  ];


  function printingScore(
    printing,
    preference
  ) {
    let score = 0;


    const effects =
      printing.frame_effects ||
      [];

    const finishes =
      printing.finishes ||
      [];


    if (printing.digital) {
      return -10000;
    }


    if (
      preference ===
      "premium"
    ) {

      if (
        effects.includes(
          "showcase"
        )
      ) {
        score += 100;
      }


      if (
        printing.border_color ===
        "borderless"
      ) {
        score += 90;
      }


      if (
        printing.full_art
      ) {
        score += 85;
      }


      if (
        effects.includes(
          "extendedart"
        )
      ) {
        score += 75;
      }


      if (
        finishes.includes(
          "etched"
        )
      ) {
        score += 40;
      }


      if (
        finishes.includes(
          "foil"
        )
      ) {
        score += 18;
      }

    }


    if (
      preference ===
      "alternate"
    ) {

      if (
        effects.includes(
          "showcase"
        )
      ) {
        score += 95;
      }


      if (
        printing.full_art
      ) {
        score += 90;
      }


      if (
        printing.border_color ===
        "borderless"
      ) {
        score += 85;
      }


      if (
        effects.includes(
          "extendedart"
        )
      ) {
        score += 75;
      }

    }


    const date =
      Date.parse(
        printing.released_at ||
        ""
      );


    if (
      Number.isFinite(
        date
      )
    ) {
      score +=
        date /
        10000000000000;
    }


    return score;
  }


  async function loadFeatureCard(
    element
  ) {
    const name =
      element.dataset
        .featureCard;

    const preference =
      element.dataset
        .featurePreference ||
      "alternate";

    const art =
      element.querySelector(
        ".scoutboard-feature-art"
      );

    const link =
      element.querySelector(
        ".scoutboard-feature-link"
      );


    if (
      !name ||
      !art
    ) {
      return;
    }


    try {

      const query =
        encodeURIComponent(
          `!"${name}"`
        );


      const data =
        await fetchJson(
          `${API}/cards/search?q=${query}&unique=prints&order=released&dir=desc&include_extras=true`
        );


      const printings =
        Array.isArray(
          data.data
        )
          ? data.data
          : [];


      const selected =
        printings
          .filter(
            card =>
              !card.digital &&
              imageFor(card)
          )
          .sort(
            (a, b) =>
              printingScore(
                b,
                preference
              ) -
              printingScore(
                a,
                preference
              )
          )[0];


      if (!selected) {
        return;
      }


      const image =
        document.createElement(
          "img"
        );


      image.src =
        imageFor(
          selected
        );


      image.alt =
        `${name} — ${
          selected.set_name ||
          "Magic printing"
        }`;


      image.loading =
        "lazy";

      image.decoding =
        "async";


      art.innerHTML =
        "";

      art.appendChild(
        image
      );


      if (
        link &&
        selected.id
      ) {

        const url =
          new URL(
            link.href
          );


        url.searchParams.set(
          "printing",
          selected.id
        );


        link.href =
          url.pathname +
          url.search;

      }


    } catch (error) {

      console.warn(
        `ManaScout feature artwork failed for ${name}:`,
        error
      );

    }
  }


  async function loadFeatureArtwork() {

    for (
      const element of
      featureCards
    ) {

      await loadFeatureCard(
        element
      );


      await sleep(
        110
      );

    }

  }


  if (
    featureCards.length
  ) {
    loadFeatureArtwork();
  }


  /* ========================================
     CARD OF THE WEEK
     ======================================== */

  const weekly =
    document.getElementById(
      "card-of-the-week"
    );

  const weeklyImage =
    document.getElementById(
      "card-week-image"
    );

  const weeklyPrinting =
    document.getElementById(
      "card-week-printing"
    );

  const weeklyLink =
    document.getElementById(
      "card-week-link"
    );

  const weeklyShell =
    document.getElementById(
      "weekly-card-shell"
    );


  async function loadWeeklyCard() {

    if (!weekly) {
      return;
    }


    const set =
      weekly.dataset
        .weeklySet;

    const number =
      weekly.dataset
        .weeklyNumber;


    if (
      !set ||
      !number
    ) {
      return;
    }


    try {

      const card =
        await fetchJson(
          `${API}/cards/${encodeURIComponent(
            set
          )}/${encodeURIComponent(
            number
          )}`
        );


      const imageUrl =
        imageFor(
          card
        );


      if (
        weeklyImage &&
        imageUrl
      ) {
        weeklyImage.src =
          imageUrl;


        weeklyImage.alt =
          `${card.name} — ${
            card.set_name ||
            "Magic printing"
          } #${
            card.collector_number ||
            number
          }`;
      }


      if (
        weeklyPrinting
      ) {

        const treatments = [];


        if (
          (
            card.frame_effects ||
            []
          ).includes(
            "showcase"
          )
        ) {
          treatments.push(
            "SHOWCASE"
          );
        }


        if (
          card.border_color ===
          "borderless"
        ) {
          treatments.push(
            "BORDERLESS"
          );
        }


        if (
          card.full_art
        ) {
          treatments.push(
            "FULL ART"
          );
        }


        const treatmentText =
          treatments.length
            ? `${treatments.join(" · ")} · `
            : "";


        weeklyPrinting.textContent =
          `${
            card.set_name ||
            "MYSTIC SANCTUARY"
          } · ${
            treatmentText
          }#${
            card.collector_number ||
            number
          }`.toUpperCase();

      }


      /*
       * The homepage Card of the Week now links to a
       * dedicated ManaScout guide page.
       *
       * Do not replace that internal guide URL with
       * exactCardHref(card). The printing itself is
       * already represented by the image/set metadata.
       */
      if (
        weeklyLink &&
        !weeklyLink.getAttribute(
          "href"
        )
      ) {
        weeklyLink.href =
          `/card/${encodeURIComponent(
            (
              card.name ||
              weekly.dataset
                .weeklyCard ||
              "card"
            )
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                "-"
              )
              .replace(
                /^-|-$/g,
                ""
              )
          )}/`;
      }


    } catch (error) {

      console.warn(
        "ManaScout weekly card lookup failed:",
        error
      );

    }

  }


  loadWeeklyCard();


  /* ========================================
     WEEKLY CARD PARALLAX
     ======================================== */

  if (
    weekly &&
    weeklyShell &&
    !reducedMotion.matches &&
    window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches
  ) {

    weeklyShell.addEventListener(
      "pointermove",
      event => {

        const bounds =
          weeklyShell
            .getBoundingClientRect();


        const x =
          (
            (
              event.clientX -
              bounds.left
            ) /
            bounds.width
          ) *
          100;


        const y =
          (
            (
              event.clientY -
              bounds.top
            ) /
            bounds.height
          ) *
          100;


        weekly.style
          .setProperty(
            "--weekly-x",
            `${x}%`
          );


        weekly.style
          .setProperty(
            "--weekly-y",
            `${y}%`
          );


        weekly.style
          .setProperty(
            "--weekly-rx",
            `${
              (
                50 -
                y
              ) *
              .045
            }deg`
          );


        weekly.style
          .setProperty(
            "--weekly-ry",
            `${
              (
                x -
                50
              ) *
              .05
            }deg`
          );

      }
    );


    weeklyShell.addEventListener(
      "pointerleave",
      () => {

        weekly.style
          .setProperty(
            "--weekly-x",
            "50%"
          );


        weekly.style
          .setProperty(
            "--weekly-y",
            "42%"
          );


        weekly.style
          .setProperty(
            "--weekly-rx",
            "0deg"
          );


        weekly.style
          .setProperty(
            "--weekly-ry",
            "0deg"
          );

      }
    );

  }


  /* ========================================
     SCOUT ROULETTE
     ======================================== */

  const wheel =
    document.getElementById(
      "scout-wheel"
    );

  const spinButton =
    document.getElementById(
      "scout-roulette-spin"
    );

  const againButton =
    document.getElementById(
      "scout-roulette-again"
    );

  const rouletteIdle =
    document.getElementById(
      "scout-roulette-idle"
    );

  const rouletteResult =
    document.getElementById(
      "scout-roulette-result"
    );

  const rouletteStatus =
    document.getElementById(
      "scout-roulette-status"
    );

  const rouletteError =
    document.getElementById(
      "scout-roulette-error"
    );

  const rouletteImage =
    document.getElementById(
      "scout-roulette-card"
    );

  const rouletteName =
    document.getElementById(
      "scout-roulette-card-name"
    );

  const rouletteMeta =
    document.getElementById(
      "scout-roulette-card-meta"
    );

  const rouletteCopy =
    document.getElementById(
      "scout-roulette-card-copy"
    );

  const rouletteCategory =
    document.getElementById(
      "scout-roulette-result-category"
    );

  const rouletteAction =
    document.getElementById(
      "scout-roulette-action"
    );


  const categories = [
    {
      label:
        "Legendary",

      query:
        "game:paper t:legendary",

      copy:
        "The wheel chose Legendary — a named figure, object or place from Magic's history."
    },

    {
      label:
        "Artifact",

      query:
        "game:paper t:artifact",

      copy:
        "The wheel chose Artifact — relics, machinery and strange objects from across the Multiverse."
    },

    {
      label:
        "Creature",

      query:
        "game:paper t:creature -t:legendary",

      copy:
        "The wheel chose Creature — something from Magic's enormous bestiary."
    },

    {
      label:
        "Spell",

      query:
        "game:paper (t:instant OR t:sorcery)",

      copy:
        "The wheel chose Spell — an instant or sorcery ready to change the game."
    },

    {
      label:
        "Enchantment",

      query:
        "game:paper t:enchantment -t:creature",

      copy:
        "The wheel chose Enchantment — persistent magic waiting to reshape the battlefield."
    },

    {
      label:
        "Land",

      query:
        "game:paper t:land",

      copy:
        "The wheel chose Land — one of the places that power Magic."
    },

    {
      label:
        "Wild",

      query:
        "game:paper",

      copy:
        "No restrictions. Anything in paper Magic can appear."
    }
  ];


  let currentRotation =
    0;

  let spinning =
    false;


  function randomInt(
    max
  ) {

    const values =
      new Uint32Array(1);


    window.crypto
      .getRandomValues(
        values
      );


    return (
      values[0] %
      max
    );

  }


  function cardMeta(
    card
  ) {

    const values = [];


    if (card.set_name) {
      values.push(
        card.set_name
      );
    }


    if (
      card.collector_number
    ) {
      values.push(
        `#${card.collector_number}`
      );
    }


    if (
      card.type_line
    ) {
      values.push(
        card.type_line
      );
    }


    return values.join(
      " · "
    );

  }


  async function fetchRandomCard(
    category
  ) {

    return fetchJson(
      `${API}/cards/random?q=${encodeURIComponent(
        category.query
      )}`
    );

  }


  function targetRotation(
    index
  ) {

    const segment =
      360 /
      categories.length;


    const normalized =
      (
        (
          currentRotation %
          360
        ) +
        360
      ) %
      360;


    const desired =
      (
        360 -
        index *
          segment +
        360
      ) %
      360;


    let distance =
      (
        desired -
        normalized +
        360
      ) %
      360;


    if (
      distance <
      1
    ) {
      distance +=
        360;
    }


    return (
      currentRotation +
      (
        360 *
        (
          6 +
          randomInt(4)
        )
      ) +
      distance
    );

  }


  function showRouletteResult(
    category,
    card
  ) {

    const image =
      imageFor(
        card
      );


    rouletteImage.src =
      image;


    rouletteImage.alt =
      `${card.name} — ${
        card.set_name ||
        "Magic printing"
      }`;


    rouletteName.textContent =
      card.name;


    rouletteMeta.textContent =
      cardMeta(
        card
      );


    rouletteCopy.textContent =
      category.copy;


    rouletteCategory.textContent =
      `${category.label.toUpperCase()} · FATE HAS SPOKEN`;


    rouletteAction.href =
      exactCardHref(
        card
      );


    rouletteIdle.hidden =
      true;


    rouletteResult.hidden =
      false;

  }


  async function spinRoulette() {

    if (
      spinning ||
      !wheel
    ) {
      return;
    }


    spinning =
      true;


    spinButton.disabled =
      true;


    if (
      againButton
    ) {
      againButton.disabled =
        true;
    }


    rouletteError.hidden =
      true;


    rouletteResult.hidden =
      true;


    rouletteIdle.hidden =
      false;


    rouletteStatus.textContent =
      "FATE IS CHOOSING…";


    const index =
      randomInt(
        categories.length
      );


    const category =
      categories[index];


    currentRotation =
      targetRotation(
        index
      );


    wheel.style
      .setProperty(
        "--roulette-rotation",
        `${currentRotation}deg`
      );


    try {

      const [
        card
      ] =
        await Promise.all([
          fetchRandomCard(
            category
          ),

          sleep(
            reducedMotion.matches
              ? 100
              : 5250
          )
        ]);


      if (
        !card?.name ||
        !imageFor(card)
      ) {
        throw new Error(
          "No usable card returned."
        );
      }


      rouletteStatus.textContent =
        `${category.label} selected`;


      showRouletteResult(
        category,
        card
      );


    } catch (error) {

      console.error(
        "ManaScout Roulette failed:",
        error
      );


      rouletteStatus.textContent =
        "The wheel needs another spin";


      rouletteError.textContent =
        "ManaScout couldn't retrieve a card this time. Spin again.";


      rouletteError.hidden =
        false;


    } finally {

      spinning =
        false;


      spinButton.disabled =
        false;


      if (
        againButton
      ) {
        againButton.disabled =
          false;
      }

    }

  }


  if (
    wheel &&
    spinButton
  ) {

    spinButton.addEventListener(
      "click",
      spinRoulette
    );


    againButton?.addEventListener(
      "click",
      spinRoulette
    );

  }


  /* ========================================
     DEFAULT PANEL
     ======================================== */

  activatePanel(
    "explore"
  );

})();
