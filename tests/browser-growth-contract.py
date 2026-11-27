"""Check publisher navigation and live retailer actions at mobile and desktop sizes."""

import argparse
import json
from pathlib import Path
import runpy
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = runpy.run_path(str(ROOT / "tests/browser-phase10.py"))
COHORT = json.loads((ROOT / "tests/fixtures/ctr-experiment.json").read_text())
SOL = PRODUCT["CARDS"][5]
WIDTHS = (320, 390, 768, 1024, 1440, 1920)
RETAILER_PRODUCT = "https://www.cardmarket.com/en/Magic/Products/Singles/Alpha/Sol-Ring"


def audit(browser, base, width, artwork, screenshots):
    with browser.new_context(viewport={"width": width, "height": 900}, is_mobile=width <= 430,
                             has_touch=width <= 430, reduced_motion="reduce") as context:
        # Exercise both the existing sourced product route and the name-search fallback.
        direct = width >= 768
        card = {**SOL, "scryfall_uri": "https://scryfall.com/card/lea/269/sol-ring"}
        if direct:
            card["purchase_uris"] = {"cardmarket": RETAILER_PRODUCT + "?referrer=external-fixture"}
        PRODUCT["install"](context, artwork, [card])

        def exact_sol(route):
            url = urlsplit(route.request.url)
            params = parse_qs(url.query)
            if url.path == "/cards/named" and params.get("exact") == ["Sol Ring"]:
                route.fulfill(json=card)
            elif url.path == "/cards/search" and SOL["oracle_id"] in params.get("q", [""])[0]:
                route.fulfill(json={"data": [card], "total_cards": 1, "has_more": False})
            else:
                route.fallback()

        context.route("https://api.scryfall.com/**", exact_sol)
        page = context.new_page()
        errors, provider_calls = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def observe(request):
            host = urlsplit(request.url).hostname or ""
            if host in ("plausible.io", "www.googletagmanager.com", "google-analytics.com") or host.endswith(
                (".google-analytics.com", ".googlesyndication.com", ".doubleclick.net")
            ):
                provider_calls.append(request.url)

        page.on("request", observe)

        def visit(path):
            page.goto(base + path)
            PRODUCT["no_overflow"](page, width)

        visit("/")
        expect(page).to_have_title(COHORT["controls"]["home"]["title"])
        page.locator("footer").get_by_role("link", name="About", exact=True).press("Enter")
        page.wait_for_url(base + "/about/")
        heading = page.get_by_role("heading", name="About ManaScout", exact=True)
        expect(heading).to_be_visible()
        if screenshots and width in (390, 1440):
            page.screenshot(path=screenshots / f"about-{width}.png", full_page=True)
        page.keyboard.press("Tab")
        skip = page.get_by_role("link", name="Skip to About ManaScout")
        expect(skip).to_be_focused()
        skip.press("Enter")
        expect(heading).to_be_focused()
        expect(page.get_by_role("link", name="report it through Contact")).to_have_attribute("href", "/contact/")
        expect(page.get_by_role("heading", name="Retailer links and affiliate disclosure")).to_be_visible()
        PRODUCT["no_overflow"](page, width)

        visit("/card/")
        expect(page.locator("footer").get_by_role("link", name="About", exact=True)).to_be_visible()
        filter_button = page.get_by_role("button", name="Original Printings")
        filter_button.press("Enter")
        expect(filter_button).to_have_attribute("aria-pressed", "true")
        PRODUCT["no_overflow"](page, width)

        for slug in ("rhystic-study", "sol-ring", "mr-spock-science-officer", "mana-crypt"):
            visit(f"/card/{slug}/")
            snippet = COHORT["controls"][slug] if slug in COHORT["controls"] else COHORT["cohort"][slug]["new"]
            expect(page).to_have_title(snippet["title"])
            expect(page.locator("meta[name=description]")).to_have_attribute("content", snippet["description"])
            byline = page.locator(".guide-byline")
            expect(byline).to_be_visible()
            expect(byline.get_by_role("link", name="ManaScout", exact=True)).to_have_attribute("href", "/about/")
            expect(byline.locator("time")).to_be_visible()
            if screenshots and slug == "sol-ring" and width in (390, 1440):
                page.screenshot(path=screenshots / f"guide-{width}.png")

        visit("/")
        search = page.locator("#search-input")
        search.fill("Sol Ring")
        search.press("Enter")
        expect(page.locator("#card-details h2")).to_have_text("Sol Ring")
        expect(page.get_by_role("table", name="Printing catalogue records")).to_be_visible()
        details = page.locator("#ms-card-information").get_by_text("Collector information", exact=True)
        details.press("Enter")
        merchant = page.get_by_role("link", name="View on Cardmarket" if direct else "Search Cardmarket", exact=True)
        expect(merchant).to_be_visible()
        target = urlsplit(merchant.get_attribute("href"))
        assert target.hostname == "www.cardmarket.com"
        if direct:
            assert merchant.get_attribute("href") == RETAILER_PRODUCT
        else:
            assert target.path == "/en/Magic/Products/Search"
            assert parse_qs(target.query) == {"searchString": ["Sol Ring"]}
        expect(merchant).to_have_attribute("rel", "noopener noreferrer")
        verification = page.get_by_role("link", name="Verify on Scryfall", exact=True)
        expect(verification).to_be_visible()
        assert verification.get_attribute("data-ms-merchant") is None
        assert page.get_by_role("link", name="Search Magic Madhouse").count() == 0
        assert page.get_by_role("link", name="Search Chaos Cards").count() == 0
        PRODUCT["no_overflow"](page, width)

        # Observe analytics-bound arguments without opening an external retailer window.
        page.evaluate("""() => {
          window.merchantFixture = [];
          window.ManaScoutAnalytics = {
            ...window.ManaScoutAnalytics,
            trackMerchantExit: event => window.merchantFixture.push(event)
          };
          document.addEventListener("click", event => {
            if (event.target.closest("a[data-ms-merchant]")) event.preventDefault();
          });
        }""")
        merchant.press("Enter")
        tracked = page.evaluate("window.merchantFixture")
        assert tracked == [{
            "merchant": "cardmarket", "guide": "none", "printingId": SOL["id"], "finish": "nonfoil"
        }], (width, tracked)

        page.locator("#card-details [data-build-deck]").click()
        page.wait_for_url(f"{base}/deck/**")
        expect(page.locator("#card-preview[open] #preview-id")).to_have_text(SOL["id"])
        expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://manascout.co.uk/deck/")
        PRODUCT["no_overflow"](page, width)
        assert not provider_calls and not errors, (provider_calls, errors)
        print(f"PASS {width}px homepage, About, archive, four guides, Search, retailer keyboard action and Deck handoff", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8779")
    parser.add_argument("--artwork", type=Path)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--width", action="append", type=int)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        for width in args.width or WIDTHS:
            audit(browser, args.base_url, width, args.artwork, args.screenshots)
        browser.close()


if __name__ == "__main__":
    main()
