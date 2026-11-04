# Commander generation V1

Generation extends the existing Deck Studio. It does not create another deck representation,
legality engine or save store. Search, Discover and handoffs still use the same compact preview.
Assign its exact printing to the command zone or main deck to reveal **Generate Deck**.
**Deck options** is a native, initially closed details element in the existing drawer/bottom sheet.
Other formats retain manual editing; automatic generation is Commander/paper only.

## Construction

`deck-generator.js` accepts an immutable deck snapshot and returns a candidate using
`deck-model.js`. Its async dependencies are supplied explicitly for testing. It refreshes
preserved printing records, preserves finishes/leader assignments, and obtains current
commander eligibility proofs from the existing client. Supported commander pairs use the
existing pair/colour rules, including Backgrounds; generation does not introduce new pairings.

With a main-deck seed and no commanders, it searches a bounded pool of Commander candidates
whose identities contain the seed's. It ranks explicit mechanical relationships in Oracle text
and relevant card types, penalises unnecessary extra colours, checks eligibility and retains the
original main-deck seed. An isolated destructive reference to a theme is insufficient. Unclear
seeds fail with an invitation to choose a commander manually. Existing incompatible commanders
are reported, never replaced silently.

Broad heuristics cover artifacts, graveyard, tokens, spellslinger, aristocrats, Voltron, ramp,
aggro, control and combo-oriented engines. The strategy selector is filtered to inferred matches.
This is **not** an exhaustive tribal/theme engine or a verified combo database. Unrecognised
mechanics and sparse candidate pools can fail safely. The default is Auto / balanced curve /
reliable choices / Bracket 2 preference / no budget.

Candidate queries group basics, fixing/utility lands, ramp, draw, interaction, wipes,
protection/recursion, theme support and payoffs. At most 12 search pages are requested including
commander discovery (normally 10–11), not hundreds of individual printing lookups. Each page
uses the existing paced/cancellable request queue, timeout, normalisation and short-lived cache.
404 means an empty pool; there are no automatic retries. Final selected records are refreshed in
collection batches of at most 75. Searches choose a currently supplied printing, not an
optimised cheapest-printing inventory. Preferred finish follows the existing nonfoil-first
normalisation and available finishes; preserved seeds retain their exact selected finish.

Role-deficit scoring favours missing functions, theme relevance, the selected curve and power
preference. A card may fill multiple roles. Land and ramp targets adapt to commander mana value,
curve and strategy; basic allocation follows actual mana symbols, with at least one source in
each required colour. Colourless decks use Wastes. There are hard minimums for ramp, draw,
interaction, synergy and payoffs. Failure to meet them does not trigger random filler. Oracle
and English-name identities prevent duplicate game cards across printings. Basic repeats use
the existing model and rules. Final construction must pass the **unchanged** rules engine with
current verification/proofs and exactly 100 cards, including one or two leaders.

## Power and budget limits

Bracket 1–5 is a **generation preference, not bracket certification**. Higher settings favour
mana efficiency, interaction, generic tutors and repeatable engines. Casual settings avoid
generic unrestricted tutors, artifact fast mana, explicit extra turns/alternate-win text and
explicit land destruction among generated candidates. Preserved seeds are retained even if
stronger. Reliable favours common synergistic choices using Scryfall's supplied EDHREC rank;
Mixed/Wild widen score variation within legal, relevant role pools. No cEDH capability, verified
infinite combo, formal bracket assignment or tournament readiness is claimed.

Finite GBP budgets use positive Scryfall EUR prices for the **actual chosen finish**, multiplied
by a dated EUR/GBP reference rate from Frankfurter. Missing, zero or malformed prices remain
unknown; they are never treated as £0. An unpriced seed/commander or missing/stale rate prevents a
budgeted generation. Unpriced candidate printings are excluded. The estimate includes repeated
basics and leaders; it is checked again after the final record refresh. It excludes shipping,
fees, stock and regional shop differences. It is not a purchase quote. Exact-printing price
optimisation is not implemented. A pool may fail a tight budget even if other printings outside
it could meet the target. No-limit generation makes no price guarantee.

## Replacement, cancellation and local drafts

Existing meaningful contents require the existing confirmation dialog. Seed and assigned
commanders are the only entries retained for construction; other contents are replaced only on
success. Before destructive replacement the existing store must create a recovery checkpoint.
If storage cannot preserve that checkpoint, replacement stops and the existing deck stays intact;
the existing JSON backup action remains available.

The controller holds a temporary job/snapshot and AbortController. Edits, selection, format,
options, draft changes, external-tab conflicts or Cancel invalidate the job. Both the generator
and controller check for cancellation/staleness after awaits. A late response cannot overwrite
newer work. No partial generation is committed, autosaved or displayed as a completed deck.

On success the candidate goes through the same commit/render/autosave path as manual edits.
Save Deck, rename, draft switching, recovery, views, quantities, statistics and JSON backups
remain unchanged. Storage stays schemaVersion 1. Optional manaCost, pricesEUR and edhrecRank
fields are sanitised additively; old records load with empty/unknown defaults. There is no new
save mechanism and no required migration. Current verification is deliberately not restored
from storage: reopened decks still require the existing current-data checks.

## Verification and limits

Run `python tests/run-deck-studio.py` for all existing and new tests, syntax and structural
checks. New tests use synthetic cards/HTTP responses and the actual model/client/rules/store,
plus the controller's existing DOM double. They do not establish real-world deck strength.

During implementation, one live Scryfall request failed with `Operation not permitted` in the
execution sandbox. It was not retried. Live candidate quality, pricing/exchange responses and
real-API generation remain unverified. A prior Chromium launch in this environment closed
before a page was available; no repeated launch or claimed desktop/mobile visual verification
was made. Static responsive/focus structure and simulated interactions passed; native browser
layout, actual touch/focus behaviour and gameplay quality still need manual review.
