# Growth and monetisation experiments

## Growth Prompt 1

Implemented on DEVELOPMENT on **27 November 2026**. Start the observation window after the manual release and once Search Console shows the new snippets have had time to be discovered. Production and repository release gates are separate from the experiment.

### Search baseline

Source is the supplied verified Google Search Console audit for `https://manascout.co.uk/`. The connected Search Console report reproduced the same Web property total and the cohort and control rows for **29 October through 24 November 2026**. Recent days after 24 November were outside this data window. Search Console reporting lag makes those missing days unobserved.

| Web search | Clicks | Impressions | CTR | Average position |
|---|---:|---:|---:|---:|
| 29 Oct–24 Nov | 42 | 3,149 | 1.33% | 9.82 |
| 29 Oct–3 Nov | 7 | 281 | 2.49% | 14.82 |
| 4–10 Nov | 7 | 689 | 1.02% | 9.19 |
| 11–17 Nov | 11 | 784 | 1.40% | 10.06 |
| 18–24 Nov | 17 | 1,395 | 1.22% | 8.99 |

The supplied sitemap observation was 71 submitted URLs, zero errors, zero warnings and a last download on 27 November. Search Console exposed impressions for 62 of the 68 guides in the reporting window. Those are observed search appearances. The existing guide directory, guide locations and sitemap dates are preserved. The indexable About page adds one release-candidate URL, so the branch sitemap now has 72.

| Device | Clicks | Impressions | CTR | Average position |
|---|---:|---:|---:|---:|
| Mobile | 31 | 1,863 | 1.66% | 7.51 |
| Desktop | 11 | 1,267 | 0.87% | 13.27 |
| Tablet | 0 | 19 | 0.00% | 5.84 |

| Market | Clicks | Impressions | CTR | Average position |
|---|---:|---:|---:|---:|
| United States | 17 | 1,307 | 1.30% | 7.15 |
| United Kingdom | 12 | 570 | 2.11% | 20.73 |
| Canada | 1 | 153 | 0.65% | 6.43 |
| Germany | 1 | 91 | 1.10% | 7.51 |
| Australia | 0 | 83 | 0.00% | 7.77 |
| Italy | 3 | 75 | 4.00% | 8.31 |
| Netherlands | 2 | 62 | 3.23% | 6.40 |

| Exposed query | Impressions | Average position |
|---|---:|---:|
| `mr spock science officer mtg` | 133 | 5.53 |
| `when was sol ring first printed` | 22 | 5.55 |
| `arcane signet first printing` | 13 | 8.08 |
| `sol ring first print` | 13 | 6.15 |
| `can deflecting swat counter a board wipe` | 12 | 6.67 |
| `when was arcane signet first printed` | 11 | 4.45 |
| `smaug the magnificent mtg gold foil` | 10 | 9.70 |
| `how many smaug the magnificent cards are there` | 8 | 8.25 |
| `all sol ring printings` | 6 | 10.33 |
| `sol ring printings` | 6 | 9.67 |

Search Console suppresses some query data. Use property totals for the site, the page report for each guide, and exposed queries for directional intent analysis. A query's absence or a sparse query report does not quantify all clicks. Image search recorded 237 impressions, zero clicks and average position about 41.8. Large-image preview permission, card-image identity and useful alt text remain in place.

### Controlled snippet cohort

The hypothesis is that a title and snippet giving a concrete identification, verification or comparison task can earn more clicks at similar positions. All eight pages were checked for the actual title, description, H1, opening answer and supporting sections. The existing opening answers and research stayed intact. Social titles and descriptions, and structured descriptions where present, follow the new proposition. Google may choose a different snippet. [Google snippet guidance](https://developers.google.com/search/docs/appearance/snippet)

| Guide | Old title | New title | Old description | New description | Impressions | Clicks | CTR | Avg. position | Reason |
|---|---|---|---|---|---:|---:|---:|---:|---|
| [The One Ring](../card/the-one-ring/index.html) | The One Ring MTG — Versions, Foils & Unique 001/001 \| ManaScout | The One Ring MTG — Identify Printings & Foils | Identify The One Ring’s standard, scene and scroll versions; distinguish surge foil, serialized Sol Ring cards and the unique 001/001 One Ring headliner. | Compare standard, scene and scroll artwork. Use set codes and collector numbers to distinguish surge foil and the serialized One Ring headliner. | 383 | 5 | 1.31% | 8.16 | Lead with identifying the card in hand and distinguishing variants. |
| [Mr. Spock, Science Officer](../card/mr-spock-science-officer/index.html) | Mr. Spock, Science Officer MTG — Versions & Foils | Mr. Spock, Science Officer MTG — Compare Printings | Compare Mr. Spock, Science Officer MTG printings by artwork and collector number. Identify the Traditional Foils, Surge Foil #535 and signed headliner #1702. | Match your Mr. Spock card by artwork and collector number. Compare Traditional Foil, Surge Foil and the signed headliner before checking an exact printing. | 245 | 1 | 0.41% | 5.87 | Match the named card query and show a concrete comparison task. |
| [Sol Ring](../card/sol-ring/index.html) | Sol Ring First Printing — Limited Edition Alpha (1993) | Sol Ring First Printing Guide — Identify Your Edition | Sol Ring first appeared in Alpha in 1993. Identify the original, compare later artwork and foil versions, then inspect exact editions by set and number. | Identify the original Alpha Sol Ring by artwork and catalogue record, then compare reprints and verify sets, collector numbers and foil treatments. | 230 | 1 | 0.43% | 6.36 | Retain first-print intent and give a reason to inspect the edition. |
| [Arcane Signet](../card/arcane-signet/index.html) | Arcane Signet First Printing & MTG Versions \| ManaScout | Arcane Signet — Identify the First Printing & Reprints | Arcane Signet debuted in 2019's Throne of Eldraine Brawl decks. Identify ELD #331 and compare later artwork, editions and foil finishes. | Use artwork, set codes and collector numbers to identify the original Arcane Signet, then compare borderless reprints and foil finishes. | 131 | 1 | 0.76% | 7.29 | Offer a first-print identification task and useful reprint comparisons. |
| [Deflecting Swat](../card/deflecting-swat/index.html) | Deflecting Swat MTG — Board Wipes & Printings \| ManaScout | Deflecting Swat vs. Board Wipes — MTG Targeting Guide | Deflecting Swat redirects targets; it does not counter spells. Learn when a board wipe can be redirected, then compare MTG artwork, printings and finishes. | Check which targeted effects Deflecting Swat can redirect with board-wipe examples. Then distinguish the original printing from later artwork and finishes. | 93 | 1 | 1.08% | 5.70 | Lead with the observed board-wipe question and the examples the guide explains. |
| [Mana Crypt](../card/mana-crypt/index.html) | Mana Crypt MTG — First Printing, Art & Neon Foils \| ManaScout | Mana Crypt — Identify the Book Promo & Neon Foils | Identify Mana Crypt’s book-promo first printing and compare later artwork, Invention and neon foil records. Keep edition, suffix and current legality distinct. | Compare the original book promo, Invention and neon foils by artwork, set and collector-number suffix. Check format legality separately from the printing. | 79 | 0 | 0.00% | 8.32 | Bring the two collector identification decisions into focus. |
| [Demonic Tutor](../card/demonic-tutor/index.html) | Demonic Tutor MTG — Alpha Original & Alternate Art \| ManaScout | Demonic Tutor — Compare Early Printings & Alternate Art | Identify Demonic Tutor’s Alpha #104 original and compare later artwork, borderless and etched editions. Match the set before relying on a collector number. | Tell early Demonic Tutor editions apart by set and collector number. Compare the original artwork with later borderless and etched versions. | 61 | 0 | 0.00% | 7.74 | Explain why a reference that distinguishes similar early editions is useful. |
| [Dockside Extortionist](../card/dockside-extortionist/index.html) | Dockside Extortionist Printings, Commander Ban & Art \| ManaScout | Dockside Extortionist — Compare Printings & Finishes | Trace Dockside Extortionist from Commander 2019 #24 through Double Masters borderless and etched versions, The List and Avatar art, with dated ban status. | Match original, borderless, etched and Avatar-art Dockside Extortionist cards by set and number, and check the dated Commander legality notes. | 20 | 0 | 0.00% | 4.35 | Offer printing identification and make the dated legality context secondary. |

Metadata controls are the homepage (39 impressions, 10 clicks, 25.64% CTR, position 8.79) and Rhystic Study (187 impressions, five clicks, 2.67% CTR, position 5.53). Their titles, descriptions and social metadata remain unchanged. The shared publisher navigation and byline are site-wide trust work. Brainstorm, Force of Will, Smaug the Magnificent and Swords to Plowshares are secondary candidates and retain their existing snippets. Brainstorm drew 26 impressions and zero clicks at position 5.23, and Force of Will drew 71 impressions and zero clicks at position 9.87. Smaug's exposed finish and version queries are recorded above.

Record the actual release date and check discovery and snippet changes after 7 days. Compare the next 14 and 28 complete reporting days after release against equal-length pre-release periods, holding Web search, page, device and country constant where volumes permit. Log impressions, clicks, CTR, position, query mix and any rewritten snippets. Compare the movement of the controls and flag material position or impression shifts before interpreting CTR. For weak-volume pages, extend the window. The worksheet remains empty until a post-release pull verifies the figures.

**Post-release results** remain pending. A few parameterised Deck URLs such as `/deck/?card=…&printing=…` appeared in the audit. Monitor these in future reports. Deck URLs retain their clean `/deck/` canonical and query-state `noindex,follow` behaviour.

### Publisher and distribution

All 68 guides use an organisational ManaScout byline linked to About and show their existing Article modification date. Existing review copy, citations and date evidence remain intact. About houses the editorial identity, method, corrections route and retailer disclosure. If the owner confirms a public personal identity in a later release, add it to About as operator information. Article authorship should reflect who actually wrote and reviewed the guide.

Retailer intent is the first revenue opportunity because someone verifying a printing can already be near a purchase decision. Cardmarket remains a plain outbound destination and Scryfall remains verification. Magic Madhouse and Chaos Cards are affiliate application candidates with disabled retailer entries pending verified search or product destinations. Measurement and provider activation steps are recorded in [monetisation setup](monetisation-setup.md).

### Engineering boundary and next growth phase

The large app controller, specialised Deck transport, duplicated guide header search, historical asset version strings, staging-only asset versioning, historical tests and stale backup/fix branches remain engineering backlog items. The dedicated Deck transport phase is separate.

The next growth decision should use the first cohort's 14- and 28-day results. In parallel, the owner can pursue the two retailer programmes and supply a real analytics stream and consent decision. A verified affiliate feed or approved link template should precede a new retailer search experience or exact-printing claim. Use the next CTR cohort or a First Printings hub only when the measured queries and page outcomes justify it.

### Release-candidate checks

| Measure | Released baseline | Growth Prompt 1 |
|---|---:|---:|
| Production JavaScript under `assets/js` | 553,146 bytes | 558,566 bytes |
| Retailer modules / direct merchant builders in app.js | 0 / 1 | 1 / 0 |
| Guides with the shared visible publisher byline | 0 | 68 |
| Guide titles and descriptions changed for CTR | 0 | 8 |
| Sitemap URLs | 71 | 72 |
| Supported production analytics adapters | 1 | 2 |
| Active analytics, display-ad or affiliate providers | 0 | 0 |

`python tests/run-deck-studio.py` passed 1,282 JavaScript cases and the static validators. `node --test tests/*-contract.test.cjs` passed 71 cases. `python scripts/sync-guide-catalogue.py --check` verified all 68 guides. A released-source comparison verified that all guide bodies apart from the byline, all editorial dates, and all prior sitemap entries and dates stayed intact.

The localhost growth browser contract passed at 320, 390, 768, 1024, 1440 and 1920px. It checked About and its keyboard skip link, archive filters, four guides, Search, Cardmarket product and name-search links, Scryfall verification and Deck handoff. It observed zero analytics or ad requests. The existing Search and Scoutboard browser suites passed four and 15 checks respectively. Staged browser checks also passed with zero asset 404s. Catalogue responses and artwork came from saved fixtures.
