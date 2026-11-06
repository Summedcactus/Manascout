# Stage 5 integrity review

Baseline: DEVELOPMENT `97d94269e9d1b3490884630996b837285e4fdbcf`. All local site bytes matched that remote tree. Main had independently advanced to the same tree; it was not used or modified. Review covers all production HTML/assets, shared search/homepage/guide controllers, Deck Studio modules, storage, tests and documentation. Static checks cannot certify native layout, live service responses or external destination availability.

## Findings and disposition

**Critical: none found** in the inspected code or deterministic regressions. This is not a claim that every browser/service interleaving can be proven safe.

**High — fixed before bulk implementation**

- Shared `readJson()` and featured-card requests could remain pending indefinitely, including a stalled JSON reader. The standalone exact-printing helper relied on abort cooperation. Hard Promise boundaries now settle fetch/body stalls and cancellation, clear timers/listeners, and permit retry. Existing featured artwork/fallback, 3D and foil layers are unchanged.
- Shared printing archives accepted arbitrary HTTP next-page URLs, repeated pages and foreign Oracle records. Missing/malformed pagination could imply a complete archive. Requests now restrict search destinations, detect loops and validate response identities/shape. Partial results are explicitly incomplete; the selected exact printing is retained. Featured search results must match the intended card name.

**Medium — fixed where low risk**

- Unsaved checkpoints accumulated immutable recovery snapshots until quota. Checkpoints now apply the existing retention policy after a successful journal write, preserving primary/backup pointers and recent versions. Cleanup failure never reports a successful checkpoint lost.
- Shared preview/recommendation and homepage request caches had no retention limit. Limits are now 256, 128 and 64 records respectively. This does not change exact saved deck entries.
- Same-Oracle swaps rejected harmless Unicode/newline/trailing-whitespace presentation differences. Comparison and authoritative fact signatures now share conservative text canonicalisation. Oracle ID, words, symbols, case, costs, type, identity, keywords and commander requirements remain checked. A genuine Oracle text update still requires explicit current-card rechecking; it is never silently treated as a cosmetic printing swap.

**Low — fixed**

- Root README described only the obsolete V1 search flow and incorrectly implied no curated static facts. It now distinguishes source-backed editorial/fallback content from live data and points to the complete validation workflow.
- The existing runner did not cover every non-guide HTML page or cross-page fragments. New validation checks 50 production HTML documents, dependency order, literal Deck Studio DOM IDs, local fragments/assets, metadata/JSON-LD and CSS delimiter integrity. The search-engine verification text file and deliberately noindexed 404 are handled by their actual purposes.

## Checked and retained

- Deck entries/UUID/finish/zone/assignment remain authoritative in `deck-model`; accepted legality and Oracle commander proof remain in `deck-client`; generation intent remains version-1 metadata. Catalogue hints do not promote trust. Identity/Health are derived analyses; no parallel deck model was found.
- Stage 4 exact UUID/finish validation, collision grouping, signature ownership, job guards, cancellation, role recomputation, focus return and saved-printing retention were inspected and regression-tested. Bulk must build a temporary candidate using the same mechanism; sequentially remapping already-merged keys would be unsafe and must not be used.
- Store input limits, safe UUID/entry keys, immutable snapshots, pointer read-back, corruption recovery, expected-token conflicts, JSON size limits and quota fallbacks remain. No destructive migration is needed.
- All production `console.warn/error` calls report a real fallback/failure (clipboard, shared load/FX/archive, featured card or exact weekly/archive lookup). They are intentional diagnostics, not success masking. No production `console.log`, TODO/FIXME/HACK/remove-later residue was found. “Legacy” mostly names a format or historical set, not abandoned code.
- No duplicate IDs, broken local assets/fragments, absent required scripts, invalid static ARIA references or contradictory duplicate canonical/description/title elements were found. Existing guide-layout outliers are deliberate earlier editorial templates, not broken guides. Historical documentation sections are superseded by their later-stage notes; new feature docs must update obsolete current claims.

## Deferred risks / deliberate limits

- Long-lived client Oracle/proof/error side maps can outlive the capped accepted-record cache. A future active-deck pinning/expiry policy needs lifecycle-specific design; indiscriminate eviction could recreate commander invalidation. Bulk catalogue hints do not grow authoritative maps and applied records remain bounded by deck size.
- Cross-tab localStorage without native Web Locks remains best-effort conflict detection backed by immutable recovery, not a transaction guarantee. Native Web Locks, storage events and quota behaviour require real-browser testing.
- Missing-image rendering remains readable through card names/printing metadata; native image-error layout shifts and mobile sticky/focus behaviour need visual testing. No layout redesign was attempted during this audit.
- Unsupported special formats/configurations, companion/event workflows, bracket certification, older-browser single-column fallbacks and local-only saving are intentional product restrictions, not defects to “fix”.

## Marketplace/source follow-up

The removed US marketplace has no remaining production, test or research references. Cardmarket remains as a validated HTTPS destination with a card-name search fallback; Scryfall verification links remain separate. No affiliate code or sponsorship claim was added. Terms/Privacy retain third-party responsibility and privacy/tracking notices.

Citation replacements were checked against accessible sources: [official Iconic Masters gallery](https://magic.wizards.com/en/news/card-image-gallery/iconic-masters) for Mana Drain's edition, [catalogue product availability](https://mtg.wtf/card/availability/5ed/388) for Mana Vault's Secret Lair rainbow-foil product, and [MB2 #181 catalogue](https://mtg.wtf/card/mb2/181/Demonic-Consultation) plus the existing official product explanation for Demonic Consultation. Direct IMA catalogue/Scryfall fetches were unavailable; indexed independent catalogue results corroborated its number/artist. No prices were copied. Only source links/review notes changed in these guides. Their lastmod dates, homepage/Deck dates and URL-specific evidence were updated; cache-version edits alone did not reset other guide editorial dates.

## Stage 5 final local validation

The complete runner passed **753 JavaScript cases and 10 Python unit tests, 0 failures**, plus the HTML/CSS/JSON-LD/dependency/local-link/registry/sitemap validators. The sitemap retains 47 unique URLs and all 44 permanent guides. The removed marketplace's two spelling variants have zero repository matches. Cardmarket exact/search routing is covered by focused URL-safety tests.

The 32 pure appearance cases and 15 controller journeys cover all presets, same-Oracle/finish guards, complete catalogue traversal, protected manual/unknown entries, collision grouping, failure/cancellation/time limits, stale revisions, undo, version-1 save/recovery/backup, paired commanders/Backgrounds, Oathbreaker ownership, generated Edgar/artifact/spellslinger decks, active filters, equivalent Health, basic-land quantities and reopening. Existing commander lifecycle and Stage 1–4 suites remain green; gameplay generator/Identity/Health code was not changed.

Native browser launch was attempted once in the resumed environment: Chromium failed on `setsockopt: Operation not permitted`. A single live Scryfall smoke request failed because the configured proxy could not be reached. Neither was repeatedly retried or worked around. Native layout/focus/scroll, real storage concurrency and live catalogue pagination remain unverified. Existing 22 earlier-template guide layout outliers remain deliberately unchanged, not reported as broken pages.

Publication is incomplete: the GitHub connector cancelled creation of the marketplace tree after its scoped blobs had been uploaded and hash-verified. No Stage 5 ref update completed. The tested local work and publication manifest are retained for an explicitly authorised retry; main and DEVELOPMENT-2 were not modified.
