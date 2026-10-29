# Experimental features

Open **Experimental features**, the beaker button immediately after Parameters in the operation toolbar. This dropdown holds optional features for extended testing before they become part of the standard interface. A dot on the button indicates that an experiment is enabled. The viewport remains interactive while the dropdown is open.

Each experiment starts as one compact row. Click its name/chevron to expand or collapse its settings. The **On/Off** indicator is the toggle button and works even when the settings are collapsed; expanding a section does not enable it. Closing the menu resets sections to collapsed while retaining all feature settings.

Settings apply immediately and persist in this browser across refreshes and design changes. They do not modify the document, create history events, change geometry or affect exports. A different browser has independent settings. Experiments default to off. Each experiment has its own reset action and stable ID, so requests can identify exactly which behavior to change, remove or make permanent.

## Active component appearance

Stable ID: `active-component-appearance`.

Enable **surface shading** to replace the active component's amber edge highlighting with shaded surfaces. Component edges keep their normal neutral appearance. Specific selected faces, edges and vertices retain their blue treatment; hover and operation-reference feedback retain their existing styles. Selecting a group shades its visible member parts. Tool and movement previews use the same appearance, while inactive components retain their existing contextual fading.

| Style | Stable mode ID | Appearance |
| --- | --- | --- |
| Soft glow | `soft-glow` | Gentle surface illumination, stronger near the silhouette. |
| Rim glow | `rim-glow` | Illumination concentrated toward the silhouette, responding to the camera angle. |
| Height gradient | `height-gradient` | Illumination increasing from bottom to top along the part's local Z axis. |

**Strength** controls the effect from 10–100%. **Tint** changes the illumination color. Initial settings are Soft glow, 65%, warm amber. These are surface effects, without a blurred halo outside the part. Original component/group color and ordinary lighting remain visible.

Switching the experiment off restores standard amber component edges immediately. **Reset this experiment** switches it off and restores the initial style, strength and tint. Escape or the close button dismisses the dropdown without changing settings.

Example feedback: “Make active-component-appearance / Rim glow stronger” or “Make Height gradient permanent and remove the other modes.”

## Implementation and lifecycle

- `frontend/src/experiments.ts` defines stable IDs, typed settings, defaults, validation and versioned browser persistence (`ryancad-experiments-v1`). Unknown settings are ignored; malformed or unavailable storage falls back safely.
- `frontend/src/ExperimentalFeatures.tsx` provides controls in a viewport-safe portal dropdown, including phone sizing and keyboard isolation from CAD shortcuts.
- `frontend/src/activeAppearance.ts` adds an emissive contribution to the standard material shader. Mode, tint and strength update shader uniforms rather than reconstructing meshes. Depth, lighting, clipping and native picking geometry remain intact.
- `viewportOperationDisplay.ts` applies the setting consistently to normal and preview materials and hides the whole-component selection outline while preserving individual subfeature overlays.
- Future experiments should get explicit stable IDs, a default-off state, validated settings, a reset control and a documented scope. Keep each experimental implementation separable from document intent. Promotion should move its intended defaults and controls into the normal UI; removal should delete the control, setting and render hook. Neither requires migrating CAD files.

Verification includes settings normalization/persistence, shader uniforms and source injection, neutral edges, retained subfeature overlays, preview depth, and browser rendering checks for all modes. The browser check also verifies exact original rendering after disabling, refresh persistence, unchanged document intent, reset and mobile bounds.
