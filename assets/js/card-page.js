(() => {
  "use strict";


  /*
   * ========================================
   * MANASCOUT PERMANENT CARD PAGE
   * ========================================
   *
   * Permanent card guides declare their card
   * through:
   *
   * <body data-card-name="Rhystic Study">
   *
   * app.js owns all search, printing, price,
   * ManaScout Pick and discovery behaviour.
   */


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


  function showBootError(
    message
  ) {
    const details =
      document.getElementById(
        "card-details"
      );


    if (!details) {
      return;
    }


    details.innerHTML = `
      <div
        class="error-state"
        role="alert"
      >
        <h2>
          ManaScout couldn't load this guide
        </h2>

        <p>
          ${message}
        </p>
      </div>
    `;
  }


  async function initialiseCardPage() {
    const cardName =
      document.body
        .dataset
        .cardName
        ?.trim();


    if (!cardName) {
      console.error(
        "ManaScout card page: no data-card-name was provided."
      );


      showBootError(
        "This guide is missing its card configuration."
      );


      return;
    }


    if (
      !window.ManaScout ||
      typeof window.ManaScout
        .loadCard !==
        "function"
    ) {
      console.error(
        "ManaScout card page: app.js is unavailable."
      );


      showBootError(
        "The shared ManaScout card explorer is unavailable. Please refresh the page."
      );


      return;
    }


    try {
      await window.ManaScout
        .loadCard(
          cardName,
          {
            fromHistory:
              true,

            printingId:
              getPrintingId()
          }
        );

    } catch (error) {
      console.error(
        "ManaScout card page failed to initialise:",
        error
      );


      showBootError(
        "The card explorer could not be started. Please refresh the page."
      );
    }
  }


  if (
    document.readyState ===
    "loading"
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
