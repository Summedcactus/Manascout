# Deck Appearance — Stage 5

Deck Appearance is a collapsed control above Health, separate from gameplay options. Choose a preset, prepare a preview, then explicitly Apply to deck. The preview reports changed/kept copies, protection/no-match reasons, command-zone changes and up to five example entries. It never regenerates cards or certifies an incomplete deck as legal. Individual Change printing remains available.

## Metadata profiles

- **Keep Current:** no catalogue calls or changes.
- **Original / Earliest:** earliest eligible physical edition by source release date, after examining every catalogue page. Missing release dates prevent an earliest claim for that card.
- **Retro / Old Border:** source frame `1993` or `1997`, including later retro editions; never guessed from year. Already matching editions remain.
- **Borderless / Full Art:** source borderless border or full-art flag. This is an edition choice, not a finish. Already matching editions remain.
- **Foil:** traditional `foil`, using the current edition when supported. Etched is a separate finish and is not invented as traditional foil.
- **Maximum Bling:** deterministic visual hierarchy: serialized, textured, confetti, halo, surge, galaxy, showcase with traditional foil, etched, traditional foil, nonfoil showcase, borderless/full art. Premium foil tags require an actual foil/etched finish. This is not a financial/value ranking; generic promo status is not a premium score.

Ties use release date (earliest for Original, newest otherwise), English, set, collector number, exact UUID and finish. Nonfoil is preferred when the existing finish is unavailable, except Foil/Bling. Metadata profiles can later add aesthetic families without commander-name rules or image recognition. Cheapest Known is deferred: incomplete currency/finish coverage cannot reliably support deck-wide UK price comparisons. Cohesive Style is deferred rather than claiming artwork intelligence.

## One replacement boundary

`deck-appearance.js` streams the existing client's paced, cancellable, cached `printings()` catalogue, keeping only its best candidate per Oracle identity. Every actual change goes through Stage 4 `DeckPrintings.prepare()` for exact-UUID refresh, same-Oracle mechanics, available finish, platform, legality and authoritative commander verification. Display hints never confer trust.

`deck-model.replacePrintings()` transforms original entry keys once and then groups final keys once. This prevents an A→B / B→C batch from cascading through a merged entry. Quantities, zones and signature ownership survive; commander UUID changes remap dependent signature keys. Individual replacement delegates to this same pure mechanism. A final accepted-record refresh, existing construction validation and aggregate Oracle/zone/owner/copy comparison must pass before application. Incomplete drafts may be styled but retain their incomplete status. Illegal, unsupported or unverified candidates cannot apply.

Preview and application have source-object/revision guards; application rechecks freshness and commander proof. No live deck mutation occurs while calculating. Any catalogue/exact-record failure aborts the entire candidate. No-match cards are intentionally kept. A genuine mechanics update requires explicit current-card rechecking, not a relaxed printing comparison. Unicode/newline/trailing-whitespace presentation normalisation does not ignore words, symbols, case, costs or colour identity.

The compact controller owns one transient preview/job and one undo snapshot. Settings, deck/draft/format/filter/panel/selection changes, page exit or Cancel abort work. Late responses cannot win a newer session. Progress counts checked entries and catalogue pages without fake completion percentages. Limits are 250 distinct entries, 512 pages per Oracle and five minutes per operation; reaching a limit fails closed. Bulk presets currently require Paper; existing Arena individual printing selection remains unchanged.

## Provenance and version-1 storage

Optional per-entry `printingChoices` counts (`automatic`, `manual`, `bulk`, `unknown`) sum to quantity. Counts, rather than one flag, accurately represent grouped entries containing both manual and automatic copies. New additions/default generation start automatic; confirmed individual printing choices become manual; actually changed bulk choices become bulk. Unchanged/default editions are not credited as customisation.

Older version-1 entries without provenance remain **unknown**, not retroactively labelled manual or automatic. Manual and unknown entries are protected by default with separate explicit inclusion checkboxes. If any copies in an entry are protected, the whole entry is kept. A later individual choice becomes manual and is protected on the next preview. Quantity increases follow the entry's existing provenance conservatively; decreases remove automatic, then bulk, then unknown, then manual copies. Zone moves transfer that same provenance. Split basic-land editions remain possible.

The progress label counts customised **copies across all zones**: manual + bulk / total. Unknown copies do not count. Existing schemaVersion 1, autosave, saves, JSON backups and immutable recovery snapshots persist optional counts; old backups load without migration. Malformed counts are rejected.

A successful application checkpoints the previous deck through the existing store and retains one in-tab Undo. Undo restores exact previous entries/finishes/provenance, including split editions, but refuses to overwrite subsequent entry/quantity/manual changes. Rename/view changes can be retained. Recovery remains available after reload; undo is deliberately not an infinite history. Quota failures are reported, and the user can download a JSON backup.

## Browsing and testing

Stage 3 reconciliation remaps changed keys and the current scroll anchor. Active filters, view preference, Health and Oracle-based generation intent remain. Roles are recomputed from accepted records, never copied from DOM tags. No parallel deck/card API or saved representation is introduced.

Deterministic production-module/controller journeys cover generated Edgar, artifact and spellslinger decks, paired commanders/Backgrounds, Oathbreaker/signature ownership, basic-land quantities, cancellation/stale responses, protected manual/history entries, undo and storage. Native Chromium launch was blocked by sandbox socket permissions; the configured HTTP proxy was unreachable for the live Scryfall smoke check. Native rendering/focus/scroll, browser storage concurrency and live catalogue pagination remain unverified.
