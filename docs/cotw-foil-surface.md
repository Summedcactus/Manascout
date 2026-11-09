# COTW foil surface correction

The previous foil was a different geometric plane: `.weekly-foil-sheen` used `inset: -4%`, a local Z-offset, translation and a 2D rotation, while oversized pseudo-elements rotated inside it. Image, foil and edge paint were direct children of the transformed shell. Although the shell already had overflow clipping, the effect relied on that 3D compositing boundary rather than an explicit flat card-face group. Owner review exposed rectangular bleed during rotation. Native compositor diagnostics are unavailable here; the oversized, independently transformed surface is the code-level cause addressed.

The surface now uses:

```
weekly-card-stage                 perspective / stationary pointer geometry
  weekly-card-rest-shadow        separate ground shadow
  weekly-card-float               historical idle / bounded takeover and return
    weekly-card-shell            3D object, raised Z, external depth and shadows
      weekly-card-face           exact rounded, flat clipping group
        card image
        weekly-foil-sheen         stationary, inset 0
          foil pseudo-elements   inset 0; gradient paint only
          weekly-foil-glimmer    inset 0; faint cool component
        weekly-edge-light
```

The existing authored silhouette is **15px** at every corner. A single `--weekly-card-radius: 15px` sets the shell radius, inherited by the face, image, foil, glimmer and edge light. This is the site's CSS silhouette, not a claim to have measured the physical printing's corner radius. Shell aspect ratio remains 488/680. The face fills it with `inset: 0`, `overflow: hidden`, `clip-path: inset(0 round var(--weekly-card-radius))` (including the WebKit form), `isolation: isolate` and `transform-style: flat`. Image, blending and masking are composed in that local face before the ancestor shell's perspective transformation. The outer shell uses overflow visible so its outset shadows remain outside the face; the ground shadow remains a sibling of the floating card.

There is no foil-plane transform, local Z-offset, independent rotation or negative inset. A broad soft metallic reflection, feathered narrow specular highlight and faint blue/lavender separation are painted with gradients. Only background positions drift slowly; no opacity loop pulses the whole surface. Existing pointer coordinates position the broad reflection, while the same virtual light-angle input drives the narrow gradient and edge highlight. Existing reflection-intensity values remain .70 idle / .76–1.00 interacting. The lower-text mask remains. Reduced motion stops drift, retains .78 static foil and keeps the angled, raised card, edge light and external shadows.

No production JavaScript changes were required. Historical idle poses, Z motion, pointer/touch ranges, passive scroll-safe handling, takeover/return transitions, rest-shadow animation and exact-printing validation remain byte-identical to the previous implementation. Only the COTW face markup and stylesheet cache version change in the homepage.

Tests cover common ancestry, shared radius, zero insets, planar paint, retained external shadows, gradient/light response, reduced motion and maximum-tilt authored geometry. Projection checks exercise the declared shared plane and rounded clip; they are not native GPU/antialiasing tests. Chromium remains blocked by the previously observed sandbox socket restriction; the earlier elevated check was cancelled and is not retried. Owner review is still needed for actual mobile/desktop rasterization, clipping at all corners and perceived foil appearance.
