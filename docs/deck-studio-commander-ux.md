# Commander selection and Studio polish

This update refines the existing Studio; generator/model/rules/store/view modules and their
schemas remain unchanged. Homepage, Card of the Week, shared explorer and guides are untouched.

## Roles

In Commander, a fresh, eligible unassigned printing offers **Set as Commander** and **Add to the
99**. With a different commander already assigned, it offers **Replace Commander** instead.
Known-ineligible, unknown and unsupported pregame-colour-choice cards do not display the
commander action. Eligibility comes from the existing Scryfall proof, not Legendary type alone.
Other formats retain their existing leader and manual-add controls.

Role actions and the existing generation controls precede printing facts in the compact drawer.
The selected-printing label distinguishes a preview from an assigned main-deck seed/commander.
The generator is disclosed only when its selected seed and preserved commander configuration
pass current role construction checks (deck incompleteness is expected before generation).
Merely previewing a card never assigns it. Existing Deck options stays natively collapsed.

Replacement names the current commanders and proposed replacement in the existing confirmation
dialog. It explicitly warns when ending a pair or clearing preserved signature-spell assignments.
On approval, a recovery checkpoint is required, old leaders/signature spells move into the main
deck with their IDs/finishes/quantities intact, and the new exact printing moves into the command
zone (from the main deck where present). No old card is silently deleted. Normal identity/copy
warnings remain visible. A failed checkpoint or stale confirmation leaves the deck unchanged.

Supported pairings are still available through a small contextual **Add as partner** or
**Add Background** action. Replacement and joining are deliberately separate choices. Reprints
of the same Oracle card cannot partner with themselves. Hidden actions transfer focus to the
remaining main-deck action when needed.

## Discovery

A compact Commander-only selector defaults to **Any card**. **Commander** extends the existing
random-card endpoint with `is:commander`, retains `f:commander game:paper` and all existing
printing/special-card guards, and requires the existing Oracle `commanderEligibility()` proof
before returning a verified record. There is no second discovery client or automatic retry.

Both modes use the same preview renderer and preserve the returned exact printing/finish.
Neither adds entries nor assigns a commander automatically. Mode and format changes cancel
pending discovery; late results are ignored. Other formats hide/reset the selector and retain
normal discovery. Current request queue, timeouts, proof caching and error handling are reused.

## Layout and colour

Wide desktops keep three columns. The Find panel is 270–320px and insights 230–280px. Between
821 and 1100px, Find/insights stack beside a full-height central deck, preserving all three panels
without squeezing the canvas. Existing collapse controls adjust rows at these widths. At 820px
and below, existing Deck/Discover/Stats navigation and the bottom sheet remain.

Search sits above two balanced Search/Discover buttons. Header, draft and toolbar rows wrap
intentionally. Fixed header controls cannot shrink into the canvas; the central panel scrolls
normally when its contents exceed the available height. View controls keep touch-sized targets.

Scoped colours: near-black `#101114`, charcoal slate `#1B1C20`, ivory `#EFEDE6`, crimson `#9B283A`,
and readable muted crimson text `#D6A4AB`. Sage `#8EA99A` remains for focus, saved/valid indicators
and legality status. Decorative labels, chart/selected-state accents and general statistics
no longer use green throughout. Text/background contrast has focused numerical checks.

## Verification limits

Run `python tests/run-deck-studio.py`. The new tests exercise the actual controller/client/model/
store with synthetic responses, and authored CSS structure at 1920, 1440, 1366, 1024, 820 and
390px. Static checks evaluate wrapping/grid areas and available track widths, not actual pixels.

Chromium previously failed during startup in this unchanged execution environment; browser
launch was not repeatedly retried. Live Scryfall access previously failed with `Operation not
permitted`, so no redundant network requests were made. Native rendering, actual overflow,
focus/touch behaviour and live Commander discovery need browser/manual review on DEVELOPMENT.
No visual-perfection or live-API success claim is made.
