# Deck Studio — manual editing milestone

Stage A of 5B + 5C implements card searching, Quick Add, exact-printing entries, quantities, main/sideboard moves, deck naming and artwork/list views. Rules/statistics and persistence are the next internal milestones. The existing premium palette, desktop rails, mobile navigation and native card drawer remain in place.

## Boundaries

- `deck-data.js`: validates Scryfall records and builds one display/rules record per printing. No prices or fabricated legality values.
- `deck-client.js`: paced sequential API requests (at least 130ms between starts), 12-second timeout, cancellation and bounded query caches. Search uses `unique=cards`; exact handoffs always use the supplied printing UUID. Autocomplete is optional and never replaces explicit search. No automatic network retries.
- `deck-model.js`: immutable deck operations. Card records are keyed by printing UUID; entries refer to an ID, finish, quantity and zone. Changing format never deletes cards.
- `deck-view.js`: DOM renderers using `textContent`, with stable search-result DOM during Quick Add.
- `deck-studio.js`: event/controller integration and 5A navigation/preview. Debounce is 180ms for autocomplete and 350ms for result search. New queries cancel obsolete requests and use generation tokens against late responses. Results are revealed in groups of 24; further Scryfall pages are requested only on demand.

URL handoff remains `/deck/?card=<name>&printing=<UUID>&finish=<finish>&guide=<optional-guide-path>`. The UUID is authoritative; a failed request never silently substitutes a named printing. Previewed cards are separate from deck entries. Card rules remain expandable, and changing printings inside the studio remains a disabled future feature.

## Focused verification

Run `node tests/deck-studio.test.cjs`, `node tests/deck-editing.test.cjs`, `python tests/validate-deck-studio.py`, and `node --check` on affected JavaScript. Tests use synthetic records and a limited DOM double, never production card content. They cover handoff, client failure/cancellation/cache, model operations and controller editing/navigation. They cannot verify actual layout, native dialog focus containment or live API behaviour.

The current environment previously blocked Chromium launch and Scryfall socket access. Those operations are not repeatedly retried. Desktop/mobile visual, live search, image and native-dialog tests remain unverified.

## Rules and storage milestones

Stage B will add current-data Commander/Pauper checks and real statistics. Stage C will add versioned local drafts, autosave/recovery, multiple-deck management and JSON backups. Until then the page states that changes are not saved and does not declare a deck legal.
