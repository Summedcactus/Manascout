# Deck Studio — editing, rules and statistics milestone

Stages A and B of 5B + 5C implement card searching, Quick Add, exact-printing entries, quantities, main/sideboard moves, deck naming, artwork/list views, construction checks and real statistics. Persistence is the next internal milestone. The existing premium palette, desktop rails, mobile navigation and native card drawer remain in place.

## Boundaries

- `deck-data.js`: validates Scryfall records and builds one display/rules record per printing. No prices or fabricated legality values.
- `deck-client.js`: paced sequential API requests (at least 130ms between starts), 12-second timeout, cancellation and bounded query caches. Search uses `unique=cards`; exact handoffs always use the supplied printing UUID. Autocomplete is optional and never replaces explicit search. No automatic network retries.
- `deck-model.js`: immutable deck operations. Card records are keyed by printing UUID; entries refer to an ID, finish, quantity and zone. Changing format never deletes cards.
- `deck-view.js`: DOM renderers using `textContent`, with stable search-result DOM during Quick Add.
- `deck-studio.js`: event/controller integration and 5A navigation/preview. Debounce is 180ms for autocomplete and 350ms for result search. New queries cancel obsolete requests and use generation tokens against late responses. Results are revealed in groups of 24; further Scryfall pages are requested only on demand.

URL handoff remains `/deck/?card=<name>&printing=<UUID>&finish=<finish>&guide=<optional-guide-path>`. The UUID is authoritative; a failed request never silently substitutes a named printing. Previewed cards are separate from deck entries. Card rules remain expandable, and changing printings inside the studio remains a disabled future feature.

## Focused verification

Run `node tests/deck-studio.test.cjs`, `node tests/deck-editing.test.cjs`, `node tests/deck-rules.test.cjs`, `python tests/validate-deck-studio.py`, and `node --check` on affected JavaScript. Tests use synthetic records and a limited DOM double, never production card content. They cover handoff, client failure/cancellation/cache, model operations, rules/statistics and controller editing/navigation. They cannot verify actual layout, native dialog focus containment or live API behaviour.

The current environment previously blocked Chromium launch and Scryfall socket access. Those operations are not repeatedly retried. Desktop/mobile visual, live search, image and native-dialog tests remain unverified.

## Construction checks

`deck-rules.js` takes a deck plus a verification context. Scryfall's format legality, colour identity and Oracle text are authoritative card inputs; rarity is never used to infer Pauper legality. Commander eligibility is queried with `oracleid:… is:commander`, not guessed from the displayed type. Both card records and eligibility proofs expire after 15 minutes. Restored object references cannot inherit a current-data check. Collection refreshes use batches of at most 75 IDs and invalidate requested records before checking, so missing/failed responses cannot leave a passing status behind.

Commander includes one or two commanders within exactly 100, checks combined colour identity (including basic-land-type requirements), singleton across all sections and printings, and Oracle unlimited/capped-copy exceptions. Supported pairs: Partner; Character select, Father & son, Friends forever and Survivors named Partner variants; reciprocal Partner with; Choose a Background plus a legendary Background; Doctor's companion plus exactly a legendary Time Lord Doctor. A Background cannot command alone. Unknown partner variants and pregame colour-choice commanders are explicitly unsupported. Additional companions, Commander Draft, brackets and custom Rule 0 combinations are outside the supported UI.

Pauper requires 60+ main cards, at most 15 sideboard cards and four copies across main/sideboard/printings, with the same recognised Oracle copy exceptions. A format change preserves incompatible entries and reports them. Unsupported physical editions, unavailable saved finishes, missing metadata and stale data all prevent a passing result. Cards are grouped by English name and shared Oracle identity, so alternate languages and Oracle-linked interchangeable names do not evade limits.

The dashboard uses quantities, excludes sideboards, includes commanders for Commander and excludes command-zone entries for Pauper. Mana curve/average exclude front-face lands; split cards use combined types and Scryfall's supplied mana value. Types and colour identities can count a card in several groups. Unknown mana values are explicitly excluded. There are no estimated-price claims.

Rules references: [Commander](https://magic.wizards.com/en/formats/commander), [Pauper](https://magic.wizards.com/en/formats/pauper), [current comprehensive rules mirror, sections 903 and 702.124](https://blogs.magicjudges.org/rules/comprehensive-rules/), [Doctor Who release notes](https://magic.wizards.com/en/news/feature/magic-the-gathering-doctor-who-release-notes), [Background rules update](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-6-1-22), [interchangeable-name rules](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-4-20-22).

Stage C will add versioned local drafts, autosave/recovery, multiple-deck management and JSON backups. Until then the page states that changes are not saved.
