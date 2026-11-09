# Ulamog feature and five printing guides — 9 November 2026

DEVELOPMENT was ten commits behind main with no unique commits; their site trees were identical. DEVELOPMENT was fast-forwarded, without force, from `785dd910dfb9f24fe2a82ec77a9a7577729e424b` to `d61e9a7278f54558184b834d7073539c2c412583` before this patch. main and DEVELOPMENT-2 were not edited.

## Featured printing

Ulamog, the Defiler uses **MH3 #383**, Vincent Proce's borderless concept illustration, **traditional foil**. [Wizards' MH3 collecting guide](https://magic.wizards.com/en/news/feature/collecting-modern-horizons-3) confirms concept nonfoil/traditional foil separately from serialized double-rainbow copies. The [exact catalogue record](https://mtg.wtf/card/mh3/383/Ulamog-the-Defiler) is the printing reference. The feature neither selects #383z nor represents Chase Stone's etched #476.

The existing perspective → idle float → pointer/touch shell structure remains authoritative. The card grows from the previous 290px desktop cap to 330px, with bounded mobile caps of 248–295px and a 72vw limit. Desktop tilt remains ±8° X / ±10° Y; touch remains ±2.5° / ±3°, with passive handlers and pan/pinch scrolling. Ground shadow and edge light reinforce depth. Curved silver/violet reflections stay on the transformed card plane and fade over the lower text. They illustrate foil; they do not reproduce a photographed physical surface.

A faint 16-second void atmosphere and occasional 19-second spatial ripple replace the green artwork map and Minas Morgul theme. No continuous JavaScript animation loop was added. Existing offscreen/tab/search pauses, cached-image recovery and reduced-motion support remain. Failed artwork leaves a named fallback and exact catalogue link. Live responses must match the exact set/number, UUID shape, name, artist, concept tag and foil availability; serialized records are rejected. Historical Minas Morgul archive data remains historical.

## Editorial and discovery

Five guides cover Skullclamp, Enlightened Tutor, Worldly Tutor, Swan Song and Living Death. `card-guide-research-eldrazi.json` records each physical shortlist, sources and qualifications. Rules explanations and collector recommendations are card-specific. Original rarity, original foil availability, later art, frame-only differences and Warhammer starred surge records are distinguished. Promo year-placeholder dates are not asserted as distribution days. No fixed prices are supplied.

The existing guide renderer, single static fallback surface, shared explorer, Cardmarket routing and header search are reused. Catalogue: **55 guides / 59 sitemap URLs**. Only the homepage, guide directory and five new guides receive 9 November sitemap dates; all older URL dates remain. Older guides receive the shared registry cache version; three receive contextual links. Deck Studio changes only its shared guide-count label from 50 to 55. All Deck Studio JavaScript/CSS and contact/legal pages are unchanged.

The homepage retains Organization, WebSite, WebPage and featured-card structured data while removing the obsolete SearchAction. Five promotional Try links now target permanent guides. Search forms and query processing remain functional.

## Verification limits

Run `python3 tests/run-deck-studio.py`; it includes all existing Deck Studio suites, updated COTW regressions, new guide/schema/search checks, sitemap provenance, CSS syntax, HTML/ARIA/internal links and JSON-LD checks. Focused guide validation also accepts the five new paths explicitly.

Native Chromium failed at launch in this environment; no pixel, native touch-scroll, compositing or physical-foil claim is made. Direct Scryfall API access was unavailable; accessible catalogue and official Wizards sources were researched through web tools. Owner review should check image delivery, mobile/desktop appearance, real touch scrolling and the live explorer. Existing 18 legacy guide-layout outliers remain outside this focused update; their links and metadata still validate.
