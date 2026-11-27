"""Render the Phase 10.1 motion and exact-guide flows in Chromium.

The optional artwork directory holds original Scryfall JPEGs named by printing UUID.
The dedicated edge mist contract covers rendered atmosphere displacement.
"""
import argparse
import json
from pathlib import Path
import runpy
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PHASE10 = runpy.run_path(str(ROOT / "tests/browser-phase10.py"))
RESEARCH = json.loads((ROOT / "docs/phase10-1-guides.json").read_text())["guides"]
CARDS = [card for guide in RESEARCH.values() for card in guide["curated"]]
WIDTHS = (320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920)
MIST = ".ms-edge-atmosphere > span"


def capture(page, directory, name):
    if directory:
        page.screenshot(path=directory / f"{name}.png")


def verify_mist(page, width, directory):
    expect(page.locator(MIST)).to_have_count(4)
    expect(page.locator(".ms-edge-atmosphere")).to_have_attribute("aria-hidden", "true")
    assert page.locator(MIST).evaluate_all("""layers =>
        layers.every(layer => getComputedStyle(layer).pointerEvents === 'none')""")
    PHASE10["no_overflow"](page, width)
    capture(page, directory, f"workspace-{width}")


def verify_card_motion(context, page, surface, mobile):
    surface.scroll_into_view_if_needed()
    drift = surface.locator(".ms-physical-drift")
    shell = surface.locator(".ms-physical-shell")
    assert drift.evaluate("e => getComputedStyle(e).animationDuration") == "16s"
    assert drift.evaluate("e => getComputedStyle(e).transformStyle") == "preserve-3d"
    page.wait_for_function("""() => {
      const e = document.querySelector('#card-details .ms-physical-drift');
      return e && e.getAnimations().some(a => a.playState === 'running');
    }""")
    initial = drift.evaluate("e => getComputedStyle(e).transform")
    reflection = surface.locator(".ms-physical-reflection")
    rest_light = reflection.evaluate("e => getComputedStyle(e).backgroundPosition")
    page.wait_for_function("""before => getComputedStyle(document.querySelector('#card-details .ms-physical-drift')).transform !== before""", arg=initial)
    rect = surface.bounding_box()
    x, y = rect["x"] + rect["width"] * .72, rect["y"] + rect["height"] * .30
    touch = context.new_cdp_session(page) if mobile else None
    if touch:
        touch.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    else:
        page.mouse.move(x, y)
    expect(surface).to_have_attribute("data-tilting", "")
    expect(surface).to_have_attribute("data-idle-held", "")
    assert drift.evaluate("e => e.getAnimations()[0].playState") == "paused"
    held = drift.evaluate("e => getComputedStyle(e).transform")
    limits = (6, 7) if mobile else (11, 14)
    angles = surface.evaluate("e => [parseFloat(e.style.getPropertyValue('--rx')), parseFloat(e.style.getPropertyValue('--ry'))]")
    assert all(0 < abs(a) <= bound for a, bound in zip(angles, limits))
    assert reflection.evaluate("e => getComputedStyle(e).backgroundPosition") != rest_light
    page.wait_for_timeout(180)
    assert drift.evaluate("e => getComputedStyle(e).transform") == held
    assert shell.evaluate("e => getComputedStyle(e).transform") != "none"
    if touch:
        touch.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        page.mouse.move(1, 1)
    expect(surface).not_to_have_attribute("data-tilting", "")
    assert drift.evaluate("e => e.getAnimations()[0].playState") == "paused"
    expect(surface).not_to_have_attribute("data-idle-held", "")
    assert drift.evaluate("e => e.getAnimations()[0].playState") == "running"
    if touch:
        initial_scroll = page.evaluate("scrollY")
        touch.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y + 110}]})
        for distance in (30, 60, 95, 140):
            touch.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y + 110 - distance}]})
        touch.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_function("start => window.scrollY > start + 15", arg=initial_scroll)
        expect(surface).not_to_have_attribute("data-tilting", "")


def verify_new_guides(page, base, width, directory):
    for slug, guide in RESEARCH.items():
        page.goto(f"{base}/card/{slug}/", wait_until="domcontentloaded")
        expect(page.locator("h1")).to_have_text(guide["name"])
        expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", f"https://manascout.co.uk/card/{slug}/")
        expect(page.locator(".guide-static-art .ms-physical")).to_have_attribute("data-ms-physical", guide["first"])
        expect(page.locator("#card-details .ms-physical")).to_have_attribute("data-ms-physical", guide["first"])
        live = page.get_by_role("table", name="Printing catalogue records")
        expect(live).to_be_visible()
        expect(live.get_by_role("row")).to_have_count(len(guide["curated"]) + 1)
        cards = guide["curated"]
        alternative = cards[-1]
        if slug == "deep-space-9":
            expect(page.locator("[data-intent-record-count]")).to_have_text("3 English paper printing records · 2 artwork families")
        page.evaluate("window.scrollTo(0, 0)")
        capture(page, directory, f"{slug}-{width}")
        if slug == "heroic-intervention" and width == 1440 and directory:
            page.screenshot(path=directory / "heroic-intervention-long.png", full_page=True)
        live.locator(f'.ms-print-name[data-print-id="{alternative["id"]}"]').click()
        expect(page.locator("#card-details .ms-physical")).to_have_attribute("data-ms-physical", alternative["id"])
        deck_link = page.locator('#card-details a[href^="/deck/"]').get_attribute("href")
        handoff = parse_qs(urlsplit(deck_link).query)
        assert handoff["printing"] == [alternative["id"]] and handoff["finish"] == [alternative["finishes"][0]]
        expect(page.locator("[data-version-differences] summary")).to_have_text("What makes this version different?")
        PHASE10["no_overflow"](page, width)

        page.goto(base + "/" + PHASE10["shared_url"]([
            (cards[0], cards[0]["finishes"][0]), (alternative, alternative["finishes"][-1])
        ]).removeprefix("/"), wait_until="domcontentloaded")
        expect(page.locator(".cmp-grid article")).to_have_count(2)
        expect(page.locator(".cmp-grid .ms-physical-drift")).to_have_count(2)
        expect(page.get_by_role("region", name="Differences")).to_be_visible()
        expect(page.locator(".ms-edge-atmosphere")).to_have_count(1)
        PHASE10["no_overflow"](page, width)
        if slug == "deep-space-9" and directory:
            page.locator(".cmp-grid").evaluate("""async e => {
                window.scrollTo({top: scrollY + e.getBoundingClientRect().top - 78, behavior: 'instant'});
                await Promise.all(Array.from(e.querySelectorAll('img'), image => image.decode()));
                window.scrollTo({top: scrollY + e.getBoundingClientRect().top - 78, behavior: 'instant'});
            }""")
            capture(page, directory, f"comparison-{width}")


def audit(browser, base, width, artwork, directory):
    mobile = width <= 430
    context = browser.new_context(viewport={"width": width, "height": 900}, is_mobile=mobile, has_touch=mobile)
    PHASE10["install"](context, artwork, CARDS)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/", wait_until="domcontentloaded")
    verify_mist(page, width, directory)
    expect(page.locator("#card-of-the-week .ms-physical-drift")).to_have_count(0)
    search = page.locator("#search-input")
    search.fill("Grant Griffin")
    search.press("Enter")
    table = page.get_by_role("table", name="Exact printing results")
    expect(table).to_be_visible()
    expect(table.locator(".ms-physical[data-compact]")).to_have_count(2)
    expect(table.locator(".ms-physical-drift")).to_have_count(0)
    PHASE10["no_overflow"](page, width)
    if width in (390, 1440):
        first_thumb = table.locator("img").first
        first_thumb.scroll_into_view_if_needed()
        expect(first_thumb).to_have_js_property("complete", True)
        capture(page, directory, f"printing-table-{width}")
    table.locator(".ms-print-name").last.click()
    surface = page.locator("#card-details .ms-physical")
    expect(surface).to_have_attribute("data-surface", "surgefoil")
    if width in (390, 1440):
        verify_card_motion(context, page, surface, mobile)
        capture(page, directory, f"selected-card-{width}")
    if width == 1440 and directory:
        surface.evaluate("e => e.scrollIntoView({block:'center', behavior:'instant'})")
        rect = surface.bounding_box()
        clip = {key: round(value) for key, value in rect.items()}
        page.screenshot(path=directory / "idle-card-start.png", clip=clip)
        page.wait_for_timeout(3400)
        page.screenshot(path=directory / "idle-card-3.4s.png", clip=clip)
        from PIL import Image, ImageChops
        before = Image.open(directory / "idle-card-start.png").convert("RGB")
        after = Image.open(directory / "idle-card-3.4s.png").convert("RGB")
        assert ImageChops.difference(before, after).getbbox()
    reflection = surface.locator(".ms-physical-reflection")
    assert "repeating-linear-gradient" in reflection.evaluate("e => getComputedStyle(e).backgroundImage")
    assert reflection.evaluate("e => getComputedStyle(e).animationName") == ("none" if mobile else "ms-foil-idle")
    page.emulate_media(reduced_motion="reduce")
    assert reflection.evaluate("e => e.getAnimations().length") == 0
    assert surface.locator(".ms-physical-drift").evaluate("e => e.getAnimations().length") == 0
    assert page.locator(MIST).evaluate_all("""layers => layers.every(layer =>
        !layer.getAnimations().length && Number(getComputedStyle(layer).opacity) > 0)""")
    expect(surface).to_have_attribute("data-surface", "surgefoil")
    expect(page.locator("#card-details")).to_contain_text("Surge Foil")
    if width == 1440:
        capture(page, directory, "reduced-motion")
    page.emulate_media(reduced_motion="no-preference")
    page.goto(base + PHASE10["exact_url"](RESEARCH["deep-space-9"]["curated"][0], "nonfoil"), wait_until="domcontentloaded")
    expect(surface).to_have_attribute("data-surface", "nonfoil")
    assert surface.locator(".ms-physical-reflection").evaluate("e => getComputedStyle(e).display === 'none' && !e.getAnimations().length")
    PHASE10["no_overflow"](page, width)
    if width in (390, 1440):
        verify_new_guides(page, base, width, directory)
    else:
        page.goto(base + "/card/heroic-intervention/", wait_until="domcontentloaded")
        expect(page.get_by_role("table", name="Printing catalogue records")).to_be_visible()
        expect(page.locator(MIST)).to_have_count(4)
        PHASE10["no_overflow"](page, width)
    assert not errors, (width, errors)
    context.close()
    print(f"PASS {width}px", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8767")
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
            audit(browser, args.base_url, width, args.artwork, args.screenshots)


if __name__ == "__main__":
    main()
