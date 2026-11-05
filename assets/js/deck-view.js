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
  function renderEntries(deck, container, { isVerified = () => false } = {}, inspection = null) {
    const profile = formats.get(deck.format);
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const focus = active ? { key: active.dataset.key, action: active.dataset.action } : null;
    const fragment = document.createDocumentFragment();
    for (const zone of ["commander", "signature", "main", "sideboard"]) {
      const entries = deck.entries.filter(e => e.zone === zone);
      if (!entries.length) continue;
      const section = node("section", "ds-deck-zone"); section.dataset.zone=zone;
      section.append(node("h3", "ds-zone-heading", `${zone === "signature" ? "Signature spells" : zone === "commander" ? "Command zone" : zone === "sideboard" ? "Sideboard" : "Main deck"} · ${entries.reduce((n, e) => n + e.quantity, 0)}`));
      const grid = node("div", "ds-card-grid"); grid.dataset.view = deck.view;
      for (const entry of entries) {
        const card = deck.cards[entry.printingId];
        const article = node("article", "ds-deck-entry"); article.dataset.key = entry.key; article.dataset.zone=zone;
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
        const roles=inspection?.cardRoles[card.id]?.roles||[];
        article.dataset.roles=roles.join(" ");
        const meaningful=roles.filter(role=>!["land","creature","artifact","enchantment","instant","sorcery","planeswalker","spell","manaEngine","life","enters","tribal"].includes(role)&&inspection?.labels[role]);
        if(meaningful.length){
          const summary=node("p","ds-entry-roles",meaningful.slice(0,3).map(role=>inspection.labels[role]).join(" · "));
          summary.title=meaningful.map(role=>inspection.labels[role]).join(" · ");article.append(summary);
        }
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
  function filterEntries(deck,container,keys) {
    let count=0;
    const byKey=new Map(deck.entries.map(entry=>[entry.key,entry]));
    for(const article of container.querySelectorAll(".ds-deck-entry")){
      const entry=byKey.get(article.dataset.key);
      article.hidden=entry?.zone==="main"&&!keys.has(entry.key);
      if(entry?.zone==="main"&&!article.hidden)count+=entry.quantity;
    }
    const zone=container.querySelector('[data-zone="main"].ds-deck-zone');
    if(zone){const total=deck.entries.filter(e=>e.zone==="main").reduce((n,e)=>n+e.quantity,0);zone.querySelector("h3").textContent=`Main deck · ${count} / ${total} shown`;}
    return count;
  }
  function renderFilters(analysis,selected,essential,strategy) {
    const active=[essential,strategy].find(container=>container.contains(document.activeElement));
    const focused=active?document.activeElement.dataset.filter:"";
    if(!analysis.categories.some(c=>c.id===selected))selected="all";
    for(const [group,container]of [["essential",essential],["strategy",strategy]]){
      container.replaceChildren(...analysis.categories.filter(c=>c.group===group||(group==="essential"&&c.group==="additional"&&c.id===selected)).map(category=>{
        const b=node("button","ds-filter-chip",`${category.label} ${category.count}`);b.type="button";b.dataset.filter=category.id;
        b.setAttribute("aria-pressed",String(category.id===selected));b.setAttribute("aria-controls","deck-entries");return b;
      }));container.hidden=!container.children.length;
    }
    if(focused)([...essential.querySelectorAll("button"),...strategy.querySelectorAll("button")].find(b=>b.dataset.filter===focused)||essential.querySelector("button"))?.focus({preventScroll:true});
    return selected;
  }
  function renderHealth(report,dom) {
    dom.panel.hidden=!(report.configured||report.hasSavedPlan);dom.panel.dataset.state=report.state;dom.state.textContent=report.label;
    const metric=key=>report.metrics.find(m=>m.key===key);
    dom.brief.textContent=[`Theme: ${report.themeState}`,...["ramp","draw","interaction","protection"].map(key=>{const m=metric(key);return m?`${({ramp:"Ramp",draw:"Draw",interaction:"Interaction",protection:"Protection"})[key]}: ${m.count<m.target?"Low":"Met"}`:"";})].filter(Boolean).join(" · ");
    dom.context.textContent=`${report.styles.map(key=>dom.styleLabel(key)).join(" → ")} · ${report.priorities.adherence} adherence · Average nonland mana value ${report.stats.average===null?"unknown":report.stats.average.toFixed(2)}. Targets count the main deck.`;
    dom.legality.textContent=`Construction: ${report.validation.label}. Composition is separate from current legality.`;
    function rows(metrics,container){container.replaceChildren(...metrics.map(m=>{
      const row=node("div");row.dataset.role=m.key;row.dataset.state=m.state||"observed";
      const term=node("dt");
      if(report.categories.some(c=>c.id===m.key&&c.count>0)){
        const control=node("button","ds-health-role",m.label);control.type="button";control.dataset.filter=m.key;control.setAttribute("aria-controls","deck-entries");control.setAttribute("aria-pressed",String(dom.activeFilter===m.key));control.setAttribute("aria-label",`Filter main-deck cards: ${m.label}, ${m.count}`);term.append(control);
      }else term.textContent=m.label;
      row.append(term,node("dd","",m.target===null?`${m.count} observed${m.commanderCount?` · ${m.commanderCount} in command zone`:""}`:`${m.count} / ${m.target}+ · ${m.healthLabel||""}`));return row;
    }));}
    dom.coverage.replaceChildren(...report.styleCoverage.map(style=>{const row=node("div");row.append(node("dt","",`${style.rank} · ${style.label}`),node("dd","",`${style.count} supporting cards`));return row;}));
    rows(report.metrics.filter(m=>m.section==="theme"),dom.theme);rows(report.metrics.filter(m=>m.section==="infrastructure"),dom.infrastructure);
    rows(report.observations,dom.observed);
    rows(report.roleCounts.filter(m=>!report.metrics.some(x=>x.key===m.key)&&!report.observations.some(x=>x.key===m.key)).map(m=>({...m,target:null})),dom.other);
    dom.warnings.replaceChildren(...report.warnings.map(message=>node("li","",message)));dom.warnings.hidden=!report.warnings.length;
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
  const api = Object.freeze({ node, button, renderEntries, filterEntries, renderFilters, renderHealth, appendResults });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckView = api;
})(typeof window === "undefined" ? globalThis : window);
