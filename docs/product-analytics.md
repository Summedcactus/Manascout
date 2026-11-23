# Product analytics and the COTW funnel — Phase 6.1

Implemented 17 November 2026 on DEVELOPMENT, based on `ac2c8afa9ef195f7b46ba5f2a0de1ae1f903d5f4`.

**Status: PREPARED-BUT-DISABLED.** No Plausible account/site registration or live collection is assumed. The committed public configuration has `enabled: false`, `provider: null`, `debug: false`. Loading pages and using the product currently sends no requests to Plausible. This release prepares a real transport and bounded product hooks; it does not claim that behavioural data is already available, that traffic increased or that a merchant conversion occurred.

## Architecture and public configuration

Product action → `ManaScoutAnalytics.track(event, properties)` → strict validation and immutable scalar projection → configured adapter → Plausible Events API. Product controllers never call the provider directly. The existing browser API remains frozen and has no adapter setter. The Node module exposes factories for isolated tests; browser startup builds its adapter once from `assets/js/analytics-config.js`.

`assets/js/analytics.js` owns the schema, mapping, canonical-path allowlist, optional provider transport and local debug adapter. Configuration loads before that boundary on public pages; the boundary loads before its product consumers. Guide HTML dependency/navigation-source changes are necessary to support consistent pageviews and bounded attribution. They do not change titles, descriptions, opening answers, canonical URLs or editorial dates. All 63 guide snippet/opening snapshots and the complete sitemap are tested against `docs/phase61-baseline.json`.

Production enablement is deliberately explicit:

```js
window.ManaScoutAnalyticsConfig = Object.freeze({
  enabled: true,
  provider: 'plausible',
  domain: 'manascout.co.uk',
  debug: false
});
```

The browser adapter sends directly to `https://plausible.io/api/event` using the documented Events API. No provider script, API key or other secret is embedded. The canonical domain is a public site setting, not a credential. Configuration must match that domain and the real HTTPS production hostname (`manascout.co.uk` or `www.manascout.co.uk`). Unknown routes, providers, domains, non-HTTPS and local development fail closed. DNT `1` and Global Privacy Control `true` suppress this adapter as an additional courtesy. Unsupported configuration creates no requests, queues or retries.

The request uses text/plain JSON, omitted credentials, no-referrer policy and keepalive. It forwards only name, configured public domain, canonical page URL, validated properties and (when available) an external referral **origin**. It never sets an IP, forwarded-IP or custom User-Agent header. Plausible necessarily receives ordinary browser/network request information and uses its own visitor-counting model. ManaScout creates no visitor ID, profile, account or fingerprint. This is not a claim of complete anonymity or a legal consent exemption.

Provider failure, blocking, synchronous errors, rejected requests and unavailable configuration do not delay or prevent navigation, search, comparisons, generation, saves or exports. There is no application event queue, event storage, retry loop or promise awaited by product actions. Delivery is best-effort; a request may be blocked or dropped on navigation. A local adapter invocation is not proof that a dashboard accepted the event.

Primary implementation references checked for this release:

- [Plausible Events API](https://plausible.io/docs/events-api)
- [Custom event goals](https://plausible.io/docs/custom-event-goals)
- [Funnels](https://plausible.io/docs/funnel-analysis)

## Exact internal schema and provider names

All fields below are required, with no additional properties. Integers must be safe integers. Arrays, unknown names/keys, getters, inherited values, non-plain objects, symbol/non-enumerable extras and wrong types are rejected. Payload version remains `1`: existing events keep their names/properties, and the vocabulary is extended additively.

| Internal event | Plausible name | Allowed properties | Meaning |
|---|---|---|---|
| `search_success` | Search Success | `surface`: home/guide; `exact_printing`: boolean | Explicit successful shared search/autocomplete, not initial URL loading or a failed request. |
| `guide_compare_start` | Compare Started | `guide`: published slug or none; `selection_count`: integer 1–4 | First accepted selection of the current comparison on a guide. Not unique people/sessions. |
| `comparison_save` | Comparison Save | `selection_count`: 1–4; `storage`: browser/memory | Explicit save; memory fallback distinguished. |
| `comparison_share` | Comparison Share | `selection_count`: 1–4; `method`: clipboard/manual | Whole-comparison link prepared/copied; not recipient use. |
| `deck_import_complete` | Deck Import Complete | `import_format`: text/csv/json; `deck_format`: fixed format enum | Accepted draft/restore activation, not preview or file read. |
| `deck_export` | Deck Export | `export_format`: txt/csv/json; `deck_format`; `method`: download/clipboard/manual | Export prepared/initiated; not proof of disk write or manual copy. |
| `cotw_inspect` | COTW Inspect | `week`: integer 1–5200; `guide_available`: boolean; `exact_printing`: boolean | Native activation of the COTW inspect link. |
| `cotw_deck_start` | COTW Deck Start | `week`: 1–5200; `exact_printing`: boolean; `commander_seeded`: boolean | Native activation of the commander-start handoff. Seeded means intended workflow context, not an already-created deck. |
| `deck_studio_open` | Deck Studio Open | `source`: nav/guide/cotw/home/direct/import/unknown | Once per initialized document. Missing source is direct; invalid supplied source is unknown. Reload is another open, not a unique person. |
| `guide_deck_start` | Guide Deck Start | `guide`: one published guide slug; `commander_seeded`: boolean | Activation of the explicit exact-printing Build a Deck action on a guide. Its normal preview does not automatically assign a commander, so this currently reports false. |
| `deck_generation_start` | Deck Generation Start | `deck_format`; `primary_style`; `commander_seeded`: boolean; `bracket_selected`: integer 1–5 | Accepted generation attempt, including its replacement confirmation. Default chosen bracket is 2; no budget is sent. |
| `deck_generation_complete` | Deck Generation Complete | `deck_format`; `primary_style`; `commander_seeded`: boolean; `result`: success/failure/cancelled | One terminal event per in-memory job. Cancel includes a rejected replacement confirmation, user cancellation or interruption by state/selection/options/navigation changes. |
| `merchant_exit` | Merchant Exit | `merchant`: approved enum (empty); `guide`; `exact_printing`: boolean; `finish`: nonfoil/foil/etched/unknown | Reserved only. No product hook, approved merchant or provider transmission is enabled. |

The 63 published guide slugs are an explicit allowlist, checked against the app registry. `guide_deck_start` rejects `none` and unpublished names. The older comparison/merchant schema retains its existing `none` category where appropriate.

`deck_format` enum: commander, standard, pioneer, modern, legacy, vintage, pauper, oathbreaker, standard_arena, pioneer_arena, alchemy, historic, timeless, standardbrawl, brawl, gladiator.

`primary_style` enum: auto, tribal, other, artifacts, tokens, aristocrats, sacrifice, spellslinger, graveyard, lands, landfall, voltron, counters, lifegain, blink, enchantments, vehicles, treasure, clues, food, poison, discard, aggro, control, ramp, combo, value. This records the requested primary option, not a claim about the resulting deck's quality. Generated tribe names are collapsed to `tribal`; unrecognised controller options collapse to `other`. No tribe or strategy free text leaves the controller. The schema itself rejects unrestricted strings.

No optional card_count, weekly card name/UUID, budget, custom prompts or extra identity fields were added. Week number supplies the bounded COTW context. Optional save/reopen/search-panel-open events were deliberately omitted: autosaves and automatic restoration would otherwise inflate this first funnel with ambiguous interactions. Explicit library actions can be evaluated separately later.

## Data that must never be sent

Raw search strings, pasted decks, card arrays, imported text/files/names, printing/Oracle UUIDs, comparison lists/state, full query/hash URLs, emails, account IDs, localStorage/sessionStorage values, IP addresses from application code, free-text strategies and budget values are excluded. Existing product storage and catalogue requests are separate functionality; the analytics adapter does not read them. The existing future merchant helper validates an input printing UUID and projects a boolean, but production merchant tracking remains inactive.

Every custom request is independently revalidated by the Plausible adapter, even after the central tracker. Only known mapped events and their scalar properties are copied. The provider adapter rejects merchant exits unconditionally in this release; an eventual merchant phase needs its own explicitly reviewed activation.

Pageviews are emitted once per document load only for `/`, `/card/`, the 63 canonical guide paths, `/deck/`, `/contact/`, `/privacy/` and `/terms/`. The URL is constructed from the allowlisted pathname and canonical domain; raw `location.href`, search/hash and arbitrary DOM state are not sent. A search is `/`; an exact printing remains its guide URL; shared comparisons do not become new analytics pages; all Deck Studio query states are `/deck/`. No SEO canonical or sitemap is changed for analytics. History changes inside the explorer do not cause synthetic pageviews.

External referrers retain only an HTTP(S) DNS origin. Credentials, paths, query strings, fragments, internal-site referrers and IP-literal referrers are discarded. Campaign/UTM attribution is intentionally omitted to avoid transmitting arbitrary query values. Standard external source hosts, entry pages, countries and devices remain available through ordinary provider processing when collection is enabled.

## COTW and Deck Studio behaviour

Week 008 heading: **The Jellyfish Bloom**. Subtitle: **An unusual mono-blue commander. Flying Jellyfish, blink synergies and a very different way to build blue.** The Week 008 badge remains, now ocean-coloured. Primary action: **Build a deck with Cynette**; secondary: **Inspect exact printing**. The two actions sit immediately after the concise introduction, before the longer printing/context notes. Both have comfortable targets, wrapping layout and visible keyboard focus.

The primary URL retains Cynette's name, exact UUID `8810b817-7349-468b-bcca-ba0843bbc852`, `set=j25`, `number=35`, `finish=nonfoil`, plus bounded `source=cotw` and generic `intent=commander`. The existing parser and catalogue client verify the exact record. Deck Studio still consumes printing parameters into its preview and may clean them from the address bar; that does not discard the selected printing. No saved deck entry changes merely because the preview opens.

The generic arrival cue says “Build around [selected card]”. A deliberate **Start a new Commander deck** action uses the normal model, verification/eligibility checks, persistence and `canLeaveDraft()` flow. It saves the previous draft before switching, or offers the existing unsaved-work/backup confirmation if saving fails. “Keep editing” cancels the switch. A new draft has a new identity and preserves the exact nonfoil card; it does not add Cynette to the unrelated deck, silently change its format or overwrite its saved contents. An already-assigned commander can continue through the normal controls. There is no Cynette-specific decklist, generator logic or persistence model.

The COTW click handlers observe native clicks only. Enter/keyboard activation follows the same path, without an extra keydown tracker, visibility event or prevented navigation. The event describes the activated handoff, not a guaranteed completed build. Source context uses an allowlisted query value, never a free-form referrer. Header navigation is nav; guide body/static contextual links are guide; the shared exact-preview action is guide/home; COTW is cotw. Static links gain only these bounded parameters.

Shared raised-card geometry, face clipping, perspective, depth, tilt, shadow, pointer handling and reduced-motion behaviour now use **weekly-physical**. Current markup is weekly-physical + weekly-theme-ocean, with no Eldrazi class or foil/glimmer layer. Historical Week 007 fixtures explicitly use weekly-physical + weekly-theme-eldrazi; their void/foil painting stays theme-specific and is still regression-tested. Geometry and keyframes were moved, not copied into another large theme block. The current loader has no fallback set/number/name for Ulamog. Missing or mismatched runtime identity retains the static record/image/link; historical Ulamog acceptance is an explicit matching profile only. Cynette remains English paper J25 #35, Daisuke Tatsuma, nonfoil only.

## Enablement and everyday dashboard use

The owner does not need raw logs for normal reporting.

1. Create/select the `manascout.co.uk` website in the owner's Plausible account and confirm the account can receive events for that domain. No account credentials belong in this repository. Check the account's available features; current provider documentation places funnel analysis in its Business plan.
2. Before activation, update `/privacy/` to accurately state that collection is enabled and identify Plausible, broad traffic/product categories, exclusions and lack of a ManaScout profile. The committed notice currently truthfully says prepared and disabled. Do not leave that wording after enabling. Make any applicable deployment/privacy arrangements; no legal exemption is asserted here.
3. Change only the public configuration to the explicit enabled example, and deploy through the normal release process. This development task did not deploy production or create/modify the owner's dashboard.
4. In Plausible site settings → Goals, add Custom event goals with the exact provider names from the mapping table. Start with Search Success, Compare Started, Comparison Save, Comparison Share, COTW Inspect, COTW Deck Start, Deck Studio Open, Guide Deck Start, Deck Generation Start, Deck Generation Complete, Deck Import Complete and Deck Export. Do not activate a merchant integration or infer income from outbound links.
5. After real visits, open the site dashboard and date range. Use the visitors/pageviews overview, Top Pages, Sources, Locations/Countries, Devices and entry-page reports. `/deck/` groups its transient states; query-state variants should not appear. Filters can compare country/device/source without inspecting individual deck contents.
6. In Goals/Conversions, select the matching named action and inspect the bounded properties, such as generation result, deck format, source or week. Define a property-filtered success goal for Deck Generation Complete where result=success. A missing goal or blocked request can produce zero conversions; first check configuration and exact goal spelling rather than assuming nobody used the feature.
7. To disable, set enabled=false (or provider=null) and deploy. No cleanup queue or cookie migration is necessary. Update the privacy notice when the actual collection state changes.

### Funnel configuration

Use sequential funnels so unrelated intervening actions do not invalidate a normal journey. Register goals first. Provider funnels do not support arbitrary OR branches; create separate funnels for alternate paths:

- **A-save:** guide pageview goal `/card/*/` → Compare Started → Comparison Save.
- **A-share:** same guide pageview goal → Compare Started → Comparison Share.
- **B-inspect:** homepage `/` → COTW Inspect.
- **B-build:** homepage `/` → COTW Deck Start → Deck Studio Open (source=cotw) → Deck Generation Complete (result=success).
- **C-builder:** Deck Studio Open → Deck Generation Start → Deck Generation Complete (result=success) → Deck Export.
- **D-commercial, future only:** guide/comparison → exact-printing selection → Merchant Exit. There is currently no approved commercial integration and no standalone exact-selection event in this release, so do not present this future funnel as measured.

Property-filtered goals depend on the account's available functionality. If the plan lacks funnels, use named goal counts and bounded property/date filters; do not call independent counts a measured step-by-step conversion rate. Custom events can count toward the provider's usage limits. No plan was purchased or revenue setup added by this task.

## Safe local debug and tests

For local work only, set enabled=true, provider='debug', debug=true and serve on localhost/127.0.0.1. The adapter logs only validated event names and bounded properties via console.info. It never sends requests, prints raw state or keeps an event buffer. The debug adapter is rejected on the production hostname even if its flag is accidentally enabled. Restore the disabled configuration before committing. No query-string debug switch or developer traffic to the live analytics account is required.

Node tests inject adapters and mock transport to verify default no-op, exact schemas, unknown/property/getter rejection, enum/count bounds, merchant dormancy, synchronous/asynchronous failures, canonical/referrer sanitisation and event mappings. Controller tests exercise real generation success/failure/cancel and confirm new-draft/save-failure protections. Archived foil geometry/surface tests continue against their explicit fixture. New browser tests intercept every provider request under a mocked canonical origin, covering genuine keyboard/pointer activation, source, exact preview, preserved existing drafts, disabled/failing transport and mobile motion. No test request is sent to the real Plausible service.

Validation executed on 17 November 2026: Public provider collection/dashboard receipt is not verified while the configuration is disabled. T05 remains partial until real activation, schema/privacy verification and production behaviour are documented; completed-support measurement remains outside this release. Ordinary network processing, blockers, small samples, page age and provider plan limits constrain interpretation. No visitor growth, CTR uplift, payment or merchant conversion is claimed.


| Check | Actual outcome |
|---|---|
| `python tests/run-deck-studio.py` | **1,200 JavaScript cases passed, zero failed** (1,159 existing plus 34 adapter/privacy and seven controller lifecycle/draft-protection cases). Syntax and the runner validators passed. |
| Structural/catalogue validation | **70 production HTML pages**, **63 permanent guides**, **67 sitemap URLs**, zero structural outliers; ten sitemap negative-regression cases passed. |
| Phase 1 native suite | **71 checks passed**, live catalogue/foreign-printing handoff, normal product/draft behaviour, mobile/keyboard and no-JavaScript fallback. |
| Phase 2 native suite | **28 checks passed**, comparison storage/import/export/limits/failures. |
| Phase 3 native suite | **44 checks passed**, interoperability, sharing and recovery. |
| Phase 4 native suite | **157 checks passed**, seven generator profiles across 320/390/1280px. |
| Phase 5 native suite | **197 checks passed**, including an explicit once-per-document direct Studio Open assertion before the existing import-preview/cancel checks. |
| Phase 6 native suite | **240 checks passed**, plus **13** persistent selected-source checks. |
| `python tests/browser-phase61.py --no-sandbox` | **68 checks passed** at **320, 390, 768 and 1280px**. Mocked enabled/disabled/failing Plausible transport; genuine keyboard/pointer COTW actions; canonical payloads; exact nonfoil preview; preserved Modern draft; deliberate new Commander draft; guide-source attribution; touch/reduced motion; no overflow or uncaught errors. |
| Total native checks | **818 passed; zero uncaught JavaScript errors**. Exploratory/duplicate runs are excluded. |
| Preservation and whitespace | All 63 guide titles/descriptions/openings and complete sitemap bytes preserved. Core model/store/data/generator and ads.txt hashes passed; `git diff --check` passed. |

The archived foil fixture now explicitly opts into neutral geometry; its historical motion, surface and clipping assertions remain. Previous assertions that the analytics implementation itself could never contain a provider were updated to the authorized Phase 6.1 contract: disabled-by-default operation and strict mocked transport. The original schema/privacy regressions continue, and the additional runtime tests cover configured requests, failures and sensitive-state exclusion. Contact retains its no-form assertions and permits exactly the two central analytics/config dependencies. No metadata/date assertions for the CTR experiments were relaxed.

Browser reports/screenshots are outside the repository in `/workspace/work/phase61/`. Phase 6.1 tests serve local fixture files under a mocked canonical hostname and intercept every request; **no production Plausible traffic is generated**. New geometry/CTA screenshots were visually inspected at 390px. Touch uses Chromium's native emulated touch input, not physical Android/iOS hardware. The enabled transport, payloads and mapping are verified against mocks; actual account registration, provider dashboard receipt and real production visitor counts remain unverified and disabled. A stopped/stale local test server was restarted before successful legacy-browser runs; it was an execution environment issue, not a site deployment change.

## Phase 10 product events

| Internal event | Plausible name | Allowed properties |
|---|---|---|
| `printing_table_select` | Printing Table Select | `table`: search/archive, `surface`: home/guide |
| `finish_switch` | Finish Switch | `surface`: home/guide/deck |
| `printing_difference_expand` | Printing Difference Expand | `surface`: guide |

Compare Started now also includes homepage comparisons, using the existing `guide: none` value. Printing Table Select records deliberate row selection. Finish Switch records an explicit change. Printing Difference Expand records opening the guide's catalogue-based difference summary. The existing Exact Printing Select event still carries only source, language group and a bounded finish category.

Production stays disabled pending registration of `manascout.co.uk` in Plausible. Once the domain is registered, the public configuration shown above enables the prepared transport. No credential is required in the repository.
