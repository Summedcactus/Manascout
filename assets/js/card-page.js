(() => {
  "use strict";

  /**
   * ManaScout Permanent Card Page
   *
   * Permanent card pages provide their card name through:
   *
   * <body data-card-name="Rhystic Study">
   *
   * This shared file then loads that card through the main
   * ManaScout application.
   */

  function initialiseCardPage() {
    const cardName =
      document.body.dataset.cardName?.trim();

    if (!cardName) {
      console.error(
        "ManaScout card page: no data-card-name was provided."
      );
      return;
    }

    if (
      !window.ManaScout ||
      typeof window.ManaScout.loadCard !== "function"
    ) {
      console.error(
        "ManaScout card page: app.js is unavailable."
      );
      return;
    }

    window.ManaScout.loadCard(
      cardName,
      {
        fromHistory: true
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialiseCardPage,
      { once: true }
    );
  } else {
    initialiseCardPage();
  }
})();
