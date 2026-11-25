"""Browser contract for Search history, verified guide selections and failure recovery."""
import argparse
import json
from pathlib import Path
import runpy
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import Error, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PHASE10 = runpy.run_path(str(ROOT / "tests/browser-phase10.py"))
SOL = PHASE10["CARDS"][5]
SPOCK = PHASE10["SPOCK"][3]
HEROIC = json.loads((ROOT / "docs/phase10-1-guides.json").read_text())["guides"]["heroic-intervention"]


def fixture(context, artwork, failures):
    PHASE10["install"](context, artwork, HEROIC["curated"])
    pending = {}
    requests = []

    def response(route):
        url = urlsplit(route.request.url)
        values = parse_qs(url.query)
        name = values.get("exact", [""])[0]
        requests.append((url.path, name))
        if url.path == "/cards/autocomplete" and values.get("q") == ["Sol Ri"]:
            route.fulfill(json={"data": ["Sol Ring"]})
        elif failures and name == "Rate Limited Fixture":
            route.fulfill(status=429, json={"object": "error"}, headers={
                "Retry-After": "2", "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": "Retry-After"
            })
        elif failures and name == "Offline Fixture":
            route.abort("connectionfailed")
        elif failures and name in ("Timeout Fixture", "Slow Fixture"):
            pending[name] = route
        else:
            route.fallback()

    context.route("https://api.scryfall.com/**", response)
    if failures:
        def shorten_deadline(route):
            script = route.fetch().text()
            route.fulfill(content_type="application/javascript", body=script + """
window.ManaScoutScryfall = (() => {
    const client = window.ManaScoutScryfall;
    return Object.freeze({ ...client, get(url, options) {
        const timed = new URL(url).searchParams.get("exact") === "Timeout Fixture";
        return client.get(url, timed ? { ...options, timeout: 350 } : options);
    } });
})();
""")
        context.route("**/assets/js/scryfall-client.js?*", shorten_deadline)
    return pending, requests


def select_named(page, name):
    field = page.locator("#search-input")
    field.fill(name)
    field.press("Enter")
    expect(page.locator("#card-details h2")).to_have_text(name)


def checked_flow(browser, base, width, artwork):
    context = browser.new_context(viewport={"width": width, "height": 900},
                                  is_mobile=width <= 430, has_touch=width <= 430, reduced_motion="reduce")
    fixture(context, artwork, failures=False)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/")
    field = page.locator("#search-input")
    field.fill("Sol Ri")
    expect(page.get_by_role("option", name="Sol Ring", exact=True)).to_be_visible()
    field.press("ArrowDown")
    field.press("Enter")
    expect(page.locator("#card-details h2")).to_have_text("Sol Ring")
    expect(page).to_have_title("Sol Ring Printings, Foils & Art | ManaScout")
    expect(page.locator('meta[name="robots"]')).to_have_attribute("content", "noindex,follow")

    field.fill("Grant Griffin")
    field.press("Enter")
    results = page.get_by_role("table", name="Exact printing results")
    row = results.get_by_role("button", name="Mr. Spock, Science Officer Star Trek · TRK #535", exact=True)
    row.click()
    expect(page.locator("#card-details .ms-physical")).to_have_attribute("data-ms-physical", SPOCK["id"])
    PHASE10["no_overflow"](page, width)
    page.go_back()
    expect(results).to_be_visible()
    expect(results.get_by_role("row")).to_have_count(3)
    page.go_forward()
    expect(page.locator("#card-details .ms-physical")).to_have_attribute("data-ms-physical", SPOCK["id"])
    for _ in range(3):
        page.go_back()
    expect(field).to_have_value("")
    expect(page.locator("#card-details h2")).to_have_count(0)
    expect(page.locator('meta[name="robots"]')).to_have_attribute("content", "index,follow,max-image-preview:large")

    page.locator("#discover-card-button").click()
    expect(page.locator("#card-details h2")).to_have_text("Sol Ring")
    page.locator("#card-details [data-build-deck]").click()
    expect(page.locator("#card-preview[open] #preview-id")).to_have_text(SOL["id"])
    expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://manascout.co.uk/deck/")
    PHASE10["no_overflow"](page, width)

    for slug, card in (("sol-ring", SOL), ("heroic-intervention", HEROIC["curated"][0])):
        path = f"/card/{slug}/"
        page.goto(base + path)
        title = page.title()
        expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://manascout.co.uk" + path)
        table = page.get_by_role("table", name="Printing catalogue records")
        table.locator(f'.ms-print-name[data-print-id="{card["id"]}"]').click()
        selected = page.locator("#card-details .ms-physical").first
        expect(selected).to_have_attribute("data-ms-physical", card["id"])
        expect(page).to_have_title(title)
        identity = urlsplit(page.url)
        assert identity.path == path and parse_qs(identity.query)["printing"] == [card["id"]]
        assert "q" not in parse_qs(identity.query)
        page.locator("#card-details button[data-compare-id]").click()
        expect(page.locator(".cmp-current .cmp-grid article")).to_have_count(1)
        PHASE10["no_overflow"](page, width)

    # A dynamic q under a permanent guide is owned by one controller during boot.
    page.goto(base + "/card/sol-ring/?" + urlencode({"q": SPOCK["name"]}))
    expect(page.locator("#card-details h2")).to_have_text(SPOCK["name"])
    expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://manascout.co.uk/card/sol-ring/")
    assert "Sol Ring" in page.title()

    page.goto(base + "/card/")
    total = page.locator(".hub-guide").count()
    page.get_by_role("button", name="Original Printings").click()
    assert 0 < page.locator(".hub-guide:visible").count() < total
    expect(page.locator(".ms-edge-atmosphere > span")).to_have_count(4)
    PHASE10["no_overflow"](page, width)
    assert not errors, errors
    context.close()


def error_flow(browser, base, width, artwork):
    context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
    pending, requests = fixture(context, artwork, failures=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/")
    field = page.locator("#search-input")
    status = page.locator("#ms-search-status")

    def submit(name):
        field.fill(name)
        field.press("Enter")

    for term, expected in (
        ("No Matching Fixture", "No paper cards or printings matched"),
        ("Rate Limited Fixture", "Scryfall is rate limiting requests"),
        ("Offline Fixture", "Catalogue search could not complete"),
        ("Timeout Fixture", "Catalogue search could not complete"),
    ):
        submit(term)
        expect(status).to_contain_text(expected)
        if term == "Rate Limited Fixture":
            sol_lookup = ("/cards/named", "Sol Ring")
            calls = requests.count(sol_lookup)
            submit("Sol Ring")
            expect(status).to_contain_text(expected)
            assert requests.count(sol_lookup) == calls
            page.wait_for_timeout(2050)
        if term == "Timeout Fixture":
            assert term in pending
            try:
                pending.pop(term).abort()
            except Error:
                pass
        select_named(page, "Sol Ring")
        expect(status).to_have_text("")

    # The shared scheduler may still be starting Scoutboard requests. Wait for
    # the actual lookup to start before issuing the successor that cancels it.
    with page.expect_request(lambda request: request.url.startswith("https://api.scryfall.com/cards/named?")
                             and parse_qs(urlsplit(request.url).query).get("exact") == ["Slow Fixture"]):
        submit("Slow Fixture")
    select_named(page, SPOCK["name"])
    assert "Slow Fixture" in pending
    try:
        pending.pop("Slow Fixture").fulfill(json=SOL)
    except Error:
        # Chromium can drop a paused request immediately on cancellation.
        pass
    expect(page.locator("#card-details h2")).to_have_text(SPOCK["name"])
    expect(status).to_have_text("")
    assert not errors, errors
    PHASE10["no_overflow"](page, width)
    context.unroute_all(behavior="wait")
    context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8774")
    parser.add_argument("--artwork", type=Path)
    parser.add_argument("--width", type=int, action="append")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        for width in args.width or (390, 1440):
            checked_flow(browser, args.base_url, width, args.artwork)
            print(f"PASS {width}px Search, history and handoffs", flush=True)
            error_flow(browser, args.base_url, width, args.artwork)
            print(f"PASS {width}px 404, 429, offline, timeout, cancellation and recovery", flush=True)


if __name__ == "__main__":
    main()
