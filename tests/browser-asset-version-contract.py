"""Serve a deterministic stage and check product flows and browser asset cache reuse."""

import argparse
from collections import Counter
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import runpy
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCOUT = runpy.run_path(str(ROOT / "tests/browser-scoutboard-contract.py"))
PRODUCT = SCOUT["PRODUCT"]
HEROIC = json.loads((ROOT / "docs/phase10-1-guides.json").read_text())["guides"]["heroic-intervention"]
GUIDES = (("sol-ring", SCOUT["SOL"]), ("heroic-intervention", HEROIC["curated"][0]))
ROUTES = ("/", "/card/", "/card/sol-ring/", "/card/heroic-intervention/", "/deck/")


class StageHandler(SimpleHTTPRequestHandler):
    def log_message(self, _message, *_args):
        pass

    def send_response(self, code, message=None):
        url = urlsplit(self.path)
        self.asset = self.server.manifest.get(url.path.lstrip("/"))
        if self.asset:
            self.server.asset_requests.append((self.path, code))
        return super().send_response(code, message)

    def end_headers(self):
        if self.asset:
            self.send_header("Cache-Control", "public, max-age=3600, immutable")
        super().end_headers()


def assert_asset_url(url, manifest):
    path = urlsplit(url)
    name = path.path.lstrip("/")
    assert name in manifest, name
    assert path.query == f"v={manifest[name]['version']}", url


def product_flows(browser, base, width, artwork, manifest):
    with browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce",
                             is_mobile=width <= 430, has_touch=width <= 430) as context:
        page, _, calls, _ = SCOUT["fixture"](context, artwork, extra_cards=HEROIC["curated"])
        assets, local_errors, page_errors = [], [], []
        page.on("response", lambda response:
                assets.append(response) if response.url.startswith(base + "/")
                and response.request.resource_type in ("script", "stylesheet") else None)
        page.on("response", lambda response:
                local_errors.append((response.url, response.status)) if
                response.url.startswith(base + "/") and response.status >= 400 else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def go(path):
            page.goto(base + path)
            check_layout()

        def check_layout():
            assert page.evaluate("document.documentElement.scrollWidth") <= width

        go("/")
        SCOUT["finish_initial"](page, calls)
        expect(SCOUT["featured_link"](page, "Rhystic Study")).to_have_attribute(
            "href", f"/card/rhystic-study/?printing={SCOUT['featured_card']('Rhystic Study', True)['id']}&finish=etched")
        expect(page.locator("#card-of-the-week")).to_have_attribute(
            "data-weekly-printing-id", SCOUT["WEEKLY"]["id"])
        field = page.locator("#search-input")
        field.fill("Sol Ring")
        field.press("Enter")
        expect(page.locator("#card-details h2")).to_have_text("Sol Ring")
        expect(page.locator("#card-details .ms-physical").first).to_have_attribute("data-surface", "nonfoil")
        check_layout()
        page.locator("#card-details [data-build-deck]").click()
        expect(page.locator("#card-preview[open] #preview-id")).to_have_text(SCOUT["SOL"]["id"])
        assert urlsplit(page.url).path == "/deck/"
        check_layout()

        go("/card/")
        guides = page.locator(".hub-guide")
        total = guides.count()
        page.get_by_role("button", name="Original Printings").click()
        assert 0 < page.locator(".hub-guide:visible").count() < total
        expect(page.locator(".ms-edge-atmosphere > span")).to_have_count(4)

        for slug, card in GUIDES:
            path = f"/card/{slug}/"
            go(path)
            editorial_title = page.title()
            table = page.get_by_role("table", name="Printing catalogue records")
            table.locator(f'.ms-print-name[data-print-id="{card["id"]}"]').click()
            expect(page.locator("#card-details .ms-physical").first).to_have_attribute("data-ms-physical", card["id"])
            expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://manascout.co.uk" + path)
            expect(page).to_have_title(editorial_title)
            check_layout()

        spock = PRODUCT["SPOCK"]
        go(PRODUCT["shared_url"]([(spock[2], "foil"), (spock[3], "foil")]))
        comparison = page.locator(".cmp-current")
        expect(comparison.locator(".cmp-grid article")).to_have_count(2)
        expect(comparison.locator(".cmp-art [data-surface=surgefoil]")).to_have_count(1)
        check_layout()
        assert not local_errors and not page_errors, (local_errors, page_errors)
        assert assets and any(response.request.resource_type == "stylesheet" for response in assets)
        for response in assets:
            assert response.ok, (response.status, response.url)
            assert_asset_url(response.url, manifest)
    print(f"PASS staged Search, Scoutboard, COTW, archive, two guides, comparison and Deck at {width}px", flush=True)


def warm_navigation(browser, base, server):
    with browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce") as context:
        page = context.new_page()
        devtools = context.new_cdp_session(page)
        devtools.send("Network.enable")
        # Use Chromium blocking instead of Playwright routing here so its HTTP cache remains active.
        devtools.send("Network.setBlockedURLs", {"urls": [
            "https://api.scryfall.com/*", "https://cards.scryfall.io/*", "https://api.frankfurter.dev/*",
            "https://mtg.wtf/*"
        ]})
        devtools.send("Network.setCacheDisabled", {"cacheDisabled": False})

        counts = []
        ordered_urls = {}
        start = len(server.asset_requests)
        for label in ("cold", "warm"):
            before = len(server.asset_requests)
            for route in ROUTES:
                page.goto(base + route)
                urls = page.locator('script[src], link[rel="stylesheet"][href]').evaluate_all(
                    "(elements, origin) => elements.map(e => e.src || e.href).filter(url => url.startsWith(origin))", base)
                assert urls and page.evaluate("""() => [...document.querySelectorAll('link[rel=stylesheet]')]
                    .filter(link => new URL(link.href).origin === location.origin).every(link => link.sheet !== null)""")
                for asset in urls:
                    assert_asset_url(asset, server.manifest)
                if label == "cold":
                    ordered_urls[route] = urls
                else:
                    assert urls == ordered_urls[route]
            counts.append(len(server.asset_requests) - before)
        statuses = Counter(code for _, code in server.asset_requests[start:])
        assert counts[0] == len({url for urls in ordered_urls.values() for url in urls}), counts
        assert counts[1] == 0, counts
        assert statuses == {200: counts[0]}, statuses
        print(json.dumps({
            "cold_server_js_css_requests": counts[0], "warm_server_js_css_requests": counts[1],
            "asset_404s": statuses[404], "asset_references_per_route": {
                route: len(urls) for route, urls in ordered_urls.items()
            }
        }, sort_keys=True))
        print("PASS ordered hashed assets and cold/warm Chromium cache reuse across five staged routes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, type=Path)
    parser.add_argument("--artwork", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.stage / "asset-versions.json").read_text())
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(StageHandler, directory=args.stage)) as server:
        server.manifest = manifest
        server.asset_requests = []
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
                for width in (390, 1440):
                    product_flows(browser, base, width, args.artwork, manifest)
                warm_navigation(browser, base, server)
                browser.close()
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
