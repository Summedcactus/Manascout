"""Verify title ownership and the static Search/explorer styles against a local checkout."""
import argparse
from pathlib import Path
import runpy

from playwright.sync_api import expect, sync_playwright

PHASE10 = runpy.run_path(str(Path(__file__).with_name("browser-phase10.py")))
SPOCK = PHASE10["SPOCK"]
WIDTHS = PHASE10["WIDTHS"]
STYLE_TARGETS = {
    "#ms-search-results": ["margin-block-start", "min-width"],
    ".ms-printing-table": ["width", "border-collapse"],
    ".ms-compact-card h2": ["font-size", "overflow-wrap"],
    ".ms-selected-actions": ["display", "gap", "align-items"],
    "#ms-selected-finish": ["background-color", "min-height", "padding"],
    ".ms-archive-options summary": ["cursor", "padding", "min-height"],
    ".ms-live-explorer": ["padding-bottom"],
}


def style_snapshot(page):
    return page.evaluate("""targets => Object.fromEntries(Object.entries(targets)
        .map(([selector, properties]) => {
            const element = document.querySelector(selector);
            return [selector, element && properties.map(property => getComputedStyle(element).getPropertyValue(property))];
        }))""", STYLE_TARGETS)


def screenshot(page, path, selector):
    if path:
        page.locator(selector).evaluate("e => window.scrollTo({top: scrollY + e.getBoundingClientRect().top - 76, behavior: 'instant'})")
        page.locator(selector).evaluate("""async e => {
            const viewportImages = [...e.querySelectorAll('img')].filter(image => {
                const rect = image.getBoundingClientRect();
                return rect.bottom > 0 && rect.top < innerHeight;
            });
            await Promise.allSettled(viewportImages.map(image => image.decode()));
        }""")
        page.screenshot(path=path)


def audit(browser, base, width, artwork, directory, label):
    ctx = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce",
                              is_mobile=width <= 430, has_touch=width <= 430)
    PHASE10["install"](ctx, artwork)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/")
    search = page.locator("#search-input")
    search.fill("Grant Griffin")
    search.press("Enter")
    table = page.get_by_role("table", name="Exact printing results")
    expect(table).to_be_visible()
    expect(page).to_have_title("MTG Card Search | ManaScout")
    row = table.get_by_role("button", name="Mr. Spock, Science Officer Star Trek · TRK #535", exact=True)
    row.focus()
    row.press("Enter")
    expect(page).to_have_title("Mr. Spock, Science Officer Printings, Foils & Art | ManaScout")
    expect(page.locator("#card-details .ms-physical").first).to_have_attribute("data-surface", "surgefoil")
    PHASE10["no_overflow"](page, width)
    home_styles = style_snapshot(page)
    screenshot(page, directory / f"home-{width}-{label}.png" if directory else None, "#card-details")

    page.goto(base + "/card/mr-spock-science-officer/")
    editorial_title = page.title()
    expect(page.locator("#card-details .ms-physical").first).to_be_visible()
    archive = page.get_by_role("table", name="Printing catalogue records")
    archive.get_by_role("button", name="Star Trek · TRK #535", exact=True).click()
    expect(page.locator("#card-details .ms-physical").first).to_have_attribute("data-surface", "surgefoil")
    expect(page).to_have_title(editorial_title)
    guide_styles = style_snapshot(page)
    screenshot(page, directory / f"guide-{width}-{label}.png" if directory else None, "#card-details")
    PHASE10["no_overflow"](page, width)
    assert not errors, (page.url, errors)
    ctx.close()
    return home_styles, guide_styles


def assert_visuals(directory, width):
    from PIL import Image, ImageChops
    for feature in ("home", "guide"):
        before = Image.open(directory / f"{feature}-{width}-baseline.png").convert("RGB")
        after = Image.open(directory / f"{feature}-{width}-current.png").convert("RGB")
        red = ImageChops.difference(before, after).getchannel("R")
        changed = sum(red.histogram()[12:])
        # At most 0.2% of the viewport may differ beyond antialiasing noise.
        assert changed <= before.width * before.height * .002, (feature, width, changed)
        print(f"{feature} {width}px baseline comparison: {changed} pixels differ by at least 12 colour levels", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8771")
    parser.add_argument("--baseline-url")
    parser.add_argument("--artwork", type=Path)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--width", type=int, action="append")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        for width in args.width or WIDTHS:
            current = audit(browser, args.base_url, width, args.artwork, args.screenshots, "current")
            if args.baseline_url:
                baseline = audit(browser, args.baseline_url, width, args.artwork, args.screenshots, "baseline")
                assert current == baseline, (width, current, baseline)
                if args.screenshots:
                    assert_visuals(args.screenshots, width)
            print(f"PASS {width}px", flush=True)


if __name__ == "__main__":
    main()
