# Phase 2: exact-printing comparisons

Implemented on DEVELOPMENT; release remains manual. Baseline 9f9b326242957013183f261368827514c38e8179. Main, backup, hosting, accounts and deck storage are untouched.

## Using it

Choose Compare beside a catalogue record or on the selected printing. Its current available finish is named on the button. To compare two finishes of one edition, select that edition, change its existing finish selector and press Compare again. Exact UUID plus finish identifies each selection; up to four physical versions of one supplied gameplay identity can coexist. Duplicate, incompatible or unverified selections leave the existing choices intact. A single selection can be saved as work in progress; choose two or more to compare.

The comparison appears after the first selection, between the selected card and catalogue. Readable cards show supplied metadata, actual finish, language, static image, source reference price/currency and exact inspect/source links. Illustration IDs support artwork distinctions; missing IDs remain unknown. Catalogue UUID differences alone never establish different artwork. Frame/treatment and finish are separate fields. Source price timestamps are unknown; session-loaded or refreshed records are distinguished from cached, unverified snapshots. GBP estimates reuse the explorer's conversion rates when available. No cheapest offer or delivered quotation is asserted.

Save/export controls use a disclosure. Saved comparisons/import remain accessible in a small disclosure with no empty comparison panel. Save creates a separate named entry, even when another entry has the same name. Open rechecks the exact UUID, gameplay identity, physical availability and finish using the existing API client, sequentially, without fallback to a different edition. Unavailable records stay in place with their snapshots labelled. Rename/delete affect only the saved entry. Clear/remove affect the current comparison. All deck operations remain separate.

## Storage and portable formats

Only localStorage key `manascout.comparisons.v1` is read or written. Its envelope is `{version:1,saved:[comparison,...]}` with at most 100 entries. Each comparison has `format:"manascout-comparison"`, `version:1`, a 1–100-character name and 1–4 items. Every item carries a lowercase printing UUID `id`, gameplay UUID `oracleId`, and `finish` (`nonfoil`, `foil`, `etched`). `card` is a bounded display snapshot of supplied identity, description, image URL, treatment and price fields. Runtime `live`/status fields are discarded and reconstructed as cached/unverified during validation. Snapshots never certify catalogue facts, price freshness or image verification.

JSON exports contain one such comparison, not a deck or the whole library. Imports are limited to 150,000 characters/bytes at the UI boundary, validate schema/version/count/UUIDs/finish enum/duplicates/common gameplay identity, and show a preview with explicit import/cancel. Import adds a saved entry and replaces the working view only after acceptance. Finish availability cannot be trusted from imported metadata and is rechecked live. Unresolved imports retain exact IDs/finishes and cached status. Unsupported or malformed input is rejected without replacing saved work.

CSV uses UTF-8 with BOM, CRLF records and quoted/escaped cells. It includes printing/gameplay UUIDs, finish, set/number, language, artist/frame/date, original EUR/USD reference fields, status, source, exact links and the reference-price qualification. Formula-leading text cells are prefixed with an apostrophe for spreadsheet safety. CSV is output only; JSON is the supported portable import. Copy links produces one exact utility URL per selection, preserving UUID and finish; clipboard denial leaves selectable text.

Storage exceptions, quota failure or damaged libraries preserve the working view and export. Damaged disk data is never automatically overwritten. A failed save retains its library in memory. A detected intervening write from another tab preserves disk data and asks users to export/reload; localStorage has no atomic cross-tab transactions, so simultaneous writes remain a limitation. Saved work belongs to this browser/origin and is not cloud backed up. Export important comparisons before clearing browser data.

## Files

- `assets/js/comparisons.js`: bounded pure comparison/storage/portable-format functions and progressively revealed accessible controller.
- `assets/js/app.js`: small actions and a bridge to existing accepted catalogue, exact-fetch, finish, image, treatment and reference-price/conversion helpers. No second catalogue or price client.
- `assets/css/comparisons.css`: scoped cards, mobile layout, static artwork, controls and focus styles using the existing palette.
- Homepage and all 59 guide HTML files: shared module/style loading and explorer cache refresh. Existing content, canonical URLs and fallbacks preserved.
- `tests/card-comparisons.test.cjs`: exact identity, finish, limits, incompatible selection, portable data, storage/deck isolation and unavailable-record regressions.
- `tests/browser-phase2.py`: reproducible native interaction/layout/failure checks with explicit synthetic catalogue fixtures; requires Playwright and Chromium. The separate Phase 1 browser suite covers live catalogue/search/guide/deck handoffs.
- `tests/run-deck-studio.py`: include comparison JavaScript syntax validation.
- README and roadmap: available scope and follow-up boundaries.

## Validation

Required runner: `python tests/run-deck-studio.py`. Result: 961 JavaScript cases passed, zero failed, plus syntax and all included structural/catalogue/site validators (66 production HTML pages).

Native Phase 2 suite: 28 checks passed, zero uncaught page errors. Coverage includes homepage and permanent guide selection, same-edition finishes, duplicates/four-limit, four-card 320px layout, keyboard removal/focus, save/download/reload/reopen, JSON preview/cancel/accept without overwrite, rename/delete, 320/390/1280px overflow, reduced-motion static comparison, unavailable exact records, failed artwork, restricted storage and deck-key preservation. Fixtures are explicitly synthetic test records, not claims about real printings.

Existing optional Phase 1 native suite: 71 checks passed against the local site with live catalogue access, including homepage keyboard search, guide handoff, history, language/finish selection, Deck Studio add/save/export and offline/no-JavaScript guide fallbacks. Live network access can be intermittent; the initial Phase 2 live-catalogue attempt could not obtain its second record, so its deterministic suite uses fixtures rather than assuming catalogue completeness.

Commands used in this managed environment:

```sh
python tests/browser-phase2.py --output /tmp/manascout-phase2
python tests/browser-phase1.py --base-url http://127.0.0.1:8765 --output /tmp/manascout-phase1 --chromium /usr/bin/chromium --no-sandbox --ignore-https-errors
```

Serve the repository root at port 8765 first. Phase 2's environment-specific runner currently uses installed `/usr/bin/chromium`, no-sandbox and known-proxy certificate tolerance; these are test settings only. Mobile/desktop comparison screenshots were inspected. `git diff --check` passed.

## Remaining limits

No account, synchronization, hosted comparison URL, public decks, payment/ad/analytics integrations, new merchants, price history or price alerts. Original source currencies are CSV references; conversion rates are session-only and not exported as persistent quotes. Artwork identity may be unavailable, particularly multi-face records. The comparison displays the supplied representative face rather than certifying physical foil appearance or every face. Imported descriptions can be inaccurate and remain unverified until the exact record is retrieved. Browser-local storage and export cannot guarantee permanent retention. Native tests sample Chromium, not every browser/device. No traffic, CTR or revenue gain is claimed by shipping this utility.
