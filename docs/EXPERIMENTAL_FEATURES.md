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

## Toolbar between sidebars

Stable ID: `sidebar-toolbar-layout`. Off by default. On desktop (1000 px and wider), this extends the design tree and inspector/operation sidebar up to the bottom of the header, with the tool toolbar occupying only the space between them. Long toolbars scroll horizontally. Hidden sidebars and operation panels retain their normal behavior. Phone layouts stay unchanged, while the preference remains remembered for desktop use. A second mode, **Full-width bar, inset buttons** (`inset-buttons`), keeps the bar background full width but insets its scrolling button row between the sidebar boundaries; sidebars remain below the toolbar. The original mode is **Sidebars beside toolbar** (`between`). Switching off restores the standard full-width toolbar immediately. This setting is independent of Active component appearance and persists in the same browser preferences.

## Implementation and lifecycle

- `frontend/src/experiments.ts` defines stable IDs, typed settings, defaults, validation and versioned browser persistence (`ryancad-experiments-v1`). Unknown settings are ignored; malformed or unavailable storage falls back safely.
- `frontend/src/ExperimentalFeatures.tsx` provides controls in a viewport-safe portal dropdown, including phone sizing and keyboard isolation from CAD shortcuts.
- `frontend/src/activeAppearance.ts` creates owned wide-line core/halo overlays with normalized arclength attributes and GPU animation. All strokes share one time uniform, updated from the existing viewport render loop; controls update uniforms without reloading native geometry. Depth, clipping and picking remain intact.
- `viewportOperationDisplay.ts` applies the setting consistently to normal and preview materials and hides the whole-component selection outline while preserving individual subfeature overlays.
- Future experiments should get explicit stable IDs, a default-off state, validated settings, a reset control and a documented scope. Keep each experimental implementation separable from document intent. Promotion should move its intended defaults and controls into the normal UI; removal should delete the control, setting and render hook. Neither requires migrating CAD files.

Verification includes settings normalization/migration/persistence, arclength across unequal segments, shared animation uniforms, owned-buffer disposal, neutral source edges, retained subfeature overlays, preview depth and section clipping. The browser check also verifies exact original rendering after disabling, refresh persistence, unchanged document intent, reset and mobile bounds.
