/* Phase 5A: workspace navigation and one exact-printing preview. No deck model or saving. */
(() => {
  "use strict";
  const data = window.ManaScoutDeckData;
  const $ = id => document.getElementById(id);
  const body = document.body;
  if (!body.classList.contains("deck-studio") || !data) return;

  const mobile = window.matchMedia("(max-width: 820px)");
  const panels = { deck: $("studio-deck"), discover: $("studio-discover"), stats: $("studio-stats") };
  const headings = { deck: $("deck-heading"), discover: $("discover-heading"), stats: $("stats-heading") };
  const nav = document.querySelector(".ds-mobile-nav");
  const navButtons = [...nav.querySelectorAll("[data-panel]")];
  const collapsed = new Set();
  const scrollPositions = new Map();
  const preview = $("card-preview");
  let activePanel = "deck";
  let selection = null;
  let current = null;
  let face = 0;
  let loading = false;
  let returnFocus = null;

  function syncLayout() {
    body.dataset.activePanel = activePanel;
    body.dataset.discoverCollapsed = String(!mobile.matches && collapsed.has("discover-body"));
    body.dataset.statsCollapsed = String(!mobile.matches && collapsed.has("stats-body"));
    nav.hidden = !mobile.matches;
    for (const [name, panel] of Object.entries(panels)) panel.hidden = mobile.matches && activePanel !== name;
    for (const button of navButtons) button.setAttribute("aria-pressed", String(button.dataset.panel === activePanel));
    for (const button of document.querySelectorAll("[data-collapse]")) {
      const id = button.dataset.collapse;
      const closed = !mobile.matches && collapsed.has(id);
      $(id).hidden = closed;
      button.hidden = mobile.matches;
      button.setAttribute("aria-expanded", String(!closed));
      button.textContent = closed ? "+" : "−";
      button.setAttribute("aria-label", `${closed ? "Expand" : "Collapse"} ${id === "discover-body" ? "Discover" : "Deck insights"} panel`);
    }
  }

  function activatePanel(name, focus = true) {
    if (!Object.hasOwn(panels, name)) return;
    if (mobile.matches) scrollPositions.set(activePanel, panels[activePanel].scrollTop);
    activePanel = name;
    if (name === "discover") collapsed.delete("discover-body");
    if (name === "stats") collapsed.delete("stats-body");
    syncLayout();
    if (mobile.matches) panels[name].scrollTop = scrollPositions.get(name) || 0;
    if (focus) headings[name].focus({ preventScroll: true });
  }

  navButtons.forEach((button, index) => {
    button.addEventListener("click", () => activatePanel(button.dataset.panel));
    button.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % navButtons.length;
      if (event.key === "ArrowLeft") next = (index + navButtons.length - 1) % navButtons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = navButtons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activatePanel(navButtons[next].dataset.panel, false);
      navButtons[next].focus();
    });
  });
  for (const button of document.querySelectorAll("[data-collapse]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.collapse;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      syncLayout();
    });
  }
  mobile.addEventListener("change", () => {
    const focusedPanel = Object.values(panels).find(panel => panel.contains(document.activeElement));
    syncLayout();
    if (focusedPanel?.hidden && !preview.open) headings[activePanel].focus({ preventScroll: true });
  });
  $("show-discover").hidden = false;
  document.querySelector(".ds-nojs-discover").hidden = true;
  $("show-discover").addEventListener("click", () => activatePanel("discover"));
  document.querySelector(".ds-skip").addEventListener("click", () => activatePanel("deck"));
  body.dataset.studioReady = "true";
  syncLayout();

  function closePreview() { if (preview.open) preview.close(); }
  function openPreview(trigger) {
    if (!current) return;
    if (typeof preview.showModal !== "function") {
      $("selection-status").textContent = "This browser cannot open the card drawer. The selected printing is shown in the workspace; use a current browser for full preview details.";
      return;
    }
    returnFocus = trigger || document.querySelector("#inspiration [data-open-preview]");
    if (!preview.open) preview.showModal();
  }
  for (const trigger of document.querySelectorAll("[data-open-preview]")) trigger.addEventListener("click", () => openPreview(trigger));
  $("close-preview").addEventListener("click", closePreview);
  $("back-to-workspace").addEventListener("click", closePreview);
  preview.addEventListener("close", () => {
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    else headings[activePanel].focus({ preventScroll: true });
  });
  preview.addEventListener("click", event => {
    if (event.target !== preview) return;
    const bounds = preview.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePreview();
  });

  function setImage(element, image, alt) {
    element.hidden = !image;
    if (!image) { element.removeAttribute("src"); return; }
    element.alt = alt;
    element.src = image.url;
  }
  for (const id of ["inspiration-image", "selection-thumb"]) $(id).addEventListener("error", () => { $(id).hidden = true; });
  $("preview-image").addEventListener("error", () => {
    $("preview-image").hidden = true;
    $("image-status").textContent = "Artwork could not load. Printing details are still available below.";
    $("image-status").hidden = false;
  });
  function showFace() {
    $("image-status").hidden = true;
    const image = current.images[face];
    setImage($("preview-image"), image, image ? `${image.name} — ${current.setCode} #${current.collectorNumber}` : "");
    $("flip-preview").hidden = current.images.length < 2;
    $("flip-preview").textContent = face === 0 ? "View other face" : "View front face";
    if (!image) {
      $("image-status").textContent = "No artwork was supplied for this printing. Its identifying details are shown below.";
      $("image-status").hidden = false;
    }
  }
  $("flip-preview").addEventListener("click", () => { face = (face + 1) % current.images.length; showFace(); });

  function renderCard(card) {
    current = card;
    face = 0;
    const printing = `${card.setName} · ${card.setCode} #${card.collectorNumber}`;
    const values = {
      "selection-name": card.name, "selection-set": `${card.setCode} #${card.collectorNumber}`,
      "inspiration-name": card.name, "inspiration-printing": printing,
      "preview-name": card.name, "preview-type": card.type, "preview-mv": card.manaValue,
      "preview-printing": printing, "preview-artist": card.artist, "preview-finish": card.finishLabel,
      "preview-finishes": card.finishes, "preview-language": card.language, "preview-released": card.released,
      "preview-id": card.id, "preview-oracle": card.oracle, "preview-brief": card.summary, "preview-note": card.finishNotice
    };
    for (const [id, value] of Object.entries(values)) $(id).textContent = value;
    setImage($("inspiration-image"), card.images[0], `${card.name} selected printing`);
    setImage($("selection-thumb"), card.images[0], "");
    showFace();
    for (const [id, href] of [["preview-guide", card.guide], ["preview-source", card.sourceUrl]]) {
      $(id).hidden = !href;
      if (href) $(id).href = href;
      else $(id).removeAttribute("href");
    }
    $("discover-selection").hidden = false;
    $("inspiration").hidden = false;
    $("selection-status").textContent = "Selected printing loaded. It has not been added to a deck.";
  }

  function showError(error) {
    $("selection-error-message").textContent = error.message;
    $("selection-error").hidden = false;
    $("retry-printing").hidden = !error.retryable;
    $("selection-status").textContent = "The deck workspace is still available. No card has been added.";
  }

  async function loadSelection() {
    if (!selection || loading) return;
    loading = true;
    $("selection-error").hidden = true;
    $("retry-printing").disabled = true;
    $("inspiration").setAttribute("aria-busy", "true");
    $("selection-status").textContent = "Loading your exact printing from Scryfall…";
    try {
      renderCard(await data.fetchPrinting(selection));
      // Opening a handoff preview is intentional; navigation and the empty deck remain intact.
      openPreview();
    } catch (error) { showError(error); }
    finally {
      loading = false;
      $("retry-printing").disabled = false;
      $("inspiration").removeAttribute("aria-busy");
    }
  }
  $("retry-printing").addEventListener("click", loadSelection);
  try { selection = data.parseSelection(window.location.search); }
  catch (error) { showError(error); }
  if (selection) loadSelection();
})();
