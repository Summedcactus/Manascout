# Contact and printing-guide expansion — 7 November 2026

Baseline DEVELOPMENT: `226edf7b1f8c9ce5bddbd122e6147a72b7f81c84`. The local site matched every baseline blob before edits. Six new guides bring the permanent directory/registry to 50; adding those six and Contact brings the existing 47-URL sitemap to 54. Only the six new routes and Contact were added. Older guide dates were preserved except the four materially expanded guides. Home/hub/deck dates reflect their current navigation/discovery changes; footer/cache edits did not reset every other guide.

New routes: mox-opal, jeweled-lotus, lotus-petal, command-tower, senseis-divining-top and edgar-markov. Sol Ring, The One Ring, Demonic Tutor and Deflecting Swat retain their original useful sections, section IDs, researched edition rows and citations. They gain controlled artwork/finish comparisons, practical collector notes, section navigation, responsive editorial scope and coherent metadata. Related links were also added to Black Lotus, Mox Diamond and Mana Crypt; these are navigation additions, not extra guide rewrites. Homepage featured curation and COTW remain unchanged.

## Research decisions

`card-guide-research-expansion.json` records the selected exact editions, artists, release dates, rarities, finishes and source links. Existing copy was compared against current web-accessible exact catalogue records rather than treated as evidence. Wizards' current banned list and product articles were consulted independently. Direct Scryfall page/API access was unavailable: its page returned 403, the shell proxy could not be reached, and the proposed outside-sandbox request was cancelled. No failed request was repeatedly retried. The live explorer remains the existing Scryfall integration.

Significant distinctions:

- Command Tower's debut is CMD #269, common, Ryan Yee, nonfoil-only (17 June 2011). The Arsenal edition changes to Adam Paquette; extended art is not a finish.
- Edgar's standard-size C17 #36 is foil-only. INR #234/#428 offer Baga's original image in nonfoil/foil; Betty Jiang's #328 changes the illustration. Jack Hughes' #491 is the 500-copy serialized double-rainbow movie-poster headliner confirmed by Wizards. Oversized and digital records are not ordinary paper deck copies.
- Jeweled Lotus remains Commander-banned on the current official list. #611 etched and #1066 textured are different exact entries; collecting one does not restore gameplay legality.
- Lotus Petal debuted at common, nonfoil-only. Later mythic, Invention and etched editions do not change that debut or the current card's Pauper qualification. Vintage restriction is separately identified.
- Top's original is an uncommon with actual booster foils. Its Modern/Legacy bans are separated from Commander/Vintage legality. The One Ring's Modern ban is also explicit.
- Mox Opal's original and regular Masters image are separated from Rahn's Invention and Pilcerova's borderless illustration. Old Modern-ban articles are not used as current legality evidence.

No unsupported legacy rarity/artist/finish claim was discovered in the retained four-guide edition rows. The upgrades therefore retain those rows rather than inventing corrections. Catalogue dates are not assumed to be universal retail-launch dates: Commander 2020 retains the year where regional launch timing complicates the day. The Innistrad collecting article says January 25 in one paragraph but January 24 in its launch section; exact records and that latter section support 24 January 2025. Source disagreement is documented, not silently copied.

## Static artwork and Contact

Each of the ten guides contains one exact-edition catalogue-image reference in the existing `#card-details` surface. Its source, artist, dimensions, alt text and initial loading priority are explicit. OG/Twitter/Article image metadata points to that same edition. The static image is a catalogue scan, not evidence of a physical foil surface. Network rendering of every image is not certified; source-linked edition image URLs and readable failure states are used.

Shared `guideFallback()` retains this one surface while the initial API request loads or fails. `renderCard()` replaces it on success, using the existing exact-printing controls; it does not create a second preview. Failed static images hide only the image and expose explanatory text. Main search and guides without the fallback keep their prior behaviour. Paced requests, timeouts, caches, marketplace safety and deck modules are unchanged.

Contact uses a native mailto action, contextual subjects and a read-only selectable email address, `ManaScout111@gmail.com`. There is no form, submission claim, backend, new tracking or response-time promise. A single Contact footer link is available throughout the public site. Privacy now describes voluntarily emailed information, enquiry handling and Gmail as a third-party email service; it does not invent a company address or retention deadline. The Privacy Policy and guide footers also identify MTG.wtf as the static image host; live Scryfall requests retain their existing disclosure.

## Validation and limits

The expansion tests cover independent original-printing fixtures, exact edition distinctions, metadata graphs/social images, accessible header interactions, static loading/error/success replacement, registry and deck handoff, retained upgrade sections, Contact/email/privacy, sitewide links, sorted directory groups and sitemap dates. The full existing Deck Studio/card/site runner must pass before publication. CSS/HTML checks establish structural policy, not pixel-perfect layout.

Native Chromium exited during launch in this environment. No native screenshot, Android interaction, actual email-app launch or live printing-explorer journey is claimed. The owner should review mobile/desktop rendering and image delivery on the development preview. Web research access is separate from native browser/API verification. Sitemap inclusion does not guarantee indexing; Search Console submission remains the owner's post-release action.
