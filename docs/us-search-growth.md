# Phase 5: US search growth and CTR review

Implementation date: **16 November 2026**. Branch: `DEVELOPMENT`. Starting commit: `63e6c3e29946c4a2d8a79da1a74a599a802dd279` (preserves independent Phase 4 revalidation). This is a development change, not a recorded production release. Release and first-full-post-release-day remain `null` in [the machine-readable baseline](us-search-baseline.json).

## Observed evidence — supplied GSC, not a new account audit

The owner supplied the following Search Console figures in the Phase 5 request. No live GSC export was retrieved during implementation. Rounded figures are preserved; missing values are unknown, not zero. Query rows may be suppressed/anonymised, so exposed query sums are not property totals.

| Web period | Scope | Impressions | Clicks | CTR | Average position |
|---|---|---:|---:|---:|---:|
| 17 Oct–15 Nov 2026 | United States | 706 | 8 | 1.13% | 7.55 |
| 17 Oct–15 Nov 2026 | United Kingdom | 346 | 15 | 4.34% | Not supplied |
| 27 Oct–5 Nov 2026 | Overall | 493 | 10 | 2.03% | 12.90 |
| 6–15 Nov 2026 | Overall | 1,061 | 12 | 1.13% | 9.83 |
| 27 Oct–5 Nov 2026 | United States | 168 | 3 | 1.79% | 9.51 |
| 6–15 Nov 2026 | United States | 484 | 5 | 1.03% | 6.68 |

US image search: approximately 37 impressions, zero clicks, average position approximately 43.6. Keep separate from Web. The supplied report identifies the US as the largest impression market. Rising visibility and improving aggregate position alongside lower CTR are observations; they do not establish that snippets caused the shortfall. Five recent US clicks is a small sample.

### Stable priority cohort and query evidence

The five canonical URLs in the baseline's `guides.*.sitemap.url` are the fixed cohort. They are global pages, with no regional duplicates or hreflang.

| Guide | Exposed page evidence | Observed US query intent |
|---|---|---|
| Mr. Spock, Science Officer | Approximately 128 **US** impressions; position ~5.3; page clicks not supplied | `mr spock science officer mtg`: ~119 impressions, position ~5.34; query clicks not supplied |
| Sol Ring | 130 **overall** impressions; 0 clicks; position ~6.78 | `sol ring first print`, `when was sol ring first printed`, `sol ring printings` |
| Arcane Signet | 58 **overall** impressions; position ~7.88; clicks not supplied | `arcane signet first printing`, `when was arcane signet first printed` |
| Rhystic Study | 157 **overall** impressions; 3 clicks; position ~6.87 | `rhystic study printings`, `rhystic study prints`, `when was rhystic study first printed` |
| Deflecting Swat | 55 **overall** impressions; 0 clicks; position ~5.65 | `can deflecting swat counter a board wipe`: ~6 US impressions, position ~7; query clicks not supplied |

Do not treat the four overall page totals as US page totals. The supplied prompt describes poor exposed Spock CTR but omits its clicks; no numeric Spock CTR is inferred.

Additional observed clusters: Mana Crypt first printing; Black Lotus versions/original art; The One Ring versions/foil/full art; Demonic Tutor art/original art; Counterspell artwork; Smothering Tithe art; Teferi's Protection art; Cyclonic Rift foil; Edgar Markov foil; Orcish Bowmasters full art. These support canonical-guide coverage, not separate keyword pages. Counts were not supplied for these clusters.

## Search-presentation audit and implementation

Inspected the baseline title, description, H1, opening, social metadata, Article/WebPage graph, canonical, first-printing answer, static image, jump navigation, explorer, and contextual links on the five priority and eleven secondary guides. Existing Phase 1 openings already answer many first-printing questions. This is a focused improvement to presentation and route clarity, not a claim that the old guides lacked researched answers.

### Before and after — five material edits

**mr-spock-science-officer**

- Previous title: Mr. Spock, Science Officer MTG Printings & Foils | ManaScout
- New title (60 characters): Mr. Spock, Science Officer MTG — Printings & Art | ManaScout
- Previous description: Compare Mr. Spock, Science Officer’s first TRK #74 printing, Mirror, Mirror scene, Classic Enterprise art, surge foil #535 and signed headliner #1702.
- New description (149 characters): Explore Mr. Spock, Science Officer as an MTG card. Compare Star Trek TRK #74 with alternative artwork, collector numbers and available foil finishes.

**sol-ring**

- Previous title: Sol Ring Printings, Artwork & Versions | ManaScout
- New title (50 characters): Sol Ring First Printing & MTG Versions | ManaScout
- Previous description: Compare Sol Ring’s Alpha original, Mark Tedin and Mark Poole artwork, Commander reprints, borderless editions, foils and Middle-earth collector versions.
- New description (152 characters): Sol Ring first appeared in Alpha in 1993. Identify the original, compare later artwork and foil versions, then inspect exact editions by set and number.

**arcane-signet**

- Previous title: Arcane Signet First Printing, Artwork & Versions | ManaScout
- New title (55 characters): Arcane Signet First Printing & MTG Versions | ManaScout
- Previous description: When was Arcane Signet first printed? Identify the 2019 Brawl original, later artwork, extended art, borderless versions and verified foil treatments.
- New description (136 characters): Arcane Signet debuted in 2019's Throne of Eldraine Brawl decks. Identify ELD #331 and compare later artwork, editions and foil finishes.

**rhystic-study**

- Previous title: Rhystic Study Printings, Artwork & Foil Versions | ManaScout
- New title (52 characters): Rhystic Study MTG Printings, Art & Foils | ManaScout
- Previous description: Identify Rhystic Study’s Prophecy common, original foil, Judge and Jumpstart art, anime and confetti editions by set, artist and collector number.
- New description (154 characters): Find Rhystic Study's first printing, Prophecy PCY #45 from 2000. Compare original art, later versions and foil finishes by exact set and collector number.

**deflecting-swat**

- Previous title: Deflecting Swat Printings, First Edition & Foil Artwork | ManaScout
- New title (57 characters): Deflecting Swat MTG — Board Wipes & Printings | ManaScout
- Previous description: Compare Deflecting Swat’s nonfoil Commander 2020 original, traditional and etched foils, Staples borderless art, Ejsing Secret Lair and Avatar version.
- New description (155 characters): Deflecting Swat redirects targets; it does not counter spells. Learn when a board wipe can be redirected, then compare MTG artwork, printings and finishes.

Spock's old title already identified MTG, but the description led with catalogue codes and specialist treatment names. The new description leads with the card identity and useful comparison actions, retaining detailed scene/showcase/headliner research below. Its old opening still called 13 November a scheduled release, and a visible deck paragraph said not yet Commander-legal. The opening now states the release date; a dated 16 November check of exact TRK #74 records Commander as legal. The 4 November legality paragraph is retained in clearly dated historical details, without extrapolating legality to every format.

Sol Ring's old opening already answered Alpha/August 1993. Its broad title missed the explicit first-printing intent. The new title foregrounds that intent; the opening retains Mark Tedin, uncommon and nonfoil facts, explains that LEA #269 is a database identifier rather than a number printed on Alpha cards, and links directly to the verified Alpha UUID with `finish=nonfoil`. The initial static image remains its honestly captioned CMM #410 reference; it is not relabelled as Alpha. The live selection updates image/caption/source together.

Arcane Signet already had first-printing wording, but its old description was a question followed by a broad feature list. The new description answers 2019/Brawl directly. The opening explicitly names 4 October 2019, ELD #331, Dan Murayama Scott, nonfoil-only availability and the distinction from regular Draft Boosters. Later foil treatments remain separate.

Rhystic Study's former snippet concentrated on a long list of special editions. It now leads with Prophecy PCY #45 (2000), art and finish comparison. The opening retains 5 June 2000, common rarity, Terese Nielsen and original nonfoil/traditional-foil availability. Existing detailed printing rows, art history and sources stay intact.

Swat's collector-only proposition did not surface the observed board-wipe question early. One concise question block now explains that Swat changes legal targets and does not counter spells/abilities. It can target an untargeted wipe but has no targets to redirect; Wrath of God still resolves normally. Targeted parts can be redirected only to legal targets, without changing target count or removing untargeted instructions. Overloaded Cyclonic Rift has no targets. The answer links to the existing Rift guide and official Commander 2020 targeting rulings. This is one demand-supported answer, not a general rules wiki or FAQ schema.

All five keep the card-name H1 and original researched sections, citations, printing tables and static references. One existing explorer jump link becomes the visually restrained **Compare printings** action; the explorer heading accepts native fragment focus (`tabindex=-1`). No new competing toolbar. Ordinary/OG/Twitter metadata and Article/WebPage descriptions agree. Existing editorial schema remains; no Product, Offer, ratings, availability, prices or FAQPage additions.

### Secondary audit — retain existing search presentation

No secondary title/description or researched text was rewritten. Their existing snippets already state concrete printing, art or finish benefits. They receive only the shared no-op script dependency and consumer cache-version update.

| Page | Existing title | Finding / decision |
|---|---|---|
| the-one-ring | The One Ring Printings, Artwork & Foil Versions \| ManaScout | Versions/foil demand already matches original, extended art, scene, scroll/poster and serialized distinctions. Retain; do not imply every treatment is simply “full art”. |
| demonic-tutor | Demonic Tutor Printings, Alpha Original & Foil Artwork \| ManaScout | Alpha original and foil artwork already explicit; opening distinguishes LEA #104 from later #105. Retain art/original intent. |
| cyclonic-rift | Cyclonic Rift Printings: First Release, Art & Foils \| ManaScout | First release, art and foils explicit; existing precise treatment list supports foil demand. Retain; linked contextually from Swat. |
| esper-sentinel | Esper Sentinel Printings: Sketch, Retro & Foils \| ManaScout | Specific sketch/retro/foil proposition and MH2 identity already clear. No supplied new query gap justifies a rewrite. |
| jeweled-lotus | Jeweled Lotus Printings, First Edition & Foil Guide \| ManaScout | First edition, foil and current Commander-ban explanation already present. Preserve legality caution, avoid a buying proposition. |
| lightning-bolt | Lightning Bolt Printings, Reprints & First Printing \| ManaScout | First printing and major art eras already clear; opening answers Alpha 1993. Retain researched breadth. |
| mana-vault | Mana Vault Printings: Alpha, Invention & Foil Art \| ManaScout | Alpha/Invention/foil wording and database-number explanation are useful and specific. Retain. |
| mystic-remora | Mystic Remora Printings: Ice Age, Foils & Art \| ManaScout | Ice Age original versus later retro-frame art already explained. Retain. |
| orcish-bowmasters | Orcish Bowmasters Printings: Artwork, Frames & Foils \| ManaScout | Artwork/frames/foils and borderless/scroll editions already match treatment demand. Avoid claiming all variants or conflating full art with finish. |
| mox-opal | Mox Opal Printings, First Edition & Foil Guide \| ManaScout | First edition and foil guide backed by SOM #179 and later specific finishes. No demonstrated snippet gap. |
| edgar-markov | Edgar Markov Printings, First Edition & Foil Guide \| ManaScout | Description starts with foil-only Commander 2017 debut and distinguishes later treatments. Already aligned with foil demand. |

The priority pages retain meaningful alt text, 488×680 dimensions, source links and graceful image failure. Image traffic is not the focus at position ~43.6, and no image-growth claim is made. Global canonicals, 59-guide registry, directory and URL inventory are unchanged. Only five sitemap `lastmod` values become 16 November, reflecting actual content/meta edits; older research dates are retained. Shared script loading alone does not trigger mass lastmod updates. AdSense configuration, ads.txt, Contact and Terms are unchanged. Privacy now accurately describes the inactive interface.

## Hypotheses — not demonstrated outcomes

| Hypothesis | Evidence motivating it | What would support/reject it |
|---|---|---|
| Clearer card identity improves relevance for Spock visitors | Concentrated US MTG query impressions; stale pre-release wording | Same-page/query/device CTR with comparable positions, plus comparison starts once measurement is approved |
| Earlier first-printing proposition helps Sol/Arcane/Rhystic searchers | Exposed original/printing queries; Sol zero exposed page clicks | Cohort and per-page clicks/CTR, holding ranking/query mix in view |
| Precise Swat answer earns relevant visits and helps them | Six exposed US board-wipe impressions | Query relevance/CTR and useful collector journey; small counts may remain inconclusive |
| One clear comparison action helps product use | Exact-printing comparison is the differentiator | Accepted compare starts, saves and shares with an approved destination later |

Google may rewrite titles/descriptions. Better answers can also satisfy a query in the SERP without a visit. Rankings, SERP features, page age, release interest, competition and query mix may dominate CTR. These changes address evidenced presentation gaps; they cannot promise a drastic click increase, rankings, AdSense approval or earnings.

## Privacy-safe event contract, version 1

`assets/js/analytics.js` exposes frozen `ManaScoutAnalytics.track(event, properties)`, `.guide()` and `.trackMerchantExit(input)`. **Production is a no-op**: no destination, provider, queue, cookies, local/session storage, timestamps, identifiers, event network requests or automatic pageview collection. This creates validated hooks, not a functioning analytics report. Existing local deck/comparison saves remain product functionality, not event storage. Existing third-party card/image/AdSense behaviour is not an analytics destination.

| Event | Exact allowed properties | Trigger / meaning |
|---|---|---|
| `search_success` | `surface`: home/guide; `exact_printing`: boolean | Successful explicit shared-form/autocomplete load only; not initial/direct URL, random, failed/stale requests. The separate guide header navigates to home and is not attributed across that navigation. |
| `guide_compare_start` | `guide`: 59 published slugs or none; `selection_count`: integer 1–4 | First accepted user addition in a guide's current comparison. No duplicate, failed add, shared-link open or saved-library reopen. Can occur again after clearing a comparison; not unique people/sessions. |
| `comparison_save` | `selection_count`: 1–4; `storage`: browser/memory | Explicit save accepted; memory fallback distinguished. Not rename/delete/import. |
| `comparison_share` | `selection_count`: 1–4; `method`: clipboard/manual | Whole-comparison link prepared/copied. Not proof of sending, recipient visit or conversion; individual printing links excluded. |
| `deck_import_complete` | `import_format`: text/csv/json; `deck_format`: fixed 16-profile enum | Accepted new draft or successful JSON restore activation; not file read, preview, cancel or invalid import. Memory-only active drafts count as completion. |
| `deck_export` | `export_format`: txt/csv/json; `deck_format`: fixed enum; `method`: download/clipboard/manual | Export prepared/download initiated or copy/manual fallback presented. Not proof of disk write or manual copy. Common JSON callback emits once. |
| `merchant_exit` | `merchant`: explicit approved enum (currently empty); `guide`; `exact_printing`: boolean; `finish`: nonfoil/foil/etched/unknown | Reserved, inactive. No retailer hooks, integration, affiliate IDs, links, API or fake events. |

Deck format enum: commander, standard, pioneer, modern, legacy, vintage, pauper, oathbreaker, standard_arena, pioneer_arena, alchemy, historic, timeless, standardbrawl, brawl, gladiator. Guide enum is tested against the authoritative 59-guide registry. No free-form slug/event/property strings. All required fields must be present; unknown keys (including non-enumerable/symbol extras), wrong types/counts/enums, accessors, arrays and non-plain objects are rejected. Only allowlisted scalars are copied into an immutable payload `{version:1,event,properties}`. Exceptions and rejected adapter promises do not break the UI.

The future merchant helper accepts an optional UUID in `printingId`, validates it and projects only a boolean; neither UUID nor URL leaves the abstraction. No production merchants or adapters are configured. The Node/test factory supports an explicit adapter and merchant allowlist for verification/future implementation; the browser default has no adapter setter. Any future destination requires a separate implementation, consent/privacy review as appropriate, policy update and verification. Never pass raw names, pasted decklists, filenames/content, unrestricted search terms, URLs/state, prices, email, IP or identity. Never use an existing outbound retailer link as evidence of revenue or partner status.

## Repeatable GSC landing-page review

1. In the same verified Search Console property, open Performance → Search results, Search type **Web**, country **United States**, complete dates. Use the Pages tab and the five exact canonical URLs in `us-search-baseline.json`; report each page and the fixed cohort separately from the whole property. Keep an export of filters, dates and retrieval date. Do not silently include new guides.
2. Export clicks, impressions, CTR and average position by date/page, then examine query and device breakdowns with the same filters. A Search Analytics API equivalent uses `type: web`, country filter `equals: usa`, page filter for the five exact URLs, dimensions date/page (query/device in separate diagnostic extracts), and pagination. Do not expose credentials or place raw user data in this repo.
3. Cohort CTR = **sum(clicks) / sum(impressions) × 100**, never the unweighted mean of row CTR. Use GSC's aggregate position for the same filters; only use impression-weighted row positions when the row set covers that cohort, documenting aggregation differences. Query-suppressed rows are diagnostic, not a substitute for page/property totals. Do not combine page totals and property totals as though their aggregation is identical.
4. Record actual production release time/zone in the baseline. Start on the first full GSC reporting day after deployment, excluding partial release days and incomplete recent data. GSC daily reporting uses its reporting time zone (typically Pacific Time), not the local development clock. Allow for processing delays. Development commit time alone is not release time.
5. Review after 7, 14 and 28 complete reporting days. Maintain 7-day and 14-day rolling US-only same-page views. Re-export matching pre-release 7/14-day windows and query/device/position detail; the supplied 6–15 November baseline is **10 days**, not an invented 7/14-day baseline. Retain it as contextual evidence and compare equal-length windows where available.
6. At each review, log the dates, release, per-page/cohort counts, query mix, device, position movement, page age and whether Google actually displays the new snippet. Spock's 13 November product release is a strong confounder. Separate unchanged secondary pages as descriptive context, not a randomised control. Mark outcomes supported, unsupported or inconclusive; do not infer causation from a rise or fall alone.

If (and only if) publication occurs on 16 November in GSC's reporting day, an illustrative first full day is 17 November: 7 days = 17–23 November; 14 days = 17–30 November; 28 days = 17 November–14 December. These are conditional examples, **not scheduled or completed measurements**. Update after the actual release. No background reporting job or dashboard has been created.

Use this release log template:

| Actual release / first full day | Review dates / filters | Cohort counts / CTR / position | Query / device / age changes | Hypothesis outcome / next action |
|---|---|---|---|---|
| Pending production release | Pending complete data | Not measured | Not measured | Unproven |

## Validation and remaining scope

Automated and native results are recorded below after execution. Native catalogue and image fixtures are explicitly synthetic display tests; they do not prove live service uptime, physical foil appearance, ranking or Google snippet adoption. Actual catalogue checks for Spock, Swat and Sol's Alpha record and the official rules source are recorded in the baseline; older researched rows remain sourced in their original ledgers.

T05 is **partially complete**: bounded core events and no-op hooks implemented; approved collection and completed-support measurement remain outside this phase. No support/payment completion is invented. G05 is **partially complete**: stable cohort, baseline, hypotheses and review procedure exist; actual post-release search outcomes and returning-use analysis are pending. T18 stays open; no merchant partnership, affiliate integration or revenue is claimed.

### Executed validation (16 November 2026)

- `python tests/run-deck-studio.py`: **1,139 JavaScript cases, 1,139 passed, zero failed** (1,092 existing plus 47 new Phase 5 cases). JavaScript syntax checks and the runner's structural/catalogue validators passed. Historical tests retain researched facts and now overlay only the five documented metadata/date revisions; the renamed comparison action is checked as the same accessible destination. Final cache-version assertions and the 66-page/59-guide/63-URL validators were rerun after the HTML dependency update.
- `python tests/browser-phase1.py --no-sandbox --ignore-https-errors`: **71 checks passed**, including live catalogue/foreign-language printing and finish handoff, saves/reload, keyboard, no-JavaScript and viewport checks.
- `python tests/browser-phase2.py`: **28 checks passed**, including exact comparisons, duplicate/limit handling, persistence/import, restricted storage and failures.
- `python tests/browser-phase3.py --no-sandbox --ignore-https-errors`: **44 checks passed**, including imports/exports, sharing, malformed/unavailable identities and recovery.
- `python tests/browser-phase4.py --no-sandbox --ignore-https-errors`: **157 checks passed** across seven generator profiles and three widths, including 100-card generation, support summaries, save/reload, JSON export and keyboard focus.
- `python tests/browser-phase5.py --no-sandbox --ignore-https-errors`: **196 checks passed**. All five guides at **320, 390 and 1280px**: early answer/H1, keyboard comparison fragment focus, image load and actual aborted-image fallback, no page overflow, two exact selections, bounded start/save/share triggers. Additional explicit/failed searches, import preview/cancel/accept, text/CSV/JSON exports and restore, manual-copy fallback, restricted saves and dormant merchant checks passed.
- Total native browser checks: **496 passed; no uncaught JavaScript errors** in any suite. Phase 5 catalogue/image fixtures are synthetic and test layout/behaviour, not real artwork or service availability. Phase 1 separately exercised live services. The environment-specific Chromium/proxy flags are test-only; production transport settings are unchanged.
- `git diff --check` passed. No new canonical pages, regional URLs, providers or external/merchant destinations. A recorded pre-change external-destination inventory and full sitemap URL/date map guard these invariants.

Browser reports and screenshots were generated outside the repository under `/workspace/work/phase5/`; they are execution artifacts, not added site assets. These checks do not establish future CTR, traffic, AdSense status or earnings.
