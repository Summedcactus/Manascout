# Phase 3: deck interoperability and portable comparisons

Implemented on DEVELOPMENT, 13 November 2026. Publication, main and backup-branch updates remain manual. Baseline: `636511f3c4b0418f8c8f1afb9694ae7744adb815`. At task start, main was `2ce00e5450a1a41c369ce0789fa7a550a9f3612d`; its file tree matched DEVELOPMENT exactly. The additional main commits were merges, so no merge, rebase or reset was needed.

## Import workflow and protection

Deck Studio now has Import and Export actions beside the draft controls. Import accepts a pasted list or a local UTF-8 TXT/CSV file. Preview resolves records through the existing paced, cancellable catalogue client and shows each requested identity, status, returned UUID/language, quantities, commander section and CSV mapping. Parsing/preview do not edit the current deck, commander, selection or local draft.

Acceptance always opens a **new draft with a new identity**, in the currently selected format. It never merges with or overwrites the existing deck. Existing saved drafts remain in the library. Unsaved edits use the existing save/recovery guard before switching; if saving fails, the existing confirmation offers keeping the current deck, downloading its JSON backup or explicitly leaving it. Cancelling the import/lookup or closing with Escape retains the working deck. An intervening workspace change invalidates the preview. Closing during acceptance also cancels the switch if it has not yet happened.

Ambiguous, invalid, unresolved or unavailable-finish rows block acceptance of the whole source. Successful rows remain visible in that preview; failed rows and their original requests stay in the input. Correct/remove the offending lines and preview again. There is deliberately no automatic “import matches and silently discard the rest” behavior. The textarea is retained when the dialog closes in the same tab; unfinished source text is not a saved draft or a cross-reload backup.

Parsing does not certify legality. Quantities, explicit commander assignments, sideboard and maybeboard entries are preserved even when Commander/copy/format rules are violated. Existing construction checks explain those violations; no commander is inferred from a legendary type. Maybeboard is an outside-deck section, excluded from construction counts, copy limits, curve and type/colour statistics.

## Supported text syntax

```text
Commander
1 Krenko, Mob Boss
Deck
1 Sol Ring
1x Lightning Bolt
1 Sol Ring (CMM) 396
1 Sol Ring [CMM] 396 [foil]
1 Sol Ring (CMM) 396 *F*
1 Sol Ring (CMM) 396 | foil
Sideboard
1 Sol Ring (CMM) 396 [nonfoil]
Maybeboard
1 Sol Ring (CMM) 396 [foil] [lang:de]
```

- A positive integer quantity, optional `x`, then the full canonical Scryfall card name. `1xSol Ring` is also accepted. Case, straight/curly apostrophes, Unicode and spacing around double-face `//` are normalized for identity comparison. No fuzzy-name fallback.
- Optional `(SET) number` or `[SET] number`; set codes are case-insensitive. Collector numbers support letters/numbers and common catalogue suffixes; undocumented exotic formats are rejected rather than guessed.
- Optional finish follows the name or printing: `[nonfoil]`, `[foil]`, `[etched]`, `*F*`, `*E*`, or `| nonfoil/foil/etched`. Finish tokens are case-insensitive. No generic premium finish.
- A final `[lang:de]` (or another 2–8-letter code) verifies a language on an exact set/number or UUID. Language verification without exact printing information is rejected explicitly.
- Headings: Commander/Commanders, Deck/Mainboard/Main deck, Sideboard, Maybeboard; optional trailing colon. Default section is main. `SB:` is also supported on a card line.
- Explicit commander suffixes `[Commander]` and `!Commander` are supported at the very end of a line, after other annotations. Multiple supplied commanders are retained for existing pairing validation.
- Blank lines and whole-line `#`, `//` or `;` comments are ignored. Repeated card rows remain visible in preview and combine quantities only when workspace identity, finish and section coincide.
- Signature-spell owner assignments require JSON recovery. Text recognizes the Signature spells heading and blocks its rows instead of silently assigning them to main or commander.

Inline comments, arbitrary tags, every third-party export dialect and fuzzy abbreviations are not supported. An empty or malformed list is not an instruction to clear a deck.

## CSV format and bounds

CSV is comma-delimited UTF-8 with an optional BOM. Quoted commas, double quotes and embedded CR/LF are parsed properly. Headers are case-insensitive and trimmed. Unknown headers and duplicate mappings are rejected; no arbitrary mapping is guessed.

| Meaning | Accepted headers |
| --- | --- |
| Quantity (required) | Quantity, Qty, Count |
| Full card name (required) | Name, Card Name, Card |
| Set | Set, Set Code |
| Collector number | Collector Number, collector_number, Number, CN |
| Finish | Finish |
| Language of exact record | Language, Lang |
| Exact printing UUID | Printing UUID, printing_uuid, Printing ID, Scryfall ID |
| Gameplay UUID to check | Oracle/gameplay UUID, Oracle UUID, oracle_id |
| Commander flag | Commander, Commander Flag |
| Section | Section, Zone |
| Informational export status | Status, Verification State |

Set and collector number must appear together in a row. UUIDs are optional, validated and normalized to lowercase. Any supplied UUID, Oracle ID, set/number and language must agree with the returned record. Commander accepts true/false, yes/no or 1/0. Section accepts the documented text-section names and main. Status is informational and never restores verification trust. Notes and custom columns are not currently supported; remove them deliberately rather than relying on silent omission. The preview lists the actual header-to-field mapping.

Limits: 250,000 UTF-8 bytes, 1,000 card rows, 10,000 total copies, at most 10,000 per row/entry, 200-character card names. Text also limits physical input lines to 1,200, including blank/comment/heading lines. CSV stops at its record limit and rejects malformed quotes, mismatched column counts, binary/control characters and invalid UTF-8 uploads. Parsing and display never execute formulas or HTML. CSV export quotes every cell and prefixes formula-leading text with an apostrophe; the importer reverses that text-protection prefix before applying the documented field validators; it never evaluates cell contents.

## Exact-printing and finish integrity

A generic name is matched by exact-name query through the existing Deck Studio client, using the current format's platform but **without a legality filter**. An illegal supplied card remains importable for construction checks. Multiple results/pagination are ambiguous; there is no cheapest/newest/fuzzy fallback. The accepted catalogue record is a representative display/gameplay record, not a claim that its edition or finish was supplied.

A set/number request uses the exact catalogue endpoint, with language when supplied; a UUID request retrieves that exact UUID. The resolver checks the returned name and all supplied identities. If a language was omitted, the API's returned language is shown in preview rather than presented as a user-specified language. Missing records, contradictory identities and unavailable finishes remain unresolved. Exact failures never trigger a generic search. Missing finish stays unspecified even when the workspace uses an available finish to display the record.

Optional per-entry `identityChoices` tracks quantity counts for `unspecified`, `finishOnly`, `printingOnly`, and `exact`, with its own `version:1`. Mixed quantities can share a workspace entry without losing which copies were pinned. Portable output splits those quantities appropriately. Quantity changes and section moves preserve the counts; an explicit printing/finish selection intentionally pins them. Generator seed copying preserves this metadata; generator strategy, options and classification are unchanged.

## Export and JSON compatibility

- Copy decklist and Download TXT produce sectioned quantity/name lists. Recorded exact identities include `(SET) number`; otherwise those fields are omitted. The optional detailed text switch adds known finish annotations. Non-English exact records include `[lang:code]` to avoid losing language on text round trips.
- Download CSV includes Quantity, Card Name, Set, Collector Number, Finish, Language, Printing UUID, Oracle/gameplay UUID, Commander, Section and Status. Unspecified fields remain empty. UTF-8 BOM, CRLF records, correct quoting and spreadsheet-text protection are included. Names/quantities/identity/finish/sections can be imported again. CSV/TXT do not preserve signature-spell owner assignments; use JSON for that workflow.
- Download JSON and the existing JSON backup/restore controls remain available. Clipboard failure exposes/selects the generated text for manual copying; downloads do not require clipboard permission.

Existing deck schema/version-1 backups remain readable with no bulk rewrite or destructive migration. Ordinary legacy decks remain schema 1. Adding imported identity provenance or Maybeboard upgrades that deck to **schema 2** through the model; its JSON backup envelope is version 2. Both backup versions are accepted by the current reader. Local draft/recovery snapshot and pointer envelopes remain version 1 with a versioned deck inside. Older application versions reject schema-2 decks rather than silently losing the new provenance. Do not expect a Phase 3 backup containing these extensions to load into an older deployment. Prior immutable recovery versions retain their existing behavior.

The previous unknown-future-version regression now rejects version/schema **3**, since 2 is explicitly supported; its malformed-entry, unsafe-URL and oversized-backup checks are retained. New regressions exercise 1/2 compatibility and reject inconsistent identity counts/unknown identity versions. Stored/imported metadata never restores the catalogue client's runtime verification proofs; construction freshness is still checked separately.

## Whole-comparison sharing

The whole comparison can be copied as:

```text
https://manascout.co.uk/#compare=v1:PRINTING-UUID~foil,PRINTING-UUID~nonfoil
```

The copy action uses the current origin's homepage, so local previews work too. Fragment state contains only UUID plus actual finish for 1–4 selections; no names, descriptions, images, prices, saved-library IDs or deck contents travel in it. State is limited to 240 characters, with an early bound on the encoded fragment. Unsupported versions/finishes, malformed UUIDs, duplicate UUID+finish pairs, extra delimiters and oversized inputs are rejected.

On opening, the shared controller reuses the existing exact-fetch bridge and retrieves at most four records sequentially. Returned UUID, gameplay UUID, physical availability and requested finish are checked. Different known gameplay identities reject the new comparison while retaining prior choices. An unavailable requested record/finish stays represented with its UUID/finish and an explicit failure status; no edition or finish is substituted. Malformed state reports an error and leaves normal search functional. The comparison area is outside the homepage's search-only hidden section so shared results and errors are visible without running a search.

Opening is memory-only and never saves to the library automatically. Save remains an explicit action. An unavailable shared UUID can be saved/exported with `oracleId:""` and `unresolved:true`, an optional extension of comparison format version 1; it is not an inferred gameplay identity. Reopen can fill that identity only from an exact response, with a common-identity check. Existing Phase 2 JSON/CSV/import/save behavior is retained. Older Phase 2 readers may reject this newly supported unresolved-item form; existing fully identified files remain compatible.

Fragment state is utility state on the existing canonical homepage URL. Canonicals and sitemap are unchanged; there are no new indexed comparison routes or hosted records. Anyone with a link can retrieve those public printing identities. The fragment itself is not sent in the HTTP page request; catalogue lookups still disclose the requested public IDs to Scryfall.

## Storage and privacy

No new storage namespace, account, backend, analytics, retailer, advertising or payment service is added. Deck operations use the existing `manascout.deckstudio.v1.*` draft/pointer/snapshot/journal/recovery keys; comparison saves use only `manascout.comparisons.v1`. The stores remain separate. Namespace names are retained; deck schema/version information is inside the stored records. Opening a share link does not write a saved comparison; the existing library may be read for its controls. Saving is explicit.

Pasted text and uploaded files are parsed locally. Names/exact identifiers needed for lookup go to Scryfall through the existing client, not to a new ManaScout service or raw-deck logging/analytics. Import/export works in memory when storage is restricted; saving errors stay explicit and JSON recovery output remains available. Browser/origin storage can be cleared or fail; keep portable backups.

## Files and validation

- `assets/js/deck-interoperability.js`: bounded text/CSV parsing, shared-client resolution orchestration, honest provenance-aware serializers and new-draft assembly.
- `assets/js/deck-interoperability-controls.js`: restrained native import/export modal, preview/cancel/accept, file bounds, clipboard fallback and focus lifecycle.
- `assets/js/deck-client.js`: resolution endpoints on the existing request queue/verification boundary; no duplicate catalogue client.
- `assets/js/deck-model.js`, `deck-store.js`: versioned identity counts, Maybeboard retention, safe version-1/2 persistence compatibility.
- `assets/js/deck-view.js`, `deck-rules.js`: visible import provenance and outside-deck Maybeboard handling; existing construction checks preserved.
- `assets/js/deck-studio.js`: new-draft integration with existing save/recovery and race guards.
- `assets/js/deck-generator.js`: preserve identity metadata when copying seed entries only; no generator redesign or strategic-quality claim.
- `assets/js/comparisons.js`: bounded fragment serialization/reconstruction, unavailable-item preservation and visible homepage shared state.
- `assets/css/deck-studio.css`, `deck/index.html`: scoped modal controls, accessibility, mobile layout and dependency/cache updates.
- Homepage/all 59 guide HTML files: shared comparison module cache refresh only; editorial content, sources, dates and SEO retained.
- New parser/resolution/sharing tests and `tests/browser-phase3.py`; existing store unknown-version fixture updated to version 3 with its assertions retained. README/roadmap document the supported scope.

Required automated command: `python tests/run-deck-studio.py`. Final results: **1,032 JavaScript cases passed, zero failed**, plus JavaScript syntax and the included Python structural/catalogue/site-integrity validations. All 66 production HTML files passed the structural suite. This includes 54 new deck interoperability cases and 17 new comparison-sharing cases, with all previous regression assertions retained apart from updating the now-supported future-version marker from 2 to 3.

Native results: **44 Phase 3 checks**, **28 Phase 2 checks**, and **71 Phase 1 checks** passed (143 total); no uncaught page errors were observed. Phase 3 and Phase 2 use explicitly synthetic, deterministic catalogue fixtures. Phase 1 also exercised live catalogue/search access. Checks are observations in this test environment, not claims that synthetic records describe real physical printings.

Phase 3 covers a 100-card supplied fixture with preserved quantities/commander and retained singleton warning; preview before mutation; accept/save/reload; exact set/number/finish surviving TXT/CSV/JSON output; generic records not acquiring fabricated pins; clipboard denial; Escape/focus return; cancellation over an existing deck; unresolved/ambiguous imports; malformed CSV, oversized files and invalid UTF-8; CSV mapping and a separate draft; existing JSON restore; clean-context whole-comparison reconstruction/no autosave/explicit save; unavailable and malformed shared state; mixed gameplay rejection with prior choices retained; restricted storage and JSON recovery output; reduced motion; and import/export layout at 320px and 390px. Desktop used 1280px. Mobile dialog screenshots, including the preview/accept area, were visually inspected. `git diff --check` passed.

Reproduction (serve the repository root at port 8765):

```sh
python tests/browser-phase3.py --output /tmp/manascout-phase3 --no-sandbox --ignore-https-errors
python tests/browser-phase2.py --output /tmp/manascout-phase2
python tests/browser-phase1.py --output /tmp/manascout-phase1 --chromium /usr/bin/chromium --no-sandbox --ignore-https-errors
```

Native runners require Playwright and Chromium. The no-sandbox/certificate switches are managed-environment test accommodations; they do not change production security. Phase 3 offers explicit switches; the existing Phase 2 runner retains its environment-specific defaults. Initial native fixture-navigation/selection assumptions were corrected, and the sharing test found and prompted the real homepage-hidden-container fix described above. No failed test attempt is counted as a passing check.

## Known limits

No universal third-party deck format support, fuzzy correction, automatic partial import, signature-owner CSV/TXT round trip, cloud sync or public deck storage. Long lists require paced remote requests; cancel is available and unresolved previews cannot be accepted. The ordinary text export omits finish by choice; use detailed text, CSV or JSON when finish matters. Legacy entries already record concrete UUID/finish values and are exported as recorded identities; this phase does not retroactively infer whether an older user manually pinned them. Browser tests sample Chromium; no all-browser/device guarantee or traffic/revenue improvement is claimed. T02 remains a separate strategic-quality audit.
