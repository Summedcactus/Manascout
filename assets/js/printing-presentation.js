/* Shared catalogue labels and physical presentation. Raw identifiers remain in state and links. */
((root) => {
  "use strict";

  const languages = Object.freeze({
    en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
    ja: "Japanese", ko: "Korean", ru: "Russian", zhs: "Simplified Chinese", zht: "Traditional Chinese",
    he: "Hebrew", la: "Latin", grc: "Ancient Greek", ar: "Arabic", sa: "Sanskrit", ph: "Phyrexian"
  });
  const finishNames = Object.freeze({
    nonfoil: "Nonfoil", foil: "Traditional Foil", etched: "Etched Foil",
    surgefoil: "Surge Foil", galaxyfoil: "Galaxy Foil", halofoil: "Halo Foil",
    confettifoil: "Confetti Foil", textured: "Textured Foil", rainbowfoil: "Rainbow Foil",
    stepandcompleat: "Step-and-Compleat Foil"
  });
  const treatmentNames = Object.freeze({
    ...finishNames, extendedart: "Extended art", fullart: "Full art", borderless: "Borderless",
    showcase: "Showcase", inverted: "Inverted", boosterfun: "Booster Fun", serialized: "Serialized",
    retro: "Classic / retro frame", retroframe: "Retro frame", concept: "Concept art",
    headliner: "Headliner", signed: "Signed", universesbeyond: "Universes Beyond",
    thick: "Thick stock", rainbow: "Rainbow Foil", texturedfoil: "Textured Foil",
    datestamped: "Date stamped", prerelease: "Prerelease", setpromo: "Set promo", promopack: "Promo pack",
    playpromo: "Play promo", fnm: "Friday Night Magic", instore: "In-store promo",
    commanderparty: "Commander Party", bundle: "Bundle promo", poster: "Poster",
    sourcematerial: "Source Material", boxtopper: "Box topper"
  });
  const special = ["surgefoil", "galaxyfoil", "halofoil", "confettifoil", "textured", "rainbowfoil", "stepandcompleat"];
  const aliases = Object.freeze({ texturedfoil: "textured", rainbow: "rainbowfoil", etchedfoil: "etched" });
  const lookup = (map, value) => Object.hasOwn(map, value) ? map[value] : "";
  const tokens = (card = {}) => [...(card.promo_types || card.promoTypes || []), ...(card.frame_effects || card.frameEffects || []), ...(card.treatmentTags || [])];
  const available = card => card?.availableFinishes || (Array.isArray(card?.finishes) ? card.finishes : []);
  const defaultFinish = card => available(card).includes("nonfoil") ? "nonfoil" : available(card)[0] || "";
  const language = code => lookup(languages, String(code || "").toLowerCase()) || "Language not supplied";
  const setCode = code => String(code || "").toUpperCase();
  const printing = (card = {}) => {
    const set = card.set_name || card.setName;
    const code = setCode(card.set || card.setCode);
    const number = card.collector_number || card.collectorNumber;
    return [set, [code, number && "#" + number].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Printing unavailable";
  };
  const frameNames = Object.freeze({ 1993: "Original frame", 1997: "Classic frame", 2003: "Modern frame", 2015: "Modern frame (2015)", future: "Future Sight frame" });
  const frame = card => lookup(frameNames, card?.frame);
  const treatmentLabel = token => lookup(treatmentNames, token);
  function treatments(card = {}) {
    return [...new Set([
      (card.border_color || card.borderColor) === "borderless" && "Borderless",
      (card.full_art || card.fullArt) && "Full art", card.textless && "Textless", card.promo && "Promo",
      ...tokens(card).filter(token => !Object.hasOwn(finishNames, token) && !lookup(aliases, token)).map(treatmentLabel)
    ].filter(Boolean))];
  }
  function surface(card, finish) {
    // Explicit selection and the record must agree, even on saved or imported previews.
    if (!available(card).includes(finish)) return "unavailable";
    const key = lookup(aliases, finish) || finish;
    if (key !== "foil") return lookup(finishNames, key) ? key : "unavailable";
    const verified = [...new Set(tokens(card).map(token => lookup(aliases, token) || token).filter(token => special.includes(token) || token === "etched" && !available(card).includes("etched")))];
    return verified.length === 1 ? verified[0] : "foil";
  }
  function finishLabel(finish, card) {
    const key = lookup(aliases, finish) || finish;
    return (card && lookup(finishNames, surface(card, finish))) || lookup(finishNames, key) || "Finish not supplied";
  }
  const finishList = card => available(card).map(finish => finishLabel(finish, card)).join(" · ") || "Finishes not supplied";

  function prices(card, finish) {
    if (!available(card).includes(finish)) return [];
    const key = lookup(aliases, finish) || finish;
    const fields = key === "nonfoil" ? [["EUR", "eur"], ["USD", "usd"]] :
      key === "etched" ? [["EUR", "eur_etched"], ["USD", "usd_etched"]] :
      key === "foil" ? [["EUR", "eur_foil"], ["USD", "usd_foil"]] : [];
    return fields.flatMap(([currency, field]) => {
      const value = card.prices?.[field];
      return /^\d+(\.\d+)?$/.test(value) && Number.isFinite(+value) && +value > 0
        ? [`${currency === "USD" ? "$" : "€"}${Number(value).toFixed(2)} ${currency}`] : [];
    });
  }

  const artwork = card => card.illustration_id || (card.card_faces?.length && card.card_faces.every(face => face.illustration_id)
    ? card.card_faces.map(face => face.illustration_id).join("/") : "");
  const rules = card => card.oracle_text || (card.card_faces?.length && card.card_faces.every(face => typeof face.oracle_text === "string")
    ? card.card_faces.map(face => face.oracle_text).join("\n") : "");
  function distinctTreatments(versions) {
    const attributes = versions.map(({card}) => [frame(card), ...treatments(card)].filter(Boolean));
    const common = attributes[0].filter(value => attributes.every(values => values.includes(value)));
    return attributes.map(values => values.length ? values.filter(value => !common.includes(value)).join(" · ") || "Shared frame and treatment" : "");
  }
  function differences(versions) {
    if (versions.length < 2) return [];
    const fields = [
      ["Artwork", c => artwork(c), (_, versions) => {
        const families = [...new Set(versions.map(({card}) => artwork(card)).filter(Boolean))];
        return versions.map(({card}) => artwork(card) ? "Artwork " + (families.indexOf(artwork(card)) + 1) : "");
      }],
      ["Artist", c => c.artist],
      ["Set / Collector Number", c => c.collector_number && printing(c)],
      ["Frame / Treatment", c => [frame(c), ...treatments(c)].filter(Boolean).sort().join(" · "), (_, compared) => distinctTreatments(compared)],
      ["Selected Finish", (c, f) => available(c).includes(f) && finishLabel(f, c)],
      ["Release Date", c => c.released_at],
      ["Language", c => lookup(languages, c.lang)],
      ["Gameplay text", c => rules(c), (_, versions) => versions.map(({card}) => rules(card))]
    ];
    return fields.flatMap(([label, value, display]) => {
      const values = versions.map(({card, finish}) => value(card, finish) || "");
      return new Set(values.filter(Boolean)).size > 1
        ? [{label, values: display ? display(values, versions) : values}] : [];
    });
  }

  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function imageUrl(raw) {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && url.hostname === "cards.scryfall.io" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }
  const decoration = '<span class="ms-physical-reflection" aria-hidden="true"></span><span class="ms-physical-edge" aria-hidden="true"></span>';
  function markup({ card, finish, src, alt = "", compact = false, lazy = false, imageClass = "" }) {
    const url = imageUrl(src);
    if (!url) return '<span class="ms-physical-missing">Artwork unavailable</span>';
    const shell = `<span class="ms-physical-shell"><span class="ms-physical-face"><img class="${escape(imageClass)}" src="${escape(url)}" alt="${escape(alt)}" width="488" height="680" decoding="async"${lazy ? ' loading="lazy"' : ""}>${decoration}</span></span>`;
    return `<span class="ms-physical" data-ms-physical="${escape(card.id || "")}" data-surface="${surface(card, finish)}"${compact ? ' data-compact' : ""}>
      ${compact ? shell : `<span class="ms-physical-drift">${shell}</span>`}
    </span>`;
  }

  function enhance(image, card, finish, { compact = false, host, shell, face } = {}) {
    if (!image) return;
    const existing = image.closest("[data-ms-physical]");
    if (existing) {
      existing.dataset.msPhysical = card.id || "";
      existing.dataset.surface = surface(card, finish);
      image.closest(".ms-physical-face")?.toggleAttribute("data-art-ready", image.complete && !!image.naturalWidth);
      return;
    }
    // Static scenes can supply their existing geometry. Other surfaces wrap their existing image.
    if (!host) {
      const { ownerDocument } = image;
      host = ownerDocument.createElement("span");
      shell = ownerDocument.createElement("span");
      face = ownerDocument.createElement("span");
      image.before(host);
      if (compact) {
        host.append(shell);
      } else {
        const drift = ownerDocument.createElement("span");
        drift.className = "ms-physical-drift";
        host.append(drift);
        drift.append(shell);
      }
      shell.append(face);
      face.append(image);
    }
    host.classList.add("ms-physical");
    shell.classList.add("ms-physical-shell");
    face.classList.add("ms-physical-face");
    host.dataset.msPhysical = card.id || "";
    host.dataset.surface = surface(card, finish);
    if (compact) host.setAttribute("data-compact", "");
    face.insertAdjacentHTML("beforeend", decoration);
    face.toggleAttribute("data-art-ready", image.complete && !!image.naturalWidth);
  }

  const api = { languages, language, setCode, printing, frame, treatments, treatmentLabel, available, defaultFinish,
    surface, finishLabel, finishList, prices, artwork, rules, differences, markup, enhance };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }
  root.ManaScoutPrinting = Object.freeze(api);

  if (document.body.matches(".ms-home, .printing-guide, .ms-card-archive")) {
    const atmosphere = document.createElement("div");
    atmosphere.className = "ms-edge-atmosphere";
    atmosphere.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 4; index++) atmosphere.append(document.createElement("span"));
    document.body.prepend(atmosphere);
  }

  // Observe only the floating wrapper. Exact-printing changes can replace its host.
  if (typeof IntersectionObserver === "function") {
    const floating = new Set();
    const viewport = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        target.toggleAttribute("data-idle-offscreen", !isIntersecting);
      }
    });
    document.addEventListener("animationstart", event => {
      if (event.animationName !== "ms-card-idle") return;
      for (const wrap of floating) {
        if (wrap.isConnected) continue;
        viewport.unobserve(wrap);
        floating.delete(wrap);
      }
      floating.add(event.target);
      viewport.observe(event.target);
    });
  }

  const reduced = root.matchMedia("(prefers-reduced-motion: reduce)");
  const idleReturns = new WeakMap();
  const idleReturnMs = 500;

  function holdIdle(host) {
    if (!host.querySelector(".ms-physical-drift")) return;
    clearTimeout(idleReturns.get(host));
    host.setAttribute("data-idle-held", "");
  }

  function returnToIdle(host) {
    if (!host.hasAttribute("data-idle-held")) return;
    const resume = () => {
      idleReturns.delete(host);
      host.removeAttribute("data-idle-held");
    };
    if (reduced.matches || document.hidden || !host.isConnected) resume();
    else idleReturns.set(host, setTimeout(resume, idleReturnMs));
  }
  let active = null;
  let touch = null;
  let pending = null;
  let request = 0;
  function scene(host, detail) {
    if (host.hasAttribute("data-ms-physical-scene")) host.dispatchEvent(new CustomEvent("ms:physical-angle", { detail }));
  }
  function reset() {
    if (active) {
      active.removeAttribute("data-tilting");
      for (const key of ["--rx", "--ry", "--px", "--py", "--sx", "--sy", "--incidence"]) active.style.removeProperty(key);
      returnToIdle(active);
      scene(active, null);
    }
    active = pending = null;
    touch = null;
  }
  function render() {
    request = 0;
    if (!pending || !active?.isConnected) { reset(); return; }
    const { clientX, clientY, pointerType } = pending;
    const rect = active.getBoundingClientRect();
    if (!rect.width || !rect.height) { reset(); return; }
    const x = Math.max(-1, Math.min(1, (clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (clientY - rect.top) / rect.height * 2 - 1));
    const isTouch = pointerType === "touch";
    const strength = active.hasAttribute("data-compact") ? .28 : 1;
    const angle = Math.min(1, Math.hypot(x, y) / Math.SQRT2);
    const properties = {
      "--rx": `${-y * (isTouch ? 6 : 11) * strength}deg`,
      "--ry": `${x * (isTouch ? 7 : 14) * strength}deg`,
      "--px": `${50 + x * 43}%`, "--py": `${50 + y * 43}%`,
      "--sx": `${-x * 12 * strength}px`, "--sy": `${-y * 8 * strength}px`, "--incidence": angle
    };
    active.setAttribute("data-tilting", "");
    for (const [name, value] of Object.entries(properties)) active.style.setProperty(name, value);
    scene(active, { x, y, isTouch });
  }
  function move(event) {
    if (reduced.matches || document.hidden || !event.isPrimary || (event.pointerType === "touch" && touch !== event.pointerId)) return;
    const host = event.target.closest?.("[data-ms-physical]");
    if (host !== active) {
      const pointer = touch;
      reset();
      active = host;
      touch = pointer;
      if (host) holdIdle(host);
    }
    if (!host) return;
    pending = event;
    if (!request) request = root.requestAnimationFrame(render);
  }
  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    touch = event.pointerId;
    move(event);
  }, { passive: true });
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerout", event => {
    if (active?.contains(event.target) && !active.contains(event.relatedTarget)) reset();
  }, { passive: true });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, event => {
    if (event.pointerId === touch) reset();
  }, { passive: true });
  root.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
  if (reduced.addEventListener) reduced.addEventListener("change", reset);
  else reduced.addListener(reset);

  function imageState(event) {
    const image = event.target;
    if (image.tagName === "IMG") {
      const face = image.closest(".ms-physical-face");
      if (face) face.toggleAttribute("data-art-ready", event.type === "load" && !!image.naturalWidth);
    }
  }
  document.addEventListener("load", imageState, true);
  document.addEventListener("error", imageState, true);
})(typeof window === "undefined" ? globalThis : window);
