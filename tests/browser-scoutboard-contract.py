"""Exercise Scoutboard's public homepage interactions with a deterministic Scryfall fixture."""

import argparse
from collections import Counter
import json
from pathlib import Path
import runpy
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import Error, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = runpy.run_path(str(ROOT / "tests/browser-phase10.py"))
WEEKLY = PRODUCT["WEEKLY"]
SOL = PRODUCT["CARDS"][5]
API = "https://api.scryfall.com"
WEEKLY_PATH = f"/cards/{WEEKLY['set']}/{WEEKLY['collector_number']}"
NEXT = f"{API}/cards/search?page=2"
WIDTHS = (320, 390, 768, 1024, 1440, 1920)
FEATURES = ("Rhystic Study", "Sol Ring", "The One Ring", "Force of Will",
            "Demonic Tutor", "Mystic Remora", "Ancient Tomb", "Smothering Tithe")
FEATURE_ART = dict(zip(FEATURES, PRODUCT["CARDS"], strict=True))


def featured_card(name, premium=False):
    original = FEATURE_ART[name]
    if name == "Sol Ring":
        original = SOL
    card = {**original, "name": name, "border_color": "black",
            "frame_effects": [], "promo_types": [], "full_art": False, "finishes": ["nonfoil"]}
    if premium:
        card.update(id="f459d000-a31c-42d1-acb0-9fa423e203e9", border_color="borderless",
                    finishes=["nonfoil", "etched"])
    return card


def fixture(context, artwork, feature="success", weekly="success", random="success", hold=False,
            extra_cards=()):
    PRODUCT["install"](context, artwork, extra_cards)
    held, calls, weekly_warnings = {}, [], []

    def intercept(route):
        url = urlsplit(route.request.url)
        params = parse_qs(url.query)
        calls.append(route.request.url)
        query = params.get("q", [""])[0]
        name = query.removeprefix('!"').removesuffix('" game:paper')
        if url.path == WEEKLY_PATH:
            if weekly == "timeout":
                held["weekly"] = route
            elif weekly == "offline":
                route.abort("connectionfailed")
            elif weekly == "mismatch":
                route.fulfill(json={**WEEKLY, "promo_types": ["surgefoil"]})
            elif weekly == "429":
                route.fulfill(status=429, json={"object": "error"}, headers={"Retry-After": "1"})
            elif weekly == "404":
                route.fulfill(status=404, json={"object": "error"})
            else:
                route.fulfill(json=WEEKLY)
        elif url.path == "/cards/random" and random == "failure":
            route.abort("connectionfailed")
        elif url.path == "/cards/search" and params.get("page") == ["2"]:
            route.fulfill(json={"data": [featured_card("Rhystic Study", premium=True)]})
        elif url.path == "/cards/search" and name in FEATURES:
            data = {"data": [featured_card(name)]}
            if name == "Rhystic Study":
                if feature != "success":
                    route.fulfill(status=404, json={"object": "error"})
                    return
                data.update(has_more=True, next_page=NEXT)
                if hold:
                    held["featured"] = (route, data)
                    return
            route.fulfill(json=data)
        elif url.path == "/cards/named" and params.get("exact") == ["Rhystic Study"]:
            if feature == "fallback":
                route.fulfill(json=featured_card("Rhystic Study"))
            else:
                route.fulfill(status=404, json={"object": "error"})
        else:
            route.fallback()

    context.route(f"{API}/**", intercept)
    if weekly == "timeout":
        def short_deadline(route):
            script = route.fetch().text()
            route.fulfill(content_type="application/javascript", body=script + """
const scoutboardTimeoutClient = window.ManaScoutScryfall;
window.ManaScoutScryfall = Object.freeze({...scoutboardTimeoutClient, get(url, options) {
  return scoutboardTimeoutClient.get(url, url.endsWith(%s) ? {...options, timeout: 250} : options);
}});
""" % json.dumps(WEEKLY_PATH))
        context.route("**/assets/js/scryfall-client.js?*", short_deadline)
    page = context.new_page()
    page.on("console", lambda message: weekly_warnings.append(message.text)
            if "Card of the Week lookup unavailable" in message.text else None)
    return page, held, calls, weekly_warnings


def featured_link(page, name):
    return page.locator(f'[data-feature-card="{name}"] .scoutboard-feature-link')


def finish_initial(page, calls):
    expect(featured_link(page, "Force of Will")).to_have_attribute(
        "href", f"/card/force-of-will/?printing={featured_card('Force of Will')['id']}&finish=nonfoil")
    # Last resolved archive job marks the end of the initial deterministic reads.
    for _ in range(120):
        if any(urlsplit(url).path == "/cards/thb/261" for url in calls):
            return
        page.wait_for_timeout(25)
    raise AssertionError("The last archive lookup never started")


def visual_checks(browser, base, artwork, screenshots):
    metrics = None
    for width in WIDTHS:
        with browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce",
                                 is_mobile=width <= 430, has_touch=width <= 430) as context:
            page, _, calls, _ = fixture(context, artwork)
            requests, errors = [], []
            page.on("request", lambda request: requests.append(request.url))
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base + "/")
            selector = "#card-of-the-week"
            expect(page.locator(selector)).to_have_attribute("data-weekly-printing-id", WEEKLY["id"])
            expect(page.locator(f"{selector} [data-surface]")).to_have_attribute("data-surface", "foil")
            expect(page.locator(".ms-edge-atmosphere")).to_be_attached()
            finish_initial(page, calls)
            assert page.evaluate("document.documentElement.scrollWidth") <= width
            assert not errors, errors
            if screenshots:
                for name, locator in [("features", page.locator(".scoutboard-feature-grid")),
                                      ("weekly", page.locator(selector))]:
                    locator.evaluate("""async node => {
                      for (const image of node.querySelectorAll('img')) image.loading = 'eager';
                      await Promise.all([...node.querySelectorAll('img')].map(image => image.decode()));
                    }""")
                    locator.screenshot(path=screenshots / f"{name}-{width}.png", animations="disabled")
            if width == 1440:
                # Warm decoding can trigger lazy local artwork requests. Count at the same
                # settled state in both trees, after the four images and COTW are decoded.
                local = [url for url in requests if url.startswith(base + "/")]
                metrics = {
                    "homepage_browser_requests": len(requests),
                    "homepage_local_requests": len(local),
                    "scryfall_initial_gets": len(calls),
                    "scryfall_initial_duplicate_gets": sum(n - 1 for n in Counter(calls).values()),
                    "scryfall_paths": [urlsplit(url).path for url in calls],
                }
            print(f"PASS Scoutboard/COTW surface, layout and overflow at {width}px", flush=True)
    return metrics


def flows(browser, base, artwork):
    with browser.new_context(reduced_motion="reduce") as context:
        page, held, calls, _ = fixture(context, artwork, hold=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/")
        first = featured_link(page, "Rhystic Study")
        expect(first).to_be_visible()
        expect(first).to_have_attribute("href", "/card/rhystic-study/")
        expect(page.locator('[data-feature-card="Rhystic Study"] .scoutboard-feature-placeholder')).to_be_visible()
        expect(page.locator("#card-of-the-week")).to_be_visible()
        route, data = held["featured"]
        route.fulfill(json=data)
        expect(first).to_have_attribute("href",
            f"/card/rhystic-study/?printing={featured_card('Rhystic Study', True)['id']}&finish=etched")
        assert NEXT in calls
        expect(page.locator("#card-of-the-week")).to_have_attribute("data-weekly-printing-id", WEEKLY["id"])
        page.locator("#discover-card-button").click()
        expect(page.locator("#card-details h2")).to_have_text("Sol Ring")
        expect(page.locator("#discover-card-button")).to_be_enabled()
        assert sum(urlsplit(call).path == "/cards/random" for call in calls) == 1
        assert not errors, errors
    print("PASS cold featured fallback, paginated exact enrichment, COTW and Discover", flush=True)

    for mode in ("fallback", "failure"):
        with browser.new_context(reduced_motion="reduce") as context:
            page, _, calls, _ = fixture(context, artwork, feature=mode, random="failure")
            page.goto(base + "/")
            finish_initial(page, calls)
            first = featured_link(page, "Rhystic Study")
            expected = "/card/rhystic-study/"
            if mode == "fallback":
                expected += f"?printing={featured_card('Rhystic Study')['id']}&finish=nonfoil"
            expect(first).to_have_attribute("href", expected)
            if mode == "failure":
                expect(page.locator('[data-feature-card="Rhystic Study"] .scoutboard-feature-placeholder')).to_be_visible()
            assert any(urlsplit(call).path == "/cards/named" and "Rhystic" in call for call in calls)
            button = page.locator("#discover-card-button")
            button.click()
            expect(button).to_have_text("Could not scout — try again")
            expect(button).to_have_accessible_name("Discover a Card")
            expect(button).to_be_enabled()
            assert sum(urlsplit(call).path == "/cards/random" for call in calls) == 1
        print(f"PASS first-page {mode} and Discover failure recovery", flush=True)

    for mode in ("mismatch", "404", "429", "offline", "timeout"):
        with browser.new_context(reduced_motion="reduce") as context:
            page, held, _, warnings = fixture(context, artwork, weekly=mode)
            page.goto(base + "/")
            expect(page.locator("#card-of-the-week")).to_be_visible()
            for _ in range(80):
                if warnings:
                    break
                page.wait_for_timeout(25)
            assert warnings, mode
            expect(page.locator("#card-of-the-week")).not_to_have_attribute("data-weekly-printing-id", WEEKLY["id"])
            assert WEEKLY["id"] in page.locator("#card-week-link").get_attribute("href")
            if mode == "timeout":
                try:
                    held["weekly"].abort()
                except Error:
                    pass  # The transport has already aborted this request.
        print(f"PASS static COTW retained after {mode}", flush=True)

    with browser.new_context(reduced_motion="reduce") as context:
        page, held, _, _ = fixture(context, artwork, hold=True)
        page.goto(base + "/")
        page.get_by_role("button", name="Show 4 more featured Magic cards").click()
        later = featured_link(page, "Demonic Tutor")
        expect(later).to_have_attribute("href",
            f"/card/demonic-tutor/?printing={featured_card('Demonic Tutor')['id']}&finish=nonfoil")
        route, data = held["featured"]
        with page.expect_response(lambda response: response.url == NEXT):
            route.fulfill(json=data)
        expect(featured_link(page, "Smothering Tithe")).to_have_attribute("href",
            f"/card/smothering-tithe/?printing={featured_card('Smothering Tithe')['id']}&finish=nonfoil")
        expect(later).to_have_attribute("href",
            f"/card/demonic-tutor/?printing={featured_card('Demonic Tutor')['id']}&finish=nonfoil")
        expect(page.locator('[data-feature-card="Rhystic Study"]')).to_have_count(0)
    print("PASS stale featured page cannot overwrite the newer page", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8776")
    parser.add_argument("--artwork", type=Path)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--measure-only", action="store_true")
    args = parser.parse_args()
    if args.screenshots:
        if not args.artwork:
            parser.error("--screenshots requires --artwork")
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        print(json.dumps(visual_checks(browser, args.base_url, args.artwork, args.screenshots), sort_keys=True))
        if not args.measure_only:
            flows(browser, args.base_url, args.artwork)
        browser.close()


if __name__ == "__main__":
    main()
