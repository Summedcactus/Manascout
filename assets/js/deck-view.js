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
  // UI nodes are keyed by the existing model entry key; no second deck state.
  const entryNodes = new WeakMap();
  function text(element, value) { if (element.textContent !== value) element.textContent = value; }
  function orderChildren(parent, children) {
    const wanted = new Set(children);
    for (const child of [...parent.children]) if (!wanted.has(child)) child.remove();
    children.forEach((child, index) => {
      if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] || null);
    });
  }
  function createEntry(entry) {
    const article = node("article", "ds-deck-entry"); article.dataset.key = entry.key;
    const inspect = button("inspect-entry", "", entry.key); inspect.className = "ds-entry-preview";
    const name = node("strong", "ds-entry-name"); inspect.append(name);
    // Stage 4 can append controls here without replacing the article or its entry key.
    const printing = node("div", "ds-entry-printing");
    const info = node("p", "ds-entry-meta"); printing.append(info);
    const status = node("p", "ds-entry-legality");
    const controls = node("div", "ds-entry-controls");
    const decrease = button("decrease", "−", entry.key), increase = button("increase", "+", entry.key);
    const remove = button("remove", "Remove", entry.key), quantity = node("span", "ds-entry-quantity");
    controls.append(decrease, quantity, increase, remove);
    const roles = node("p", "ds-entry-roles"), owner = node("p", "ds-entry-owner ds-entry-meta");
    const move = button("move-main", "", entry.key); move.className = "ds-entry-move";
    article.append(inspect, printing, roles, status, controls, owner, move);
    entryNodes.set(article, { inspect, name, printing, info, status, controls, decrease, increase, remove, quantity, roles, owner, move, art: null, url: null });
    return article;
  }
  function renderEntries(deck, container, { isVerified = () => false } = {}, inspection = null) {
    const profile = formats.get(deck.format);
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const articles = new Map([...container.querySelectorAll(".ds-deck-entry")].map(a => [a.dataset.key, a]));
    const sections = [];
    for (const zone of ["commander", "signature", "main", "sideboard"]) {
      const entries = deck.entries.filter(e => e.zone === zone);
      if (!entries.length) continue;
      let section = container.querySelector(`.ds-deck-zone[data-zone="${zone}"]`);
      if (!section) {
        section = node("section", "ds-deck-zone"); section.dataset.zone = zone;
        section.append(node("h3", "ds-zone-heading"), node("div", "ds-card-grid"));
      }
      const heading = section.querySelector("h3"), grid = section.querySelector(".ds-card-grid");
      text(heading, `${zone === "signature" ? "Signature spells" : zone === "commander" ? "Command zone" : zone === "sideboard" ? "Sideboard" : "Main deck"} · ${entries.reduce((n, e) => n + e.quantity, 0)}`);
      grid.dataset.view = deck.view;
      const children = entries.map(entry => {
        const card = deck.cards[entry.printingId];
        const article = articles.get(entry.key) || createEntry(entry), ui = entryNodes.get(article);
        article.dataset.zone = zone; article.dataset.printingId = entry.printingId; article.dataset.finish = entry.finish;
        ui.inspect.setAttribute("aria-label", `Inspect ${card.name}, ${card.setCode} #${card.collectorNumber}, ${entry.finish}`);
        const url = card.images[0]?.url || "";
        if (ui.url !== url) {
          ui.art?.remove(); ui.art = image(card); ui.url = url;
          ui.inspect.insertBefore(ui.art, ui.name);
        }
        text(ui.name, card.name);
        text(ui.info, `${card.setCode} #${card.collectorNumber} · ${entry.finish}`);
        ui.printing.dataset.printingId = entry.printingId;
        for (const [control, label] of [[ui.decrease,"Remove one copy of"],[ui.increase,"Add one copy of"],[ui.remove,"Remove all copies of"]]) control.setAttribute("aria-label", `${label} ${card.name}`);
        ui.increase.disabled = ["commander", "signature"].includes(zone);
        text(ui.quantity, String(entry.quantity)); ui.quantity.setAttribute("aria-label", `${entry.quantity} copies of ${card.name}`);
        text(ui.status, !isVerified(card) ? "Legality needs recheck" : !card.games?.includes(profile.platform) ? `Printing unavailable in ${profile.platform}` : formats.supportedLegality(card, profile) ? card.legalities[profile.legalityKey] === "restricted" ? "Restricted — maximum one" : "Card legal in format" : !card.legalities[profile.legalityKey] || card.legalities[profile.legalityKey] === "unknown" ? "Legality not supplied" : "Not legal in format");
        const roles = inspection?.cardRoles[card.id]?.roles || []; article.dataset.roles = roles.join(" ");
        const meaningful = roles.filter(role => !["land","creature","artifact","enchantment","instant","sorcery","planeswalker","spell","manaEngine","life","enters","tribal"].includes(role) && inspection?.labels[role]);
        text(ui.roles, meaningful.slice(0,3).map(role => inspection.labels[role]).join(" · "));
        ui.roles.hidden = !meaningful.length; ui.roles.title = meaningful.map(role => inspection.labels[role]).join(" · ");
        ui.owner.hidden = zone !== "signature";
        text(ui.owner, zone === "signature" ? `For: ${deck.cards[entry.assignedTo]?.name || "Unassigned Oathbreaker"}` : "");
        ui.move.hidden = !(["commander","signature","sideboard"].includes(zone) || profile.sideboard);
        ui.move.dataset.action = zone === "main" ? "move-sideboard" : "move-main";
        text(ui.move, ["commander","signature"].includes(zone) ? "Move one to main" : zone === "main" ? "To sideboard" : "To main deck");
        return article;
      });
      orderChildren(grid, children); sections.push(section);
    }
    orderChildren(container, sections);
    if (active && !container.contains(active)) {
      const target = [...container.querySelectorAll("button")].find(b => !b.closest(".ds-deck-entry")?.hidden && !b.hidden && !b.disabled) || document.getElementById("deck-heading");
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
