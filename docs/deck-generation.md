# Commander generation and deck identity

Deck Studio reuses its model, paced Scryfall client, rules, previews and local draft store.
Automatic generation remains Commander/paper only; other formats retain manual editing.
Assign the selected exact printing to the command zone or main deck to reveal **Generate Deck**.
The existing drawer/bottom sheet keeps **Deck style & priorities** closed by default.

## Analysis and style selection

`deck-identity.js` is a pure analysis/policy module, independent of the DOM and network.
`analyse(cards)` reads current commander Oracle text, types/subtypes and combined colour identity.
It returns a maximum of seven relevant styles with evidence and heuristic confidence weights
(these are not statistical probabilities). Referenced creature types take precedence. A subtype
alone, a creature token's incidental name, or a destructive artifact reference is insufficient.
English creature-type plurals are normalised. There are no commander-name branches.

The registry covers tribal, creature tokens/go-wide, artifacts, graveyard, sacrifice/aristocrats,
spellslinger, lands/landfall, Voltron, counters, lifegain/drain, blink, enchantments, vehicles,
Treasure, Clues, Food, poison, discard, combat, control, mana engines and broad value.
Narrow categories require text evidence. A few extensions use an evidenced engine and colours,
such as creature-token fodder with black sacrifice access. Ambiguous commanders receive a broad
creature/combat or value fallback, rather than arbitrary mechanics to fill a quota.

Auto selects the strongest inferred primary. Users can select a different relevant primary and
optional, distinct secondary/tertiary styles. Supporting styles cannot duplicate the primary.
Existing supported partners/Backgrounds are analysed together; their legality rules are unchanged.
The main-deck-seed route retains its bounded mechanical commander matching, current eligibility
checks and exact seed printing/finish. Ambiguous seeds still require manual commander selection.

## Composition and priorities

Each style defines component minimums. Primary/secondary/tertiary influence is **1 / .55 / .28**;
Loose/Balanced/Strict scales theme minimums by **.6 / 1 / 1.3**. Tribal minimums also adapt to the
chosen curve. Infrastructure uses separate priorities; a style's essential minimum remains a floor.
Counts concern the main deck, excluding commanders, and one card may serve several real roles.

Examples of enforced components:

- Tribal: actual creatures of the referenced subtype, or creature cards with changeling.
- Tokens: token makers, creature-token generators and token/go-wide payoffs. Treasure alone
  cannot satisfy the creature-token requirement.
- Sacrifice: outlets, fodder, death payoffs and appropriate recursion.
- Spells: instant/sorcery density, spell payoffs and cheap card velocity.
- Lands: 38–40 target lands as configured, land ramp, land payoffs and fetch/sacrifice
  utility lands; basics follow actual mana symbols and include each required colour.
- Artifacts, graveyard, counters and Voltron each have distinct density/enabler/payoff minimums.

Ramp Light/Normal/Heavy targets **5 / 9 / 17** (Normal 12 for expensive commanders).
Draw targets **5 / 10 / 17**, removal **4 / 8 / 16**, wipes **0 / 2 / 5**,
protection **1 / 3 / 9**, and tutors **0 / 2 / 7**. Theme-specific ramp/support can fill these
roles simultaneously. Tutors None excludes generated nonland card tutors; land searches remain
ramp. Preserved seeds/commanders are never removed by preference filters.

`deck-generator.js` queries bounded, current Commander/paper candidate pools through the existing
client/cache/normalisation/cancellation path. At most **12 search pages**, including commander
search and combined supporting-style/combo queries, are requested. There are no retry loops.
Cards must pass existing verification, colour identity, platform and legality checks. Role-deficit
scoring prioritises hard targets; irrelevant feature tags alone do not qualify a filler card.
A cached classifier and bounded, monotonic swaps rebalance remaining deficits. Repair yields to
the event loop and respects cancellation. Seeds, commanders and suggested package cards are
protected. An infeasible target combination fails with the missing counts, keeping the old deck.

After selection, all printing records are refreshed in batches; both construction and composition
are checked again. Changed commander mechanics invalidate stale styles. Exactly 100 cards,
current commander/pairing proofs, singleton rules and the unchanged legality engine must pass
before the controller applies anything. Manual contents require confirmation and a successful
recovery checkpoint. Cancellation, edits, draft changes and stale responses cannot replace a deck.

## Power, combos and prices

Bracket 1–5 remains a preference, **not certification**. Casual filters, mana curve, efficiency
and randomness preferences remain; explicit tutor/combo priorities take precedence over implied
optimisation. No cEDH or tournament-strength guarantee is made.

Combo None does not deliberately assemble packages and avoids completing the small catalogued
pairs among generated picks. Some/Heavy can suggest up to one/two compatible packages and
increase relevant engine density. The initial catalogue is Scepter/Reversal, Dualcaster/Twinflame
and Kiki-Jiki/Conscripts, with Oracle-pattern checks and documented prerequisites. These are
conditional suggestions, not certified executable wins. The catalogue is deliberately small:
this is not exhaustive combo detection, and ordinary cards can interact outside it. Unsupported
colour/style pools can have no available package. See each registry entry's source/prerequisites.

GBP budgets still use positive Scryfall EUR prices for actual selected finishes and a dated
Frankfurter reference rate. Unknown prices are not zero; final prices are checked again.
Estimates exclude stock, shipping and fees. No cheapest-printing inventory optimisation is added.

## Storage and extension

Storage remains schemaVersion 1. Optional `generation` metadata records version, three style
keys, priorities, composition targets and achieved counts. It is a **generation-time snapshot**,
not live deck-health or legality certification after manual edits. The existing sanitiser bounds
and whitelists it; old drafts without metadata load unchanged. Exact IDs, finishes, quantities,
selection, commander assignments, JSON backups, autosave and recovery use the same store.
Saved style/priority choices restore when reopening a draft. Verification proofs still expire.

To add a mechanic: add its evidence/query/component definition to `defs`, add precise feature
classification, and test inference plus actual generated composition. Avoid granting a role for
an incidental mention. Keep secondary/tertiary query terms in the shared bounded query, use the
existing client, and never weaken construction checks to make a composition pass.

## Verification and limitations

Run `python tests/run-deck-studio.py`. Tests use verified reference Oracle excerpts for six
commanders and explicitly synthetic candidate pools/printing IDs, not fabricated production
card records. They exercise actual generation, rules, model, controller and storage.

Controlled Edgar fixtures produced 20 Vampires under Loose versus 36 under Strict. Light
ramp/removal produced 5/4 cards versus 17/16 under Heavy. Aristocrats primary with tribal
secondary produced 21 Vampires, 7 outlets and 8 death payoffs. These compare behaviour, not deck
strength, and are not predictions for a live Scryfall pool.

Oracle matching is heuristic, not a full rules interpreter. Unusual wording, type morphology,
negative/opponent references or highly constrained budgets/styles can cause sparse pools or safe
failure. Finite candidate pools and greedy repair do not guarantee finding every feasible deck.
Human gameplay review remains necessary. In this environment the live Scryfall collection
request failed with `Operation not permitted`; it was not retried. Actual API deck quality and
native desktop/mobile layout, touch and focus remain unverified. Automated DOM/CSS checks do
not establish browser rendering or playtesting quality.
