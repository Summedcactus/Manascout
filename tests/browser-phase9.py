"""Chromium checks for Phase 9 using the saved catalogue record.

Serve the repository with python -m http.server 8765, then run this script.
Pass --artwork to use a locally saved, unmodified image from the catalogue.
"""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
CARD = json.loads((ROOT / "tests/fixtures/cosmic-spider-man.json").read_text())
WIDTHS = (320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920)
ART_BOX = """image => {
    const r = image.getBoundingClientRect(), s = getComputedStyle(image);
    return { width: r.width, height: r.height, left: r.left, right: r.right,
      fit: s.objectFit, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
}"""


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--artwork", type=Path)
    args = parser.parse_args()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium, args=["--no-sandbox"])
        for width in WIDTHS:
            context = await browser.new_context(
                viewport={"width": width, "height": 900}, is_mobile=width <= 430, has_touch=width <= 430
            )
            requests = []
            errors = []

            async def catalogue(route):
                url = urlsplit(route.request.url)
                q = parse_qs(url.query).get("q", [""])[0]
                requests.append((url.path, q))
                if url.path == "/sets":
                    await route.fulfill(json={"data": [{"code": "spm", "name": CARD["set_name"]}]})
                elif url.path == "/cards/autocomplete":
                    await route.fulfill(json={"data": [CARD["name"]]})
                elif url.path == "/cards/named":
                    await route.fulfill(status=404, json={"object": "error"})
                elif url.path == "/cards/search":
                    if 'a:"Zoltan Boros"' in q or CARD["oracle_id"] in q or 'cn="271"' in q:
                        await route.fulfill(json={"data": [CARD], "total_cards": 1, "has_more": False})
                    else:
                        await route.fulfill(status=404, json={"object": "error"})
                elif url.path in (f"/cards/{CARD['id']}", "/cards/spm/271", "/cards/spm/271/en"):
                    await route.fulfill(json=CARD)
                else:
                    await route.fulfill(status=404, json={"object": "error"})

            async def image(route):
                if args.artwork:
                    await route.fulfill(path=args.artwork, content_type="image/jpeg")
                else:
                    await route.fulfill(content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" fill="#342553"/></svg>')

            await context.route("https://api.scryfall.com/**", catalogue)
            await context.route("https://cards.scryfall.io/**", image)
            await context.route("https://api.frankfurter.dev/**", lambda r: r.abort())
            page = await context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto(args.base_url + "/")
            field = page.get_by_role("combobox", name="Search Magic: The Gathering cards and printings")
            assert await page.locator("#search-form input").count() == 1
            assert await page.locator(".ms-search-filters").count() == 0

            feature = page.locator("#card-of-the-week")
            build_url = await feature.get_by_role("link", name="Build a deck with Cosmic Spider-Man").get_attribute("href")
            weekly_image = feature.locator("#card-week-image")
            await weekly_image.scroll_into_view_if_needed()
            await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyArtReady === 'true'")
            weekly = await weekly_image.evaluate(ART_BOX)
            assert 0 <= weekly["left"] < weekly["right"] <= width + 1, (width, weekly)
            assert await feature.locator(".weekly-cosmic-filaments").evaluate("e => getComputedStyle(e).zIndex === '1'")
            assert await feature.locator(".weekly-card-face").evaluate("e => getComputedStyle(e).clipPath.startsWith('inset')")
            assert await weekly_image.evaluate("e => getComputedStyle(e).filter === 'none'")

            assert await feature.locator(".weekly-card-float").evaluate(
                "e => getComputedStyle(e).animationName === 'msCosmicDrift'"
            )
            stage = await feature.locator(".weekly-card-stage").bounding_box()
            x, y = stage["x"] + stage["width"] * .72, stage["y"] + stage["height"] * .25
            if width <= 430:
                touch = await context.new_cdp_session(page)
                await touch.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
                await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting === 'true'")
                assert await feature.evaluate("""e => e.dataset.weeklyInteracting === 'true'
                    && Math.abs(parseFloat(e.querySelector('.ms-physical').style.getPropertyValue('--rx'))) <= 6
                    && Math.abs(parseFloat(e.querySelector('.ms-physical').style.getPropertyValue('--ry'))) <= 7
                    && Math.abs(parseFloat(e.style.getPropertyValue('--weekly-parallax-x'))) <= 1.8""")
                await touch.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                assert await feature.locator(".ms-physical").evaluate("e => getComputedStyle(e).touchAction === 'pan-y pinch-zoom'")
            else:
                await page.mouse.move(x, y)
                await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting === 'true'")
                assert await feature.evaluate("""e => e.dataset.weeklyInteracting === 'true'
                    && Math.abs(parseFloat(e.querySelector('.ms-physical').style.getPropertyValue('--ry'))) <= 14
                    && parseFloat(e.style.getPropertyValue('--weekly-shadow-x')) !== 0
                    && parseFloat(e.querySelector('.ms-physical').style.getPropertyValue('--px')) !== 50
                    && Math.abs(parseFloat(e.style.getPropertyValue('--weekly-parallax-x'))) <= 5""")
                await page.mouse.move(0, 0)
            await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyInteracting === 'false'")
            await page.emulate_media(reduced_motion="reduce")
            assert await feature.locator(".weekly-card-float").evaluate(
                "e => getComputedStyle(e).animationName === 'none' && getComputedStyle(e).transform !== 'none'"
            )
            assert not await feature.locator(".weekly-cosmic-filaments").is_visible()
            assert await feature.locator(".ms-physical-reflection").evaluate(
                "e => getComputedStyle(e, '::before').animationName === 'none'"
            )
            await field.scroll_into_view_if_needed()
            await page.wait_for_function("document.querySelector('#card-of-the-week').dataset.weeklyEffectsPaused === 'true'")

            if width == 390:
                await field.fill("Zoltan Boros")
                await field.press("Enter")
                await page.get_by_role("heading", name="Exact printings").wait_for()
                assert any('a:"Zoltan Boros"' in q for _, q in requests)
                artist_match = page.locator("#ms-search-results .ms-print-name")
                assert "Extended art" in await page.locator("#ms-search-results table").inner_text()
                await artist_match.click()
            else:
                await field.fill("SPM 271")
                await page.get_by_role("option", name="SPM #271 — Cosmic Spider-Man · Extended art").wait_for()
                await field.press("ArrowDown")
                await field.press("Enter")
            selected = page.locator("#card-details .card-image")
            await selected.wait_for()
            await page.wait_for_function("document.querySelector('#card-details .card-image').naturalWidth > 0")
            box = await selected.evaluate(ART_BOX)
            assert 0 <= box["left"] < box["right"] <= width + 1, (width, box)
            assert abs(box["width"] / box["height"] - 488 / 680) < .015 and box["fit"] == "contain", (width, box)
            assert box["width"] >= (360 if width >= 1280 else 230), (width, box)
            assert await page.locator('meta[name="robots"]').get_attribute("content") == "noindex,follow"
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")

            await page.goto(args.base_url + build_url)
            await page.locator("#card-preview[open]").wait_for()
            printing_id = await page.locator("#preview-id").text_content()
            assert printing_id == CARD["id"], (printing_id, requests)
            assert await page.locator("#preview-finish-select option:checked").inner_text() == "Traditional Foil"
            assert await page.locator(".ds-deck-entry").count() == 0
            assert await page.locator('meta[name="robots"]').get_attribute("content") == "noindex,follow"
            assert await page.locator('link[rel="canonical"]').get_attribute("href") == "https://manascout.co.uk/deck/"
            await page.locator("#close-preview").click()
            artwork = page.locator("#inspiration-image")
            await artwork.wait_for()
            await page.wait_for_function("document.querySelector('#inspiration-image').naturalWidth > 0")
            studio = await artwork.evaluate(ART_BOX)
            assert 0 <= studio["left"] < studio["right"] <= width + 1, (width, studio)
            assert abs(studio["width"] / studio["height"] - 488 / 680) < .015 and studio["fit"] == "contain", (width, studio)
            assert studio["width"] >= (315 if width >= 1024 else 230), (width, studio)
            assert await page.locator("#inspiration-printing").inner_text() == "Marvel's Spider-Man · SPM #271 · English · Traditional Foil"
            await page.locator("#inspiration button").scroll_into_view_if_needed()
            assert await page.locator("#inspiration button").is_visible()
            if width <= 820:
                await page.locator('button[data-panel="discover"]').click()
                assert not await artwork.is_visible()
                await page.locator('button[data-panel="deck"]').click()
                assert await artwork.is_visible()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert not errors, errors
            print(f"PASS {width}px · homepage {box['width']:.0f}px · Deck Studio {studio['width']:.0f}px · COTW {weekly['width']:.0f}px", flush=True)
            await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
