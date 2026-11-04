# ManaScout collector-guide editorial standard

Apply this to new guide batches without rewriting unrelated guides or shared rendering.
The One Ring and Deflecting Swat are useful references for detail and printing tables; the
Picard and Spock pages demonstrate this structure for an upcoming, single-family release.

- Verify the exact card name and catalogue before drafting. Record original set/date/number,
  rarity, artist, mana cost/type/identity and the actual mechanics. Use official product/rules
  material plus named catalogue records; retain a dated research ledger with uncertainty notes.
- Lead with the printing question, not a character biography. Put a concrete first-printing
  answer near the top. Clearly distinguish upcoming/global/prerelease dates from past releases.
- Separate artwork, frame and finish. A foil is not automatically another painting, a different
  number is not automatically a later reprint, and a portrait's artist is not its autograph signer.
- Use a curated table for multiple meaningful records: set, collector number, treatment/art,
  artist and available finishes. Link precise records; do not turn missing prices into availability
  evidence or invent extra promo/serialized variants. Use a fact panel for one-entry histories.
- Explain only gameplay details that help identify or choose the card. Date legality claims,
  respect current data, and keep card-type commander suitability separate from actual legality.
- Offer distinct selection advice and a specific ManaScout comparison/pick with reasons.
  Avoid unverifiable price rankings, value predictions and generic service descriptions.
- Reuse `data-card-name`, `card-details`, `printings-status`, `printings-container`, `app.js`
  and `card-page.js`. Add registry slugs only where needed. Never create a second explorer.
- Keep titles and descriptions specific to printing/art/foil intent. Match canonical, OG/Twitter,
  WebPage/Article and breadcrumb identity. Do not invent offers, prices or ratings in JSON-LD.
- Add directory links in the appropriate existing group, sequential unique ItemList positions,
  all visible/meta/structured guide counts, current shared guide registrations and sitemap URLs.
  Preserve existing entries. Check actual permanent-guide count instead of guessing.
- Use contextual related-guide links. Keep editorial/layout CSS scoped to the new guide class;
  wide tables scroll inside their region, long names wrap, and keyboard access remains clear.
- Run `python tests/run-deck-studio.py` and the new guide validator. The validator accepts page
  paths for a later batch: `python tests/validate-new-guides.py card/example/index.html`.
  Add focused catalogue/metadata/link/integration tests; keep existing tests intact.
- Report source/API/browser limits honestly. Static structure does not prove visual rendering,
  physical foil appearance, live availability or successful indexing. Do not change Search Console
  or create a PR without authorisation. Keep work on DEVELOPMENT and preserve its newer features.
