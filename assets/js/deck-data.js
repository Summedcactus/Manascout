/* Small data boundary shared by the studio controller and dependency-free tests. */
((root) => {
  "use strict";
  const formats = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const finishLabels = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched foil" };
  const slug = name => String(name).trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  class SelectionError extends Error {
    constructor(message, retryable = false) {
      super(message);
      this.name = "SelectionError";
      this.retryable = retryable;
    }
  }

  function parseSelection(search) {
    const params = new URLSearchParams(search);
    const id = (params.get("printing") || "").trim().toLowerCase();
    const cardName = (params.get("card") || "").trim().slice(0, 200);
    if (!id && !cardName) return null;
    if (!uuid.test(id)) throw new SelectionError("Choose an exact printing in ManaScout Search, then use Build a Deck to open it here.");
    return { id, cardName, requestedFinish: params.get("finish") || "", guide: params.get("guide") || "" };
  }

  function safeUrl(value, host) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && host.includes(url.hostname) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function normaliseCard(card, selection) {
    if (card?.object !== "card" || card.id?.toLowerCase() !== selection.id || typeof card.name !== "string" || !card.name.trim()) {
      throw new SelectionError("Scryfall did not return the requested printing. Return to Search to choose it again.");
    }
    const finishes = [...new Set((Array.isArray(card.finishes) ? card.finishes : []).filter(f => Object.hasOwn(finishLabels, f)))];
    const finish = finishes.includes(selection.requestedFinish) ? selection.requestedFinish : finishes.includes("nonfoil") ? "nonfoil" : finishes[0] || "";
    const imageFaces = card.image_uris ? [card] : (card.card_faces || []);
    const images = imageFaces.map(face => ({ name: face.name || card.name, url: safeUrl(face.image_uris?.normal || face.image_uris?.large, ["cards.scryfall.io"]) })).filter(face => face.url);
    const guide = selection.guide === `/card/${slug(card.name)}/` ? selection.guide : "";
    const oracle = card.oracle_text || (card.card_faces || []).map(face => [face.name, face.oracle_text].filter(Boolean).join("\n")).join("\n\n") || "Rules text not supplied.";
    const briefSource = card.oracle_text || card.card_faces?.[0]?.oracle_text || oracle;
    const firstLine = briefSource.split("\n").find(line => line.trim()) || "Rules text not supplied.";
    const front = card.card_faces?.[0] || card;
    const statuses = new Set(["legal", "not_legal", "banned", "restricted"]);
    return {
      id: selection.id, name: card.name, type: card.type_line || "Type not supplied",
      manaCost: typeof front.mana_cost === "string" ? front.mana_cost : "",
      pricesEUR: Object.fromEntries([["nonfoil", card.prices?.eur], ["foil", card.prices?.eur_foil], ["etched", card.prices?.eur_etched]].map(([finish, value]) => [finish, typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null])),
      edhrecRank: Number.isSafeInteger(card.edhrec_rank) && card.edhrec_rank > 0 ? card.edhrec_rank : null,
      oracleId: uuid.test(card.oracle_id || "") ? card.oracle_id.toLowerCase() : "",
      frontType: card.card_faces?.[0]?.type_line || card.type_line || "",
      frontText: card.card_faces?.[0]?.oracle_text || card.oracle_text || "",
      rulesText: card.oracle_text || (card.card_faces || []).map(face => face.oracle_text || "").join("\n\n"),
      colors: Array.isArray(card.colors) ? card.colors.filter(c => /^[WUBRG]$/.test(c)) : [],
      colorIdentity: Array.isArray(card.color_identity) && card.color_identity.every(c => /^[WUBRG]$/.test(c)) ? [...new Set(card.color_identity)] : null,
      keywords: Array.isArray(card.keywords) ? card.keywords.filter(k => typeof k === "string") : [],
      legalities: Object.fromEntries(formats.legalityKeys.map(key => [key, statuses.has(card.legalities?.[key]) ? card.legalities[key] : "unknown"])),
      hasPrintedPT: typeof front.power === "string" && typeof front.toughness === "string",
      isRebalanced: /^A-/.test(card.name),
      meldEntry: card.layout === "meld" ? card.all_parts?.find(part => part.id === card.id)?.component || "unknown" : "not_meld",
      games: Array.isArray(card.games) ? card.games : [], layout: card.layout || "", oversized: !!card.oversized,
      borderColor: card.border_color || "", securityStamp: card.security_stamp || "",
      printingDataComplete: typeof card.oversized === "boolean" && typeof card.layout === "string" && !!card.layout && typeof card.border_color === "string" && !!card.border_color && Array.isArray(card.games) && typeof card.set === "string" && !!card.set && typeof card.collector_number === "string" && !!card.collector_number,
      availableFinishes: finishes,
      manaValue: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? String(card.cmc) : "Not supplied",
      setName: card.set_name || "Set not supplied", setCode: String(card.set || "").toUpperCase(),
      collectorNumber: String(card.collector_number ?? "Not supplied"),
      artist: card.artist || (card.card_faces || []).map(face => face.artist).filter(Boolean).join(" / ") || "Not supplied",
      language: String(card.lang || "Not supplied").toUpperCase(),
      released: /^\d{4}-\d{2}-\d{2}$/.test(card.released_at || "") ? card.released_at : "Not supplied",
      oracle, summary: firstLine.length > 160 ? firstLine.slice(0, 157).trimEnd() + "…" : firstLine,
      finishes: finishes.map(f => finishLabels[f]).join(", ") || "Not supplied", finish,
      finishLabel: finishLabels[finish] || "Not supplied", images, guide,
      sourceUrl: safeUrl(card.scryfall_uri, ["scryfall.com", "www.scryfall.com"]),
      finishNotice: selection.requestedFinish && finish !== selection.requestedFinish ? "The requested finish is not listed for this printing. The preview label uses an available finish instead." : "Artwork is a digital image; it does not reproduce the physical foil surface."
    };
  }

  async function fetchPrinting(selection, { fetchImpl = root.fetch?.bind(root), timeout = 12000 } = {}) {
    if (!uuid.test(selection?.id || "")) throw new SelectionError("This printing link is invalid. Return to ManaScout Search.");
    if (!fetchImpl) throw new SelectionError("Card data cannot be requested in this browser. Return to ManaScout Search.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchImpl(`https://api.scryfall.com/cards/${selection.id}`, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) {
        if (response.status === 404) throw new SelectionError("That printing could not be found on Scryfall. Choose another printing in Search.");
        if (response.status === 429) throw new SelectionError("Scryfall is receiving too many requests. Wait a moment before trying again.", true);
        throw new SelectionError("Scryfall could not load this printing right now. You can try again.", true);
      }
      return normaliseCard(await response.json(), selection);
    } catch (error) {
      if (error instanceof SelectionError) throw error;
      if (controller.signal.aborted) throw new SelectionError("The card request timed out. Check your connection and try again.", true);
      throw new SelectionError("Card data is unavailable. Check your connection and try again.", true);
    } finally { clearTimeout(timer); }
  }

  const api = Object.freeze({ SelectionError, parseSelection, normaliseCard, fetchPrinting });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckData = api;
})(typeof window === "undefined" ? globalThis : window);
