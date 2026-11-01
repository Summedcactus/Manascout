
/*
 * MANASCOUT — PERMANENT CARD GUIDE CONTROLLER
 *
 * File: assets/js/card-page.js
 * Branch: DEVELOPMENT
 *
 * Complete replacement.
 *
 * Works with existing guide pages using:
 *
 * <body data-card-name="Rhystic Study">
 *
 * The main app.js handles:
 * - Scryfall card data
 * - Printing comparisons
 * - GBP estimates
 * - Foil previews
 * - ManaScout Picks
 *
 * This file handles guide navigation,
 * exact-printing links and page behaviour.
 */

(() => {
  "use strict";

  const body = document.body;

  const guideName = String(
    body?.dataset?.cardName || ""
  ).trim();

  const details =
    document.getElementById("card-details");

  const printings =
    document.getElementById("printings-container");

  const titleNode =
    document.querySelector("head title");

  const originalTitle =
    titleNode?.textContent || document.title;

  const reducedMotion = () =>
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  let toolbar = null;
  let statusElement = null;
  let printingButton = null;
  let currentPrintingId = "";
  let loading = false;


  /* ========================================
     HELPERS
     ======================================== */

  function parameters() {
    return new URLSearchParams(
      window.location.search
    );
  }

  function getPrintingId() {
    return (
      parameters().get("printing") || ""
    ).trim();
  }

  function normalise(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function sameCard(name) {
    return normalise(name) ===
      normalise(guideName);
  }

  function guideUrl() {
    return (
      window.location.origin +
      window.location.pathname
    );
  }

  function printingUrl(id) {
    const url = new URL(guideUrl());

    if (id) {
      url.searchParams.set(
        "printing",
        id
      );
    }

    return url.href;
  }

  function scrollToTarget(id) {
    const target =
      document.getElementById(id);

    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: reducedMotion()
        ? "auto"
        : "smooth",
      block: "start"
    });
  }

  function updateStatus(message) {
    if (statusElement) {
      statusElement.textContent =
        message;
    }
  }


  /* ========================================
     COPY LINK
     ======================================== */

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(
          value
        );

        return true;

      } catch (error) {
        console.warn(
          "Clipboard API unavailable:",
          error
        );
      }
    }

    /*
     * Fallback for older mobile browsers.
     */

    const textarea =
      document.createElement("textarea");

    textarea.value = value;

    textarea.setAttribute(
      "readonly",
      ""
    );

    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);

    textarea.select();

    let success = false;

    try {
      success =
        document.execCommand("copy");

    } catch {
      success = false;
    }

    textarea.remove();

    return success;
  }


  /* ========================================
     TOOLBAR STYLING
     ======================================== */

  function installStyles() {
    if (
      document.getElementById(
        "ms-card-guide-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id = "ms-card-guide-styles";

    style.textContent = `
      .ms-guide-toolbar {
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:8px;
        margin:0 0 2rem;
        padding:12px;
        border:1px solid rgba(255,255,255,.1);
        border-radius:12px;
        background:linear-gradient(
          135deg,
          rgba(139,40,56,.095),
          rgba(255,255,255,.018)
        );
      }

      .ms-guide-toolbar a,
      .ms-guide-toolbar button {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:38px;
        padding:8px 11px;
        border:1px solid rgba(255,255,255,.11);
        border-radius:8px;
        background:rgba(255,255,255,.025);
        color:#e9e0e3;
        font:inherit;
        font-size:11px;
        font-weight:800;
        line-height:1.3;
        text-decoration:none;
        cursor:pointer;
        transition:
          background .18s ease,
          border-color .18s ease;
      }

      .ms-guide-toolbar a:hover,
      .ms-guide-toolbar button:hover {
        border-color:rgba(210,85,104,.55);
        background:rgba(146,43,61,.13);
      }

      .ms-guide-toolbar a:focus-visible,
      .ms-guide-toolbar button:focus-visible {
        outline:2px solid #d36a7b;
        outline-offset:3px;
      }

      .ms-guide-toolbar button:disabled {
        opacity:.45;
        cursor:not-allowed;
      }

      .ms-guide-toolbar .ms-guide-primary {
        color:#ffe6ea;
        border-color:rgba(208,75,96,.48);
        background:rgba(142,38,55,.15);
      }

      .ms-guide-status {
        flex-basis:100%;
        display:block;
        min-height:16px;
        margin:3px 2px 0;
        color:#aaa0a4;
        font-size:11px;
        line-height:1.55;
      }

      .ms-guide-toolbar + .results {
        scroll-margin-top:2rem;
      }

      #card-details,
      #printings-container {
        scroll-margin-top:2rem;
      }

      .ms-guide-error {
        padding:18px;
        border:1px solid rgba(209,79,96,.3);
        border-radius:11px;
        background:rgba(137,41,57,.07);
        color:#f0e7e9;
      }

      .ms-guide-error h2 {
        margin:0 0 8px;
        font-size:1.2rem;
      }

      .ms-guide-error p {
        color:#bcb0b4;
        font-size:13px;
        line-height:1.7;
      }

      .ms-guide-retry {
        margin-top:8px;
        padding:9px 12px;
        border:1px solid rgba(208,79,99,.5);
        border-radius:8px;
        background:rgba(143,44,61,.16);
        color:#fff0f2;
        font:inherit;
        font-size:12px;
        cursor:pointer;
      }

      @media(max-width:620px) {
        .ms-guide-toolbar {
          gap:6px;
          padding:9px;
          border-radius:10px;
        }

        .ms-guide-toolbar a,
        .ms-guide-toolbar button {
          flex:1 1 auto;
          min-height:39px;
          padding:8px;
          font-size:10px;
        }

        .ms-guide-status {
          font-size:10px;
          padding:3px;
        }
      }

      @media(prefers-reduced-motion:reduce) {
        .ms-guide-toolbar a,
        .ms-guide-toolbar button {
          transition:none!important;
        }
      }
    `;

    document.head.appendChild(style);
  }


  /* ========================================
     GUIDE SHORTCUT NAVIGATION
     ======================================== */

  function createToolbar() {
    const main =
      document.querySelector("main");

    const hero =
      main?.querySelector(".hero");

    if (
      !main ||
      !hero ||
      !details ||
      !printings
    ) {
      return;
    }

    if (
      document.getElementById(
        "ms-guide-toolbar"
      )
    ) {
      return;
    }

    if (!hero.id) {
      hero.id = "ms-guide-overview";
    }

    toolbar =
      document.createElement("nav");

    toolbar.id = "ms-guide-toolbar";

    toolbar.className =
      "ms-guide-toolbar";

    toolbar.setAttribute(
      "aria-label",
      "ManaScout card guide shortcuts"
    );

    toolbar.innerHTML = `
      <a href="#${hero.id}">
        Overview
      </a>

      <a href="#card-details">
        Card details
      </a>

      <a
        href="#printings-container"
        class="ms-guide-primary"
      >
        Compare printings
      </a>

      <a href="/card/">
        All guides
      </a>

      <button
        type="button"
        data-ms-copy-guide
      >
        Copy guide link
      </button>

      <button
        type="button"
        data-ms-copy-printing
        disabled
      >
        Copy exact printing
      </button>

      <span
        class="ms-guide-status"
        role="status"
        aria-live="polite"
      >
        Loading live card and printing information…
      </span>
    `;

    hero.insertAdjacentElement(
      "afterend",
      toolbar
    );

    statusElement =
      toolbar.querySelector(
        ".ms-guide-status"
      );

    printingButton =
      toolbar.querySelector(
        "[data-ms-copy-printing]"
      );


    /* Copy the permanent guide URL */

    toolbar
      .querySelector(
        "[data-ms-copy-guide]"
      )
      ?.addEventListener(
        "click",
        async () => {
          const success =
            await copyText(
              guideUrl()
            );

          updateStatus(
            success
              ? "Permanent guide link copied."
              : "Copy the guide URL from your browser address bar."
          );
        }
      );


    /* Copy the specific selected printing */

    printingButton?.addEventListener(
      "click",
      async () => {
        const id =
          currentPrintingId ||
          getPrintingId();

        if (!id) {
          updateStatus(
            "Select a card printing first."
          );

          return;
        }

        const success =
          await copyText(
            printingUrl(id)
          );

        updateStatus(
          success
            ? "Exact printing link copied."
            : "Could not copy automatically. Use your browser address bar."
        );
      }
    );
  }


  /* ========================================
     SELECTED PRINTING STATE
     ======================================== */

  function updatePrintingSelection(
    id = ""
  ) {
    const printingId =
      String(
        id || getPrintingId()
      ).trim();

    currentPrintingId =
      printingId;

    if (!printingButton) {
      return;
    }

    printingButton.disabled =
      !printingId;

    printingButton.title =
      printingId
        ? "Copy a link to this exact printing"
        : "Select a printing first";
  }


  /* ========================================
     LIVE SEARCH STATE
     ======================================== */

  function listenToExplorer() {
    window.addEventListener(
      "manascout:statechange",
      event => {
        const state =
          event?.detail?.state;

        if (
          state === "loading"
        ) {
          updateStatus(
            "Loading card details and available printings…"
          );

          return;
        }

        if (
          state !== "card"
        ) {
          return;
        }

        const name =
          event.detail.cardName;

        if (
          name &&
          !sameCard(name)
        ) {
          return;
        }

        const id =
          event.detail.printingId || "";

        /*
         * app.js changes the URL immediately
         * after some selection events.
         * Update after the current event handler
         * has completed.
         */

        queueMicrotask(() => {
          updatePrintingSelection(
            id
          );

          updateStatus(
            "Card loaded. Compare the available printings below."
          );
        });
      }
    );

    window.addEventListener(
      "popstate",
      () => {
        queueMicrotask(() => {
          updatePrintingSelection();
        });
      }
    );
  }


  /* ========================================
     GUIDE ERROR HANDLING
     ======================================== */

  function showBootError(message) {
    if (!details) {
      return;
    }

    details.replaceChildren();

    const box =
      document.createElement("div");

    box.className =
      "ms-guide-error";

    box.setAttribute(
      "role",
      "alert"
    );

    const heading =
      document.createElement("h2");

    heading.textContent =
      "ManaScout couldn't load this guide";

    const paragraph =
      document.createElement("p");

    paragraph.textContent =
      message;

    const retry =
      document.createElement("button");

    retry.type = "button";

    retry.className =
      "ms-guide-retry";

    retry.textContent =
      "Try loading again";

    retry.addEventListener(
      "click",
      () => {
        void loadGuide();
      }
    );

    box.append(
      heading,
      paragraph,
      retry
    );

    details.appendChild(box);

    updateStatus(
      "Live printing data is unavailable. The written guide remains accessible."
    );
  }


  /* ========================================
     GUIDE TITLE PROTECTION
     ========================================

     app.js updates the browser title when
     searching. Permanent editorial guides
     should retain their dedicated page title.
  */

  function preserveGuideTitle() {
    if (
      !titleNode ||
      !originalTitle
    ) {
      return;
    }

    const observer =
      new MutationObserver(
        () => {
          if (
            titleNode.textContent !==
            originalTitle
          ) {
            titleNode.textContent =
              originalTitle;
          }
        }
      );

    observer.observe(
      titleNode,
      {
        childList: true,
        characterData: true,
        subtree: true
      }
    );
  }


  /* ========================================
     INITIALISE CARD GUIDE
     ======================================== */

  async function loadGuide() {
    if (loading) {
      return;
    }

    if (!guideName) {
      showBootError(
        "This page is missing its card name configuration."
      );

      return;
    }

    if (
      !window.ManaScout ||
      typeof window.ManaScout.loadCard !==
        "function"
    ) {
      showBootError(
        "The shared card explorer is unavailable. Refresh the page and try again."
      );

      return;
    }

    loading = true;

    updateStatus(
      `Loading ${guideName} printings…`
    );

    try {
      const card =
        await window.ManaScout.loadCard(
          guideName,
          {
            fromHistory: true,
            printingId: getPrintingId()
          }
        );

      if (!card) {
        /*
         * app.js may already have shown a
         * specific error message.
         */
        const hasError =
          details?.querySelector(
            ".error-state, .ms-guide-error"
          );

        if (!hasError) {
          showBootError(
            "Live card information could not be loaded. Check your connection or try again."
          );
        }

        return;
      }

      updatePrintingSelection(
        getPrintingId() ||
        card.id
      );

      updateStatus(
        `${guideName} loaded. Choose any printing to inspect its details.`
      );

      /*
       * Support direct links to the
       * comparison section.
       */
      const hash =
        window.location.hash;

      if (
        hash === "#printings-container" ||
        hash === "#card-details"
      ) {
        scrollToTarget(
          hash.slice(1)
        );
      }

    } catch (error) {
      console.error(
        "ManaScout guide load failed:",
        error
      );

      showBootError(
        "The live card explorer could not be started. Please try again."
      );

    } finally {
      loading = false;
    }
  }


  function initialiseCardPage() {
    installStyles();
    createToolbar();
    listenToExplorer();
    preserveGuideTitle();

    if (!guideName) {
      showBootError(
        "This guide is missing its card configuration."
      );

      return;
    }

    /*
     * When the URL already has ?q=<card>,
     * app.js starts the lookup automatically.
     *
     * Avoid performing the same fetch twice.
     */
    const query =
      parameters().get("q");

    if (
      query &&
      sameCard(query)
    ) {
      updatePrintingSelection();
      return;
    }

    void loadGuide();
  }


  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialiseCardPage,
      {
        once: true
      }
    );

  } else {
    initialiseCardPage();
  }

})();
