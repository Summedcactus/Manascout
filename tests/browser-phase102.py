"""Serve this checkout, then run the archive and rendered mist checks in Chromium."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

WIDTHS = (320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920)
MIST = ".ms-edge-atmosphere"
LAYERS = MIST + " > span"


def no_overflow(page):
    widths = page.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
    assert widths[0] <= widths[1], (page.url, widths)


def atmosphere(page, width):
    mist = page.locator(MIST)
    expect(mist).to_have_count(1)
    expect(mist).to_have_attribute("aria-hidden", "true")
    expect(page.locator(LAYERS)).to_have_count(4)
    stack = mist.evaluate("""layer => {
        const styles = element => getComputedStyle(element);
        return {
            mist: +styles(layer).zIndex,
            main: +styles(document.querySelector('main')).zIndex,
            footer: +styles(document.querySelector('footer')).zIndex,
            header: +styles(document.querySelector('.site-header')).zIndex,
            position: styles(layer).position, hit: styles(layer).pointerEvents,
        };
    }""")
    assert 0 <= stack["mist"] < min(stack["main"], stack["footer"]) < stack["header"], stack
    assert stack["position"] == "fixed" and stack["hit"] == "none", stack
    layers = page.locator(LAYERS).evaluate_all("""layers => layers.map(layer => {
        const style = getComputedStyle(layer);
        return {opacity: +style.opacity, width: layer.offsetWidth, duration: style.animationDuration,
            active: layer.getAnimations().some(animation => animation.playState === 'running')};
    })""")
    if width <= 620:
        assert all(0 < layer["opacity"] < .08 and not layer["active"] for layer in layers), layers
    else:
        assert all(layer["opacity"] > 0 and layer["active"] for layer in layers), layers
        assert {layer["duration"] for layer in layers} == {"37s", "46s", "41s", "49s"}
        if width <= 1024:
            assert all(layer["width"] <= 125 and layer["opacity"] <= .18 for layer in layers)
        else:
            assert all(layer["width"] >= 250 and layer["opacity"] >= .20 for layer in layers)


def archive_filters(page, width):
    all_cards = page.locator(".hub-guide")
    visible = page.locator(".hub-guide:visible")
    total = all_cards.count()
    status = page.locator("#hub-status")
    row = page.get_by_role("group", name="Filter card guides")
    all_guides = row.get_by_role("button", name=f"All {total} Guides")
    original = row.get_by_role("button", name="Original Printings")
    premium = row.get_by_role("button", name="Premium Treatments")
    artwork = row.get_by_role("button", name="Artwork & History")
    search = page.get_by_role("searchbox", name="Search ManaScout card guides")

    expect(row.get_by_role("button")).to_have_count(4)
    expect(all_guides).to_have_attribute("aria-pressed", "true")
    expect(visible).to_have_count(total)
    expect(status).to_have_text(f"{total} guides")
    expect(page.locator("#hub-filter-results")).to_be_hidden()
    assert row.evaluate("""e => {
        const buttons = [...e.querySelectorAll('button')];
        return getComputedStyle(e).overflowX === 'auto' && buttons.every(button =>
            button.offsetHeight >= 44 && button.offsetTop === buttons[0].offsetTop);
    }""")
    if width <= 430:
        assert row.evaluate("e => e.scrollWidth > e.clientWidth")

    def verify_category(key, button, included, excluded):
        expected = page.locator(f'.hub-guide[data-guide-tags~="{key}"]').count()
        assert 0 < expected < total
        expect(button).to_have_attribute("aria-pressed", "true")
        expect(row.locator('button[aria-pressed="true"]')).to_have_count(1)
        expect(button.locator("[aria-hidden]")).to_have_css("visibility", "visible")
        expect(visible).to_have_count(expected)
        expect(status).to_have_text(f"{expected} guides")
        expect(page.get_by_role("link", name=f"View {expected} guides")).to_be_visible()
        expect(page.locator(f'.hub-guide[href="/card/{included}/"]')).to_be_visible()
        expect(page.locator(f'.hub-guide[href="/card/{excluded}/"]')).to_be_hidden()
        no_overflow(page)
        return expected

    all_guides.focus()
    page.keyboard.press("Tab")
    expect(original).to_be_focused()
    expect(original).to_have_css("outline-style", "solid")
    page.keyboard.press("Space")
    verify_category("original", original, "sol-ring", "deep-space-9")
    if width <= 430:
        premium.tap()
    else:
        premium.click()
    premium_count = verify_category("premium", premium, "heroic-intervention", "grim-monolith")
    search.fill("foil")
    filtered_count = visible.count()
    assert 0 < filtered_count < premium_count
    expect(status).to_have_text(f"{filtered_count} guides matching “foil”")
    expect(page.locator('.hub-guide:visible:not([data-guide-tags~="premium"])')).to_have_count(0)
    expect(page.locator('.hub-guide[href="/card/heroic-intervention/"]')).to_be_visible()
    expect(page.locator('.hub-guide[href="/card/grim-monolith/"]')).to_be_hidden()

    all_guides.click()
    expect(search).to_have_value("foil")
    expect(page.locator('.hub-guide[href="/card/grim-monolith/"]')).to_be_visible()
    expect(status).to_have_text(f"{visible.count()} guides matching “foil”")
    premium.click()
    search.fill("no exact card guide matches here")
    expect(visible).to_have_count(0)
    expect(page.locator(".hub-group:visible")).to_have_count(0)
    expect(page.locator(".hub-jumps")).to_be_hidden()
    expect(page.locator("#hub-empty")).to_be_visible()
    expect(status).to_have_text("0 guides matching “no exact card guide matches here”")

    page.get_by_role("button", name="Clear", exact=True).click()
    expect(search).to_be_focused()
    expect(search).to_have_value("")
    verify_category("premium", premium, "deep-space-9", "black-lotus")
    artwork.focus()
    page.keyboard.press("Enter")
    verify_category("artwork", artwork, "reanimate", "hit-it")
    if width <= 430:
        assert row.evaluate("e => e.scrollLeft > 0")
    all_guides.click()
    expect(all_guides).to_have_attribute("aria-pressed", "true")
    expect(visible).to_have_count(total)
    expect(status).to_have_text(f"{total} guides")
    assert page.url.endswith("/card/")
    if width <= 430:
        search.fill("x" * 320)
        no_overflow(page)
        page.get_by_role("button", name="Clear", exact=True).click()
    expect(page.get_by_role("link", name="ManaScout home")).to_be_visible()


def capture_desktop(page, directory):
    from PIL import Image, ImageChops

    at_start = directory / "archive-mist-start.png"
    later = directory / "archive-mist-7s.png"
    last = directory / "archive-mist-14s.png"
    without = directory / "archive-mist-hidden.png"
    page.screenshot(path=at_start)
    page.wait_for_timeout(7000)
    page.screenshot(path=later)
    page.wait_for_timeout(7000)
    page.screenshot(path=last)
    page.locator(MIST).evaluate("e => e.style.visibility = 'hidden'")
    page.screenshot(path=without)
    page.locator(MIST).evaluate("e => e.style.visibility = ''")

    first, second, third, clear = [Image.open(path).convert("RGB") for path in (at_start, later, last, without)]
    width, height = first.size
    # A single interval can straddle one layer's opacity peak. Compare both intervals.
    motion = ImageChops.lighter(ImageChops.difference(first, second), ImageChops.difference(second, third)).getchannel("R")
    haze = ImageChops.difference(second, clear).getchannel("R")
    counts = []
    for x in (0, width - 155):
        for y in (85, height - 188):
            box = (x, y, x + 155, y + 140)
            drifting = sum(motion.crop(box).histogram()[3:])
            present = sum(haze.crop(box).histogram()[5:])
            assert drifting >= 150 and present >= 360, (box, drifting, present)
            counts.append((drifting, present))
    centre = (width // 2 - 270, 75, width // 2 + 270, 800)
    # Toggling a composited layer can round antialiasing by a few colour levels.
    assert not sum(haze.crop(centre).histogram()[4:]), "The effect should stay out of the central content"
    print(f"Rendered corner changes across 7-second intervals and versus hidden mist: {counts}", flush=True)


def audit(browser, base, width, directory):
    mobile = width <= 430
    context = browser.new_context(viewport={"width": width, "height": 900}, is_mobile=mobile, has_touch=mobile)
    context.route("https://api.scryfall.com/**", lambda route: route.abort())
    context.route("https://cards.scryfall.io/**", lambda route: route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/card/")
    atmosphere(page, width)
    no_overflow(page)
    if directory:
        if width == 1920:
            capture_desktop(page, directory)
        else:
            page.screenshot(path=directory / f"archive-{width}.png")
    archive_filters(page, width)
    if width == 390:
        page.get_by_role("button", name="Premium Treatments").tap()
        feedback = page.locator("#hub-filter-results")
        expect(feedback).to_have_attribute("href", "#hub-directory")
        feedback.scroll_into_view_if_needed()
        if directory:
            page.screenshot(path=directory / "archive-mobile-category.png")
        feedback.tap()
        expect(page).to_have_url(base + "/card/#hub-directory")
        page.wait_for_function("""() => {
            const top = document.querySelector('#hub-directory').getBoundingClientRect().top;
            return top >= 60 && top <= 100;
        }""")
        page.locator("#hub-search").fill("foil")
        if directory:
            page.screenshot(path=directory / "archive-mobile-filtered.png")
    if width in (390, 1440):
        page.goto(base + "/card/?search=grim+monolith")
        expect(page.locator("#hub-search")).to_have_value("grim monolith")
        expect(page.locator("#hub-status")).to_have_text("1 guide matching “grim monolith”")
        page.locator('.hub-guide[href="/card/grim-monolith/"]').click()
        expect(page).to_have_url(base + "/card/grim-monolith/")
        atmosphere(page, width)
        no_overflow(page)
        page.goto(base + "/")
        atmosphere(page, width)
        no_overflow(page)
        page.goto(base + "/card/")
        page.emulate_media(reduced_motion="reduce")
        assert page.locator(LAYERS).evaluate_all("""layers => layers.every(layer =>
            +getComputedStyle(layer).opacity > 0 && layer.getAnimations().length === 0)""")
        if directory:
            page.screenshot(path=directory / f"archive-reduced-{width}.png")
        for route in ("privacy", "terms", "contact"):
            page.goto(base + f"/{route}/")
            expect(page.locator(MIST)).to_have_count(0)
    assert not errors, (width, errors)
    print(f"PASS {width}px", flush=True)
    context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8768")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--width", type=int, action="append")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, args=["--no-sandbox"])
        for width in args.width or WIDTHS:
            audit(browser, args.base_url, width, args.screenshots)


if __name__ == "__main__":
    main()
