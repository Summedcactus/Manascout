# ManaScout growth, revenue and ownership roadmap

Updated: 12 November 2026 (Europe/London). This is the durable record of the owner's priorities and the November audit. It is a plan, not a claim that implementation or commercial setup is complete.

## Owner's direction

Build a useful, uncluttered asset controlled by its owner, capable of earning through more than occasional card purchases. Preserve the printing/collector identity, existing guides and URLs, search, Deck Studio, Card of the Week and foil effects. Avoid an AI content farm, clutter, mass-produced articles, fabricated claims, unnecessary subscriptions and endless maintenance-heavy features. A large update should improve whole-site outcomes rather than add disconnected features.

Work on DEVELOPMENT under AGENTS.md. No automatic PR, merge, main change, hosting change or publication. Preserve existing data and unrelated work. No outbound marketing messages without explicit authorization.

## Evidence and limits

Audit baseline: DEVELOPMENT 3cd9b4b49c03e5416d8816bd9fda03323b073d5e; main c2c70a514e736385e455bf0797d40bce791356e1.

- Windsor GSC access is limited to the last 30 days on the current trial. The verified reporting window was 14 October–9 November 2026, not the owner's entire three-month history.
- Web search: 19 clicks, 1,217 property-level impressions, 1.56% CTR, average position 11.8. Ten clicks were to the homepage.
- Page-level report: 51 individual card guides had impressions and nine clicks. Median guide impressions: 13; 35 guides had fewer than 20; 44 had no clicks. Many guides are recent. This is inadequate evidence to condemn each title or claim every guide fails.
- Page aggregation can count impressions differently from property aggregation. Do not sum page impressions into the property total.
- Query report exposed only 337 impressions and no clicks, versus 1,217 property impressions/19 clicks. Anonymized queries prevent reliable branded/nonbranded and buyer-intent conclusions.
- Image search: 80 impressions, zero clicks, average position 32.5. This is an opportunity to investigate, not evidence that adding images guarantees traffic.
- Pages receiving impressions increased from six on 14–20 October to 53 on 4–9 November. This is discovery growth from a small base, not established product demand.
- All 63 sitemap URLs returned 200. They are reachable within two clicks, with unique titles/descriptions and matching canonicals. No orphan sitemap URLs were found. Google fetched the 63-URL sitemap on 10 November with zero reported errors.
- These checks do not establish every page's indexing status, Google-selected canonical, backlink profile, manual-action status or real-user Core Web Vitals. Those remain unverified.
- Forty sitemap pages contain no static img element; live images can still load after JavaScript. Browser tests loaded sampled card images and explorers.
- Arbitrary card searches retain homepage q/printing/finish parameters and canonicalize to /. Searching a curated card can also use this utility URL rather than its editorial guide.
- Search, exact-printing handoff, adding cards, local autosave, reopening and JSON backup worked in a 390px mobile browser test. A Krenko Commander generation completed with 100 cards in about ten seconds. This does not certify all formats, strategic quality or power brackets.
- Confirmed classifier defect: production deck-identity.js classifies Underworld Breach as landPayoff because its regex matches "land card in your graveyard" inside "nonland card in your graveyard".
- A generated Goblin sample included spell-trigger payoffs such as Fiery Inscription and Guttersnipe with five instants/sorceries. Review dependency/enabler density rather than accepting role counts as strategy proof.
- Deck persistence is browser-local. Standard decklist import/export and public deck sharing were not implemented in the audited surface.
- No visitor analytics or verified ManaScout-specific commission tracking/paid checkout was found. Ordinary Cardmarket links do not establish an earning arrangement.
- AdSense publisher meta and ads.txt are live and agree. No ad-serving script was found on sampled pages. Private review status/setup tasks are unavailable; do not invent the reason for delay.
- HTTP returned 200 without an HTTPS redirect through the audit connection; www HTTPS redirected to the apex. Verify enforce-HTTPS settings. HTTP and HTTPS localStorage are separate origins, so any existing HTTP drafts need an export/recovery path before a redirect change.
- Search surfaced another MTG service using ManaScout at mtg-manascout.seoultra.id. Relationship/ownership and impact are unverified. Investigate brand confusion before expanding branding investment.
- Recent history contains repeated presentation changes and feature expansion. The missing counterpart is outcome measurement; commit volume and passing regression tests do not establish growth.

## Product direction

Make ManaScout especially useful for identifying, visually comparing and choosing exact physical printings, then preserving those choices in a shortlist or deck.

Primary journey: find card -> compare edition/art/finish -> choose exact printing -> save/export/share or visit a merchant.

Keep the broad search and existing deck builder. Treat them as parts of that journey; avoid competing feature-for-feature with every large deck platform. Distinctive value must be demonstrated in the workflow, not asserted in marketing copy.

## Design and editorial rules for the update

- One main task/action per screen. Suggested primary navigation: Search, Guides, Deck Studio. Support/About can live in the footer.
- Keep existing palette, recognizable presentation and functioning features. Preserve Card of the Week; avoid making decorative content obstruct the user's task.
- Show helpful images and comparison facts early. Put lengthy history, sources, expert options and secondary controls lower down or behind accessible disclosure.
- Consolidate duplicate guide navigation. Ensure long names, controls, dialogs and headers work at 390px and with keyboards.
- A comparison contains 2–4 explicitly selected printings; on mobile present legible cards/tabs rather than a tiny wide spreadsheet.
- Distinguish artwork, set/collector identity, language and finish. Label catalogue scans/simulated foil honestly.
- Missing prices are unknown. Show source, currency and freshness; a converted reference price is not an executable delivered shop quote.
- No AI-written filler, chat assistant by default, fake reviews, unverified recommendations, bulk keyword pages, popups, notification nags or mandatory email gates.
- Automate repetitive maintenance, templates, link checking and metadata consistency. Human-review published explanations and unusual card facts.
- New editorial pages must have an evidenced task, a meaningful original contribution, sources and a review date. Word count is not an acceptance criterion.
- Preserve useful existing content; reorganize rather than delete it indiscriminately.
- At most one restrained monetization placement per view as an initial design constraint; never obscure the task or push the answer below ads.

## Patterns worth borrowing

1. Archidekt: standard imports/exports, direct sharing and progressive access to advanced controls. Borrow interoperability and clear workflows, not its entire feature catalogue.
2. Archidekt's support model: direct recurring support/ad removal alongside merchant income. It demonstrates that revenue need not depend on a card purchase.
3. Deckbox: free core collection use, saved work and convenience/history as repeat-use value. Do not assume its premium permissions or economics automatically apply to ManaScout.
4. Comparison-product pattern: stable exact-item identity, visible differences, shortlist and a clear next action. Implement a focused printing comparison instead of adding more prose.
5. Successful free utilities: useful output before signup/payment, bookmarks/deep links and portable data. Keep basic discovery, guides and exports useful without registration.

Sources:
- https://archidekt.com/faq
- https://archidekt.com/support-us
- https://deckbox.org/premium

## Revenue options, ranked for this asset

### First: voluntary one-off and recurring support

A quiet Support ManaScout page with optional one-off support and a small monthly contribution is the simplest revenue path independent of card purchases. Keep fan content accessible to everyone. Do not promise monthly exclusive writing, manual deck reviews, Discord access or other recurring labour merely to justify support. Ad-free support is a possible benefit once ads and reliable entitlements actually exist.

A real owner-controlled payment account/link is required. Do not invent a payment address or show an active payment button without a working destination. Track gross support, fees, refunds and net receipts separately. A one-pound payment is not necessarily one pound net.

### Second: restrained advertising

Finish the real AdSense account/setup checks, implementation, privacy disclosures and applicable consent setup. Prepare reserved placements to prevent layout jumps. Avoid crowded Auto ads across the task flow. Do not assume approval or estimate the actual RPM before data exists.

### Third: direct sponsorship

Offer a single clearly labelled sponsor placement or sponsored resource/tool placement to a relevant retailer/accessory business once real audience/use figures can be supplied. Fixed-period sponsorship does not require readers to purchase cards. Early sales, renewal and administration are active work; it is not immediately passive. Editorial recommendations and default ranking must remain independent of sponsor payment. No invented reach, customers or sponsor logos.

### Fourth: accessories and other relevant partner offers

Sleeves, binders and storage can diversify merchants/products if real agreements are available, but remain purchase-dependent affiliate income. These are supplementary, not the answer to passive revenue alone. Do not undo prior marketplace restrictions or add vendors without checking the owner's existing constraints.

### Later: separately monetizable original software

Potentially valuable convenience includes managing large collections, reliable synchronization, inventory reconciliation and reusable generic CSV/import/printing-selection software. Establish user demand and the rights/hosting position before charging. Do not build an expensive account/subscription backend just because other sites have one.

Licensing generic software authored/controlled by the owner to businesses could be a different business model, with sales and support obligations. It does not grant rights to resell Wizards artwork, rules, Scryfall data or other third-party materials.

### Avoid as the default plan

Paid card-art downloads, gated fan-content guides, selling repackaged third-party data, physical stock/fulfilment, daily AI news, labour-intensive consulting or promises of effortless guaranteed income. A paid identification service was previously suggested without demand validation and is not the recommended passive model.

## Ownership, rights and hosting

The goal is control of domain, repository, original software/editorial work, deployment, payment accounts and a consented/exportable audience relationship. No claim is made that the owner owns Wizards imagery/rules, third-party catalogue material, trademarks or service infrastructure. Retain source/license attribution. Investigate the ManaScout naming collision before assuming exclusive brand rights.

Wizards' Fan Content Policy permits sponsorship, advertising and donations while restricting paid access to fan content using its IP. Do not gate guides/artwork or sell downloads relying on that policy. Premium software and a future asset sale need a specific rights assessment; another site's subscriptions are not evidence of permission for this project.

GitHub Pages' terms restrict using it primarily for an online business, commercial transactions or commercial SaaS. Assess and choose commercially suitable portable hosting before turning ManaScout into that kind of service. This is not a claim that the current informational site is already in breach. Keep repository workflow independent from hosting so a move preserves all URLs.

Keep private credentials out of the repository and browser code. Use a real payment processor for payments. Preserve redirects, canonical host, search verification, publisher identifiers and deep links in any migration.

Sources:
- https://company.wizards.com/en/legal/fancontentpolicy
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee

## Today's implementation queue

Phase 1 implementation is committed on DEVELOPMENT; publication remains manual. Checked items below are implemented for this phase. All other items remain open. Work as one coordinated release with reviewable increments. This is an ordered queue, not a promise that all 22 items fit into one day. The first release should concentrate on correctness, shared guide usability, useful comparisons, portable output and measurement; payment activation, hosting changes and private-account checks depend on real owner setup. Leave unimplemented features out of the public interface.

### Foundation and truth

- [x] T01 Fix the land/nonland classifier defect and audit related semantic matches. Add meaningful positive/negative regression cases using real Oracle text. Validate all affected role and generation checks.
- [ ] T02 Audit generator payoff/enabler compatibility with representative commanders. Assess output strategy and draw/ramp/interaction; preserve honest bracket/price qualifications. Do not market role counts as proof of deck quality.
- [ ] T03 Verify HTTP/HTTPS behavior and plan draft recovery before HTTPS enforcement. Hosting changes remain manual under repository rules.
- [ ] T04 Obtain missing indexing/Google-selected-canonical and private AdSense evidence through available authorized access. Keep unknowns recorded; no paid Windsor upgrade is required merely to provide exports from native GSC.
- [ ] T05 Establish a small privacy-appropriate event schema: successful search, compare selection, saved shortlist, deck import/export, merchant exit and completed support. Do not collect raw deck contents, emails or unrestricted search strings by default.
- [ ] T06 Add an About/methodology explanation: real operator, what data comes from where, recommendation criteria, price limitations and correction route. Never invent personal experience or credentials.

### Whole-site usefulness and presentation

- [x] T07 Reorganize shared guide presentation around task/visual answer first, comparison next, optional history and sources below. Consolidate duplicate navigation and repair clipped mobile headers. Preserve existing guides, URLs, facts and styling identity.
- [x] T08 Add verified static representative references/fallbacks where missing. Respect image rights, useful alt text, dimensions, loading priority and error behavior. Do not label this a guaranteed CTR improvement.
- [x] T09 Add 2–4-printing comparison with exact identity, image, artist/frame, physical finishes and sourced reference prices. Clearly show differences and selected versions; support readable mobile output.
- [ ] T10 Separate edition/art variants from multilingual catalogue records in counts and default views. Expose language choice without hiding a specifically linked exact printing.
- [x] T11 Improve internal routing: known curated cards link to their guide while preserving printing/finish context; arbitrary utility results remain deliberate search utilities. Do not index every query/filter permutation or remove canonicals indiscriminately.
- [x] T12 Add a minimal local shortlist/saved comparison and robust export. Reuse existing persistence where practical. No account requirement for the useful core.

### Interoperability and revenue readiness

- [ ] T13 Add explicitly supported text/CSV deck import and export alongside existing JSON recovery. Preview matches; preserve set/number/finish where supplied; flag ambiguity. Never silently substitute an edition or overwrite an existing deck.
- [ ] T14 Provide useful sharing of selected printings/comparisons. Decide separately whether public deck storage is justified; do not imply browser-local decks are already publicly shareable.
- [ ] T15 Add a restrained Support page once an actual owner-controlled payment destination exists. Offer voluntary one-off/monthly support; keep fan content free. No fake checkout or placeholder contribution counters.
- [ ] T16 Prepare limited ad placements and accurate privacy/consent implementation tied to real AdSense setup. Verify approval/status separately; avoid activating a cluttered ad layout.
- [ ] T17 Prepare a truthful sponsor offering with actual audience metrics when available, a single labelled placement and written boundaries on editorial independence. Do not contact prospects without authorization.
- [ ] T18 Record actual partner terms and tracking before treating Cardmarket or other outbound links as income-producing. Preserve the owner's vendor preferences.

### Release and ownership

- [ ] T19 Record domain/hosting/payment/analytics/data dependencies and recurring costs in a private-safe ownership inventory; verify owner access without exposing secrets.
- [ ] T20 Assess commercially appropriate hosting and migration/rollback requirements, retaining all URLs and data backups. Choose after cost/terms comparison; no automatic DNS changes.
- [ ] T21 Run required repository validation and focused mobile/desktop browser journeys, including API failure, unresolved import, browser storage restrictions and export recovery. Check keyboard access and reduced motion.
- [ ] T22 Preserve DEVELOPMENT and unrelated work, provide a concrete change summary, and leave publication/PR/merge to the owner's established manual process.

Additional evidence references:
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://support.google.com/webmasters/answer/7440203?hl=en
- https://support.google.com/adsense/answer/12170222?hl=en

## Follow-on growth queue

- [ ] G01 Research task-led topics and competing results before creating substantial edition/finish/identification resources. Connect them to existing guides; do not mass-produce keyword variants.
- [ ] G02 Test task completion with a small number of real collectors; record confusion and successful outcomes. Small usability samples are directional, not conversion forecasts.
- [ ] G03 Create a useful demonstration/comparison with a deep link for relevant communities, creators or retailers. Respect community rules and disclose ownership. No unsolicited posting, fabricated recommendations or purchased links.
- [ ] G04 Investigate the other ManaScout service and clarify brand/domain identity; do not assume infringement or rename without evidence.
- [ ] G05 Review search in comparable page cohorts, device/country/position and page age. Review feature completion and returning use. Log each release hypothesis and outcome.
- [ ] G06 Evaluate optional recurring support and sponsorship using net receipts and actual retention. A supporter is not the same as a card purchaser; a checkout visit is not revenue.
- [ ] G07 Evaluate paid software convenience only after observed repeat demand, maintenance cost estimates and rights/hosting review.
- [ ] G08 Add scheduled source/freshness checks and broken-link/browser smoke checks. Alert for material failures rather than rewriting every guide weekly.

## Maintenance and economics

Aim for low-maintenance recurring value, not zero maintenance. Prefer evergreen, source-backed resources and stable tools. Avoid daily content commitments, open-ended moderation, high-cost AI calls and features needing constant manual pricing.

Maintain a simple ledger: revenue by source minus processor/platform fees, refunds, hosting, data/email/analytics costs and maintenance time. Use current provider terms. Do not add recurring services whose cost exceeds demonstrated utility.

Illustrations only, not forecasts: 50 supporters at GBP 2/month produce GBP 100/month gross; at a hypothetical GBP 5 page RPM, GBP 100 requires 20,000 monetized pageviews. Neither rate, audience size nor conversion is established for ManaScout.

The asset becomes more durable when users can complete a valuable task, return to saved work and support a reliable service, with the owner able to back up, move and maintain it independently.

## Phase 1 implementation record — 12 November 2026

See [Phase 1 changes and validation](phase1-usability.md) for implemented scope, actual checks and the file manifest. T10 is partially addressed by record/set-number counts and language explanations; artwork grouping and default-view changes remain open. T21 has Phase 1 browser coverage; later import, storage-restriction and broader release checks remain open. T02 remains open: semantic role fixes do not certify generated deck strategy. No analytics, payment, advertising, hosting, account, DNS or publication changes were made.

## Phase 2 implementation record — 12 November 2026

Exact printing/finish comparisons, browser-local named saves and portable JSON/CSV/exact-link output are implemented on DEVELOPMENT. See [formats, checks and limitations](phase2-comparisons.md). T14 is partially addressed by portable files and exact individual links; public comparison hosting remains unimplemented. T13 remains open: comparison CSV is not decklist interoperability. T21 has additional Phase 2 storage/import/failure and native browser coverage, rather than a blanket completion claim. Publication remains manual.
