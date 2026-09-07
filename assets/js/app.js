(() => {
  "use strict";

  const API = "https://api.scryfall.com";
  const FX_API = "https://api.frankfurter.dev/v2/rate";
  const els = {
    form: document.getElementById("search-form"),
    input: document.getElementById("search-input"),
    autocomplete: document.getElementById("autocomplete-list"),
    details: document.getElementById("card-details"),
    status: document.getElementById("printings-status"),
    printings: document.getElementById("printings-container")
  };

  let searchController = null;
  let autocompleteController = null;
  let autocompleteTimer = null;
  let searchToken = 0;
  let activeAutocompleteIndex = -1;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function getQueryName() {
    return new URLSearchParams(window.location.search).get("q")?.trim() || "";
  }

  function setQuery(name, replace = false) {
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("q", name);
    else url.searchParams.delete("q");
    history[replace ? "replaceState" : "pushState"]({}, "", url);
  }

  function setLoading() {
    if (!els.details) return;
    els.details.innerHTML = '<div class="loading-state">Searching Scryfall…</div>';
    if (els.status) els.status.textContent = "";
    if (els.printings) els.printings.innerHTML = "";
  }

  function setError(message) {
    if (!els.details) return;
    els.details.innerHTML = `<div class="error-state"><h2>We couldn't find that card</h2><p>${escapeHtml(message)}</p></div>`;
    if (els.status) els.status.textContent = "";
    if (els.printings) els.printings.innerHTML = "";
  }

  function renderFaces(card) {
    if (!Array.isArray(card.card_faces) || card.card_faces.length < 2) {
      return `<div class="oracle"><p>${escapeHtml(card.oracle_text || "No oracle text supplied.")}</p></div>`;
    }
    return `<div class="oracle">${card.card_faces.map(face =>
      `<p><strong>${escapeHtml(face.name || "")}</strong><br>${escapeHtml(face.oracle_text || "")}</p>`
    ).join("")}</div>`;
  }

  function primaryImage(card) {
    return safeUrl(card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "");
  }

  function marketplaceLinks(card) {
    const name = encodeURIComponent(card.name || "");
    return `
      <div class="marketplace-links">
        <a href="https://www.cardmarket.com/en/Magic/Products/Search?searchString=${name}" target="_blank" rel="noopener noreferrer">Search Cardmarket</a>
        <a href="https://www.tcgplayer.com/search/magic/product?q=${name}" target="_blank" rel="noopener noreferrer">Search TCGplayer</a>
      </div>`;
  }

  function renderCard(card) {
    if (!els.details) return;
    const image = primaryImage(card);
    const imageHtml = image
      ? `<div class="card-image-wrap"><img class="card-image" src="${escapeHtml(image)}" alt="${escapeHtml(card.name || "Magic card")}"></div>`
      : `<div class="card-image-wrap"><div class="empty-state">No card image supplied.</div></div>`;

    const legalities = card.legalities
      ? Object.entries(card.legalities)
          .filter(([, value]) => value === "legal")
          .map(([key]) => key.toUpperCase())
          .join(", ")
      : "Not available";

    els.details.innerHTML = `
      <article class="card-display">
        ${imageHtml}
        <div class="card-text-details">
          <p class="eyebrow">CARD</p>
          <h2>${escapeHtml(card.name || "Unknown card")}</h2>
          <p class="card-subtitle">${escapeHtml(card.type_line || "")}${card.mana_cost ? ` · <span class="mana-cost">${escapeHtml(card.mana_cost)}</span>` : ""}</p>
          <div class="detail-grid">
            <div class="detail"><strong>Set</strong>${escapeHtml(card.set_name || "—")}</div>
            <div class="detail"><strong>Collector number</strong>${escapeHtml(card.collector_number || "—")}</div>
            <div class="detail"><strong>Rarity</strong>${escapeHtml(card.rarity || "—")}</div>
            <div class="detail"><strong>Legal in</strong>${escapeHtml(legalities || "—")}</div>
          </div>
          ${renderFaces(card)}
          ${marketplaceLinks(card)}
        </div>
      </article>`;
  }

  function priceCell(value, symbol = "") {
    if (!value) return '<span class="muted">—</span>';
    return `<span class="price"><strong>${escapeHtml(symbol + value)}</strong></span>`;
  }
let fxRatesPromise = null;

async function fetchFxRate(base) {
  const response = await fetch(`${FX_API}/${base}/GBP`, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`FX HTTP ${response.status}`);
  }

  const data = await response.json();
  return Number(data.rate);
}

async function getFxRates() {
  if (!fxRatesPromise) {
    fxRatesPromise = Promise.all([
      fetchFxRate("EUR"),
      fetchFxRate("USD")
    ]).then(([eurToGbp, usdToGbp]) => ({
      eurToGbp,
      usdToGbp
    }));
  }

  return fxRatesPromise;
}

function convertToGbp(value, rate) {
  const amount = Number.parseFloat(value);

  if (!Number.isFinite(amount) || !Number.isFinite(rate)) {
    return null;
  }

  return (amount * rate).toFixed(2);
}
  
  function finishText(card) {
    return Array.isArray(card.finishes) && card.finishes.length ? card.finishes.join(", ") : "—";
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      signal,
      headers: {
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function namedCard(name, signal) {
    const exact = `${API}/cards/named?exact=${encodeURIComponent(name)}`;
    try {
      return await fetchJson(exact, signal);
    } catch (error) {
      if (error.name === "AbortError" || error.status !== 404) throw error;
      const fuzzy = `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`;
      return fetchJson(fuzzy, signal);
    }
  }

  async function renderPrintings(card, token, signal) {
    if (!els.status || !els.printings) return;
    const uri = safeUrl(card.prints_search_uri);
    if (!uri) {
      els.status.textContent = "Printing information is not available for this card.";
      return;
    }

    els.status.textContent = "Loading printings…";
    const all = [];
    let next = uri;
    let pages = 0;

    try {
      while (next && pages < 40) {
        const page = await fetchJson(next, signal);
        if (token !== searchToken) return;
        if (Array.isArray(page.data)) all.push(...page.data);
        next = safeUrl(page.next_page || "");
        pages += 1;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      els.status.textContent = all.length
        ? `Showing ${all.length} printings. Some additional results could not be loaded.`
        : "Printing data could not be loaded.";
      if (!all.length) return;
    }

    all.sort((a, b) => String(b.released_at || "").localeCompare(String(a.released_at || "")));
    let rates = null;

try {
  rates = await getFxRates();
} catch (error) {
  console.warn("GBP conversion unavailable", error);
}

  els.status.textContent = rates
  ? `${all.length} printing${all.length === 1 ? "" : "s"} found · GBP estimates`
  : `${all.length} printing${all.length === 1 ? "" : "s"} found`;

    function printingImage(print) {
      return (
        print.image_uris?.small ||
        print.image_uris?.normal ||
        print.card_faces?.[0]?.image_uris?.small ||
        print.card_faces?.[0]?.image_uris?.normal ||
        ""
      );
    }

const buildRows = (printings) => printings.map(print => `
<tr>
          <td class="printing-image-cell">
      ${printingImage(print)
        ? `<img class="printing-card-image"
             src="${escapeHtml(printingImage(print))}"
             alt="${escapeHtml(print.name || "Magic card")} printing"
             loading="lazy">`
        : "—"}
    </td>
        <td><span class="set-name">${escapeHtml(print.set_name || "—")}</span><br><span class="muted">${escapeHtml(print.set || "").toUpperCase())}</span></td>
        <td>${escapeHtml(print.released_at || "—")}</td>
        <td>${escapeHtml(print.collector_number || "—")}</td>
        <td>${escapeHtml(print.rarity || "—")}</td>
        <td>${escapeHtml(finishText(print))}</td>
<td>${priceCell(
  print.prices?.eur
    ? convertToGbp(print.prices.eur, rates?.eurToGbp)
    : convertToGbp(print.prices?.usd, rates?.usdToGbp),
  "£"
)}</td>
<td>${priceCell(
  print.prices?.eur_foil
    ? convertToGbp(print.prices.eur_foil, rates?.eurToGbp)
    : convertToGbp(print.prices?.usd_foil, rates?.usdToGbp),
  "£"
)}</td>
<td>${priceCell(
  convertToGbp(print.prices?.usd_etched, rates?.usdToGbp),
  "£"
)}</td>
      </tr>`).join("");
    const showFilters = all.length >= 8;

const filterControls = showFilters ? `
  <div class="printing-controls">
    <label>
      Finish
      <select id="printing-finish-filter">
        <option value="all">All</option>
        <option value="nonfoil">Nonfoil</option>
        <option value="foil">Foil</option>
        <option value="etched">Etched</option>
      </select>
    </label>

    <label>
      Sort
      <select id="printing-sort">
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="price-asc">£ Low → High</option>
        <option value="price-desc">£ High → Low</option>
      </select>
    </label>
  </div>
` : "";

const rows = buildRows(all);

    els.printings.innerHTML = `
      ${filterControls}
      <div class="table-wrap">
        <table class="printings-table">
          <thead>
            <tr>
             <th>Card</th><th>Set</th><th>Released</th><th>Collector #</th><th>Rarity</th><th>Finishes</th>
             <th>Price</th>
<th>Foil</th>
<th>Etched</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">No printings returned.</td></tr>'}</tbody>
        </table>
      </div>`;
    if (showFilters) {
  const finishFilter = els.printings.querySelector("#printing-finish-filter");
  const sortSelect = els.printings.querySelector("#printing-sort");
  const tbody = els.printings.querySelector("tbody");

  function regularGbpValue(print) {
    const eur = Number(print.prices?.eur);
    const usd = Number(print.prices?.usd);

    if (eur && rates?.eurToGbp) {
      return eur * rates.eurToGbp;
    }

    if (usd && rates?.usdToGbp) {
      return usd * rates.usdToGbp;
    }

    return null;
  }

  function updatePrintings() {
    const finish = finishFilter.value;
    const sort = sortSelect.value;

    let displayed = finish === "all"
      ? [...all]
      : all.filter(print =>
          Array.isArray(print.finishes) &&
          print.finishes.includes(finish)
        );

    displayed.sort((a, b) => {
      if (sort === "oldest") {
        return String(a.released_at || "").localeCompare(String(b.released_at || ""));
      }

      if (sort === "price-asc" || sort === "price-desc") {
        const aPrice = regularGbpValue(a);
        const bPrice = regularGbpValue(b);

        if (aPrice === null && bPrice === null) return 0;
        if (aPrice === null) return 1;
        if (bPrice === null) return -1;

        return sort === "price-asc"
          ? aPrice - bPrice
          : bPrice - aPrice;
      }

      return String(b.released_at || "").localeCompare(String(a.released_at || ""));
    });

    tbody.innerHTML = buildRows(displayed) ||
      '<tr><td colspan="9">No printings match these filters.</td></tr>';
  }

  finishFilter.addEventListener("change", updatePrintings);
  sortSelect.addEventListener("change", updatePrintings);
}
  }

  async function loadCard(name, options = {}) {
    const query = String(name || "").trim();
    if (!query) return;

    const token = ++searchToken;
    if (searchController) searchController.abort();
    if (autocompleteController) autocompleteController.abort();

    searchController = new AbortController();

    if (!options.fromHistory) setQuery(query, Boolean(options.replace));
    if (els.input) els.input.value = query;
    clearAutocomplete();
    setLoading();

    try {
      const card = await namedCard(query, searchController.signal);
      if (token !== searchToken) return;
      renderCard(card);
      await renderPrintings(card, token, searchController.signal);
    } catch (error) {
      if (error.name === "AbortError" || token !== searchToken) return;
      setError(
        error.status === 404
          ? `No card matched “${query}”. Try the card's full name.`
          : "Scryfall could not be reached. Please try again."
      );
    }
  }

  function clearAutocomplete() {
    if (!els.autocomplete || !els.input) return;
    els.autocomplete.hidden = true;
    els.autocomplete.innerHTML = "";
    els.input.setAttribute("aria-expanded", "false");
    activeAutocompleteIndex = -1;
  }

  function autocompleteItems() {
    if (!els.autocomplete) return [];
    return [...els.autocomplete.querySelectorAll(".autocomplete-item")];
  }

  function setActiveAutocomplete(index) {
    const items = autocompleteItems();
    if (!items.length) return;
    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;
    activeAutocompleteIndex = index;
    items.forEach((item, i) => item.setAttribute("aria-selected", i === index ? "true" : "false"));
    items[index].scrollIntoView({ block: "nearest" });
  }

  function renderAutocomplete(names) {
    if (!els.autocomplete || !els.input) return;
    if (!names.length) {
      clearAutocomplete();
      return;
    }

    els.autocomplete.innerHTML = names.map(name => `
      <button class="autocomplete-item" type="button" role="option" aria-selected="false" data-name="${escapeHtml(name)}">
        <span>${escapeHtml(name)}</span>
      </button>
    `).join("");

    els.autocomplete.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
  }

  async function autocomplete(query) {
    if (autocompleteController) autocompleteController.abort();
    autocompleteController = new AbortController();
    try {
      const url = `${API}/cards/autocomplete?q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, autocompleteController.signal);
      renderAutocomplete(Array.isArray(data.data) ? data.data.slice(0, 8) : []);
    } catch (error) {
      if (error.name !== "AbortError") clearAutocomplete();
    }
  }

  if (els.form && els.input) {
    els.form.addEventListener("submit", event => {
      event.preventDefault();
      const value = els.input.value.trim();
      if (value) loadCard(value);
    });

    els.input.addEventListener("input", () => {
      const query = els.input.value.trim();
      clearTimeout(autocompleteTimer);
      if (query.length < 2) {
        clearAutocomplete();
        return;
      }
      autocompleteTimer = setTimeout(() => autocomplete(query), 180);
    });

    els.input.addEventListener("keydown", event => {
      const items = autocompleteItems();
      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        setActiveAutocomplete(activeAutocompleteIndex + 1);
      } else if (event.key === "ArrowUp" && items.length) {
        event.preventDefault();
        setActiveAutocomplete(activeAutocompleteIndex - 1);
      } else if (event.key === "Enter" && activeAutocompleteIndex >= 0 && items[activeAutocompleteIndex]) {
        event.preventDefault();
        loadCard(items[activeAutocompleteIndex].dataset.name);
      } else if (event.key === "Escape") {
        clearAutocomplete();
      }
    });
  }

  if (els.autocomplete) {
    els.autocomplete.addEventListener("click", event => {
      const item = event.target.closest("[data-name]");
      if (item) loadCard(item.dataset.name);
    });
  }

  document.addEventListener("click", event => {
    if (els.form && !els.form.contains(event.target)) clearAutocomplete();
  });

  window.addEventListener("popstate", () => {
    const query = getQueryName();
    if (query) {
      loadCard(query, { fromHistory: true });
    } else if (els.details) {
      if (els.input) els.input.value = "";
      els.details.innerHTML = '<div class="empty-state"><div class="empty-mark">⌁</div><h2>Search any MTG card</h2><p>See oracle text, card images, finishes, printings and available Scryfall price data.</p></div>';
      if (els.status) els.status.textContent = "";
      if (els.printings) els.printings.innerHTML = "";
    }
  });

  window.ManaScout = Object.freeze({ loadCard });

  const initial = getQueryName();
  if (initial) loadCard(initial, { fromHistory: true });
})();
