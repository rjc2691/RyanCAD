# Toolbar customization

Open **Settings → Keyboard shortcuts**. Click the shortcut beside an action, then press the desired key combination. Escape cancels capture. Modifier keys alone are ignored. A conflicting assignment displays the action names and requires **Replace conflicting shortcut** before making changes. Replacement leaves conflicting actions **Unassigned**; it does not silently swap keys. Modeling and sketch-only shortcuts may share a key because they apply in different workflows. Header shortcuts participate in both scopes.

Changes take effect immediately in button tooltips, key badges and accessible shortcut attributes. Shortcuts invoke the actual button and respect its disabled state. Text entry, dialogs, menus and sketch dimension editing retain their own keyboard behavior. Browser-reserved combinations and existing navigation/edit controls cannot be reassigned through this editor. Enter/Escape, sketch Undo, ordinary Undo/Redo and viewport navigation retain their established bindings.

**Reset shortcuts to defaults** restores all editable shortcuts. **Reset toolbar order** independently restores the original button order. These preferences are stored in this browser under `ryancad-toolbar-v1`, separate from designs, workspaces and history.

| Modeling action | Default |
| --- | --- |
| Tool operation | T |
| Group components | G |
| Sketch | E |
| Move Component | M |
| Repeat part | Shift+D |
| Array parts | Shift+A |
| Measure | I |
| Checkpoint | Shift+S |
| Parameters | P |
| Experimental features | Shift+X |
| Bug reports | Shift+B |
| Settings | Shift+, |

Header defaults: Import Shift+I, Export Shift+E, Agents Shift+N, Account Shift+U, Command search Ctrl/⌘+K. Sketch defaults: Select V, Line L, Rectangle R, Circle C, Center arc A, Point P, Project J, Dimension D. The sketch toolbar shows these bindings while editing.

Drag a modeling toolbar button onto another button to place it before that button. The resulting order is also the keyboard/DOM order. Drags do not invoke the dragged action. The utility section still receives flexible space before its first button. On touch devices, or for keyboard access, use the earlier/later controls under **Settings → Toolbar order**. The divider beside Parameters has been removed.

## Adaptive sidebar layout

The toolbar-between-sidebars layout is permanent. On desktop, sidebars reach the header while the toolbar fits in the center column. Actual button widths determine fit, including custom shortcut labels and sketch tools. When that row needs more room, the toolbar uses the full window width and sidebars begin below it. If the full row is still too narrow, buttons scroll horizontally. It returns between the sidebars when room is available, with a small dead band to avoid resize flicker. Hidden sidebars and operation panels participate in sizing. Mobile keeps its existing full-width toolbar and panel layout.

The old `sidebar-toolbar-layout` experiment and both of its controls have been removed; stored values are ignored. Active component appearance preferences are preserved.

Verification: `scripts/toolbar_shortcuts.test.mjs`, `scripts/ui_toolbar_shortcuts_check.mjs`, `scripts/ui_toolbar_preferences_check.mjs` and `scripts/ui_adaptive_toolbar_check.mjs`.
