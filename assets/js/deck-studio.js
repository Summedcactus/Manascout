/* Deck Studio controller: navigation and compact preview, backed by one deck model. */
(() => {
  "use strict";
  const data = window.ManaScoutDeckData;
  const model = window.ManaScoutDeckModel;
  const client = window.ManaScoutDeckClient?.createClient();
  const view = window.ManaScoutDeckView;
  const rules = window.ManaScoutDeckRules;
  const $ = id => document.getElementById(id);
  const body = document.body;
  if (!body.classList.contains("deck-studio") || !data || !model || !client || !view || !rules) return;

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
  const eligibilityJobs = new Map();
  const eligibilityErrors = new Map();

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
    $("selection-status").textContent = "Selected printing loaded. Use Add to deck to include it.";
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
    deck = next;
    renderDeck();
    const warning = rules.validate(deck, client).issues.find(i => i.severity === "error" || i.severity === "unsupported");
    message((text || "Deck updated.") + (warning ? ` Warning: ${warning.message}` : ""));
  }
  function renderPreviewActions() {
    if (!current) return;
    const zone = $("preview-zone").value || "main";
    const entry = deck.entries.find(e => e.printingId === current.id && e.finish === currentFinish && e.zone === zone);
    $("preview-remove").disabled = !entry;
    $("preview-add").disabled = !currentFinish;
    $("preview-context").textContent = entry ? `${entry.quantity} ${entry.quantity === 1 ? "copy" : "copies"} of this printing and finish in ${zone === "main" ? "the main deck" : "the sideboard"}.` : "Selected printing. This version has not been added to this section.";
    renderCommanderAction();
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
    $("deck-count").textContent = count ? `${count} ${count === 1 ? "card" : "cards"} · ${deck.format === "commander" ? "Commander" : "Pauper"}` : "No cards added";
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
    const entry = deck.entries.find(e => e.printingId === current?.id && e.finish === currentFinish && e.zone === ($("preview-zone").value || "main"));
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
    if (refreshing || !deck.entries.length) return;
    const deckId = deck.id;
    refreshing = true; $("refresh-card-data").disabled = true; $("data-check-status").textContent = "Checking current card data…";
    client.clearProofs();
    try {
      const fresh = await client.refresh(Object.values(deck.cards));
      if (deck.id !== deckId) return;
      commitState(model.replaceRecords(deck, fresh));
      for (const commander of commanderCards()) if (!rules.background(commander) && client.isVerified(commander)) await checkCommander(commander);
      $("data-check-status").textContent = `${fresh.length} printing records rechecked. Any missing records or unsupported configurations remain flagged.`;
      if (current && deck.cards[current.id]) renderCard(deck.cards[current.id], currentFinish);
    } catch (error) { if (deck.id === deckId) $("data-check-status").textContent = error.message + " Cached entries are preserved; current legality is unverified."; }
    finally { refreshing = false; $("refresh-card-data").disabled = false; renderStatistics(); renderPreviewActions(); }
  }
  $("refresh-card-data").addEventListener("click", refreshDeckData);
  setInterval(() => { renderStatistics(); renderPreviewActions(); }, 60000);
  renderDeck();

  try { selection = data.parseSelection(window.location.search); }
  catch (error) { showError(error); }
  if (selection) loadSelection();
})();
