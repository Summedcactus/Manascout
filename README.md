# ManaScout

ManaScout is a static HTML/CSS/JavaScript site for Magic card discovery, researched printing guides and browser-local Deck Studio editing, Commander generation and individual/bulk exact-printing curation.

Live catalogue records, artwork and available price fields come from Scryfall. Editorial guides and exact featured-printing fallbacks are curated source-backed content. Missing prices remain unknown; simulated foil effects are illustrative.

## Development and validation

Follow `AGENTS.md`. Work on DEVELOPMENT; publication/PRs/merges remain manual. Preserve the homepage, guides, shared explorer and existing deck data.

Run the complete automated checks:

```sh
python tests/run-deck-studio.py
```

The runner includes JavaScript regressions, syntax, guide registry, HTML/ARIA/local links, JSON-LD, sitemap and site integrity checks. Native mobile/desktop rendering, live API responses and real storage concurrency require separate browser checks. See `docs/deck-studio.md`, `docs/deck-appearance.md` and `docs/stage5-integrity.md`.

## Hosting

GitHub Pages serves the repository root on the configured publishing branch after the owner's manual release workflow. `CNAME` specifies `manascout.co.uk`. Development tasks must not change hosting settings or publish/merge to main automatically.

## Growth and ownership roadmap

Before planning growth, revenue or a broad site update, read [the consolidated roadmap](docs/growth-and-ownership-roadmap.md). It preserves the owner's uncluttered, useful-product requirements, verified November audit findings, revenue/rights/hosting constraints and ordered implementation checklist. Planned items are not shipped features.

Exact-printing comparison supports 1–4 selections (two or more for comparison), named browser-local saves, JSON portability and CSV/exact-link export. See [comparison formats and limitations](docs/phase2-comparisons.md).

Deck Studio supports previewed text/CSV imports, copy/TXT/CSV/JSON exports and separate new drafts. Whole printing comparisons can be shared without an account. See [Phase 3 formats, storage compatibility and validation](docs/phase3-interoperability.md).
