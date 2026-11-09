# COTW physical presentation: historical reference and handoff

Reference inspected before implementation: `ef9394c69289f63145d4bdaefd83b686812bc625` (4 November 2026), **Polish Card of the Week 3D depth and atmosphere**. Also compared `f26f297c243c838ec645832f5d4b333baa8692e5`, `8865e913823d110a1efcaceb34d1f03ca3ee21f9` and the earlier `748adf001aaf7cfbe99d6f7695d16ff045363704`. The ef9394c version is the source of the requested −5.5° / +4° / −3° style, rather than an invented approximation.

## Mechanics restored from ef9394c

- Perspective stage → floating presentation layer → interactive shell; preserve-3d on the spatial parents.
- 13-second ease-in-out, alternating idle animation, with stops at 0%, 48% and 100%.
- X angles **2.8°, −2.1°, 1.3°** and Y angles **−5.5°, 4.2°, −3.2°**.
- Vertical positions **2px, −6px, 0px**. Z offsets **base, base + 5px, base + 1px**.
- Synchronized elliptical ground shadow: scale **(.94,.9), (1.05,1.15), (.98,1)**; opacity **.76, .48, .67**.
- Idle phase pauses during interaction and resumes afterward.

The original had an 8px base Z-depth. Ulamog keeps the stronger 38px desktop / 24px mobile base from `22325cdd0d926fc3cf3fb9704703acc24602676e`, plus the shell's 8px forward translation. Mobile retains that commit's readable X **4°, −3.5°, 3°** / Y **−5°, 5°, −4°**, rather than restoring the historical barely-visible mobile overrides. Perspective remains 760px; stronger Ulamog foil, frame highlights, image/text masking and void atmosphere are retained.

## Integrated takeover and return

Historical pointer geometry used the moving shell, and its relative-shell reset was 0°/0°. Those parts are intentionally adapted. Geometry stays on the stationary stage. The existing CSS idle animation remains the presentation source; this is not a second looping tilt system.

On takeover, pause the CSS idle and shadow at their current phase. A bounded Web Animations transition removes only the floating layer's angular contribution while preserving its sampled XYZ translation. The shell takes over absolute pointer angles (desktop ±11° X / ±14° Y; touch ±6° X / ±7° Y). The current foil, edge and shadow responses use those same coordinates.

On release, transition the floating layer back to the saved presentation matrix while the shell relinquishes angular control. Only then resume the paused CSS idle and shadow together. Reset variables describe the non-zero presentation stance. No reset sets transform to none or forces a flat card. Re-entry cancels the old handoff from its current sampled pose; stale completions cannot override a newer interaction. Hidden/offscreen/search/reduced-motion transitions cancel bounded handoffs safely. Without Web Animations support, retain the historical paused presentation and eased relative-shell fallback.

Reduced motion retains the deliberate static angled/raised presentation and the strong static foil from 22325cdd. No Minas Morgul colours, artwork map or visual selectors are restored. The historical names occur only in this research note/source-parity tests, not production styling.

Native Chromium has previously failed here with a sandbox socket error; the elevated check was cancelled. Do not claim pixel/native-touch verification from authored-CSS and deterministic animation tests. Owner review remains necessary for actual compositing and physical-foil appearance.
