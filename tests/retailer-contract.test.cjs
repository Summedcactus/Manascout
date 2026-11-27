const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { retailers, merchantIds, linksFor, verificationLink } = require("../assets/js/retailers.js");
const { createTracker, createGA4Adapter, createPlausibleAdapter } = require("../assets/js/analytics.js");

const origin = "https://manascout.co.uk";
const product = "https://www.cardmarket.com/en/Magic/Products/Singles/Revised/Sol-Ring";
const card = { name: "Sol Ring", purchase_uris: { cardmarket: product + "?referrer=third-party&aff=unexpected" } };
const id = "c4300d24-1cae-4dd5-be7e-38cc677cf5bd";
const input = { merchant: "cardmarket", guide: "sol-ring", printingId: id, finish: "nonfoil" };

test("a safe incoming catalogue link retains the retailer product path without tracking or an exact-match claim", () => {
  assert.deepEqual(linksFor(card), [{
    merchant: "cardmarket", label: "View on Cardmarket", href: product, affiliate: false
  }]);
  assert.deepEqual(merchantIds, ["cardmarket"]);
  assert.equal(retailers["magic-madhouse"].search, null);
  assert.equal(retailers["chaos-cards"].search, null);
});

test("unsafe source URLs fall back to an encoded name search on the allowed Cardmarket hostname", () => {
  const name = 'A "quoted" card & finish';
  for (const address of [
    "javascript:alert(1)", "data:text/html", "http://www.cardmarket.com/one",
    "https://www.cardmarket.com.example.org/one", "https://www.cardmarket.com:444/one",
    "https://user:pw@www.cardmarket.com/one", "https://www.cardmarket.com/Redirect",
    "https://www.cardmarket.com\\@bad.example/one"
  ]) {
    const [link] = linksFor({ name, purchase_uris: { cardmarket: address } });
    const url = new URL(link.href);
    assert.equal(url.origin, "https://www.cardmarket.com");
    assert.equal(url.pathname, "/en/Magic/Products/Search");
    assert.equal(url.searchParams.get("searchString"), name);
    assert.equal(link.label, "Search Cardmarket");
    assert.equal(link.affiliate, false);
  }
  assert.deepEqual(linksFor({}), []);
});

test("only explicit valid affiliate parameters attach and they cannot replace the card-name query", () => {
  const [plain] = linksFor({ name: "Sol Ring" });
  assert.deepEqual([...new URL(plain.href).searchParams.keys()], ["searchString"]);
  const [configured] = linksFor({ name: "Sol Ring" }, { cardmarket: { ref: "test-only" } });
  assert.equal(new URL(configured.href).searchParams.get("ref"), "test-only");
  assert.equal(configured.affiliate, true);
  for (const params of [{ searchString: "Different" }, { ref: "https://example.org" }]) {
    assert.deepEqual(linksFor({ name: "Sol Ring" }, { cardmarket: params }), [plain]);
  }
});

test("Scryfall is a separate verification action with no merchant identity", () => {
  const source = "https://scryfall.com/card/lea/269/sol-ring";
  assert.deepEqual(verificationLink({ scryfall_uri: source + "?utm_source=api#other" }),
    { href: source, label: "Verify on Scryfall" });
  assert.equal(verificationLink({ scryfall_uri: "https://scryfall.com.example.org/card/lea/269" }), null);
  assert.equal(verificationLink({ scryfall_uri: "data:text/html,invalid" }), null);
});

test("merchant exit is shared with Plausible and only projects configured merchant and bounded properties", () => {
  const requests = [];
  const environment = {
    location: { pathname: "/card/sol-ring/", protocol: "https:", hostname: "manascout.co.uk" },
    fetch: (url, options) => requests.push({ url, body: JSON.parse(options.body) })
  };
  const config = { enabled: true, provider: "plausible", domain: "manascout.co.uk" };
  const tracker = createTracker({ adapter: createPlausibleAdapter(config, environment) });
  assert.equal(tracker.trackMerchantExit(input), true);
  assert.deepEqual(requests[0], { url: "https://plausible.io/api/event", body: {
    domain: "manascout.co.uk", name: "Merchant Exit", url: origin + "/card/sol-ring/",
    props: { merchant: "cardmarket", guide: "sol-ring", exact_printing: true, finish: "nonfoil" }
  } });
  for (const merchant of ["magic-madhouse", "chaos-cards", "scryfall", "unknown"]) {
    assert.equal(tracker.trackMerchantExit({ ...input, merchant }), false);
  }
  assert.equal(tracker.trackMerchantExit({ ...input, printingId: "private card text" }), false);
  assert.equal(requests.length, 1);
});

const testId = "G-" + "TESTONLY",
  config = { enabled: true, provider: "ga4", domain: "manascout.co.uk", ga4MeasurementId: testId };

function googleEnvironment() {
  const commands = [];
  const environment = {
    location: {
      protocol: "https:", hostname: "manascout.co.uk", pathname: "/deck/",
      get href() { throw Error("Raw URL must stay local"); },
      get search() { throw Error("Query must stay local"); },
      get hash() { throw Error("Hash must stay local"); }
    },
    document: { referrer: "https://example.org/private?deck=secret#comparison" },
    ManaScoutAnalyticsConsent: { ga4Ready: () => true },
    gtag: (...args) => commands.push(args)
  };
  return { commands, environment };
}

test("GA4 commands require a configured route, public measurement ID and consent-managed readiness", () => {
  const { commands, environment } = googleEnvironment();
  for (const patch of [{ enabled: false }, { ga4MeasurementId: null }, { ga4MeasurementId: "invalid" }, { domain: "example.org" }]) {
    assert.equal(createGA4Adapter({ ...config, ...patch }, environment), null);
  }
  for (const patch of [
    { location: { protocol: "https:", hostname: "manascout.co.uk", pathname: "/unknown/" } },
    { ManaScoutAnalyticsConsent: undefined }, { ManaScoutAnalyticsConsent: { ga4Ready: () => false } },
    { gtag: undefined }, { navigator: { globalPrivacyControl: true } }, { navigator: { doNotTrack: "1" } }
  ]) assert.equal(createGA4Adapter(config, { ...environment, ...patch }), null);
  assert.deepEqual(commands, []);
});

test("consented GA4 receives canonical identity and validated fields and stops on route or consent change", () => {
  const { commands, environment } = googleEnvironment();
  const adapter = createGA4Adapter(config, environment);
  const tracker = createTracker({ adapter });
  assert.equal(adapter.pageview(), true);
  assert.equal(tracker.trackMerchantExit(input), true);
  assert.equal(tracker.track("search_success", { surface: "home", exact_printing: true, query: "private" }), false);
  assert.equal(tracker.track("deck_import_complete", { import_format: "text", deck_format: "commander", deck: ["private"] }), false);
  const identity = { page_location: origin + "/deck/", page_referrer: "https://example.org/", page_title: "ManaScout" };
  assert.deepEqual(commands, [
    ["config", testId, { ...identity, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }],
    ["event", "page_view", { ...identity, send_to: testId }],
    ["event", "merchant_exit", { ...identity, send_to: testId, merchant: "cardmarket", guide: "sol-ring", exact_printing: true, finish: "nonfoil" }]
  ]);
  environment.location.pathname = "/about/";
  assert.equal(adapter.pageview(), false);
  environment.location.pathname = "/deck/";
  environment.ManaScoutAnalyticsConsent.ga4Ready = () => false;
  assert.equal(tracker.trackMerchantExit(input), false);
  assert.equal(commands.length, 3);
});

test("released analytics settings cannot send a request, even with a ready GA4 bridge", () => {
  let effects = 0;
  const effect = () => { effects++; };
  const context = vm.createContext({ URL, window: {
    location: { protocol: "https:", hostname: "manascout.co.uk", pathname: "/card/sol-ring/" },
    gtag: effect, fetch: effect, navigator: { sendBeacon: effect },
    ManaScoutAnalyticsConsent: { ga4Ready: () => true }
  } });
  for (const script of ["guide-catalogue", "retailers", "analytics-config", "analytics"]) {
    vm.runInContext(readFileSync(`assets/js/${script}.js`, "utf8"), context);
  }
  assert.equal(context.window.ManaScoutAnalyticsConfig.enabled, false);
  assert.equal(context.window.ManaScoutAnalyticsConfig.ga4MeasurementId, null);
  assert.equal(vm.runInContext(
    "window.ManaScoutAnalytics.trackMerchantExit({merchant: 'cardmarket', guide: 'sol-ring', finish: 'nonfoil'})",
    context), false);
  assert.equal(effects, 0);
});
