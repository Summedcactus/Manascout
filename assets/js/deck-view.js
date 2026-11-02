/* Small DOM-only renderers. All card strings are text, never HTML. */
((root) => {
  "use strict";
  const formats = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
  function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }
  function button(action, label, key = "") {
    const b = node("button", "", label);
    b.type = "button"; b.dataset.action = action;
    if (key) b.dataset.key = key;
    return b;
  }
  function image(card) {
    if (!card.images[0]) return node("span", "ds-art-missing", "◇");
    const img = node("img"); img.src = card.images[0].url; img.alt = ""; img.loading = "lazy";
    img.width = 160; img.height = 224;
    img.addEventListener("error", () => { img.hidden = true; }, { once: true });
    return img;
  }
  function renderEntries(deck, container, { isVerified = () => false } = {}) {
    const profile = formats.get(deck.format);
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const focus = active ? { key: active.dataset.key, action: active.dataset.action } : null;
    const fragment = document.createDocumentFragment();
    for (const zone of ["commander", "signature", "main", "sideboard"]) {
      const entries = deck.entries.filter(e => e.zone === zone);
      if (!entries.length) continue;
      const section = node("section", "ds-deck-zone");
      section.append(node("h3", "ds-zone-heading", `${zone === "signature" ? "Signature spells" : zone === "commander" ? "Command zone" : zone === "sideboard" ? "Sideboard" : "Main deck"} · ${entries.reduce((n, e) => n + e.quantity, 0)}`));
      const grid = node("div", "ds-card-grid"); grid.dataset.view = deck.view;
      for (const entry of entries) {
        const card = deck.cards[entry.printingId];
        const article = node("article", "ds-deck-entry"); article.dataset.key = entry.key;
        const inspect = button("inspect-entry", "", entry.key); inspect.className = "ds-entry-preview";
        inspect.setAttribute("aria-label", `Inspect ${card.name}, ${card.setCode} #${card.collectorNumber}`);
        inspect.append(image(card), node("strong", "ds-entry-name", card.name));
        const info = node("p", "ds-entry-meta", `${card.setCode} #${card.collectorNumber} · ${entry.finish}`);
        const controls = node("div", "ds-entry-controls");
        for (const [action, text, label] of [["decrease", "−", "Remove one copy of"], ["increase", "+", "Add one copy of"], ["remove", "×", "Remove all copies of"]]) {
          const b = button(action, text, entry.key); b.setAttribute("aria-label", `${label} ${card.name}`);
          if (["commander", "signature"].includes(entry.zone) && action === "increase") b.disabled = true;
          if (action === "increase") controls.append(node("span", "ds-entry-quantity", String(entry.quantity)));
          controls.append(b);
        }
        const status = node("p", "ds-entry-legality", !isVerified(card) ? "Legality needs recheck" : !card.games?.includes(profile.platform) ? `Printing unavailable in ${profile.platform}` : formats.supportedLegality(card, profile) ? card.legalities[profile.legalityKey] === "restricted" ? "Restricted — maximum one" : "Card legal in format" : !card.legalities[profile.legalityKey] || card.legalities[profile.legalityKey] === "unknown" ? "Legality not supplied" : "Not legal in format");
        article.append(inspect, info, status, controls);
        if (zone === "signature") article.append(node("p", "ds-entry-meta", `For: ${deck.cards[entry.assignedTo]?.name || "Unassigned Oathbreaker"}`));
        if (["commander", "signature"].includes(zone)) {
          const move = button("move-main", "Move one to main", entry.key); move.className = "ds-entry-move"; article.append(move);
        } else if (profile.sideboard || zone === "sideboard") {
          const move = button(zone === "main" ? "move-sideboard" : "move-main", zone === "main" ? "To sideboard" : "To main deck", entry.key); move.className = "ds-entry-move"; article.append(move);
        }
        grid.append(article);
      }
      section.append(grid); fragment.append(section);
    }
    container.replaceChildren(fragment);
    if (focus) {
      const target = [...container.querySelectorAll("button")].find(b => b.dataset.key === focus.key && b.dataset.action === focus.action) || container.querySelector("button") || document.getElementById("deck-heading");
      target?.focus({ preventScroll: true });
    }
  }
  function appendResults(cards, container) {
    for (const card of cards) {
      const row = node("article", "ds-search-result");
      const inspect = button("inspect-search", "", card.id); inspect.className = "ds-search-preview";
      inspect.setAttribute("aria-label", `Inspect ${card.name}`);
      const copy = node("span"); copy.append(node("strong", "", card.name), node("small", "", `${card.setCode} #${card.collectorNumber} · MV ${card.manaValue}`));
      inspect.append(image(card), copy);
      const quick = button("quick-add", "+", card.id); quick.className = "ds-quick-add";
      quick.setAttribute("aria-label", `Quick Add ${card.name}`); quick.title = `Quick Add ${card.name}`;
      quick.disabled = !card.finish;
      row.append(inspect, quick); container.append(row);
    }
  }
  const api = Object.freeze({ node, button, renderEntries, appendResults });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckView = api;
})(typeof window === "undefined" ? globalThis : window);
