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

## Sidebar layout experiment

**Experimental features → Toolbar between sidebars** (`sidebar-toolbar-layout`) offers two layouts:

- **Sidebars beside toolbar** (`between`): both sidebars extend up to the header; the toolbar occupies the center column.
- **Full-width bar, inset buttons** (`inset-buttons`): the toolbar background spans the screen, with its independently scrolling button row inset to align with the viewport; sidebars begin below the toolbar.

The mode persists independently of its On/Off toggle. Turning the experiment off restores the standard toolbar. Both alternatives apply at desktop widths; mobile retains its existing layout. They support custom button order, hidden sidebars and operation panels.

Verification: `scripts/toolbar_shortcuts.test.mjs`, `scripts/ui_toolbar_shortcuts_check.mjs`, `scripts/ui_toolbar_preferences_check.mjs` and `scripts/ui_layout_experiment_check.mjs`.
