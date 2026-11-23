"""Playwright product audit against a locally served ManaScout checkout.

Run python -m http.server 8765, then python tests/browser-phase10.py.
Use --artwork to serve original catalogue JPEGs named by printing UUID.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CARDS = json.loads((ROOT / "tests/fixtures/phase10-printings.json").read_text())
WEEKLY = json.loads((ROOT / "tests/fixtures/cosmic-spider-man.json").read_text())
SPOCK = CARDS[:5]
WIDTHS = (320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920)
BASE_URL = "http://127.0.0.1:8765"


def exact_url(card, finish):
    return "/?" + urlencode({"q": card["name"], "printing": card["id"], "finish": finish})


def shared_url(cards):
    return "/#compare=v1:" + ",".join(f"{card['id']}~{finish}" for card, finish in cards)


def install(context, artwork):
    cards = CARDS + [WEEKLY]
    records = {card["id"]: card for card in cards}
    records.update({f"{card['set']}/{card['collector_number']}": card for card in cards})

    def catalogue(route):
        url = urlsplit(route.request.url)
        params = parse_qs(url.query)
        query = params.get("q", [""])[0]
        if url.path == "/sets":
            route.fulfill(json={"data": [{"code": "trk", "name": "Star Trek"}]})
        elif url.path == "/cards/autocomplete":
            route.fulfill(json={"data": []})
        elif url.path == "/cards/named":
            card = next((card for card in cards if card["name"] == params.get("exact", params.get("fuzzy", [""]))[0]), None)
            route.fulfill(status=200 if card else 404, json=card or {"object": "error"})
        elif url.path == "/cards/search":
            group = [card for card in cards if card["oracle_id"] in query]
            if 'a:"Grant Griffin"' in query:
                group = SPOCK[2:4]
            route.fulfill(status=200 if group else 404, json={"data": group, "total_cards": len(group), "has_more": False})
        elif url.path == "/cards/random":
            route.fulfill(json=CARDS[5])
        else:
            key = url.path.removeprefix("/cards/").removesuffix("/en")
            card = records.get(key)
            route.fulfill(status=200 if card else 404, json=card or {"object": "error"})

    def image(route):
        image_id = Path(urlsplit(route.request.url).path).stem
        local = artwork / f"{image_id}.jpg" if artwork else None
        if local and local.is_file():
            route.fulfill(path=local, content_type="image/jpeg")
        else:
            route.continue_()

    context.route("https://api.scryfall.com/**", catalogue)
    context.route("https://cards.scryfall.io/**", image)
    context.route("https://api.frankfurter.dev/**", lambda route: route.abort())


def no_overflow(page, width):
    actual = page.evaluate("document.documentElement.scrollWidth")
    assert actual <= width + 1, (width, actual, page.url)


def physical(locator, expected, check_art):
    expect(locator).to_have_attribute("data-surface", expected)
    info = locator.evaluate("""card => {
      const face = card.querySelector('.ms-physical-face'), image = face.querySelector('img');
      const surface = face.querySelector('.ms-physical-reflection'), style = getComputedStyle(face);
      return { aspect: face.offsetWidth / face.offsetHeight, natural: image.naturalWidth,
        clip: style.clipPath, overflow: style.overflow,
        fit: getComputedStyle(image).objectFit, display: getComputedStyle(surface).display,
        finish: getComputedStyle(surface).backgroundImage };
    }""")
    assert abs(info["aspect"] - 488 / 680) < .05, info
    assert info["clip"].startswith("inset(") and info["overflow"] == "hidden" and info["fit"] == "contain", info
    assert (info["display"] == "none") == (expected == "nonfoil"), info
    if check_art:
        expect(locator.locator("img")).to_be_visible()
        locator.locator("img").scroll_into_view_if_needed()
        expect(locator.locator("img")).to_have_js_property("complete", True)
        assert locator.locator("img").evaluate("img => img.naturalWidth") > 0
    return info["finish"]


def screenshot(locator, directory, filename):
    if directory:
        locator.screenshot(path=directory / filename, animations="disabled")


def audit(browser, width, base, artwork, screenshots):
    mobile = width <= 430
    context = browser.new_context(viewport={"width": width, "height": 900}, is_mobile=mobile, has_touch=mobile)
    install(context, artwork)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base, wait_until="domcontentloaded")
    weekly = page.locator("#card-of-the-week")
    expect(weekly.locator(".ms-physical")).to_have_attribute("data-surface", "foil")
    if width in (390, 1440):
        physical(weekly.locator(".ms-physical"), "foil", artwork is not None)
        screenshot(weekly, screenshots, f"card-of-the-week-{width}.png")
        featured = page.locator('[data-feature-card="Sol Ring"] .ms-physical')
        expect(featured).to_have_attribute("data-surface", "nonfoil")
        discover = page.locator("#discover-card-button")
        if discover.count():
            discover.click()
            expect(page.locator("#card-details .ms-physical").first).to_have_attribute("data-surface", "nonfoil")
            page.goto(base, wait_until="domcontentloaded")
    search = page.locator("#search-input")
    search.fill("Grant Griffin")
    search.press("Enter")
    table = page.get_by_role("table", name="Exact printing results")
    expect(table).to_be_visible()
    expect(table.get_by_role("row")).to_have_count(3)
    expect(table).to_contain_text("Star Trek · TRK #535")
    expect(table).to_contain_text("Surge Foil")
    expect(table).not_to_contain_text("surgefoil")
    expect(page.get_by_text("Printing matches", exact=True)).to_have_count(0)
    no_overflow(page, width)
    if artwork:
        table.locator("img").first.scroll_into_view_if_needed()
        for thumb in table.locator("img").all():
            expect(thumb).to_have_js_property("complete", True)
            assert thumb.evaluate("img => img.naturalWidth") > 0
    if width in (390, 1440):
        screenshot(table, screenshots, f"printing-results-{width}.png")
    select = table.get_by_role("button", name="Mr. Spock, Science Officer Star Trek · TRK #535", exact=True)
    select.focus()
    select.press("Enter")
    selected = page.locator("#card-details")
    expect(selected.get_by_role("heading", name=SPOCK[0]["name"])).to_be_focused()
    expect(selected).to_contain_text("TRK #535")
    expect(selected).to_contain_text("Surge Foil")
    expect(page.get_by_role("table", name="Printing catalogue records")).to_have_count(0)
    assert page.locator("#ms-search-results table").count() == 1
    assert SPOCK[3]["id"] in page.url
    surface = selected.locator("[data-ms-physical]")
    finish_paint = physical(surface, "surgefoil", artwork is not None)
    assert "repeating-linear-gradient" in finish_paint
    surface.scroll_into_view_if_needed()
    position = surface.bounding_box()
    x, y = position["x"] + position["width"] * .8, position["y"] + position["height"] * .25
    if mobile:
        cdp = context.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    else:
        page.mouse.move(x, y)
    expect(surface).to_have_attribute("data-tilting", "")
    angles = surface.evaluate("e => [parseFloat(e.style.getPropertyValue('--rx')), parseFloat(e.style.getPropertyValue('--ry'))]")
    assert 0 < abs(angles[0]) <= (6 if mobile else 11), angles
    assert 0 < abs(angles[1]) <= (7 if mobile else 14), angles
    if width == 1440:
        screenshot(selected, screenshots, "surge-selected-desktop.png")
    if mobile:
        assert surface.evaluate("e => getComputedStyle(e).touchAction") == "pan-y pinch-zoom"
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        page.mouse.move(0, 0)
    expect(surface).not_to_have_attribute("data-tilting", "")
    if mobile and width == 390:
        surface.scroll_into_view_if_needed()
        bounds = surface.bounding_box()
        x = bounds["x"] + bounds["width"] * .5
        y = bounds["y"] + bounds["height"] * .65
        before = page.evaluate("scrollY")
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for distance in (25, 55, 100, 145):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - distance}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_function("before => scrollY > before + 20", arg=before)
        expect(surface).not_to_have_attribute("data-tilting", "")
    page.emulate_media(reduced_motion="reduce")
    assert surface.locator(".ms-physical-shell").evaluate("e => getComputedStyle(e).transform === 'none' && getComputedStyle(e).transitionDuration === '0s'")
    no_overflow(page, width)
    if width == 390:
        table.get_by_role("button", name="Mr. Spock, Science Officer Star Trek · TRK #411", exact=True).click()
        expect(selected.locator("[data-ms-physical]")).to_have_attribute("data-surface", "nonfoil")
        selected.get_by_label("Selected Finish").select_option("foil")
        expect(selected.locator("[data-ms-physical]")).to_have_attribute("data-surface", "foil")
        expect(page.locator(".printings-section")).to_be_hidden()
        assert "finish=foil" in page.url
        selected.get_by_role("button", name="All printings of this card").click()
        expect(table).to_be_hidden()
        expect(page.get_by_role("table", name="Printing catalogue records")).to_be_visible()

    page.goto(base + shared_url([(SPOCK[2], "foil"), (SPOCK[3], "foil")]))
    compare = page.locator(".cmp-current")
    expect(compare).to_be_visible()
    expect(compare.locator(".cmp-grid article")).to_have_count(2)
    diffs = compare.get_by_role("region", name="Differences")
    expect(diffs.get_by_text("Selected Finish", exact=True)).to_be_visible()
    expect(diffs.get_by_text("Artwork", exact=True)).to_have_count(0)
    expect(compare.get_by_text(SPOCK[2]["id"], exact=True)).to_be_hidden()
    expect(compare.get_by_role("button", name="Remove Star Trek · TRK #535, English, Surge Foil from comparison")).to_have_text("Remove")
    assert physical(compare.locator(".cmp-art .ms-physical").first, "foil", artwork is not None) != finish_paint
    if width in (390, 1440):
        screenshot(compare, screenshots, f"comparison-2-{width}.png")
    no_overflow(page, width)
    page.goto(base + shared_url([(card, "foil") for card in SPOCK[1:]]))
    expect(compare.locator(".cmp-grid article")).to_have_count(4)
    expect(diffs.get_by_text("Artwork", exact=True)).to_be_visible()
    expect(compare.get_by_role("button", name="Remove Star Trek · TRK #353, English, Traditional Foil from comparison")).to_be_visible()
    if width in (390, 1440):
        screenshot(compare, screenshots, f"comparison-4-{width}.png")
    no_overflow(page, width)

    if width in (390, 1440):
        for card, finish, expected in [(SPOCK[0], "nonfoil", "nonfoil"), (CARDS[6], "etched", "etched"), (CARDS[7], "foil", "galaxyfoil")]:
            page.goto(base + exact_url(card, finish))
            locator = page.locator("#card-details .ms-physical").first
            physical(locator, expected, artwork is not None)
            if width == 1440:
                screenshot(page.locator("#card-details"), screenshots, f"{expected}-selected-desktop.png")
        page.goto(base + "/card/mr-spock-science-officer/")
        expect(page.locator(".guide-value-strip")).to_contain_text("5 English paper printing records · 4 artwork families")
        archive_table = page.get_by_role("table", name="Printing catalogue records")
        expect(archive_table.get_by_role("row")).to_have_count(6)
        archive_table.get_by_role("button", name="Star Trek · TRK #535", exact=True).click()
        differences = page.locator("[data-version-differences]")
        differences.get_by_text("What makes this version different?").click()
        expect(differences).to_contain_text("Different artwork")
        expect(differences).to_contain_text("Same gameplay text")
        expect(page.locator(".guide-variant-grid .ms-physical[data-surface='surgefoil']")).to_be_visible()
        if width == 390:
            screenshot(page.locator(".guide-collector-module"), screenshots, "spock-variants-390.png")
        no_overflow(page, width)
        page.goto(base + "/card/sol-ring/")
        expect(page.get_by_role("heading", name="First Printing", exact=True)).to_be_visible()
        expect(page.locator(".guide-collector-module")).to_contain_text("Mark Tedin")
        expect(page.locator(".guide-static-art .ms-physical")).to_have_attribute("data-surface", "nonfoil")
        if width == 390:
            screenshot(page.locator(".guide-overview"), screenshots, "sol-ring-390.png")
        no_overflow(page, width)
        card = SPOCK[3]
        page.goto(base + "/deck/?" + urlencode({"card": card["name"], "printing": card["id"], "finish": "foil"}))
        preview = page.locator("#card-preview")
        expect(preview).to_be_visible()
        expect(preview.locator(".ms-physical")).to_have_attribute("data-surface", "surgefoil")
        expect(preview.locator("#preview-finish")).to_have_text("Surge Foil")
        no_overflow(page, width)
        expect(preview.locator("#preview-add")).to_be_enabled()
        preview.locator("#preview-add").click()
        if preview.is_visible():
            preview.locator("#close-preview").click()
        page.locator('#deck-entries [data-action="change-printing"]').first.click()
        drawer = page.locator("#printing-selector")
        expect(drawer).to_be_visible()
        expect(drawer.locator(".ds-printing-choice > .ms-physical")).to_have_attribute("data-surface", "surgefoil")
        no_overflow(page, width)
        screenshot(drawer, screenshots, f"deck-printing-inspection-{width}.png")
    assert not errors, (width, errors)
    context.close()
    print(f"PASS {width}px", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--artwork", type=Path)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--width", type=int, action="append")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, args=["--no-sandbox"])
        for width in args.width or WIDTHS:
            audit(browser, width, args.base_url, args.artwork, args.screenshots)
        browser.close()


if __name__ == "__main__":
    main()
