# Deck Studio — 5D

ManaScout's manual deck builder supports the Constructed profiles below with exact-printing entries, compact previews, artwork/list views, construction warnings, statistics and browser-local drafts. Its palette and responsive workspace remain scoped to `.deck-studio`. Homepage search, guides, Card of the Week, foil previews and the shared printing explorer are unchanged.

## Modules and state

- `deck-formats.js`: frozen, data-driven profiles for sizes, sideboards, copy limits, restricted status, platform and special zones. Commander remains the default, Standard is second, and remaining profiles are grouped by paper/Arena.
- `deck-data.js`: validates Scryfall records and produces display/rules metadata. Missing facts remain unknown. It never infers Pauper legality from rarity.
- `deck-client.js`: sequential requests at least 130ms apart, cancellation, a 12-second timeout and 16 bounded query-cache entries. Autocomplete is optional. Search uses `unique=cards` with an explicit `game:paper` or `game:arena` filter for the selected profile; result printings are identified explicitly. Queries debounce at 180ms/350ms for suggestions/results. Results are revealed in batches of 24 and further pages load on demand. There are no automatic network retries.
- `deck-model.js`: immutable operations on one central deck. Card records are keyed by exact Scryfall printing UUID. Entries refer to printing ID, finish, quantity and main/sideboard/commander/signature zone. A selected preview refers to the same record without becoming a deck entry. Removing an entry never silently removes other printings or an independent preview selection.
- `deck-rules.js`: pure construction checks and quantity-weighted statistics, with an explicit current-data context.
- `deck-view.js`: small DOM renderers using `textContent`. Quick Add leaves the existing search-result DOM and scroll position intact.
- `deck-store.js`: versioned storage, guarded save/delete operations, immutable snapshots, checkpoints and JSON validation.
- `deck-studio.js`: navigation, search, editing, native drawer/bottom sheet, validation and draft-management events. Asset URLs carry the `5d1` cache tag. Deck-name keystrokes update metadata/autosave without rebuilding deck artwork, list nodes or search results.

The handoff remains `/deck/?card=<name>&printing=<UUID>&finish=<finish>&guide=<optional-guide-path>`. The UUID is authoritative. A failed exact request never substitutes a named printing. Incoming handoffs take precedence over the saved preview, without clearing the saved deck or automatically adding a card. Successful handoff parameters are consumed so future refreshes restore the latest saved selection.

## Supported construction checks

These profiles implement and test construction, not gameplay simulation or guaranteed acceptance into every event. Legality/pools/bans use the current Scryfall field listed below; set lists and real banned cards are never hardcoded. Standard rotation therefore follows current card data. A selected printing must also list the profile's game in `games`; equivalent paper/Arena printings are never silently substituted. No collection ownership or Arena cosmetic/finish equivalence is claimed.

| Profile | Main + required special zones | Sideboard | Copies | Scryfall legality | Game |
| --- | --- | --- | --- | --- | --- |
| Commander | Exactly 100, including 1 leader or supported pair | 0 | 1 | commander | paper |
| Standard | At least 60 | 0–15 | 4 | standard | paper |
| Pioneer | At least 60 | 0–15 | 4 | pioneer | paper |
| Modern | At least 60 | 0–15 | 4 | modern | paper |
| Legacy | At least 60 | 0–15 | 4 | legacy | paper |
| Vintage | At least 60 | 0–15 | 4; restricted 1 | vintage | paper |
| Pauper | At least 60 | 0–15 | 4 | pauper | paper |
| Oathbreaker | Exactly 60, including Oathbreaker(s) and signature(s) | 0 | 1 | oathbreaker | paper |
| Standard — Arena (Traditional) | 60–250 | 0–15 | 4 | standard | arena |
| Pioneer — Arena (Traditional) | 60–250 | 0–15 | 4 | pioneer | arena |
| Alchemy (Traditional) | 60–250 | 0–15 | 4 | alchemy | arena |
| Historic (Traditional) | 60–250 | 0–15 | 4 | historic | arena |
| Timeless (Traditional) | 60–250 | 0–15 | 4; restricted 1 | timeless | arena |
| Standard Brawl | Exactly 60 including 1 commander | 0 | 1 | standardbrawl | arena |
| Brawl | Exactly 100 including 1 commander | 0 | 1 | brawl | arena |
| Gladiator | 100–250; no commander | 0 | 1 | gladiator | arena |

Fourteen formats are represented by sixteen profiles because Standard and Pioneer have explicit paper and Arena variants. Arena Traditional profiles cover best-of-three, not queue-specific best-of-one/event rules. Arena has a 250-card client cap; paper profiles have no upper bound unless the format specifies one. The app's existing workspace cap remains 2,000 entries and 10,000 copies per entry.

Basic lands and verified Oracle unlimited/capped-copy text override the normal singleton/four-copy cap. Grouping combines English names and shared Oracle identities across every printing, finish and section. Vintage/Timeless restricted status overrides even an Oracle copy exception: at most one across all sections. Pauper uses current legality, never a printing's rarity. Missing/unrecognised legality fields remain unknown and prevent a passing result.

Commander checks exactly 100 including assigned commanders, combined colour identity, basic-land-type inclusion, singleton and Oracle copy exceptions. Eligibility uses Scryfall's `oracleid:… is:commander` query, not a displayed-type guess. An ineligible starting card may still be added to the main deck. Supported pairings remain Partner; Character select, Father & son, Friends forever and Survivors named Partner variants; reciprocal Partner with; Choose a Background with a legendary Background; and Doctor's companion with exactly a legendary Time Lord Doctor. Unknown partner families and pregame colour choices are explicitly unsupported.

Brawl and Standard Brawl allow one legendary creature, legendary planeswalker, legendary Vehicle, or legendary Spacecraft with a printed power/toughness box, following current Comprehensive Rules 903.12c. They do not allow partner pairs. Spacecraft metadata absent from an older snapshot remains unknown until refreshed. A colourless Brawl commander permits basic lands of one chosen basic land type (903.12e). The engine infers the chosen type from the actual basic lands: mixed types fail; the exception does not admit off-colour nonbasic lands or spells. Normal colour-identity/basic-land-type rules apply otherwise.

Oathbreaker uses a front-face planeswalker, or two with matching supported Partner abilities. Each requires one instant/sorcery signature spell with an explicit owner printing ID and exactly one copy. The signature must fit its own Oathbreaker's identity, not just the pair's combined identity. All special-zone cards count within 60. Split instants/sorceries qualify; a creature's Adventure or a spell only on an MDFC back does not. Missing/duplicate owners, extra signatures, ineligible leaders and off-colour signatures fail. Moving/removing an owner preserves its signature and flags the now-incompatible assignment. Background/Doctor configurations are not Oathbreaker pairings.

Gladiator uses original versions, not rebalanced `A-` cards, plus current Gladiator legality. Historic/Alchemy/Timeless follow their respective current Scryfall statuses for digital/rebalanced versions; printed rarity or a different format's status never substitutes.

Only a deck passing every implemented check receives `Construction checks passed`. This is deliberately not a claim of event registration or a complete gameplay rules engine. Records/proofs expire after 15 minutes; runtime object/generation verification cannot survive importing cached data. Collection refreshes use batches of at most 75 exact IDs. Missing/failed responses invalidate requested records without removing cards. Restored drafts get one automatic refresh; failures stay unverified until explicit retry. Format switches preserve all entries, finishes, quantities, selection and assignments, displaying incompatibilities instead of deleting cards.

Statistics use quantities and actual records. Sideboards and special zones not applicable to the selected format are excluded; required commanders/Oathbreakers/signatures are included. Mana curves/averages exclude front-face lands, use supplied mana values, combine split-card types and explicitly exclude unknown values. Type/colour-identity groups are nonexclusive. No prices or advanced analysis are claimed.

### Uncertified formats and configurations

Draft, Sealed and Commander Draft need a separate card-pool workflow and are not offered as Constructed formats. Competitive Brawl, Explorer as a distinct current queue, Duel Commander, Pauper Commander, PreDH, Premodern, Penny Dreadful and Old School are not offered because their complete current pool/role/platform/variant rules were not verified and implemented. Pioneer Arena is a distinct supported profile, not a silent Explorer alias. Best-of-one/event variants, companions as outside-game assignments, pregame colour-choice commanders, brackets and custom Rule 0 rules are not certified. Attraction/Contraption/Dungeon/Conspiracy/sticker workflows are also outside this workspace; those cards cannot pass as ordinary entries. Meld front components may be included, but meld-result records cannot. Legacy meld metadata stays unverified until refreshed. These limits are visible in the Stats rules disclosure.

### Rule sources checked for 5D

- Official Wizards format pages: [Commander](https://magic.wizards.com/en/formats/commander), [Standard](https://magic.wizards.com/en/formats/standard), [Pioneer](https://magic.wizards.com/en/formats/pioneer), [Modern](https://magic.wizards.com/en/formats/modern), [Legacy](https://magic.wizards.com/en/formats/legacy), [Vintage](https://magic.wizards.com/en/formats/vintage), [Pauper](https://magic.wizards.com/en/formats/pauper), [Historic](https://magic.wizards.com/en/formats/historic), [Timeless](https://magic.wizards.com/en/formats/timeless), [Brawl](https://magic.wizards.com/en/formats/brawl), [Alchemy](https://magic.wizards.com/en/mtgarena/alchemy).
- [Comprehensive Rules mirror](https://blogs.magicjudges.org/rules/comprehensive-rules/), especially 903, 903.12c–e and 702.124. Current Brawl eligibility includes the Vehicle/Spacecraft additions; older format overview copy is less specific.
- [Official 60-card Standard Brawl queue explanation](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-jumpstart-historic-horizons-2021-07-29).
- [Oathbreaker rules](https://oathbreakermtg.org/rules/) sections 906.3–906.5, and its [banned list](https://oathbreakermtg.org/banned-list/). Runtime legality remains Scryfall's current Oathbreaker status, not a copied static ban list.
- [Official Gladiator introduction](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-community-spotlight-gladiator): 100+ singleton, original versions, no sideboard/commander; its historic ban list is not hardcoded.
- [MTG Arena Zone, Arena client limits](https://mtgazone.com/inner-workings-of-arena/), for the 250-card cap.
- Existing pairing references: [Doctor Who release notes](https://magic.wizards.com/en/news/feature/magic-the-gathering-doctor-who-release-notes), [Background update](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-6-1-22), [interchangeable-name rules](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-4-20-22).

## Local saving and recovery

Storage uses the `manascout.deckstudio.v1.` namespace and a version-1 deck schema. Each deck has a unique ID independent of its name. Saving writes an immutable full snapshot before updating a small live pointer, guarded by the expected previous token. The previous snapshot is retained; ordinary saves prune older history while retaining at least the current, previous and recent versions. Failed/conflicting pointer writes leave recovery snapshots available.

Autosave runs after an 800ms editing pause. Save Deck flushes the current revision. Saving a copy, JSON restore and recovery restore always create new deck IDs. Renaming changes the current deck's name, not another deck with the same name. Save progress, unsaved edits and failures are explicit. Quota/security failures pause autosave; the in-memory deck and JSON download remain available.

Web Locks serialize writes where supported. Expected-token checks, immutable recovery snapshots and cross-tab storage events provide protection in the fallback path; a detected conflict pauses autosave and offers Save a copy or explicit Reload. Native confirmation is required before leaving unsaved work after a save failure, deleting a deck, reloading over unsaved changes or permanently erasing deleted-deck backups.

Page-exit/visibility checkpoints preserve pending edits before the debounce finishes. Checkpoints from an in-flight save's newer revision are retained and resumed; a competing tab's branch is kept as a separate recovery version. Damaged primary records can recover a previous snapshot into a new draft without overwriting the damaged bytes. Deleted drafts leave Saved decks but remain recoverable until explicitly erased. Reload ignores the unsaved journal and retains its snapshot for manual recovery.

JSON backups preserve IDs, finishes, quantities, commander assignments, selection, format, view and name. Import is schema-validated, uses a new deck identity and never trusts cached legality. Artwork/source/guide URLs are restricted. Backups support up to 20 MB; browser-local snapshots have a 5 MB application cap and also depend on the browser's lower available quota. Unknown storage/backup versions are rejected without changing originals.

5D keeps the same version-1 schema and storage namespace: no destructive rewrite or key migration is needed. Existing entry keys remain byte-compatible. New format IDs/legalities and an optional signature-zone `assignedTo` reference are additive. Legacy legality keys retain their values; newly introduced keys default to unknown until a current refresh. A fixed fixture captured with the unmodified 5BC model/store covers both Commander and Pauper drafts, foil selection, quantities, assignments, JSON backups and four immutable recovery snapshots. Tests check the old snapshots remain byte-identical during reading and the first format-switch save. New-format data also round-trips through local save, JSON restore, checkpoints, recovery and quota failures.

These are browser-local drafts, not an account or cross-device backup. Clearing site data or using private browsing can remove them. Download JSON files for safekeeping.

## Focused validation and release limits

Run `python tests/run-deck-studio.py`. It executes all dependency-free `deck-*.test.cjs` Node suites, checks affected/shared JavaScript syntax and runs structural HTML/CSS/link/JSON-LD/sitemap checks. Fixtures are explicitly synthetic and never shipped as card content. The DOM double exercises controller events but is not a browser.

The suite covers search/cancellation/cache, exact handoff, Quick Add, quantities, zones, views, commander eligibility/pairings, colour identity, copy exceptions, sizes, statistics, storage failures/conflicts, refresh recovery, rename/delete, backups and complete Commander/Pauper production-module journeys with mocked HTTP.

The 5B + 5C baseline had 74 passing JavaScript cases. The first 5D milestone passed 116 cases. Final 5D regression: **152 JavaScript cases passed, zero failed**, across nine suites. The added cases cover all sixteen profiles, restricted cards, platform differences, Brawl/Oathbreaker special rules, special-card/meld entry rejection, original 5BC snapshots/backups, format-switch persistence, compact role assignment and deck-name DOM preservation. Focused syntax, HTML structure, labels/ARIA references, local links/assets, JSON-LD, sitemap and scoped CSS-structure checks also passed. These results do not include an actual browser or live Scryfall service.

Chromium launch and direct Scryfall socket access were already blocked in the same environment (the Scryfall request returned `Operation not permitted`). They were not repeatedly retried. Actual desktop/mobile rendering, horizontal overflow, native focus containment/Escape, touch/datalist behaviour, browser download/file-picker behaviour, real cross-tab Web Locks and live Scryfall requests remain unverified. Static CSS checks do not certify visual quality.

For a controlled release, smoke-test 320px, 390px, 820px, 1024px and wide desktop; 200% zoom and reduced motion; keyboard/drawer focus return; homepage/Discover/guide handoff; real search and both format journeys; refresh/reopen; storage denial; and backup download/restore. No automatic generation, advanced printing customisation, owned-card tracking, combos, playtesting or sharing is implemented or advertised.

GitHub Actions (`.github/workflows/deck-studio.yml`) runs the same runner on DEVELOPMENT pushes and pull requests targeting main, with read-only contents permission and a five-minute timeout. Creating this workflow does not create a PR or modify main.
