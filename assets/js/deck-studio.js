/* Deck Studio controller: navigation and compact preview, backed by one deck model. */
(() => {
  "use strict";
  const data = window.ManaScoutDeckData;
  const model = window.ManaScoutDeckModel;
  const client = window.ManaScoutDeckClient?.createClient();
  const view = window.ManaScoutDeckView;
  const rules = window.ManaScoutDeckRules;
  const persistence = window.ManaScoutDeckStore;
  const $ = id => document.getElementById(id);
  const body = document.body;
  if (!body.classList.contains("deck-studio") || !data || !model || !client || !view || !rules || !persistence) return;

  const mobile = window.matchMedia("(max-width: 820px)");
  const panels = { deck: $("studio-deck"), discover: $("studio-discover"), stats: $("studio-stats") };
  const headings = { deck: $("deck-heading"), discover: $("discover-heading"), stats: $("stats-heading") };
  const nav = document.querySelector(".ds-mobile-nav");
  const navButtons = [...nav.querySelectorAll("[data-panel]")];
  const collapsed = new Set();
  const scrollPositions = new Map();
  const preview = $("card-preview");
  let deck = model.createDeck();
  let activePanel = "deck";
  let selection = null;
  let current = null;
  let currentFinish = "";
  let face = 0;
  let loading = false;
  let returnFocus = null;
  let returnFocusKey = null;
  const eligibilityJobs = new Map();
  const eligibilityErrors = new Map();
  let storage;
  try { storage = window.localStorage; } catch { /* Editing and JSON backup remain available. */ }
  const store = persistence.createStore({ storage });
  let savedToken = null, dirty = false, storagePaused = false, saveTimer = 0, savePromise = null;
  let lastSaveError = "", recoveryRows = [];
  let lastCheckpoint = "";

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
    returnFocusKey = returnFocus?.dataset.key ? { key: returnFocus.dataset.key, action: returnFocus.dataset.action } : null;
    if (!preview.open) preview.showModal();
  }
  for (const trigger of document.querySelectorAll("[data-open-preview]")) trigger.addEventListener("click", () => openPreview(trigger));
  $("close-preview").addEventListener("click", closePreview);
  $("back-to-workspace").addEventListener("click", closePreview);
  preview.addEventListener("close", () => {
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    else {
      const replacement = returnFocusKey && [...document.querySelectorAll("button[data-action]")].find(button => button.dataset.key === returnFocusKey.key && button.dataset.action === returnFocusKey.action && button.getClientRects().length);
      (replacement || headings[activePanel]).focus({ preventScroll: true });
    }
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

  function renderCard(card, finish = card.finish) {
    current = card;
    currentFinish = finish;
    face = 0;
    const printing = `${card.setName} · ${card.setCode} #${card.collectorNumber}`;
    const values = {
      "selection-name": card.name, "selection-set": `${card.setCode} #${card.collectorNumber}`,
      "inspiration-name": card.name, "inspiration-printing": printing,
      "preview-name": card.name, "preview-type": card.type, "preview-mv": card.manaValue,
      "preview-printing": printing, "preview-artist": card.artist, "preview-finish": finish === "nonfoil" ? "Nonfoil" : finish === "etched" ? "Etched foil" : finish === "foil" ? "Foil" : "Not supplied",
      "preview-finishes": card.finishes, "preview-language": card.language, "preview-released": card.released,
      "preview-id": card.id, "preview-oracle": card.oracle, "preview-brief": card.summary, "preview-note": card.availableFinishes.includes(finish) ? card.finishNotice : "The selected finish is not listed as available for this printing. Any saved entry is preserved; adding that finish is disabled."
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
    $("selection-status").textContent = "Selected printing loaded. Use Add to deck to include it.";
    const entryMetadataChanged = deck.cards[card.id] && deck.cards[card.id] !== card && deck.entries.some(entry => entry.printingId === card.id);
    const selectedDeck = model.select(deck, card, currentFinish);
    if (selectedDeck !== deck) { deck = selectedDeck; dirty = true; scheduleSave(); if (entryMetadataChanged) renderDeck(); }
    renderPreviewActions();
    if (deck.format === "commander" && !rules.background(card)) checkCommander(card);
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
      renderCard(await client.printing(selection));
      if (window.history?.replaceState && window.location.href) {
        const url = new URL(window.location.href);
        for (const parameter of ["card", "printing", "finish", "guide"]) url.searchParams.delete(parameter);
        window.history.replaceState({}, "", url.href);
      }
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
  function message(text) { $("deck-message").textContent = text; }
  function commitState(next, text = "") {
    if (next !== deck) { deck = next; dirty = true; scheduleSave(); }
    renderDeck();
    const warning = rules.validate(deck, client).issues.find(i => i.severity === "error" || i.severity === "unsupported");
    message((text || "Deck updated.") + (warning ? ` Warning: ${warning.message}` : ""));
  }
  function renderPreviewActions() {
    if (!current) return;
    const zone = $("preview-zone").value || "main";
    const entry = previewEntry();
    $("preview-remove").disabled = !entry;
    $("preview-remove").textContent = entry?.zone === "commander" ? "Remove commander" : "Remove one";
    $("preview-add").disabled = !current.availableFinishes.includes(currentFinish);
    $("preview-context").textContent = entry?.zone === "commander" ? "This exact printing and finish is assigned as a commander. Add to deck places any additional copies in the main deck." : entry ? `${entry.quantity} ${entry.quantity === 1 ? "copy" : "copies"} of this printing and finish in ${zone === "main" ? "the main deck" : "the sideboard"}.` : "Selected printing. This version has not been added to this section.";
    renderCommanderAction();
  }
  function previewEntry() {
    if (!current) return null;
    const matches = e => e.printingId === current.id && e.finish === currentFinish;
    return deck.entries.find(e => matches(e) && e.zone === ($("preview-zone").value || "main")) || deck.entries.find(e => matches(e) && e.zone === "commander") || null;
  }
  function renderDeck() {
    if (document.activeElement !== $("deck-name")) $("deck-name").value = deck.name;
    $("deck-format").value = deck.format;
    for (const id of ["search-zone", "preview-zone"]) {
      const select = $(id);
      select.querySelector('option[value="sideboard"]').disabled = deck.format !== "pauper";
      if (deck.format !== "pauper") select.value = "main";
    }
    $("view-artwork").setAttribute("aria-pressed", String(deck.view === "artwork"));
    $("view-list").setAttribute("aria-pressed", String(deck.view === "list"));
    const count = model.count(deck);
    $("empty-deck").hidden = count > 0;
    $("deck-entries").hidden = count === 0;
    $("deck-count").textContent = deck.format === "commander" ? `${model.count(deck, "main") + model.count(deck, "commander")} / 100 · Commander${model.count(deck, "sideboard") ? ` · ${model.count(deck, "sideboard")} sideboard (not allowed)` : ""}` : `${model.count(deck, "main")} / 60+ main · ${model.count(deck, "sideboard")} / 15 side`;
    view.renderEntries(deck, $("deck-entries"), client);
    renderPreviewActions();
    renderStatistics();
  }
  function addCard(card, zone = "main", quantity = 1, finish = card.finish) {
    if (zone === "sideboard" && deck.format !== "pauper") throw Error("Sideboards are supported for Pauper only.");
    commitState(model.add(deck, card, { zone, quantity, finish }), `Added ${quantity} × ${card.name} to ${zone === "main" ? "the main deck" : "the sideboard"}.`);
  }
  $("deck-name").addEventListener("input", () => commitState(model.edit(deck, { name: $("deck-name").value })));
  $("deck-format").addEventListener("change", () => { commitState(model.edit(deck, { format: $("deck-format").value }), "Format changed. All entries have been preserved."); if (current && deck.format === "commander") checkCommander(current); });
  for (const mode of ["artwork", "list"]) $("view-" + mode).addEventListener("click", () => commitState(model.edit(deck, { view: mode })));
  $("preview-zone").addEventListener("change", renderPreviewActions);
  $("preview-add").addEventListener("click", () => {
    try { if (current) addCard(current, $("preview-zone").value || "main", Number($("preview-quantity").value), currentFinish); }
    catch (error) { message(error.message); }
  });
  $("preview-remove").addEventListener("click", () => {
    const entry = previewEntry();
    if (entry) commitState(model.setQuantity(deck, entry.key, entry.quantity - 1), `Removed one ${current.name}.`);
  });
  $("deck-entries").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const entry = deck.entries.find(e => e.key === button.dataset.key);
    if (!entry) return;
    try {
      if (button.dataset.action === "inspect-entry") {
        renderCard(deck.cards[entry.printingId], entry.finish); openPreview(button); return;
      }
      if (button.dataset.action === "increase") commitState(model.setQuantity(deck, entry.key, entry.quantity + 1));
      if (button.dataset.action === "decrease") commitState(model.setQuantity(deck, entry.key, entry.quantity - 1));
      if (button.dataset.action === "remove") commitState(model.setQuantity(deck, entry.key, 0), "Entry removed. Other printings are unchanged.");
      if (button.dataset.action === "move-main") commitState(model.moveOne(deck, entry.key, "main"));
      if (button.dataset.action === "move-sideboard") commitState(model.moveOne(deck, entry.key, "sideboard"));
    } catch (error) { message(error.message); }
  });

  const results = new Map();
  let resultCards = [], resultShown = 0, nextPage = "", searchQuery = "", searchToken = 0;
  let searchController = null, autoController = null, searchTimer = 0, autoTimer = 0;
  function showMoreResults() {
    const batch = resultCards.slice(resultShown, resultShown + 24);
    for (const card of batch) results.set(card.id, card);
    view.appendResults(batch, $("search-results"));
    resultShown += batch.length;
    $("search-more").hidden = resultShown >= resultCards.length && !nextPage;
    $("search-status").textContent = resultShown ? `${resultShown} results shown. Quick Add keeps your place.` : "No matching cards. Try another name or query.";
  }
  async function runSearch(append = false) {
    const query = $("studio-search").value.trim();
    if (!query) return;
    searchController?.abort(); searchController = new AbortController();
    const token = ++searchToken;
    if (!append) { searchQuery = query; resultCards = []; resultShown = 0; nextPage = ""; results.clear(); $("search-results").replaceChildren(); }
    $("search-status").textContent = "Searching Scryfall…";
    $("search-results").setAttribute("aria-busy", "true"); $("search-more").disabled = true;
    try {
      const response = await client.search(searchQuery, { signal: searchController.signal, page: append ? nextPage : "" });
      if (token !== searchToken) return;
      resultCards.push(...response.cards); nextPage = response.nextPage; showMoreResults();
    } catch (error) { if (error.name !== "AbortError" && token === searchToken) $("search-status").textContent = error.message; }
    finally { if (token === searchToken) { $("search-results").removeAttribute("aria-busy"); $("search-more").disabled = false; } }
  }
  $("studio-search").addEventListener("input", () => {
    clearTimeout(searchTimer); clearTimeout(autoTimer); searchController?.abort(); autoController?.abort(); ++searchToken;
    $("search-results").removeAttribute("aria-busy"); $("search-more").disabled = false;
    const query = $("studio-search").value.trim();
    $("studio-suggestions").replaceChildren();
    if (query.length < 2) { results.clear(); resultCards = []; resultShown = 0; nextPage = ""; $("search-results").replaceChildren(); $("search-more").hidden = true; $("search-status").textContent = "Type at least two characters, or press Search."; return; }
    autoController = new AbortController();
    const signal = autoController.signal;
    autoTimer = setTimeout(async () => {
      try {
        const names = await client.autocomplete(query, { signal });
        if (signal.aborted) return;
        $("studio-suggestions").replaceChildren(...names.map(name => { const option = view.node("option"); option.value = name; return option; }));
      } catch { /* Autocomplete is optional; explicit search retains its error handling. */ }
    }, 180);
    searchTimer = setTimeout(() => runSearch(), 350);
  });
  $("studio-search-form").addEventListener("submit", event => { event.preventDefault(); clearTimeout(searchTimer); clearTimeout(autoTimer); autoController?.abort(); runSearch(); });
  $("search-more").addEventListener("click", () => { if (resultShown < resultCards.length) showMoreResults(); else if (nextPage) runSearch(true); });
  $("search-results").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    const card = results.get(button?.dataset.key);
    if (!card) return;
    if (button.dataset.action === "inspect-search") { renderCard(card); openPreview(button); }
    if (button.dataset.action === "quick-add") {
      try { addCard(card, $("search-zone").value || "main"); $("search-status").textContent = `Added ${card.name}. Keep searching or add another.`; }
      catch (error) { $("search-status").textContent = error.message; }
    }
  });

  function renderStatistics() {
    const validation = rules.validate(deck, client), stats = rules.statistics(deck);
    $("deck-validity").textContent = validation.label;
    $("deck-validity").dataset.state = validation.status;
    $("stat-count-label").textContent = deck.format === "commander" ? "Deck + commanders" : "Main deck";
    $("stat-count").textContent = deck.format === "commander" ? `${validation.total} / 100` : `${validation.main} / 60+`;
    $("stat-average").textContent = stats.average === null ? "—" : stats.average.toFixed(2);
    $("stat-lands").textContent = String(stats.lands); $("stat-creatures").textContent = String(stats.creatures);
    $("stat-commanders").textContent = String(validation.command);
    $("stat-sideboard").textContent = `${validation.side} / ${deck.format === "pauper" ? 15 : 0}`;
    const chart = $("mana-curve"); chart.replaceChildren(); chart.hidden = stats.average === null;
    const maximum = Math.max(1, ...stats.curve);
    stats.curve.forEach((count, i) => {
      const column = view.node("li", "ds-curve-column");
      const bar = view.node("span", "ds-curve-bar"); bar.setAttribute("aria-hidden", "true"); bar.style.height = `${count / maximum * 52}px`;
      column.setAttribute("aria-label", `Mana value ${i === 7 ? "7 or more" : i}: ${count} cards`);
      column.append(view.node("strong", "", String(count)), bar, view.node("span", "", i === 7 ? "7+" : String(i))); chart.append(column);
    });
    $("curve-note").textContent = stats.average === null ? "Add nonland cards with known mana values to see the curve." : `Nonland cards only; quantities included. X is zero outside the stack.${stats.unknownMana ? ` ${stats.unknownMana} cards have unknown mana values and are excluded.` : ""}`;
    for (const [id, values] of [["color-distribution", stats.distribution], ["type-breakdown", stats.types]]) {
      const nodes = [];
      const names = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colourless" };
      for (const [label, count] of Object.entries(values)) {
        const row = view.node("div"); row.append(view.node("dt", "", names[label] || label), view.node("dd", "", String(count))); nodes.push(row);
      }
      $(id).replaceChildren(...nodes);
    }
    $("deck-warning-details").hidden = !validation.issues.length;
    $("deck-warning-summary").textContent = `${validation.issues.length} construction ${validation.issues.length === 1 ? "issue" : "issues"}`;
    $("deck-issues").replaceChildren(...validation.issues.map(issue => view.node("li", `ds-issue-${issue.severity}`, issue.message)));
    return validation;
  }
  function commanderCards() { return deck.entries.filter(e => e.zone === "commander").map(e => deck.cards[e.printingId]); }
  function renderCommanderAction() {
    const button = $("preview-commander"); button.hidden = deck.format !== "commander";
    if (!current) return;
    const fresh = client.isVerified(current), legality = current.legalities[deck.format];
    const proof = client.proof(current), pending = eligibilityJobs.has(current.oracleId);
    const eligibleBackground = rules.background(current) && commanderCards().length === 1 && rules.pair(commanderCards()[0], current).valid && client.proof(commanderCards()[0]) === true;
    let note = fresh ? `${deck.format === "commander" ? "Commander" : "Pauper"} card status: ${legality.replace(/_/g, " ")}.` : "Current legality is not verified. Recheck card data before assigning a commander.";
    button.disabled = pending || (fresh && legality !== "legal");
    button.textContent = pending ? "Checking commander eligibility…" : "Use one as commander";
    if (deck.format === "commander") {
      if (rules.colorChoice(current)) { note += " This commander needs a pregame colour choice; that configuration is unsupported."; button.disabled = true; }
      else if (rules.background(current)) { note += eligibleBackground ? " Can join the selected Choose a Background commander." : " This Background needs a verified Choose a Background commander first."; button.disabled = button.disabled || !eligibleBackground; }
      else if (proof === false) { note += " Not eligible as a commander. You may include it in the main deck instead, subject to the other deck rules."; button.disabled = true; }
      else if (proof === null) { note += pending ? " Checking commander eligibility." : " Commander eligibility has not been verified."; button.textContent = pending ? "Checking commander eligibility…" : "Check commander eligibility"; }
      else note += " Commander eligibility verified by Scryfall; pairing and deck rules still apply.";
    }
    $("preview-legality").textContent = note;
    if (eligibilityErrors.has(current.oracleId)) $("preview-legality").textContent += ` Last eligibility check failed: ${eligibilityErrors.get(current.oracleId)}`;
    $("preview-add").textContent = deck.format === "commander" && proof === false && commanderCards().length < 2 ? "Add to the 99 +" : "Add to deck +";
    if (commanderCards().some(card => card.id === current.id)) { button.disabled = true; button.textContent = "Assigned as commander"; }
  }
  async function checkCommander(card) {
    if (!client.isVerified(card) || rules.background(card) || client.proof(card) !== null) return;
    let task = eligibilityJobs.get(card.oracleId);
    if (!task) { eligibilityErrors.delete(card.oracleId); task = client.commanderEligibility(card); eligibilityJobs.set(card.oracleId, task); }
    renderCommanderAction();
    try { await task; }
    catch (error) { eligibilityErrors.set(card.oracleId, error.message); if (current?.id === card.id) message(`Commander eligibility could not be verified: ${error.message} You can still edit the main deck.`); }
    finally { eligibilityJobs.delete(card.oracleId); if (current?.id === card.id) renderCommanderAction(); renderStatistics(); }
  }
  $("preview-commander").addEventListener("click", async () => {
    const originalId = current?.id, deckId = deck.id;
    if (!current || deck.format !== "commander") return;
    try {
      let card = current;
      if (!client.isVerified(card)) {
        const fresh = await client.printing({ id: card.id, requestedFinish: currentFinish, guide: card.guide });
        if (deck.id !== deckId || current?.id !== originalId) return;
        commitState(model.replaceRecords(deck, [fresh])); renderCard(fresh, currentFinish); card = fresh;
      }
      if (card.legalities.commander !== "legal") throw Error(`${card.name} is not currently legal in Commander.`);
      if (rules.colorChoice(card)) throw Error("Pregame colour-choice commanders are not supported. This card can still be added to the main deck.");
      if (!rules.background(card)) await checkCommander(card);
      if (deck.id !== deckId || current?.id !== originalId) return;
      if (!rules.background(card) && client.proof(card) !== true) throw Error("Commander eligibility has not passed. Use Add to deck to include this printing in the main deck instead.");
      const commanders = commanderCards();
      if (commanders.some(c => c.oracleId === card.oracleId || c.name === card.name)) throw Error("This card is already assigned as a commander.");
      if (model.count(deck, "commander") >= 2) throw Error("Remove or move an existing commander before selecting another. More than two are not supported.");
      if (!commanders.length && rules.background(card)) throw Error("Choose a Background commander first; a Background cannot command alone.");
      if (commanders.length) { const pairing = rules.pair(commanders[0], card); if (!pairing.valid) throw Error(pairing.reason); }
      const inMain = deck.entries.find(e => e.printingId === card.id && e.finish === currentFinish && e.zone === "main");
      commitState(inMain ? model.moveOne(deck, inMain.key, "commander") : model.add(deck, card, { finish: currentFinish, zone: "commander" }), `${card.name} assigned as a commander. It counts within the 100-card total.`);
    } catch (error) { message(error.message); }
  });
  let refreshing = false;
  async function refreshDeckData() {
    if (refreshing || !Object.keys(deck.cards).length) return;
    const deckId = deck.id;
    refreshing = true; $("refresh-card-data").disabled = true; $("data-check-status").textContent = "Checking current card data…";
    client.clearProofs();
    try {
      const fresh = await client.refresh(Object.values(deck.cards));
      if (deck.id !== deckId) return;
      commitState(model.replaceRecords(deck, fresh));
      for (const commander of commanderCards()) if (!rules.background(commander) && client.isVerified(commander)) await checkCommander(commander);
      if (deck.id !== deckId) return;
      $("data-check-status").textContent = `${fresh.length} printing records rechecked. Any missing records or unsupported configurations remain flagged.`;
      if (current && deck.cards[current.id]) renderCard(deck.cards[current.id], currentFinish);
    } catch (error) { if (deck.id === deckId) $("data-check-status").textContent = error.message + " Cached entries are preserved; current legality is unverified."; }
    finally { refreshing = false; $("refresh-card-data").disabled = false; renderStatistics(); renderPreviewActions(); }
  }
  $("refresh-card-data").addEventListener("click", refreshDeckData);
  setInterval(() => { renderStatistics(); renderPreviewActions(); }, 60000);
  function setSaveStatus(short, detail = "") {
    $("deck-state").textContent = short;
    $("deck-state").dataset.state = short === "Saved locally" ? "saved" : dirty ? "unsaved" : "memory";
    $("save-status-message").textContent = detail || short;
    $("preview-save-status").textContent = detail || short;
  }
  function renderLibrary() {
    const chosenRecovery = $("recovery-versions").value;
    let rows = [];
    try { const library = store.list(); rows = library.decks; if (library.issues.length) $("save-status-message").textContent += ` ${library.issues.length} damaged/unsupported saved records were preserved; check recovery versions or restore a JSON backup.`; }
    catch { /* The current in-memory draft remains usable and visible in the selector. */ }
    const options = rows.map(record => { const option = view.node("option", "", `${record.deck.name} · ${model.count(record.deck)} cards · ${new Date(record.savedAt).toLocaleString()}`); option.value = record.deck.id; return option; });
    if (!rows.some(record => record.deck.id === deck.id)) { const option = view.node("option", "", `${deck.name} · unsaved draft`); option.value = deck.id; options.unshift(option); }
    $("saved-decks").replaceChildren(...options); $("saved-decks").value = deck.id;
    $("delete-deck").disabled = !savedToken; $("reload-deck").disabled = !savedToken;
    try { recoveryRows = store.versions().map(record => ({ id: record.deck.id, token: record.token, name: record.deck.name, savedAt: record.savedAt, kind: record.kind })); } catch { recoveryRows = []; }
    const placeholder = view.node("option", "", "Choose a version"); placeholder.value = "";
    $("recovery-versions").replaceChildren(placeholder, ...recoveryRows.map(record => { const option = view.node("option", "", `${record.name} · ${new Date(record.savedAt).toLocaleString()}${record.kind === "recovery" ? " · recovery checkpoint" : ""}`); option.value = `${record.id}.${record.token}`; return option; }));
    if (recoveryRows.some(record => `${record.id}.${record.token}` === chosenRecovery)) $("recovery-versions").value = chosenRecovery;
    updateRecoveryButtons();
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    if (storagePaused) { setSaveStatus("Save paused", lastSaveError); return; }
    setSaveStatus("Unsaved changes", "Unsaved changes. Autosave will run when edits pause; drafts are local to this browser.");
    saveTimer = setTimeout(() => saveNow(false), 800);
  }
  async function locked(operation) { return window.navigator?.locks?.request ? window.navigator.locks.request("manascout-deckstudio-v1", operation) : operation(); }
  async function saveNow(manual = true) {
    clearTimeout(saveTimer);
    if (savePromise) { const success = await savePromise; if (!success) return false; return dirty ? saveNow(manual) : true; }
    if (storagePaused && !manual) return false;
    const snapshot = deck, expectedToken = savedToken;
    setSaveStatus("Saving…", "Saving this draft in this browser…"); $("save-deck").disabled = true;
    const task = (async () => {
      try {
        const result = await locked(() => store.save(snapshot, { expectedToken }));
        if (deck.id === snapshot.id) {
          savedToken = result.token; storagePaused = false; lastSaveError = ""; dirty = deck.revision !== snapshot.revision;
          setSaveStatus(dirty ? "Unsaved changes" : "Saved locally", result.warning || "Saved in this browser only. Download JSON backups to keep a copy elsewhere.");
          renderLibrary(); if (dirty) scheduleSave();
        }
        return true;
      } catch (error) {
        if (deck.id === snapshot.id) { dirty = true; storagePaused = true; lastSaveError = error.message; setSaveStatus(error.code === "conflict" ? "Save conflict" : "Save failed", error.message); renderLibrary(); }
        return false;
      } finally { $("save-deck").disabled = false; }
    })();
    savePromise = task;
    const success = await task; if (savePromise === task) savePromise = null;
    return success && manual && dirty && deck.id === snapshot.id ? saveNow(true) : success;
  }
  function downloadBackup() {
    try {
      const blob = new Blob([persistence.encodeBackup(deck)], { type: "application/json" });
      const href = URL.createObjectURL(blob), anchor = view.node("a");
      anchor.href = href; anchor.download = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "manascout-deck"}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      message("JSON backup prepared. Keep the downloaded file somewhere safe; browser drafts do not sync across devices.");
    } catch (error) { message(`Backup could not be downloaded: ${error.message}`); }
  }
  const confirmDialog = $("draft-confirm");
  let pendingConfirm = null, confirmTrigger = null;
  function confirmAction(title, text, accept) {
    if (pendingConfirm) return Promise.resolve(false);
    if (typeof confirmDialog.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n\n${text}`));
    $("draft-confirm-title").textContent = title; $("draft-confirm-message").textContent = text; $("draft-confirm-accept").textContent = accept;
    confirmTrigger = document.activeElement;
    return new Promise(resolve => { pendingConfirm = resolve; confirmDialog.showModal(); });
  }
  function resolveConfirm(value) { const resolve = pendingConfirm; pendingConfirm = null; confirmDialog.close(); resolve?.(value); }
  $("draft-confirm-cancel").addEventListener("click", () => resolveConfirm(false));
  $("draft-confirm-accept").addEventListener("click", () => resolveConfirm(true));
  $("draft-confirm-backup").addEventListener("click", downloadBackup);
  confirmDialog.addEventListener("cancel", () => { pendingConfirm?.(false); pendingConfirm = null; });
  confirmDialog.addEventListener("close", () => { pendingConfirm?.(false); pendingConfirm = null; if (confirmTrigger?.isConnected) confirmTrigger.focus({ preventScroll: true }); });
  async function canLeaveDraft() {
    if (savePromise) await savePromise;
    if (!dirty) return true;
    if (await saveNow(false)) return true;
    const leave = await confirmAction("Leave unsaved changes?", "This draft could not be saved. Download a JSON backup before continuing, or keep editing. Continuing will replace the working view without saving these edits.", "Continue without saving");
    if (leave) { try { store.checkpoint(deck, savedToken); } catch { /* Explicitly confirmed leaving; the download action was offered. */ } }
    return leave;
  }
  function activateDraft(record, note = "", markDirty = false) {
    clearTimeout(saveTimer);
    deck = record.deck; savedToken = record.token || null; dirty = !!record.dirty || markDirty; storagePaused = false; lastSaveError = "";
    if (record.recovered) { deck = { ...deck, id: model.newId(), revision: 0 }; savedToken = null; dirty = true; note = "Recovered a previous snapshot as a new draft. The damaged original was left untouched."; }
    current = null; currentFinish = ""; closePreview();
    $("inspiration").hidden = true; $("discover-selection").hidden = true; $("deck-name").value = deck.name;
    $("selection-status").textContent = "No printing selected. Search a card or inspect an entry.";
    renderDeck();
    if (deck.selection && deck.cards[deck.selection.printingId]) renderCard(deck.cards[deck.selection.printingId], deck.selection.finish);
    setSaveStatus(dirty ? "Unsaved changes" : savedToken ? "Saved locally" : "Not saved", note || (savedToken ? "Restored a local draft. Current legality must be rechecked; drafts do not sync across devices." : "Your new draft has not been saved yet."));
    renderLibrary(); if (dirty) scheduleSave();
  }
  $("save-deck").addEventListener("click", () => saveNow(true));
  $("saved-decks").addEventListener("change", async () => {
    const id = $("saved-decks").value;
    if (id === deck.id) return;
    if (!(await canLeaveDraft())) { $("saved-decks").value = deck.id; return; }
    try { activateDraft(store.load(id)); try { store.active(deck.id); } catch { setSaveStatus("Loaded locally", "The draft loaded, but the last-opened selection could not be saved."); } refreshDeckData(); }
    catch (error) { message(error.message); renderLibrary(); }
  });
  $("new-deck").addEventListener("click", async () => {
    if (!(await canLeaveDraft())) return;
    activateDraft({ deck: model.createDeck(), token: null, dirty: false }); activatePanel("deck");
  });
  $("save-copy").addEventListener("click", async () => {
    if (savePromise) await savePromise;
    const copy = { ...deck, id: model.newId(), name: `${deck.name.slice(0, 73)} (copy)`, revision: 0, updatedAt: Date.now() };
    activateDraft({ deck: copy, token: null, dirty: true }, "This copy has a new identity; the existing saved deck is unchanged."); await saveNow(true);
  });
  $("reload-deck").addEventListener("click", async () => {
    const id = deck.id;
    if (dirty && !(await confirmAction("Reload the saved version?", "Unsaved edits will leave the working view. Download a backup first to keep them. The saved deck will not be overwritten.", "Reload saved version"))) return;
    let checkpoint;
    if (dirty) { try { checkpoint = store.checkpoint(deck, savedToken); } catch { /* Explicit confirmation and the download option remain the fallback. */ } }
    try { const record = store.load(id, { includeJournal: false }); if (checkpoint) store.discardJournal(id, checkpoint.token); activateDraft(record); refreshDeckData(); } catch (error) { message(error.message); }
  });
  $("delete-deck").addEventListener("click", async () => {
    if (!savedToken) return;
    const id = deck.id;
    if (!(await confirmAction("Delete this saved deck?", `Delete “${deck.name}” from Saved decks and discard its unsaved edits? Recent snapshots remain in recovery until their backups are explicitly erased.`, "Delete deck"))) return;
    if (deck.id !== id) return;
    try {
      await locked(() => store.remove(id, savedToken));
      const next = store.list().decks[0]; activateDraft(next || { deck: model.createDeck(), token: null });
      if (next) { try { store.active(deck.id); } catch {} refreshDeckData(); }
      message("Deck deleted from Saved decks. Recovery snapshots are still available.");
    } catch (error) { message(error.message); }
  });
  $("download-backup").addEventListener("click", downloadBackup);
  $("restore-backup").addEventListener("click", () => $("backup-file").click());
  $("backup-file").addEventListener("change", async () => {
    const file = $("backup-file").files?.[0]; if (!file) return;
    try {
      if (file.size > persistence.maxBytes) throw Error("Backup files must be JSON under 20 MB.");
      const imported = persistence.decodeBackup(await file.text());
      if (!(await canLeaveDraft())) return;
      imported.name = `${imported.name.slice(0, 69)} (restored)`;
      activateDraft({ deck: imported, token: null, dirty: true }, "Backup restored as a separate draft. Current legality is unverified until rechecked.");
      await saveNow(true); refreshDeckData();
    } catch (error) { message(error.message); }
    finally { $("backup-file").value = ""; }
  });
  function updateRecoveryButtons() {
    const record = recoveryRows.find(r => `${r.id}.${r.token}` === $("recovery-versions").value);
    $("recover-version").disabled = !record;
    try { $("erase-recovery").disabled = !record || store.isSaved(record.id) || record.id === deck.id; } catch { $("erase-recovery").disabled = true; }
  }
  $("recovery-versions").addEventListener("change", updateRecoveryButtons);
  $("recover-version").addEventListener("click", async () => {
    const record = recoveryRows.find(r => `${r.id}.${r.token}` === $("recovery-versions").value);
    if (!record || !(await canLeaveDraft())) return;
    try { const recovered = store.restoreVersion(record.id, record.token); recovered.name = `${recovered.name.slice(0, 68)} (recovered)`; activateDraft({ deck: recovered, token: null, dirty: true }, "Recovery version opened as a new draft; the existing saved deck was not replaced."); await saveNow(true); refreshDeckData(); }
    catch (error) { message(error.message); }
  });
  $("erase-recovery").addEventListener("click", async () => {
    const record = recoveryRows.find(r => `${r.id}.${r.token}` === $("recovery-versions").value);
    if (!record || record.id === deck.id) return;
    if (!(await confirmAction("Permanently erase recovery copies?", `Erase all local recovery snapshots for the deleted deck “${record.name}”? This cannot be undone. Download any needed backup before continuing.`, "Erase recovery copies"))) return;
    try { await locked(() => store.purgeDeleted(record.id)); renderLibrary(); message("Recovery copies for the deleted deck were erased."); } catch (error) { message(error.message); }
  });
  window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== store.pointerKey(deck.id)) return;
    try { const latest = event.newValue ? JSON.parse(event.newValue).token : null; if (latest === savedToken) return; } catch { /* A damaged external write is also a conflict. */ }
    clearTimeout(saveTimer); dirty = true; storagePaused = true;
    lastSaveError = "This draft changed or was deleted in another tab. Your working version is preserved. Save a copy or explicitly reload; autosave is paused to prevent an overwrite.";
    setSaveStatus("Save conflict", lastSaveError); renderLibrary();
  });
  function checkpointIfNeeded() {
    if (!dirty) return;
    const signature = `${deck.id}:${deck.revision}:${savedToken}`;
    if (lastCheckpoint === signature) return;
    try { store.checkpoint(deck, savedToken); lastCheckpoint = signature; } catch { /* Storage failure warnings and the unload guard remain active. */ }
  }
  window.addEventListener("pagehide", checkpointIfNeeded);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { checkpointIfNeeded(); if (dirty && !storagePaused) saveNow(false); } });
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; checkpointIfNeeded(); } });

  try { selection = data.parseSelection(window.location.search); }
  catch (error) { showError(error); }
  let restoredAtStartup = false;
  try {
    const active = store.loadActive();
    if (active) { activateDraft(active); restoredAtStartup = true; if (!selection) refreshDeckData(); }
    else { renderDeck(); renderLibrary(); }
  } catch (error) { renderDeck(); setSaveStatus("Memory only", error.message); renderLibrary(); }
  if (selection) loadSelection().finally(() => { if (restoredAtStartup && Object.values(deck.cards).some(card => !client.isVerified(card))) refreshDeckData(); });
})();
