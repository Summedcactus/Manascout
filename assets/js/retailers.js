/* Public retailer configuration. Add only verified search routes and approved programme parameters. */
((root) => {
  "use strict";

  const retailers = Object.freeze({
    cardmarket: Object.freeze({
      label: "Cardmarket",
      hosts: Object.freeze(["www.cardmarket.com", "cardmarket.com"]),
      search: name => {
        const url = new URL("https://www.cardmarket.com/en/Magic/Products/Search");
        url.searchParams.set("searchString", name);
        return url;
      }
    }),
    "magic-madhouse": Object.freeze({
      label: "Magic Madhouse",
      hosts: Object.freeze(["magicmadhouse.co.uk", "www.magicmadhouse.co.uk"]),
      search: null
    }),
    "chaos-cards": Object.freeze({
      label: "Chaos Cards",
      hosts: Object.freeze(["chaoscards.co.uk", "www.chaoscards.co.uk"]),
      search: null
    })
  });

  // Public query parameters keyed by merchant, after approval and disclosure review.
  const affiliateParameters = Object.freeze({});
  const merchantIds = Object.freeze(Object.keys(retailers).filter(id => retailers[id].search));

  function trustedUrl(value, hosts) {
    if (typeof value !== "string" || !/^https:\/\//i.test(value) || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.includes(url.hostname)
        ? url : null;
    } catch {
      return null;
    }
  }

  function catalogueProduct(card) {
    const url = trustedUrl(card?.purchase_uris?.cardmarket, retailers.cardmarket.hosts);
    if (!url || !/^\/[a-z]{2}\/Magic\/Products\/Singles\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return null;
    // A Scryfall-supplied product path is useful without its tracking parameters.
    url.search = "";
    url.hash = "";
    return url;
  }

  function appendAffiliateParameters(url, params) {
    if (!params || Object.getPrototypeOf(params) !== Object.prototype) return false;
    const entries = Object.entries(params);
    if (!entries.length || entries.some(([key, value]) =>
      !/^[a-z][a-z0-9_]{0,31}$/i.test(key) || url.searchParams.has(key) ||
      typeof value !== "string" || !/^[a-z0-9._-]{1,128}$/i.test(value))) return false;
    for (const [key, value] of entries) url.searchParams.set(key, value);
    return true;
  }

  function linksFor(card, configured = affiliateParameters) {
    const name = typeof card?.name === "string" ? card.name.trim() : "";
    return merchantIds.flatMap(merchant => {
      const retailer = retailers[merchant];
      const product = merchant === "cardmarket" ? catalogueProduct(card) : null;
      const url = product || (name && retailer.search(name));
      if (!url || !trustedUrl(url.href, retailer.hosts)) return [];
      const affiliate = appendAffiliateParameters(url, configured?.[merchant]);
      const label = product ? `View on ${retailer.label}` : `Search ${retailer.label}`;
      return [{ merchant, href: url.href, label, affiliate }];
    });
  }

  function verificationLink(card) {
    const url = trustedUrl(card?.scryfall_uri, ["scryfall.com", "www.scryfall.com"]);
    if (!url || !/^\/card\/[a-z0-9]+\/[^/]+(?:\/|$)/i.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return { href: url.href, label: "Verify on Scryfall" };
  }

  const api = Object.freeze({ retailers, merchantIds, linksFor, verificationLink });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutRetailers = api;
})(typeof window === "undefined" ? globalThis : window);
