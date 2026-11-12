# Phase 1: guide usability, exact-printing integrity and role accuracy

Implemented on DEVELOPMENT, 12 November 2026. Production publication remains manual. Baseline: fce696384be79cbba686447b8dddfb1af8130500. No main, backup branch, hosting, DNS or account changes are part of this release.

## Result

All 59 guides now begin with their existing concise first-printing answer and one representative card image. Their original introductions remain under an accessible About this guide disclosure in the history section. The original quick-answer question/anchor is retained for assistive technology and existing links; remaining release notes remain visible. All existing editorial paragraphs were checked against the baseline: none were lost. Existing metadata, review dates, catalogue tables, citations and routes remain intact.

The small overview reference follows live selection using actual API image, identity, language and finish. It is not a second interactive explorer. Missing/failed artwork is hidden with an explicit notice and retained text/source links; an unavailable API leaves the researched guide and reference usable. Existing 21 static references are retained; 38 missing references were verified against exact API identity, set/number and artist. Image URLs were copied from responses, not constructed by guessing. The verification ledger records the sources and IDs; it does not certify physical foil appearance or future availability.

Guides reuse one section-navigation block. Copy actions are secondary and retain exact finishes. Headers omit the redundant current-card self-link while retaining the full heading in content. Mobile/desktop overviews, long names, skip links and table scroll regions are usable. Homepage identity, Card of the Week and existing foil functionality are preserved.

Known guide search uses the authoritative existing registry; result-to-guide links preserve printing and finish. Unknown cards remain supported by the search utility. Explicit printing request failure, mismatched identity or unavailable finish now keeps the exact link and reports an error rather than silently substituting another edition. Canonicals are unchanged.

The explorer separates catalogue-record counts from set/number pair counts, explains language/finish differences and labels price columns as source references. Filters/sorting and snapshot tiles are behind a native expandable control; incomplete-data notices remain outside it.

The classifier uses land word boundaries in style, role, tutor and recursion checks. Underworld Breach retains its graveyard roles without becoming land payoff. Genuine landfall and land recursion remain recognized, including play-lands-from-graveyard wording. The generator architecture and deck storage schema were not redesigned.

## Actual validation

- Required command: `python tests/run-deck-studio.py`.
- Result: **951 JavaScript cases passed, zero failed**, plus JavaScript syntax and the runner's Python structural/catalogue/integrity validations.
- The structural validator passed all 66 production HTML files: nesting, unique IDs, internal links/fragments, ARIA references, metadata, JSON-LD and script dependencies.
- Optional native suite: **71 checks passed, zero failed** using Playwright and installed Chromium against the local development server, including live Scryfall catalogue access. No uncaught page JavaScript errors were observed.
- Native coverage: homepage autocomplete/keyboard selection; exact guide handoff; history back/forward and reload; guide search and Escape focus return; unknown-guide card search; expandable filters; an explicit German printing/finish; Deck Studio preview/add/save/reopen/JSON export; failed API requests across five differently structured/long-name guides at 320/390/1280px; header bounds, overflow, skip-link focus, reduced-motion preference and JavaScript-disabled content.
- Real image loading and the mobile/desktop overview were visually inspected. A separate image-error regression verifies that only failed artwork is hidden. Images with no available live URL cannot retain a different edition's image under the new label.
- Original paragraph multiset preservation checked for all 59 guides; no missing paragraphs. `git diff --check` passed.

Run the optional browser suite separately from the dependency-free runner. It requires Playwright, an installed Chromium and live catalogue access. Start a local HTTP server at the repository root, then use:

```sh
python tests/browser-phase1.py --base-url http://127.0.0.1:8765 --chromium /path/to/chromium --output /tmp/manascout-browser
```

This managed test environment required `--no-sandbox --ignore-https-errors` for Chromium/proxy operation. These are opt-in test switches, not production changes or claims about the site's certificate. Native checks used the browser fetch path after Playwright's separate request client encountered an IPv6 connectivity limitation.

## Remaining limits and follow-up

- Role heuristics and construction tests are not gameplay certification. The earlier Goblin sample's payoff/enabler-density concern remains open for generator quality review; no new power or budget guarantees were added.
- Set/number counts do not claim a count of unique artworks. A distinct artwork grouping/default-view redesign is not implemented.
- Analytics, paid support, AdSense serving/consent, hosting, HTTP-to-HTTPS settings, public deck storage, comparison/shortlist features and text/CSV import/export are later phases. Existing JSON export remains functional.
- Browser checks sampled five guide structures and one deck handoff, rather than certifying every device/format/commander. All guides received structural/content-preservation checks.
- Editorial review dates were retained because this phase rearranges existing research and verifies representative identities, rather than claiming a fresh full factual review of every guide.
- No traffic, CTR, ranking or revenue improvement is claimed as an observed result of this unreleased development work.

## File manifest and purposes

- `assets/js/deck-identity.js`: Land/nonland boundaries and legitimate land-recursion recognition.
- `assets/js/app.js`: Exact guide links, explicit-selection error integrity, live overview reference, accurate catalogue labels and expandable filters.
- `assets/js/card-page.js`: One shared guide navigation, finish-preserving copy links and retained fallback on boot failure.
- `assets/css/guide-editorial.css`: Scoped overview/reference layout, mobile headers, navigation, focus targets and readable guide spacing.
- `index.html`: Refresh the shared explorer cache without changing homepage content or presentation.
- `deck/index.html`: Refresh the classifier cache without changing deck storage or workspace markup.
- `docs/growth-and-ownership-roadmap.md`: Accurate Phase 1 completion markers and outstanding scope.
- `docs/phase1-reference-verification.json`: 38 exact reference/API matches and copied image URLs.
- `docs/phase1-usability.md`: Implementation, validation, limitations and file manifest.
- `tests/browser-phase1.py`: Optional reproducible native browser journeys and failure/layout checks.
- `tests/card-phase1.test.cjs`: All-guide structure, verified references, exact links, preserved failures and live overview identity regressions.
- `tests/deck-land-classification.test.cjs`: Real Oracle excerpts and boundary regressions for land/nonland roles.
- `tests/card-expansion.test.cjs`: Retain factual checks with the new overview location and shared reference component.
- `tests/card-guides-3a.test.cjs`: Allow the newly verified static images while retaining catalogue and integration checks.
- `tests/card-guides-3b.test.cjs`: Allow the newly verified static images while retaining catalogue and integration checks.
- `tests/card-guides.test.cjs`: Allow the newly verified static images while retaining catalogue and integration checks.
- `tests/deck-studio.test.cjs`: Keep the existing handoff renderer test isolated from the separately tested overview component.

Each guide below receives the same shared overview/navigation, preserved editorial sections, early curated comparison, static fallback and cache refresh. Newly verified references apply where previously missing:

- `card/ancient-tomb/index.html`
- `card/arcane-signet/index.html`
- `card/birds-of-paradise/index.html`
- `card/black-lotus/index.html`
- `card/brainstorm/index.html`
- `card/captain-jean-luc-picard/index.html`
- `card/cavern-of-souls/index.html`
- `card/chrome-mox/index.html`
- `card/command-tower/index.html`
- `card/counterspell/index.html`
- `card/cyclonic-rift/index.html`
- `card/dark-ritual/index.html`
- `card/deflecting-swat/index.html`
- `card/demonic-consultation/index.html`
- `card/demonic-tutor/index.html`
- `card/dockside-extortionist/index.html`
- `card/doubling-season/index.html`
- `card/edgar-markov/index.html`
- `card/enlightened-tutor/index.html`
- `card/esper-sentinel/index.html`
- `card/fierce-guardianship/index.html`
- `card/force-of-will/index.html`
- `card/gaeas-cradle/index.html`
- `card/grim-monolith/index.html`
- `card/jace-the-mind-sculptor/index.html`
- `card/jeskas-will/index.html`
- `card/jeweled-lotus/index.html`
- `card/lightning-bolt/index.html`
- `card/lightning-greaves/index.html`
- `card/living-death/index.html`
- `card/lotus-petal/index.html`
- `card/mana-crypt/index.html`
- `card/mana-drain/index.html`
- `card/mana-vault/index.html`
- `card/mox-diamond/index.html`
- `card/mox-opal/index.html`
- `card/mr-spock-science-officer/index.html`
- `card/mystic-remora/index.html`
- `card/mystic-sanctuary/index.html`
- `card/mystical-tutor/index.html`
- `card/necropotence/index.html`
- `card/orcish-bowmasters/index.html`
- `card/path-to-exile/index.html`
- `card/rhystic-study/index.html`
- `card/senseis-divining-top/index.html`
- `card/skullclamp/index.html`
- `card/smaug-wicked-worm/index.html`
- `card/smothering-tithe/index.html`
- `card/sol-ring/index.html`
- `card/swan-song/index.html`
- `card/swords-to-plowshares/index.html`
- `card/teferis-protection/index.html`
- `card/the-great-henge/index.html`
- `card/the-one-ring/index.html`
- `card/the-theorist-jace-beleren/index.html`
- `card/thoughtseize/index.html`
- `card/urzas-saga/index.html`
- `card/vampiric-tutor/index.html`
- `card/worldly-tutor/index.html`
