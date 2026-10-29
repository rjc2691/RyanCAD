# Mobile layout

## Scope

A small responsive layer makes the existing CAD workspace usable on narrow browsers. It introduces no alternate modeling commands, document schema, dependencies or touch-only CAD tools. The desktop layout applies at widths of 1000 pixels and above; narrower windows use the same mobile layout as phones.

## Layout and state

- A four-button bottom bar chooses View, Design, Inspector or History. View leaves the viewport unobstructed. Other panels share the available area with the viewport: stacked in portrait, side by side in landscape.
- Tool, Move, Group and Sketch automatically open Inspector, whose visible label becomes the active operation name. Switching bottom-bar views hides panels with CSS instead of unmounting operations, preserving their drafts, references and preview state. Returning to desktop restores the desktop panel layout.
- Header actions use compact icons with accessible names. Modeling/sketch tools and the history header scroll horizontally. The project menu, workspace manager, parameter list, export dialogs and panel bodies fit narrow screens and scroll as needed.
- Controls have larger touch targets, numeric/text inputs use a 16-pixel font to avoid focus zoom, and viewport/safe-area sizing accommodates phone orientation and the home indicator. Repeated instructional legends are omitted where they would obscure the small viewport; actual origin/profile/path geometry remains visible.
- Existing one-finger orbit and two-finger pan/zoom are reused. A multi-touch gesture cannot finish as a geometry tap or sketch point when fingers are released separately. Zero-size viewport resize observations are ignored to prevent invalid camera projections during layout changes.

`frontend/src/MobileNavigation.tsx` contains the media-query hook and bottom bar. `frontend/src/mobile.css` holds responsive overrides separately from the desktop styles. `App.tsx` stores only the selected mobile pane and opens the operation pane when a workflow starts. This pane choice is local UI state; it does not change saved designs or workspace identity.

## Verification and limits

`scripts/ui_mobile_check.mjs` runs against an isolated test server with a disposable browser workspace. It checks 320- and 390-pixel portrait layouts, 844-pixel landscape, desktop restoration at 1440 pixels, no page-wide overflow, reachable workspace/parameter/export dialogs, operation pane opening and draft retention, applying a real movement, configuring a validated material-operation preview, touch sketch drawing, pinch release safety and component history. The frontend model suite and TypeScript/production build remain part of validation.

Visual and interaction checks use mobile emulation in headless Edge. Actual iPhone Safari, on-screen keyboard behavior and safe-area behavior on hardware remain to be verified. This is an initial mobile layout, without new touch gestures for Shift multi-selection, tree reorganization or bounded sketch orbit. Complex precision editing remains easier with a pointer and keyboard.
