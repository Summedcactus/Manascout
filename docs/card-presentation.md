# Shared card presentation — 5E

The featured printing remains Minas Morgul / Cabal Coffers, LTC #390, Sean Vo, surge foil. Its static Scryfall image URL and exact-printing link are preserved. `scoutboard.js` rejects a mismatched set, number, name, artist or treatment response and retains the static fallback. This identity guard is tested with synthetic HTTP responses; the live API was not verified.

## Featured surface and atmosphere

All Minas Morgul atmospheric styles now live in `home.css`. The inline animation block and stacked older override blocks were removed. Exact set/collector-number/card-name selectors scope the feature to LTC #390; a future featured card does not inherit its surface treatment. Homepage editorial styling was retained when removing the inline style block.

The existing shell still uses perspective, rotateX/rotateY, shadows and pointer tilt. Several low-opacity curved reflection fields drift independently over 31/47-second cycles, with a restrained occasional highlight. Pointer position adjusts reflection opacity within 0.20–0.32 and moves the reflection surface by a few percent. No saturation/brightness filter changes the authentic artwork. Shadows, muted green mist, a subdued halo and occasional bats remain behind the card. Large blur layers and the extra competing spectre/shine overrides were removed. Artwork overlays are clipped inside the same transformed card shell and require a loaded image.

Decorative effects pause using IntersectionObserver, document visibility and homepage/search state. Reduced motion stops decorative animation and tilt. Tilt is event-driven, with no continuous JavaScript animation loop. On browsers without IntersectionObserver, document/search/reduced-motion pausing still works; offscreen detection is unavailable.

### Artwork-specific lighting fallback

**No window lights or sky mask were fabricated.** The exact source artwork could not be inspected. The Scryfall page returned 403 through web research, image URLs were inaccessible through that tool, and the shell artwork-download command was cancelled at its network permission prompt. A search result from a replica seller was not accepted as an authentic alignment reference. No permission retry or security-setting change was made.

The restrained fallback retains the original image, surrounding green mist and dark surface reflections. It does not place generic glowing dots, guessed windows or a broad artificial sky glow over the building. Exact sky/window masks remain outstanding and require inspection of the genuine LTC #390 image before implementation. This is a material limit to 5E visual completion.

## Selected-card flipping

`app.js` handles the homepage/search, printing explorer and permanent guides through the existing shared renderer. No guide files were edited. The floating flip control is restricted to a selected printing with a whitelisted `transform`, `modal_dfc`, `reversible_card` or `double_faced_token` layout and exactly two face-image records. Both must be HTTPS Scryfall front/back images whose filenames match that printing UUID. Ambiguous/unsupported image data gets no control. Split, Adventure, Kamigawa `flip`, meld, art-series and ordinary single-faced layouts do not qualify.

The original front is visible while the back loads. Both images must load and decode before the flip button enables. The two surfaces remain mounted, use backface visibility and rotate between 0 and 180 degrees; returning to the front reverses direction. Flipping changes only local surface state, not the selected card, printing UUID, finish, URL or search position. New selections abort obsolete image readiness work; stale controls cannot flip a different card. Missing images, decode failure and timeout preserve the front and report an unavailable flip. Native buttons provide keyboard/touch activation, accessible face labels, pressed state, focus visibility and a 44px touch target around a small icon. Reduced motion removes the rotation transition.

## Minimal finish controls

Large foil buttons and per-row thumbnail toggles are removed. An actively selected foil/etched printing offering nonfoil gets a small red-X control that explicitly selects its real nonfoil finish. Nonfoil-only and foil-only printings have no such control. A compact selected-printing finish dropdown contains only supplied finishes and can restore foil. Printing IDs remain unchanged; exact Deck Studio handoff links and copied URLs reflect the selected finish.

Only the selected printing's thumbnail animates; other table thumbnails have no animated shimmer or floating controls. The main shimmer waits for artwork and pauses offscreen/in hidden tabs. Shared shimmer and featured surface animations use transforms/opacity rather than animated filters. Finishes continue to come from Scryfall, never an inferred treatment. Deck Studio files, quantity/add controls and its internal face navigation are unchanged.

## Verification and release limits

Run `python tests/run-deck-studio.py`. The existing CI workflow runs this same command, now including `card-*.test.cjs` as well as the original Deck Studio suites. The new cases execute production helpers and delegated events using synthetic records and a limited DOM double. They cover layout gating, exact face pairing, front/back return, load/decode errors, stale selections, printing/finish preservation, red-X/dropdown behavior, image readiness, decorative visibility, tilt, runtime motion preferences and exact featured-printing fallback.

The focused Python validator checks homepage/shared-preview CSS structure, duplicate keyframes, the exact featured image/link, preserved perspective, touch/focus/reduced-motion structure and absence of guessed sky/window masks. The existing HTML/link/metadata and Deck Studio regression checks also run. Final local result: **185 JavaScript cases passed, zero failed** (the original 152 regressions plus 33 new cases); syntax and focused structural checks passed. These static/DOM checks do not certify rendering.

Actual browser rendering, native 3D compositing, Android frame rate, pixel alignment, visual intensity, mobile overlap and real Scryfall/image loading remain unverified. Known browser/socket restrictions were not retried. Before visual release approval, inspect the genuine artwork, implement and visually verify the requested sky/window masks, then smoke-test 320/390/820px and desktop, keyboard/touch flip/return, rapid selection changes, foil/nonfoil changes, slow/failed images, reduced motion, offscreen pause and homepage/guide/Deck Studio integration.
