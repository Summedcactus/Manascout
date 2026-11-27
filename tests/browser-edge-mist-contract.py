"""Measure short-window edge mist displacement and rendered contrast in Chromium."""

import argparse
from math import hypot
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageChops
from playwright.sync_api import expect, sync_playwright

MIST = ".ms-edge-atmosphere"
LAYERS = MIST + " > span"
WIDTHS = (390, 768, 1440, 1920)
STYLES = """selector => ({
    time: performance.now(),
    layers: [...document.querySelectorAll(selector)].map(layer => {
        const style = getComputedStyle(layer), rect = layer.getBoundingClientRect();
        return {
            cx: (rect.left + rect.right) / 2, cy: (rect.top + rect.bottom) / 2,
            width: layer.offsetWidth, opacity: +style.opacity,
            duration: style.animationDuration, phase: style.animationDelay,
            running: layer.getAnimations().some(anim => anim.playState === 'running')
        };
    })
})"""


def largest_channel(first, second):
    red, green, blue = ImageChops.difference(first, second).split()
    return ImageChops.lighter(ImageChops.lighter(red, green), blue)


def edge_regions(width, height, gutter):
    for left in (0, width - gutter):
        for top in (90, height - 205):
            yield left, top, left + gutter, top + 170


def delta_percent(first, second, gutter, minimum):
    delta = largest_channel(first, second)
    return [
        round(100 * sum(delta.crop(box).histogram()[minimum:]) / (170 * gutter), 1)
        for box in edge_regions(*delta.size, gutter)
    ]


def frame(page, directory, label):
    sample = page.evaluate(STYLES, LAYERS)
    page.screenshot(path=directory / f"{label}.png")
    return sample, Image.open(directory / f"{label}.png").convert("RGB")


def layout(page):
    return page.evaluate("""() => {
        const positions = ['main', 'footer', '.site-header'].map(selector => {
            const {x, y, width, height} = document.querySelector(selector).getBoundingClientRect();
            return [x, y, width, height];
        });
        return {positions, viewport: innerWidth, page: document.documentElement.scrollWidth};
    }""")


def audit(browser, base, directory, width, baseline=False):
    directory.mkdir(parents=True, exist_ok=True)
    mobile = width <= 430
    with browser.new_context(viewport={"width": width, "height": 900}, device_scale_factor=1,
                             is_mobile=mobile, has_touch=mobile,
                             reduced_motion="no-preference") as context:
        # The archive provides static content. Block third-party image loads so
        # they cannot account for motion in the viewport screenshots.
        context.route("**/*", lambda route: route.continue_()
                      if urlsplit(route.request.url).netloc == urlsplit(base).netloc else route.abort())
        page = context.new_page()
        page.goto(base + "/card/")
        expect(page.locator(MIST)).to_have_attribute("aria-hidden", "true")
        expect(page.locator(LAYERS)).to_have_count(4)
        page.evaluate("document.fonts.ready")
        geometry = layout(page)
        assert geometry["page"] <= geometry["viewport"], geometry
        gutter = 24 if mobile else max(20, min(145, int(geometry["positions"][0][0])))

        a, first = frame(page, directory, f"{width}-a")
        page.wait_for_timeout(2750)
        b, second = frame(page, directory, f"{width}-b")
        duration = round((b["time"] - a["time"]) / 1000, 2)
        assert 2.7 <= duration <= 3.6, duration
        travel = [round(hypot(y["cx"] - x["cx"], y["cy"] - x["cy"]), 1)
                  for x, y in zip(a["layers"], b["layers"])]
        contrast = delta_percent(first, second, gutter, minimum=5)
        active = sum(layer["running"] for layer in b["layers"])
        print(f"{'BASELINE' if baseline else 'OBSERVED'} {width}px, {duration}s, {active} layers active, "
              f"centre travel {travel}px, pixels changing by at least 5 levels {contrast}% "
              f"(left top/bottom, right top/bottom in {gutter}px gutters)", flush=True)
        if baseline:
            return

        for sample in (a, b):
            layers = sample["layers"]
            assert all(layer["running"] for layer in layers), sample
            assert len({layer["duration"] for layer in layers}) == 4, sample
            assert len({layer["phase"] for layer in layers}) == 4, sample
            limit = .26 if mobile else .37 if width <= 1024 else .55
            assert all(0 < layer["opacity"] <= limit for layer in layers), sample
            if width <= 1024:
                assert all(layer["width"] < width / 4 for layer in layers), sample
        assert layout(page) == geometry, "Mist animation must not move content"
        stack = page.locator(MIST).evaluate("""mist => {
            const styles = getComputedStyle(mist);
            const z = selector => +getComputedStyle(document.querySelector(selector)).zIndex;
            return {safe: styles.pointerEvents === 'none' && +styles.zIndex < z('main') &&
                +styles.zIndex < z('.site-header') && styles.position === 'fixed'};
        }""")
        assert stack["safe"], stack
        minimum_travel = 7 if mobile else 10 if width <= 1024 else 12
        minimum_layers = 2 if mobile else 3
        assert sum(distance >= minimum_travel for distance in travel) >= minimum_layers, travel
        minimum_regions = 3 if width >= 1440 else 2
        assert sum(region >= 6 for region in contrast) >= minimum_regions, contrast

        page.emulate_media(reduced_motion="reduce")
        still, reduced = frame(page, directory, f"{width}-reduced")
        page.wait_for_timeout(350)
        frozen = page.evaluate(STYLES, LAYERS)["layers"]
        assert all(not layer["running"] and layer["opacity"] > 0 for layer in frozen), frozen
        assert frozen == still["layers"], frozen
        assert layout(page) == geometry, "Reduced mist must preserve the same content geometry"
        page.locator(MIST).evaluate("mist => mist.style.visibility = 'hidden'")
        _, clear = frame(page, directory, f"{width}-without-mist")
        haze = delta_percent(reduced, clear, gutter, minimum=4)
        assert sum(region >= 4 for region in haze) >= 2, haze
        centre = (width // 2 - width // 5, 90, width // 2 + width // 5, 860)
        assert not sum(largest_channel(reduced, clear).crop(centre).histogram()[5:]), "Mist reached the centre"
        print(f"PASS {width}px short-window travel, static reduced-motion paint, stacking and layout", flush=True)

        if width == 390:
            for route in ("privacy", "terms", "about", "contact", "deck"):
                page.goto(base + f"/{route}/")
                expect(page.locator(MIST)).to_have_count(0)
            print("PASS atmosphere scope on non-mist routes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8782")
    parser.add_argument("--baseline-url")
    parser.add_argument("--screenshots", type=Path, required=True)
    parser.add_argument("--width", type=int, action="append")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        widths = args.width or WIDTHS
        if args.baseline_url:
            for width in widths:
                audit(browser, args.baseline_url, args.screenshots / "baseline", width, baseline=True)
        for width in widths:
            audit(browser, args.base_url, args.screenshots / "updated", width)
        browser.close()


if __name__ == "__main__":
    main()
