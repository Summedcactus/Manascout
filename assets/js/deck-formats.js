/* Verified construction profiles. Legality/pools always come from current Scryfall data. */
((root) => {
  "use strict";
  const paper = (id, name, extra = {}) => ({ id, name, legalityKey: id, platform: "paper", group: "Other Formats — Paper", min: 60, max: null, sideboard: 15, copies: 4, leaders: 0, signature: false, colorIdentity: false, restricted: false, source: `https://magic.wizards.com/en/formats/${id}`, ...extra });
  const arena = (id, name, extra = {}) => paper(id, name, { platform: "arena", group: "Other Formats — Arena", max: 250, source: `https://magic.wizards.com/en/formats/${id}`, note: "Traditional / best-of-three construction; BO1-specific rules are not certified.", ...extra });
  const profiles = [
    paper("commander", "Commander", { min: 100, max: 100, sideboard: 0, copies: 1, leaders: 2, colorIdentity: true, eligibility: "commander", leaderLabel: "Commander", primary: true }),
    paper("standard", "Standard", { primary: true }),
    paper("pioneer", "Pioneer"), paper("modern", "Modern"), paper("legacy", "Legacy"),
    paper("vintage", "Vintage", { restricted: true }), paper("pauper", "Pauper"),
    paper("oathbreaker", "Oathbreaker", { min: 60, max: 60, sideboard: 0, copies: 1, leaders: 2, signature: true, colorIdentity: true, eligibility: "planeswalker", leaderLabel: "Oathbreaker", source: "https://oathbreakermtg.org/rules/" }),
    arena("standard_arena", "Standard — Arena (Traditional)", { legalityKey: "standard", source: "https://magic.wizards.com/en/formats/standard" }),
    arena("pioneer_arena", "Pioneer — Arena (Traditional)", { legalityKey: "pioneer", source: "https://magic.wizards.com/en/formats/pioneer" }),
    arena("alchemy", "Alchemy (Traditional)", { source: "https://magic.wizards.com/en/mtgarena/alchemy" }),
    arena("historic", "Historic (Traditional)"), arena("timeless", "Timeless (Traditional)", { restricted: true }),
    arena("standardbrawl", "Standard Brawl — 60", { min: 60, max: 60, sideboard: 0, copies: 1, leaders: 1, colorIdentity: true, eligibility: "brawl", leaderLabel: "Commander", colorlessBasicException: true, note: "Exactly 60, one Brawl-eligible commander; no partners or sideboard.", source: "https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-jumpstart-historic-horizons-2021-07-29" }),
    arena("brawl", "Brawl — 100", { min: 100, max: 100, sideboard: 0, copies: 1, leaders: 1, colorIdentity: true, eligibility: "brawl", leaderLabel: "Commander", colorlessBasicException: true, note: "Exactly 100, one Brawl-eligible commander; no partners or sideboard." }),
    arena("gladiator", "Gladiator", { min: 100, sideboard: 0, copies: 1, originalVersions: true, note: "100–250 card Arena singleton; original versions, no commanders or sideboard.", source: "https://magic.wizards.com/en/news/mtg-arena/mtg-arena-community-spotlight-gladiator" })
  ].map(profile => Object.freeze(profile));
  const registry = new Map(profiles.map(profile => [profile.id, profile]));
  const get = id => registry.get(id) || null;
  const legalityKeys = Object.freeze([...new Set(profiles.map(profile => profile.legalityKey))]);
  const unsupported = Object.freeze([
    { name: "Draft / Sealed / Commander Draft", reason: "Require a separate limited card-pool workflow." },
    { name: "Arena best-of-one event variants", reason: "Queue-specific bans and event/sideboard rules are not certified by the Traditional profiles." },
    { name: "Competitive Brawl", reason: "Its distinct pool/commander eligibility rules have not been implemented." },
    { name: "Explorer", reason: "No separately verified current queue/pool profile; use the verified Pioneer Arena profile where appropriate." },
    { name: "Duel Commander / Pauper Commander / PreDH", reason: "Distinct commander eligibility, ban/role or historical rules are not implemented." },
    { name: "Penny Dreadful / Premodern / Old School", reason: "Complete current pool, platform and variant rules were not verified for this release." },
    { name: "Companions / special events / custom Rule 0", reason: "No outside-game companion assignment or custom event-rule workflow." }
  ]);
  function supportedLegality(card, profile) {
    const status = card.legalities?.[profile?.legalityKey] || "unknown";
    return status === "legal" || (profile?.restricted && status === "restricted");
  }
  const api = Object.freeze({ profiles: Object.freeze(profiles), get, legalityKeys, unsupported, supportedLegality });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckFormats = api;
})(typeof window === "undefined" ? globalThis : window);
