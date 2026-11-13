# Phase 4: Commander generator strategy quality

Implemented on DEVELOPMENT, 13 November 2026. Baseline: `e9b5cefcd29e12a77beb1f88be3d5fe11407ac30`. Main was `186a8671a6bf8dd884660ab996d359ee4a2b8232`; its file tree matched DEVELOPMENT, so no merge or history rewrite was needed. No main/backup update, PR, publication, hosting, account or monetisation change is included.

This completes T02 for the documented heuristic/test scope. It does not certify optimality, power brackets, combos, tournament quality, purchase cost or win rate.

## Audited previous pipeline

The real code in `deck-generator.js`, `deck-identity.js`, `deck-health.js`, `deck-rules.js` and the shared client was inspected before implementation. Existing behavior was:

1. Find the selected exact commander/main-deck seed; preserve assigned leaders and seed, UUIDs and finishes. Recheck current records and eligibility without mutating the source deck. Main-deck seeds can discover a compatible commander from one bounded pool, trying at most four eligibility candidates.
2. Infer styles from commander Oracle text and choose up to three distinct relevant styles. Build component minima scaled by primary/secondary/tertiary influence and adherence, plus infrastructure priorities and land targets.
3. Fetch bounded pools for basics, utility lands, mana, draw, interaction, wipes, protection/recursion, primary style, optional secondary/tertiary/combo support and payoffs. Queries use the existing paced client, Commander legality, paper availability and colour identity. The primary-style pool can use two pages.
4. Filter legality, colour, exact available finishes, budget-price presence, bracket restrictions and tutor settings. Optionally assemble members of the existing small combo-pair catalogue, with prerequisite text.
5. Greedily choose individually scored cards. Deficient roles receive the strongest bonus; style components, curve, rank/randomness and price affect ranking. Oracle/name identities enforce singleton rules.
6. Repair raw component deficits through monotonic single-card swaps, bounded at 100. Allocate utility/basic lands, include every required colour, then weight remaining basics by selected mana symbols.
7. Refresh all selected records, recheck eligibility/construction/composition and final reference price. Return a new model only on success; the controller commits it atomically after any required replacement/recovery confirmation.

The raw repair only reduced role-count shortfalls. A spell-trigger payoff could satisfy an individual payoff/draw slot without enough actual spells; a conditional engine could count as infrastructure even when its trigger was thin. The final gate repeated those raw counts, so the same mistake could survive. Broad draw/mana wording, graveyard recursion being labelled protection, and unsupported cross-theme fillers compounded this. There was no separate dependency health/debt measure.

## Support model

`deck-quality.js` is pure, browser-local and shared by identity classification, generation and Deck Health. It has no catalogue client or commander-name rules. It derives a cached profile from printed type, Oracle text and mana value:

- **Enablers/resources:** castable instant/sorcery/noncreature cards; physical artifacts, Equipment/Auras and creatures; actual creature/artifact-token producers; sacrifice outlets/fodder; graveyard filling/use; additional land plays, battlefield land ramp and fetch effects.
- **Payoffs/dependencies:** supported trigger/cost-reduction patterns establish a required resource class. One card can enable one package and depend on another. Merely mentioning an artifact/token is not the same as producing/supporting it.
- **Engines/support:** repeatable/conditional draw, mana-source type, recursion, creature-board finishers and appropriate tutor classes remain distinguishable. Sources count as sources, not an invented number of future activations or tokens.

Main and command-zone cards supply resources; sideboard, maybeboard and unadded selections do not. Commander dependencies are checked too. A repeatable creature-token commander contributes at most two token/fodder sources. Other supplied sources normally contribute one per copy. This is bounded availability credit, not a guarantee the commander resolves or survives.

Self-references in mana costs are recognized by replacing that card's own name with a generic self-reference; this works for any card and is not a commander-specific exception.

## Dependency thresholds

These are reviewable defaults for reliable support, not universal Magic laws. Loose adherence still cannot bypass them.

| Dependent effect | Required support |
| --- | --- |
| Instant/sorcery trigger or matching reducer | 18 instant/sorcery cards |
| Noncreature trigger/reducer or prowess | 22 noncreature, nonland cards |
| Artifact-dependent engine/payoff | 18 artifacts, or 12 artifacts plus 8 actual artifact-token sources |
| Equipment/Aura-dependent effect | 8 Equipment/Auras |
| Token-specific payoff | 6 actual creature-token sources |
| Creature-entry/go-wide effect | 22 creature cards, or 8 creature-token sources |
| Death/sacrifice payoff | 3 outlets and 6 fodder sources, plus 14 creature cards or 8 creature-token sources |
| Equipped-creature-death draw / sacrifice draw | 6 fodder sources |
| Graveyard stock-dependent effect | 6 graveyard-filling sources |
| Graveyard-leaving trigger | 4 recursion/use sources |
| Landfall trigger | 8 weighted land-entry support; ordinary basic land count contributes zero |
| Identifiable tribal payoff/reducer | 14 actual relevant tribe creatures, including changelings once |

Land-entry weighting gives one for a recognized source, with another for fetch or additional-land capability. Generation separately requires **8/10/12 actual classified land-entry sources** under loose/balanced/strict Lands/Landfall styles, plus the existing land/ramp/utility targets. The weighted dependency check therefore cannot be satisfied by normal basics alone.

Selected tribal component targets remain stronger than the minimum for an incidental dependent effect. The baseline is 28 tribe creatures, with adherence scaling and curve adjustment. Quality warnings use 18/28/34 for loose/balanced/strict respectively. Actual creature subtype/changeling is counted; an off-type support card or Oracle mention is not a tribe creature. Plural morphology and card-type exclusions prevent `Other` or `Equipment` becoming fabricated creature types.

Global graveyard-exile replacement effects are flagged as conflicting when a substantial recursion package is present. This is a small explicit conflict heuristic, not a full replacement-effect interpreter.

**Oracle correction:** the retrieved current Fiery Inscription text triggers on instant/sorcery casts, like Guttersnipe; it is not an all-noncreature-spell trigger. Its regression follows that actual text. Noncreature triggers have their own separate test/class.

## Infrastructure and commander policy

Infrastructure stays separate from legality and theme. Conditional sources lose infrastructure credit when their dependency is unsupported. Presence remains visible in Deck Health, but presence alone cannot satisfy the generator's final supported-source check.

- Draw differentiates efficient cantrips, multi-card/card-advantage effects, repeatable engines and conditional engines. Scry/look-only text and an incidental draw-step reference are not draw. A one-card instant/sorcery above MV 3 does not satisfy the draw quota. Supported engines/card-advantage sources receive small ranking preferences while draw is deficient.
- Ramp distinguishes land acceleration, mana rocks/dorks, persistent Treasure sources, reducers, rituals and self-sacrificing one-shot mana. Land-to-hand fixing, instant/sorcery mana rituals, one-shot Treasure spells and self-sacrificing mana do not satisfy sustained-ramp quotas. Conditional reducers/mana engines still need recognized support. Land-search tutors remain distinct from generic card tutors.
- Interaction requires an actual targeted removal/counter/bounce/damage pattern. +1/+1 counters and self-exile costs are not removal/countermagic. Friendly blink is not presented as exile removal. Sweepers remain separate.
- Graveyard recursion is no longer automatically credited as protection simply because Graveyard was selected. Genuine protection must come from its own supported effect.

Existing priority minima are retained: ramp/draw Light 5, Normal roughly 9/10, Heavy 17; interaction 4/8/16; wipes 0/2/5; protection 1/3/9; tutors 0/2/7. Expensive commanders (MV 6+) raise normal ramp to 12 and normal protection to 4. High curve raises normal ramp to 11, or 14 for an expensive commander. A proposed nonland average above 4 raises normal ramp to at least 12 before repair. A recognized unconditional repeatable draw commander can reduce normal external draw by one, never below eight; style requirements can still keep it higher.

Commander-produced tokens, outlets and other resources can support a package without eliminating redundancy. Colour identity restricts actual candidates and mana sources; it is not replaced with a rigid colour-specific quota table. Creature-based draw can naturally meet a creature/tribal deck's infrastructure.

Land targets retain the bounded 32–40 range, curve/commander-MV/bracket/aggro adjustments, and Lands/Landfall floors of 38 for low curve or 40 otherwise. Rocks/dorks are not lands; the generator does not cut lands merely because it found many mana sources. Existing front-face/MDFC limitations remain.

## Package-aware selection, adherence and curve

The existing primary/secondary/tertiary influence (1/.55/.28) and adherence multipliers (.6/1/1.3) remain. All selected packages must still satisfy their own minima and dependencies. The Spellslinger spell minimum cannot fall below 18 even under Loose. Strict increases real theme density while keeping infrastructure; it does not trade away lands/draw/interaction.

Scoring now also uses current composition:

- Unsupported dependencies incur a small penalty per class.
- A candidate gains value when its actual resource contribution reduces the distance to a missing support threshold. This uses the nearest valid alternative: adding an irrelevant creature does not pretend to fix a board package that really needs token engines.
- Shared features get a small overlap bonus when they support multiple selected styles. Tokens/fodder/outlets, artifact tokens and similar intersections naturally connect packages. There is no global commander-pair compatibility matrix. Low-overlap selections remain possible only if each package can still be supported within the 100-card constraint.
- Narrow dependent-effect redundancy diminishes after six similar dependencies; anthems after four; outlets after the selected target (at least three). A needed enabler is not punished just because it also has a supported payoff. These are score reductions, not rigid exclusions or caps.
- Supported repeatable draw and card advantage receive small preferences over mere role-word matches. Relevant Equipment/creature tutors gain a small preference under Voltron/Tribal respectively.

Existing role-deficit scoring remains stronger than these bounded adjustments: dependency score is capped at -25/+15, overlap adds at most 3, and curve distribution adds at most 2 in either direction. There is no giant card-name bonus.

Curve uses soft shares for MV <=2 / 3–4 / 5+: Low 55/35/10, Balanced 35/45/20, High 25/45/30, alongside the existing expensive-card penalty and adaptive mana plan. These are ranking targets, not certified final distributions. High permits supported expensive effects; it does not blindly request expensive staples.

## Bounded repair and failure

Before selection, a candidate is removed if even the available pool cannot supply its dependency. The optimistic pool is only an upper-bound impossibility check, not final proof of support.

After raw composition repair and mana-base assembly, a separate strategic pass evaluates unsupported effects **including the commander**, plus supported infrastructure shortfalls. It can accept at most **12** monotonic swaps. Each iteration considers at most **60 incoming** cards and **12 outgoing** nonland slots. Protected seed/commander and deliberately assembled package members are not removed. Low-essentiality surplus slots and unsupported cards are considered first.

Distance to support thresholds allows partial progress: several enablers can be added across successive swaps. A replacement must reduce total debt, preserve already-met raw component minima, honour colour/singleton/finish/budget rules and not assemble a forbidden known pair. It may supply support or replace a narrow payoff. It never fills randomly, loosens requested priorities or loops indefinitely. Existing raw-target repair remains bounded at 100 swaps; it was not replaced by an unbounded solver.

The final exact-record refresh reruns construction, commander/style relevance, raw minima, dependency checks and supported infrastructure. Changed Oracle data cannot inherit pre-refresh cached classifications. Missing prices/records, inability to meet the selected packages, impossible constraints, cancellation or failed refresh leave the original deck untouched. An explicitly preserved seed conflicting with casual filters or an already-preserved catalogued pair under Combo None fails with an explanation rather than silently replacing the edition or overriding the setting.

## Bracket, budget, combo and tutor qualifications

Brackets remain generation preferences. Brackets 1–2 retain unrestricted-tutor, extra-turn, win-text, land-destruction and cheap direct artifact-mana exclusions, now recognizing spelled-out mana and mass destruction/exile that lists lands or all permanents. These filters are incomplete policy heuristics, not official bracket certification. Conditional token engines are not automatically equated with immediate fast mana. Higher brackets still face relevance, support, curve, colour and price constraints.

Tutor None filters identified nonland tutors; Some/Heavy retain two/seven targets. Restricted Equipment/creature tutors can be strategically preferred; land acceleration is not treated as an unrestricted tutor. Oracle-language coverage is not exhaustive.

Combo None avoids completion of the existing known pairs during selection and both repairs, and rejects a conflicting preserved pair. Some/Heavy retain bounded engine targets and at most one/two compatible catalogue pair suggestions. Pair names/checks/prerequisites are the pre-existing small catalogue, not commander-specific decklists. Complete casting/board/resource sequences, deterministic infinite loops and win turns are **not** certified. Explicit combo priorities remain explicit; a low bracket label alone is not a guarantee of combo absence.

Budget continues to require known, positive exact-finish EUR references and a checked dated EUR/GBP rate, reserves mana-base cost and rechecks the entire result after refresh. Unknown is not free. Estimates exclude shipping, availability and delivered shop costs. No new price/retailer service is used.

## Reporting and Deck Health

The success note reports actual land and supported ramp/draw/interaction counts plus relevant package counts (tribe, artifact/token, spells, outlets/fodder, graveyard, land-entry or Equipment/Aura as selected), and at most two material warnings. It retains bracket/budget/combo qualifications and asks for sequencing/resilience/win-condition review.

Deck Health recalculates from current entries after edits/reload. Role-count metrics remain available, but the brief labels dependency status separately and shows supported-source counts. Unsupported engines can prevent a Healthy assessment even when presence targets are met. Warnings are grouped and capped at five, combining at most two leading strategic warnings with existing contextual target warnings. No new toggles, competing panels or score-math dump was added.

## Fixtures, bounds and performance

`tests/fixtures/phase4-oracle.json` contains 20 accepted Scryfall snapshots retrieved 13 November: 11 canonical commanders and nine classification/regression cards, with exact UUID, Oracle UUID, text/type/colour and source links. Five further optional source requests returned 429; no data or successful verification is claimed for them and they were not retried. Unneeded merchant fields were excluded from the fixture ledger.

The commander set is Krenko, Rhys, Teysa Karlov, Talrand, Urza, Meren, Tatyova, Sram, Atraxa Grand Unifier, Alela and Niv-Mizzet Parun: tribal, tokens, aristocrats, spells, artifacts, graveyard, landfall, Voltron, control/value, high-MV and multicolour coverage. Candidate pools/prices are explicitly synthetic test data with varied, separable roles; real commander identity/text/colour is retained. They do not establish the quality of a live metagame decklist.

The Goblin adversarial pool contains only five instant/sorcery cards but offers real Guttersnipe/Fiery Inscription records. Both must be absent in that result; a supported spell-rich result may still use them. Other tests cover unsupported protected seeds, damaged final Oracle support, cancelled repair, self-conflicting graveyards, conditional infrastructure, semantic traps, meaningful strict/loose density, saturation and version-1/2 persistence.

No new generation network calls were added. The prior maximum is 12 candidate-search pages including optional commander discovery, normally at most 175 records/page; a new **2,100 distinct candidate** guard rejects oversized input. Shared client pacing, timeouts, at-most-two-page calls, cancellation and caching remain. Eligibility checks and exact collection refreshes remain separate bounded calls: at most four discovery eligibility attempts, preserved/final leaders, and refresh chunks of at most 75 records. The quality layer does no per-card fetching, library scan or remote generation.

The strategic repair adds at most 12 × 60 × 12 = 8,640 single-swap simulations, with object-keyed feature caches and a yield/cancellation check per iteration. This is bounded heuristic search, not combinatorial deck solving. Representative fixture generation was subsecond in direct tests except repair-heavy cases around a second; native elapsed figures, including paced mocked requests and UI work, are recorded below. These are not live-network latency forecasts.

## Files and validation

- `assets/js/deck-quality.js`: shared profiles, support thresholds, contextual infrastructure, debt, scoring, curve and summaries.
- `assets/js/deck-generator.js`: pool feasibility, contextual scoring, adaptive quotas, bounded strategic repair, final gate and preserved-constraint checks.
- `assets/js/deck-identity.js`: reuse semantic infrastructure, additional Oracle inference and land-entry classification; preserve subtype rules and existing style controls.
- `assets/js/deck-health.js`, `assets/js/deck-view.js`: supported-versus-present reporting and capped contextual warnings.
- `deck/index.html`: dependency order and affected Deck Studio cache refreshes only. No guide-wide refresh.
- New quality tests/source fixtures/helper/native runner; three synthetic archetype fixture texts in the existing generator regression were corrected to match their non-artifact types, with existing assertions retained.
- This document, README and roadmap: implemented scope and limits. No storage schema/key migration or new persistence namespace in Phase 4.

Required command: `python tests/run-deck-studio.py`. **1,092 JavaScript cases passed, zero failed**, including **60 new quality cases**, plus JavaScript syntax and the included Python structural/catalogue/site validations. All 66 production HTML files passed. Existing Phase 1–3 regression assertions remain; only three synthetic generator archetype texts were corrected to match their changed card types.

Native results: **157 Phase 4 checks** passed across seven archetypes at **320/390/1280px**, plus **8 additional Sram/Voltron checks at 390px** exercising repair, the visible success summary and recalculated supported-source text after reload. Each applicable result had 100 cards, supported package/infrastructure counts, successful save/reload/export, keyboard Escape/focus return and no page-wide overflow. The Goblin five-spell regression, extra land-entry support and expensive-commander acceleration were checked in each width. No uncaught page JavaScript errors occurred. Mobile screenshots were inspected.

Earlier native suites reran successfully: **71 Phase 1 checks with live catalogue access**, **28 Phase 2 checks**, and **44 Phase 3 checks**. This is **308 native checks total** for the recorded final runs, not a sum of repeated development attempts. Phase 4 uses deterministic catalogue responses built from the dated canonical commander records and explicitly synthetic candidate pools; it does not assert live-list or real-game performance.

In the final seven-archetype browser run, generation including paced mocked responses and UI work took approximately **1.3–2.5 seconds**. The additional repair-heavy Sram journey took about **2.0 seconds**. Direct tests exercised nonzero repairs, cancellation and immutable failure. Timing depends on fixture/device/cache; actual internet latency and arbitrary live commander pools were not benchmarked or guaranteed. The new layer adds no catalogue calls.

Reproduce from the repository root with a local HTTP server at port 8765:

```sh
python tests/run-deck-studio.py
python tests/browser-phase4.py --output /tmp/manascout-phase4 --no-sandbox --ignore-https-errors
python tests/browser-phase4.py --indices 7 --widths 390 --output /tmp/manascout-voltron --no-sandbox --ignore-https-errors
python tests/browser-phase1.py --output /tmp/manascout-phase1 --chromium /usr/bin/chromium --no-sandbox --ignore-https-errors
python tests/browser-phase2.py --output /tmp/manascout-phase2
python tests/browser-phase3.py --output /tmp/manascout-phase3 --no-sandbox --ignore-https-errors
```

Playwright/Chromium are optional native-test dependencies. The explicit no-sandbox and certificate-tolerance switches accommodate this managed test proxy; no production security setting changed. `git diff --check` passed. Initial failed development attempts are not counted as passes; they exposed classification/fixture issues fixed before this release.

## Known limits

### Independent revalidation, 13 November 2026

The requested work was already present on remote `DEVELOPMENT` at
`e8b26748f177ca0467d36048b827c5876445758f`. The initial environment checkout
was older; it was replaced by a checkout of that existing development head
before edits. No generator rewrite or additional production change was needed.

Fresh runs passed **1,092/1,092 automated JavaScript cases**, the runner's syntax
and structural/catalogue/site checks, and **308 native browser checks**:
Phase 1 **71** (including live catalogue coverage), Phase 2 **28**, Phase 3
**44**, Phase 4 **157** across seven archetypes at 320/390/1280px, and
Sram/Voltron **8** at 390px. There were no uncaught page errors. The 320px
Goblin screenshot was visually inspected; the five-spell payoff rejection,
100-card results, supported infrastructure, save/reload and export checks passed.

During concurrent regression execution, the seven-archetype generation timings
were **1.421–6.789 seconds**, and Sram took **5.350 seconds**. These mocked-pool
UI timings include shared-machine contention and do not measure live catalogue
latency. The local server and Chromium required sandbox escalation; the approved
runs completed successfully. The earlier sandbox launch failure is not counted
as a passing test. T02 remains complete for the documented heuristic scope.

These English Oracle heuristics intentionally trade completeness for inspectable, bounded behavior. They do not model timing, activation costs, opponent behavior, board wipes, exact token yields, hidden choices, full replacement effects, MDFC sequencing or every graveyard/tribal engine. A card with an unsupported optional ability can be conservatively rejected despite a useful independent mode. Unusual plurals/wording may be missed. Creature-token sources and commander credits are opportunities, not guaranteed bodies/activations; toughness-specific Skullclamp optimization is not inferred from missing data.

Pool feasibility does not guarantee the greedy builder/limited repairs find an existing solution. Narrow/multi-style/high-priority/budget configurations can fail honestly. Some and Heavy combo settings are not complete combo solvers. No representative fixture or passing count establishes optimality, real-game strength, official bracket accuracy, verified infinite combos, delivered budget, win-rate uplift or increased revenue. Live pilot review remains necessary.
