# Picard and Spock printing research — 4 November 2026

Scope: two new permanent guides, based on DEVELOPMENT 456b1dc7f5805968ce02c3de8424ba12875fabb8.
No Prompt 3 guides, homepage redesign, Search Console action or Deck Studio logic changes.

Wizards announces the global tabletop release for **13 November 2026**, with prerelease events
6–12 November and Arena release 10 November. The pages are explicitly pre-release guides,
not claims that the global release already occurred. The checked catalogue entries belong to
one TRK release family. No additional promo, serialized variant or later reprint was inferred.

Primary sources:

- [Wizards collecting guide](https://magic.wizards.com/en/news/feature/collecting-star-trek)
- [Wizards release notes](https://magic.wizards.com/en/news/feature/star-trek-release-notes)

Direct Scryfall API URLs were inaccessible through the web research tool. Older shell requests
also failed with Operation not permitted; those blocked shell operations were not retried.
Wizards plus the accessible catalogues below establish the editorial facts. Some mirror sites
prematurely label all formats legal; those claims were not adopted. On the review date, MTG
Collector (Picard) and CCG Forge (Spock) show not-legal Commander status ahead of release. The
pages date that snapshot and defer current legality to the unchanged live checks.

## Captain Jean-Luc Picard

Canonical: https://manascout.co.uk/card/captain-jean-luc-picard/

Title: Captain Jean-Luc Picard MTG Printings & Foils | ManaScout

Description: Compare Captain Jean-Luc Picard’s first TRK #7 printing, LCARS art, surge foil #497 and signed headliner #1701D, with artists and collector numbers.

Identity: {2}{W}, mana value 3; legendary Human Officer, 2/3, white colour identity, mythic. Official text grants other creatures +1/+1, creates an Officer on creature/Spacecraft casts, and exchanges tapping seven Officers for a Spacecraft entering with seven charge counters. The word red on the token instruction does not add red colour identity.

| Set | Collector number | Artwork / frame | Artist | Finishes |
| --- | --- | --- | --- | --- |
| TRK | 7 | Original standard frame | Anna Pavleeva | Nonfoil, traditional foil |
| TRK | 363 | Showcase LCARS frame | Erikas Perl | Nonfoil, traditional foil |
| TRK | 497 | Showcase LCARS; surge counterpart | Erikas Perl | Surge foil only |
| TRK | 1701D | Borderless, textless signed headliner | Irvin Rodriguez | Foil only |

Catalogue cross-checks:

- https://mtg-collector.com/cards/captain-jean-luc-picard
- https://magery.com/mtg/trk/captain-jean-luc-picard-7
- https://magery.com/mtg/trk/captain-jean-luc-picard-363
- https://magery.com/mtg/trk/captain-jean-luc-picard-497
- https://www.cardtrader.com/en-US/cards/420113-captain-jean-luc-picard-borderless-autograph-card-star-trek-collectors

## Mr. Spock, Science Officer

Canonical: https://manascout.co.uk/card/mr-spock-science-officer/

Title: Mr. Spock, Science Officer MTG Printings & Foils | ManaScout

Description: Compare Mr. Spock, Science Officer’s first TRK #74 printing, Mirror, Mirror scene, Classic Enterprise art, surge foil #535 and signed headliner #1702.

Identity: {2}{U}{U}, mana value 4; legendary Vulcan Human Scientist, 2/4, blue colour identity, mythic. Official text doubles the controller’s individual draws through a replacement effect; multi-card draws and multiple replacement effects are covered by the release notes.

| Set | Collector number | Artwork / frame | Artist | Finishes |
| --- | --- | --- | --- | --- |
| TRK | 74 | Original standard frame | Colin Boyer | Nonfoil, traditional foil |
| TRK | 353 | Borderless Mirror, Mirror scene | Mark Spears | Nonfoil, traditional foil |
| TRK | 411 | Showcase Classic Enterprise frame | Grant Griffin | Nonfoil, traditional foil |
| TRK | 535 | Classic Enterprise; surge counterpart | Grant Griffin | Surge foil only |
| TRK | 1702 | Borderless, textless signed headliner | Gal Or | Foil only |

Catalogue cross-checks:

- https://themanagrove.com/cards/mr-spock-science-officer
- https://www.echomtg.com/mtg/items/mr-spock-science-officer-showcase/242156/
- https://www.cardtrader.com/en-US/cards/419871-mr-spock-science-officer-borderless-star-trek-collectors
- https://www.mtggoldfish.com/price/star-trek/535/mr-spock-science-officer-classic%20enterprise%20showcase%20surgefoil-showcase
- https://www.cardtrader.com/en-US/cards/420067-mr-spock-science-officer-borderless-autograph-card-star-trek-collectors
- https://www.ccgforge.com/en/carta/mr-spock-science-officer

## Treatment and uncertainty notes

- Picard #363/#497 credit Erikas Perl; #497 is the LCARS surge record. Spock #411/#535
  credit Grant Griffin; #535 is the Classic Enterprise surge record. Artist credits alone are
  not used as proof of a new illustration or an illustration-ID match.
- The Spock #353 scene is Mark Spears's Mirror, Mirror scene, identified by Wizards and
  CardTrader. It is distinct from the #535 Classic Enterprise surge version.
- Signed headliners: Picard #1701D (retain the D), Irvin Rodriguez; Spock #1702, Gal Or.
  Both are catalogued as foil-only borderless/textless autograph entries. No more specific
  foil process is asserted for these headliners. No signer is inferred from the artist credit
  or character name. In particular, Spock actor-signature attribution remains unasserted.
- Ordinary #7/#363 and #74/#353/#411 have nonfoil/traditional-foil choices; surge-specific
  entries are foil-only. Prices, pack odds, serial counts and investment claims are not supplied.
- The live explorer and exact-printing controls are reused. Images/finishes come from returned
  Scryfall records; there are no hardcoded replacement images or bespoke printing datasets.
  Rendering tests use synthetic responses and do not prove a live API/image fetch.
- Browser rendering remains unverified after the earlier Chromium launch failure in this
  unchanged environment. No repetitive browser/network retries or security changes were made.
  Native desktop/mobile title/table/explorer rendering and physical finish appearance need review.
- Directory: 38 → 40 actual permanent guides. Both pages join Showcase & Collector Releases,
  ItemList positions 39/40, reciprocal/contextual guide links and two unique sitemap entries.
  Deck Studio's only change is “Explore 38 card guides” → “Explore 40 card guides.”
- Post-PR: manually review deployed URLs and sitemap, then handle Search Console submission/
  URL inspection separately after Prompt 3 and the user-managed PR. No indexing success is claimed.
