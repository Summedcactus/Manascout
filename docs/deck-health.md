# Deck roles, filters and health

`deck-identity.js` remains the single mechanical classification/policy layer. Its existing
archetype definitions now include contextual filter keys. `infrastructure()` owns the shared
nonland ramp/draw/interaction rules; `classify()` combines them with Stage 1 component features
and selected-style context. Generation and inspection use these same component counts.
`inspect()` adds evidenced type/detail roles, selected-style membership and source metadata.
It never alters a card record, printing ID, finish or commander proof.

`deck-health.js` is read-only. `analyse(deck)` returns classifications by printing ID, exact
entry-key memberships, quantity-weighted role counts, primary/secondary/tertiary coverage,
categories and target metrics. `evaluate(analysis, validation)` combines composition with the
existing rules result. The controller caches analysis by structural references; it does not
reclassify on name keystrokes or filter clicks. Minute-based legality updates still refresh the
health verdict. Nothing here fetches cards, re-verifies commanders or rebuilds a deck.

## Counts and filters

Main-deck counts exclude commanders, special zones and sideboards. Those zones remain visible
when a filter is applied. Multi-role cards count once in each matching role/style, multiplied
by quantity. Coverage across styles can overlap; it is not a partition of 99/98 cards.
Command-zone support is recorded separately in optional observations, so a commander supplying
a payoff is not represented as an extra main-deck card.

Default chips contain nonzero types/infrastructure plus selected-style categories. Other
nonzero universal roles are selectable from the collapsed Health details. Selecting one adds
only that active chip, closes the analysis and moves focus to the chip. All clears it. Hidden
or zero categories are not dead controls. Filter clicks hide existing main-deck articles in
place: artwork, exact entry actions, scroll state and the deck model are preserved. Artwork and
list views consume the same entries. Accessible native buttons and bounded horizontal chip rows
avoid a permanent universal mechanic menu on mobile.

Per-card roles appear in the existing optional preview details and concise entry summaries.
The classification map exposes `roles`, `components`, `styles` and evidence-source descriptions
for later inspection/tuning. A mana-producing basic is not ramp. Lands can also have evidenced
utility, self-mill or recursion roles. Token production alone is not a token payoff; opponent-only
draw, graveyard hate and hostile auras do not automatically become beneficial infrastructure.
Potential combo pieces require both matching cards in the existing conditional package registry;
this is not certification that the prerequisites or a deterministic win are available.

## Health targets and states

Targets come from the last generated Stage 1 plan, not from a second archetype table or from
unsaved controls for the next generation. Known priorities/style floors are checked against
`identity.plan()`; land requirements reuse `identity.landTarget()`. Older drafts without
curve/bracket metadata retain their stored curve-dependent targets. Incomplete targets cannot
produce a Healthy verdict. Live counts are always recomputed; saved generation counts remain
historical snapshots.

Metrics are Meets target, Slightly low (within roughly one fifth of the minimum), Too low,
High / intentional, or No minimum selected. Heavy/High infrastructure and Strict themes are
intentional, not oversupply warnings. Tutors None and Combo None create no missing-package
penalty. Primary/supporting style component targets retain Stage 1's existing weighting.
Additional observed roles have no invented minimums. Warnings name the actual count, target and
selected priority/style, including tribal density, outlets, token payoffs and the mana-base plan.

Overall states are qualitative. Composition can meet its targets while legality needs current
data; such a deck is Needs verification, not Healthy. Incomplete/illegal/unsupported construction
cannot receive Healthy. Changed commanders flag the saved identity for review. There is no
numeric deck-quality score or automatic repair action. Stage 1's generation-time rebalance pass
continues unchanged.

## Saving and future work

Storage remains version 1. Curve, bracket and commander Oracle IDs are optional additive
`generation` metadata. Existing drafts/backups still load. Role maps are derived from the saved
card records on restoration, rather than persisting stale role claims. Deriving roles never
restores verification trust; the lifecycle safeguards from `c6d4e9e` remain responsible for it.

A future printing selector should consume `analysis.cardRoles[printingId]` and
`filterKeys(analysis, category)` with the existing exact entry keys. It should replace records
through the model, then recompute analysis, rather than duplicate deck contents or infer roles
from thumbnail DOM. Filter state is a small controller value, independent of gallery layout.

To add a role, extend the shared classifier and label registry, then add its key to an existing
style's filter metadata when mechanically relevant. For a new required component, add its target
to that same Stage 1 definition and test generation plus health. Universal optional roles belong
to the nonzero supplemental-category policy. Do not add commander-name branches or a second
style/target registry.

## Limits and validation

Oracle-text classification is heuristic, not a full Magic rules interpreter. Unusual wording,
conditional effects, mana fixing, curve suitability and combo execution still need human review.
Cached card data is analysis input, not proof of current legality. Existing construction checks
remain authoritative. Future configuration controls should update a plan explicitly rather than
silently replacing the saved generation intent.

Run `python tests/run-deck-studio.py`. Focused health tests cover real generation modules using
previously verified commander excerpts with explicitly synthetic candidate pools; controller
checks use the existing DOM double. They validate composition and subsets, not one exact list.
Native desktop/mobile rendering and live API responses remain unverified in this restricted
environment; structural tests are not visual or gameplay validation.
