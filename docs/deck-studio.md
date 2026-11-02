# Deck Studio — 5B + 5C

ManaScout's manual deck builder supports Commander and Pauper with exact-printing entries, compact previews, artwork/list views, construction warnings, statistics and browser-local drafts. Its palette and responsive workspace remain scoped to `.deck-studio`. Homepage search, guides, Card of the Week, foil previews and the shared printing explorer are unchanged.

## Modules and state

- `deck-data.js`: validates Scryfall records and produces display/rules metadata. Missing facts remain unknown. It never infers Pauper legality from rarity.
- `deck-client.js`: sequential requests at least 130ms apart, cancellation, a 12-second timeout and 16 bounded query-cache entries. Autocomplete is optional. Search uses `unique=cards`; result printings are identified explicitly. Queries debounce at 180ms/350ms for suggestions/results. Results are revealed in batches of 24 and further pages load on demand. There are no automatic network retries.
- `deck-model.js`: immutable operations on one central deck. Card records are keyed by exact Scryfall printing UUID. Entries refer to printing ID, finish, quantity and main/sideboard/commander zone. A selected preview refers to the same record without becoming a deck entry. Removing an entry never silently removes other printings or an independent preview selection.
- `deck-rules.js`: pure construction checks and quantity-weighted statistics, with an explicit current-data context.
- `deck-view.js`: small DOM renderers using `textContent`. Quick Add leaves the existing search-result DOM and scroll position intact.
- `deck-store.js`: versioned storage, guarded save/delete operations, immutable snapshots, checkpoints and JSON validation.
- `deck-studio.js`: navigation, search, editing, native drawer/bottom sheet, validation and draft-management events. Asset URLs carry the `5bc1` cache tag so deployment does not mix cached 5A code with the new modules.

The handoff remains `/deck/?card=<name>&printing=<UUID>&finish=<finish>&guide=<optional-guide-path>`. The UUID is authoritative. A failed exact request never substitutes a named printing. Incoming handoffs take precedence over the saved preview, without clearing the saved deck or automatically adding a card. Successful handoff parameters are consumed so future refreshes restore the latest saved selection.

## Supported construction checks

Commander requires exactly 100 cards including one commander or a supported pair. It checks combined colour identity, basic-land-type inclusion, singleton across all sections/printings, and Oracle unlimited/capped-copy exceptions. The commander action checks eligibility through Scryfall's `oracleid:… is:commander` query rather than guessing from the displayed type. An ineligible starting card can be added to the main deck instead.

Supported pairings are Partner; the Character select, Father & son, Friends forever and Survivors named Partner variants; reciprocal Partner with; Choose a Background with a legendary Background; and Doctor's companion with exactly a legendary Time Lord Doctor. A Background cannot command alone. Unknown partner variants and pregame colour-choice commanders are explicitly unsupported. Additional companions, Commander Draft, brackets and custom Rule 0 configurations are not implemented.

Pauper requires at least 60 main-deck cards, at most 15 sideboard cards, and at most four copies across main/sideboard/printings unless an actual basic-land or Oracle copy exception applies. It uses current `legalities.pauper`, not the selected edition's printed rarity. The format has no main-deck maximum; the application has a 2,000-entry/10,000-copies-per-entry workspace limit.

Colour identity is Scryfall's all-face identity. Copy grouping combines English names and shared Oracle identities. Unsupported physical editions, unavailable saved finishes, missing metadata, unverified commander eligibility and stale records prevent a passing result. Format changes preserve incompatible entries and report them. Illegal cards are never silently deleted.

Only a deck that passes every implemented check is labelled `Construction checks passed`. Card records and eligibility proofs expire after 15 minutes. Runtime verification uses object identity/generation stamps; loading/importing cached card data cannot carry forward a passing check. Refreshes use Scryfall collection batches of at most 75 IDs. Missing or failed responses invalidate requested records without deleting them. Restored drafts are automatically checked once; failed checks stay unverified until an explicit retry.

Statistics use quantities, exclude sideboards, include commanders for Commander and exclude command-zone entries for Pauper. Mana curve and average exclude front-face lands and use Scryfall's supplied mana values; split cards use combined types. Unknown mana values are excluded with a notice. Type and colour-identity groups are nonexclusive. No card/deck prices or advanced analysis are claimed.

Sources: [Commander](https://magic.wizards.com/en/formats/commander), [Pauper](https://magic.wizards.com/en/formats/pauper), [comprehensive rules mirror, sections 903 and 702.124](https://blogs.magicjudges.org/rules/comprehensive-rules/), [Doctor Who release notes](https://magic.wizards.com/en/news/feature/magic-the-gathering-doctor-who-release-notes), [Background rules update](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-6-1-22), [interchangeable-name rules](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-4-20-22).

## Local saving and recovery

Storage uses the `manascout.deckstudio.v1.` namespace and a version-1 deck schema. Each deck has a unique ID independent of its name. Saving writes an immutable full snapshot before updating a small live pointer, guarded by the expected previous token. The previous snapshot is retained; ordinary saves prune older history while retaining at least the current, previous and recent versions. Failed/conflicting pointer writes leave recovery snapshots available.

Autosave runs after an 800ms editing pause. Save Deck flushes the current revision. Saving a copy, JSON restore and recovery restore always create new deck IDs. Renaming changes the current deck's name, not another deck with the same name. Save progress, unsaved edits and failures are explicit. Quota/security failures pause autosave; the in-memory deck and JSON download remain available.

Web Locks serialize writes where supported. Expected-token checks, immutable recovery snapshots and cross-tab storage events provide protection in the fallback path; a detected conflict pauses autosave and offers Save a copy or explicit Reload. Native confirmation is required before leaving unsaved work after a save failure, deleting a deck, reloading over unsaved changes or permanently erasing deleted-deck backups.

Page-exit/visibility checkpoints preserve pending edits before the debounce finishes. Checkpoints from an in-flight save's newer revision are retained and resumed; a competing tab's branch is kept as a separate recovery version. Damaged primary records can recover a previous snapshot into a new draft without overwriting the damaged bytes. Deleted drafts leave Saved decks but remain recoverable until explicitly erased. Reload ignores the unsaved journal and retains its snapshot for manual recovery.

JSON backups preserve IDs, finishes, quantities, commander assignments, selection, format, view and name. Import is schema-validated, uses a new deck identity and never trusts cached legality. Artwork/source/guide URLs are restricted. Backups support up to 20 MB; browser-local snapshots have a 5 MB application cap and also depend on the browser's lower available quota. Unknown storage/backup versions are rejected without changing originals.

These are browser-local drafts, not an account or cross-device backup. Clearing site data or using private browsing can remove them. Download JSON files for safekeeping.

## Focused validation and release limits

Run `python tests/run-deck-studio.py`. It executes the six dependency-free Node suites, checks affected/shared JavaScript syntax and runs structural HTML/CSS/link/JSON-LD/sitemap checks. Fixtures are explicitly synthetic and never shipped as card content. The DOM double exercises controller events but is not a browser.

The suite covers search/cancellation/cache, exact handoff, Quick Add, quantities, zones, views, commander eligibility/pairings, colour identity, copy exceptions, sizes, statistics, storage failures/conflicts, refresh recovery, rename/delete, backups and complete Commander/Pauper production-module journeys with mocked HTTP.

At the 5B + 5C checkpoint on 2 November 2026: 74 JavaScript cases passed, zero failed. Focused syntax, HTML structure, labels/ARIA references, local links/assets, JSON-LD, sitemap and scoped CSS-structure checks also passed. These results do not include an actual browser or live Scryfall service.

Chromium launch and direct Scryfall socket access were already blocked in the same environment (the Scryfall request returned `Operation not permitted`). They were not repeatedly retried. Actual desktop/mobile rendering, horizontal overflow, native focus containment/Escape, touch/datalist behaviour, browser download/file-picker behaviour, real cross-tab Web Locks and live Scryfall requests remain unverified. Static CSS checks do not certify visual quality.

For a controlled release, smoke-test 320px, 390px, 820px, 1024px and wide desktop; 200% zoom and reduced motion; keyboard/drawer focus return; homepage/Discover/guide handoff; real search and both format journeys; refresh/reopen; storage denial; and backup download/restore. No automatic generation, advanced printing customisation, owned-card tracking, combos, playtesting or sharing is implemented or advertised.
