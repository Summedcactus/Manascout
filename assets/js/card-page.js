
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

    const finish = parameters().get("finish");
    if (["nonfoil", "foil", "etched"].includes(finish)) url.searchParams.set("finish", finish);
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


  /* Reuse the static section links; sharing stays secondary. */
  function createToolbar() {
    const hero = document.querySelector("main .hero");
    if (!hero || !details || !printings) return;
    toolbar = hero.querySelector(".guide-jump-links");
    if (!toolbar) return;
    toolbar.id = "ms-guide-toolbar";
    const tools = document.createElement("details");
    tools.className = "guide-tools";
    tools.innerHTML = `<summary>Copy links</summary>
      <div class="guide-copy-actions">
        <button type="button" data-ms-copy-guide>Copy guide link</button>
        <button type="button" data-ms-copy-printing disabled>Copy exact printing</button>
      </div>`;
    toolbar.appendChild(tools);
    statusElement = document.createElement("p");
    statusElement.className = "ms-guide-status sr-only";
    statusElement.setAttribute("role", "status");
    statusElement.setAttribute("aria-live", "polite");
    toolbar.insertAdjacentElement("afterend", statusElement);
    printingButton = tools.querySelector("[data-ms-copy-printing]");
    const reportCopy = message => {
      statusElement.className = "ms-guide-status";
      updateStatus(message);
    };
    tools.querySelector("[data-ms-copy-guide]").addEventListener("click", async () => {
      const success = await copyText(guideUrl());
      reportCopy(success ? "Permanent guide link copied." : "Copy the guide URL from your browser address bar.");
    });
    printingButton.addEventListener("click", async () => {
      const id = currentPrintingId || getPrintingId();
      if (!id) return;
      const success = await copyText(printingUrl(id));
      reportCopy(success ? "Exact printing link copied." : "Copy the current URL from your browser address bar.");
    });
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

    const fallback = details.querySelector("[data-guide-static]");
    if (!fallback) details.replaceChildren();
    details.querySelector(".ms-guide-error")?.remove();

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
      "Live card data is unavailable";

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
