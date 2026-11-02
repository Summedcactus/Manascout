# Deck Studio — 5A checkpoint

The studio is a workspace preview with exact-printing inspection. No selected card is a deck entry. Search inside the studio, deck construction, legality, prices, statistics, saving and sharing are intentionally unavailable.

## Files and boundaries

- `deck/index.html`: permanent page, empty workspace, disabled future controls and native preview dialog.
- `assets/css/deck-studio.css`: all page styles and palette variables scoped to `.deck-studio`; desktop three-column layout and a single active mobile panel at 820px and below.
- `assets/js/deck-data.js`: URL parsing, one Scryfall request, validation and a compact display model. No HTML rendering, deck model or storage. It also exports to CommonJS for dependency-free Node tests.
- `assets/js/deck-studio.js`: panel navigation, per-panel scroll position, desktop collapse state, preview rendering, two-sided artwork and explicit error/retry handling. Values from the API are assigned through `textContent`; image and source URLs are restricted to Scryfall hosts.
- `assets/js/app.js`: the shared `renderCard` calls `deckLink`. The existing search, printing selection, guide rendering and foil code stay in place.

## Handoff contract

`/deck/?card=<encoded-name>&printing=<Scryfall-UUID>&finish=<nonfoil|foil|etched>&guide=<optional-local-guide-path>`

`printing` is authoritative. The name is descriptive, never a fallback search. Missing or invalid printing IDs show an actionable error without an API call. A valid ID makes one GET to `https://api.scryfall.com/cards/{id}` with a 12-second timeout. Response IDs must match. There is no automatic retry, pagination or search. Retries require a user action. If a requested finish is absent from the record, an available finish is labelled with an explanatory notice. This does not change the printing ID.

Guide links are supplied only for names in the shared explorer's guide registry and displayed only when the path matches the returned card's slug. Scryfall supplies identifying information and artwork at runtime; production has no hardcoded card or price records. Format and commander eligibility are not inferred from the type line.

## Accessibility and navigation

Mobile Deck / Discover / Stats buttons preserve the same panel DOM, entered deck name, loaded printing and panel scroll offsets. Arrow keys, Home and End also switch sections. Desktop side panels collapse to narrow rails. Native `dialog.showModal()` provides modality, focus containment and Escape; close/back/backdrop actions return focus to the visible trigger or active panel heading. Browsers without native modal support retain the workspace identification and get an explicit limitation message. No drag gesture is needed to close the bottom sheet. Reduced motion disables transitions and drawer animation.

The deck name is a temporary field only. Nothing is persisted or exported. The studio states this near the field and in the insights panel.

## Validation

Run `node --test tests/deck-studio.test.cjs`, `python tests/validate-deck-studio.py` and `node --check` for affected scripts. Tests use explicitly synthetic records and a DOM test double; they require no dependencies or network and never provide production content. They verify the data boundary, shared-renderer handoff, controller state, rendering and error handling. They do not replace browser accessibility, layout, focus-trap or live Scryfall tests.

Before release, manually check `/deck/` at 320px, 390px, 820px, 1024px and wide desktop widths, keyboard-only navigation, native dialog Escape/focus return, 200% zoom and reduced motion. Exercise Build a Deck from homepage search, Discover and a permanent guide; change the printing/finish before following the link. Check both sides of a double-faced card and offline/404/image errors. Environment restrictions can prevent these checks; report them as unverified.

## Next authorised phase

5B can introduce a separate in-memory deck model, Scryfall searching, Quick Add, quantity/removal operations and functional artwork/list views. It should distinguish a preview selection from an added entry. Search will need cancellation/debounce and Scryfall-friendly pacing. Keep those operations separate from the preview controller.

5C can add format rules, legality validation, real statistics and mana curves, then versioned local saving/autosave/recovery. No 5B or 5C system is implemented in this checkpoint.
