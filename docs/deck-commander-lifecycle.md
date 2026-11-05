# Commander generation: verification and progress lifecycle

## Confirmed regression

The client used a per-printing object-generation counter. `refresh()` deleted each printing's
verification **before its request completed**, and every `remember()`/cached `verify()` replaced
the counter. The original immutable deck snapshot still referred to the earlier card object.
The same printing appearing in role pools invalidated that assigned commander even though its
facts had not changed. A failed refresh left the unchanged deck unverified and disabled its
Generate action. Cached candidate objects could also reassert obsolete facts after a newer refresh.

Controlled Search and Discover journeys reproduced this: the commander proof remained true but
`isVerified(assignedCard)` became false at every pool. Temporary failures and partial collection
records independently reproduced the loss of trusted data. This is separate from an actual
negative `is:commander` result or a changed ban/colour/printing record.

The request timer previously only called `AbortController.abort()`. A fetch/JSON reader that
ignored abort never settled, keeping the serial queue and generation promise pending. The new
boundary rejects explicitly and releases the queue; there are no automatic retry loops.

## What 8/9 and 9/9 meant

The counter described **role-pool requests**, not nine steps to a complete deck. It advanced
before awaiting the request and did not describe subsequent composition/finalisation work.

| Default pool | Data requested |
| --- | --- |
| 1 | Basic-land printings |
| 2 | Nonbasic fixing/utility lands |
| 3 | Ramp / land-search / additional-land effects |
| 4 | Draw / card selection |
| 5 | Targeted interaction |
| 6 | Board wipes |
| 7 | Protection and graveyard support |
| 8 | Primary theme, up to two search pages |
| 9 | Payoffs |

Supporting styles/combo preferences can add a combined pool before payoffs, so the denominator
is dynamic. Seed/commander checking precedes these downloads. Card selection, composition repair,
mana allocation, final printing refresh and final rules/identity checks follow them.

The reported production request was not observed in a live browser. Tests reproduce verification
loss during those downloads and recoverable final-refresh failures after all nine pools. The
old counter alone cannot identify which later request failed. New messages distinguish loading
from completed pools, selection, final refresh, final validation and completion. Request errors
carry their stage; UI errors preserve the deck, release loading and offer Generate/Recheck retry.

## Authoritative records

`deck.cards[printingId]` remains the application's commander record; no second commander model
or save schema is introduced. Search, Discover, printing lookups, refresh and generation use the
same normalised card fields. The client retains immutable accepted records with comparable
printing and Oracle facts, while WeakMap provenance identifies objects actually checked in this
session. Equivalent trusted objects stay verified. Restored JSON/clones do not gain trust merely
because their fields match. Current matching facts retain the existing 15-minute expiry policy.

- A successful full response can replace facts. Changed Oracle/legality data invalidates older
  aliases and eligibility proofs; finish/platform changes invalidate that printing's old aliases.
- Cached hints resolve to accepted current records without extending freshness or reviving older
  legalities. A fresh ban remains a ban.
- A partial response can retain a still-current accepted record only if it contains no explicit
  conflicting facts. It is reported as retained data, not a successful new check. Without a
  trusted record, incomplete data fails. Contradictions fail closed and require a recheck.
- A temporary failed request does not erase a fresh record or proof. Refresh warnings distinguish
  previously verified data from a currently unavailable refresh. Expired proofs/data stay expired.

Eligibility lookups share one in-flight request per Oracle identity/version, with independent
cancellable waiters and epoch checks for late responses. States distinguish pending,
verified-legal, verified-ineligible and temporarily-unverifiable. A confirmed negative result
still blocks assignment. Pair/Background, double-faced and colour rules are unchanged.

Generation reuses fresh seed records, performs the final printing check, then runs the unchanged
construction and identity rules. Only a complete candidate reaches the existing atomic deck
replacement/recovery path. Explicit rechecks do not clear valid proofs in advance; generation
is disabled while a recheck is pending, and stale refresh snapshots cannot overwrite newer edits.
CPU selection yields periodically so cancellation and progress can render.

## Diagnostics and verification

`client.diagnostics()` exposes a bounded, in-memory diagnostic list with request/eligibility/data
areas, status and identity. It is not logged noisily to the console or persisted with decks.
Generation errors carry a human-readable stage. Names/queries are not sent to a telemetry service.

Run `python tests/run-deck-studio.py`. The focused `deck-commander-lifecycle.test.cjs` uses the
production client, generator, controller, model and rules with synthetic HTTP. It covers Search
and Discover, failure/retry, partial and conflicting records, cache/expiry, timeouts, concurrent
proofs, stale replies, replacement, partners/Backgrounds, reversible commanders, refresh/edit
races and identity-preserving generation. Reference commanders include Edgar Markov (WBR),
Urza (U) and Tatyova (GU); their previously verified Oracle fixtures are paired with explicitly
synthetic candidate pools, not claimed real printings or gameplay-quality evidence.

Native browser rendering and live Scryfall requests remain unverified in this restricted
execution environment. A successful simulated journey does not establish live API availability.
