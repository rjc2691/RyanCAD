# Experimental features

Open **Experimental features**, the beaker button near Settings at the right of the operation toolbar (or at its customized position). This dropdown holds optional features for extended testing before they become part of the standard interface. A dot on the button indicates that an experiment is enabled. The viewport remains interactive while the dropdown is open.

Each experiment starts as one compact row. Click its name/chevron to expand or collapse its settings. The **On/Off** indicator is the toggle button and works even when the settings are collapsed; expanding a section does not enable it. Closing the menu resets sections to collapsed while retaining all feature settings.

Settings apply immediately and persist in this browser across refreshes and design changes. They do not modify the document, create history events, change geometry or affect exports. A different browser has independent settings. Experiments default to off. Each experiment has its own reset action and stable ID, so requests can identify exactly which behavior to change, remove or make permanent.

## Active component appearance

Stable ID: `active-component-appearance`.

Enable this experiment to replace the active component's amber edge outline with synchronized animated edge pulses. The previous Soft glow, Rim glow and Height gradient surface styles have been removed. Native component/group surface colors and ordinary lighting remain visible.

Each pulse has a bright electrical head, a smoothly fading tail and a soft halo. Several evenly spaced pulses travel along every native edge at once. A shared clock keeps active components, group members and previews synchronized. Arclength is normalized over the whole native edge, so a curved edge's tessellated segments do not restart the animation. Different-length edges complete their traversals together; this is synchronized normalized motion, rather than constant millimeters per second or a single route around the complete component graph.

| Control | Setting key | Default | Range |
| --- | --- | --- | --- |
| Pulse color | `tint` | Ice blue `#79bfff` | Any six-digit RGB color |
| Pulse speed | `speed` | 0.16 cycles/s (about 6.3 s per traversal) | 0.02–1 cycles/s |
| Pulses per edge | `pulses` | 3 | 1–6 |
| Glow strength | `strength` | 80% | 10–100% |

Controls update live. Specific selected faces, edges and vertices retain their cyan styling; hover retains its blue styling. Inactive components retain their normal appearance/contextual fading. Tool and movement previews use the same pulses, and section cuts clip them along with the component. The native picking geometry is unchanged; pulse overlays cannot intercept clicks.

Switching off restores standard amber component styling immediately. **Reset this experiment** switches it off and restores the default color, speed, count and strength. Settings remain browser-local and independent of CAD files. Previously saved enabled/color/strength preferences are retained; obsolete style names are ignored and new animation controls take their defaults. No design migration is necessary.

Example feedback: “Slow down active-component-appearance” or “Use two pulses per edge and a softer glow.”

## Dark UI palette

Stable ID: `dark-ui-palette`. Default: off, with Midnight selected for the next trial.

Enable the experiment and expand its settings to choose a palette using the color swatches:

| Palette | Surfaces | Accent |
| --- | --- | --- |
| Midnight | Deep navy | Ice blue |
| Graphite | Warm charcoal | Muted copper |
| Tide | Deep teal | Sea glass |
| Aubergine | Smoky plum | Lavender |
| Forest | Dark olive | Sage |
| Monochrome Light | Lighter charcoal | Silver |
| Monochrome Dark | Near-black | Soft gray |

Changes apply immediately to the application chrome, panels, inputs, menus and viewport background. Geometry colors, axis colors, selected objects and operation reference colors keep their existing meaning. Switching off restores the standard theme while retaining the selected palette for the next trial. Reset switches off and restores the Midnight choice. This preference is browser-local and independent of the active workspace.

`themes.ts` holds the palette registry and root CSS-variable application; `themes.css` scopes the optional chrome rules to the root theme attribute. The viewport updates its background without replacing the renderer, camera or geometry. Both monochrome palettes use neutral grayscale UI tokens; geometry and reference colors remain meaningful. `scripts/ui_theme_palette_check.mjs` checks all seven palettes, persistence, disabled controls, original-theme restoration and unchanged document intent on an isolated server.

## Promoted: Toolbar between sidebars

The toolbar layout is now permanent and no longer appears in this menu. Its background always spans the window; buttons sit inside the sidebar margins when space permits. Those margins shrink gradually as buttons need more room, with full-width scrolling only when necessary. The old `sidebar-toolbar-layout` values are ignored without changing other experiment preferences. See [Toolbar customization](TOOLBAR_CUSTOMIZATION.md).

## Implementation and lifecycle

- `frontend/src/experiments.ts` defines stable IDs, typed settings, defaults, validation and versioned browser persistence (`ryancad-experiments-v1`). Unknown settings are ignored; malformed or unavailable storage falls back safely.
- `frontend/src/ExperimentalFeatures.tsx` provides controls in a viewport-safe portal dropdown, including phone sizing and keyboard isolation from CAD shortcuts.
- `frontend/src/activeAppearance.ts` creates owned wide-line core/halo overlays with normalized arclength attributes and GPU animation. All strokes share one time uniform, updated from the existing viewport render loop; controls update uniforms without reloading native geometry. Depth, clipping and picking remain intact.
- `viewportOperationDisplay.ts` applies the setting consistently to normal and preview materials and hides the whole-component selection outline while preserving individual subfeature overlays.
- Future experiments should get explicit stable IDs, a default-off state, validated settings, a reset control and a documented scope. Keep each experimental implementation separable from document intent. Promotion should move its intended defaults and controls into the normal UI; removal should delete the control, setting and render hook. Neither requires migrating CAD files.

Verification includes settings normalization/migration/persistence, arclength across unequal segments, shared animation uniforms, owned-buffer disposal, neutral source edges, retained subfeature overlays, preview depth and section clipping. The browser check also verifies exact original rendering after disabling, refresh persistence, unchanged document intent, reset and mobile bounds.
