# Current-version cleanup audit — October 30, 2026

The user authorized removal of obsolete migrations and all development data except the design currently open. This pass applies to the local checkout and local server; it does not access or purge an EC2 deployment.

## Removed

| Area | Change |
|---|---|
| Standalone server project | Removed its eager service/worker startup and fallback request routing. An old `default.rycad` journal can no longer be opened implicitly. `--project` now selects a storage namespace, not a live design. |
| Server-project migration | Removed `copy_legacy`, `/api/workspace/copy-existing`, `legacy_available`, the workspace-menu button and its CSS. Native design and workspace imports remain explicit actions. |
| Startup demos / standalone CLI restore | Removed `--demo` and `--restore`; both platform launchers start normally without a mold seed. Current reference recipes remain available from Import. |
| MCP fallback | Workspace selection is required. Discovery remains registration-free; actual tool calls use the selected workspace/design. The stdio acceptance script now takes both scope arguments. |
| Tool search | Removed the header button, command-palette dialog, query state/filtering, Ctrl/Command+K binding, settings entry and unused search/palette styling. Header controls retain their right alignment. |
| Old component browser | Removed the obsolete unstructured tree, its drag/drop state, helpers and retired tests. The current Parts/Layouts tree and its own drag/drop remain. |
| Naming repair command | Removed `document.normalize_names` and its migration-only test. Current parts/layouts enforce their own names; components may repeat names. |
| Retired UI scripts | Removed the old modeling and measurement scripts that depended on All tools / command palette and superseded modal workflows. Current workflow smoke coverage remains. |
| Generated data | Purged old runtime projects/workspaces, standalone journals, exports, old connection files, caches, generated example archives/STLs, supplied development meshes and prior screenshot/report artifacts. Kept the artifact output directory and reference-generation source. About 1.4 GB was removed. |

## Preserved data

**Concrete Block Silicone Mold**, revision **34**, **29 features**, was identified in the active Brave window and matched to its saved workspace. Its `manifest.yaml`, complete `journal.sqlite3` and workspace identity were retained. Other design entries in that workspace were removed. Its old generated exports were purged. SQLite integrity/checksum validation passed before cleanup; the restarted server returned the same name, revision and feature count.

The preserved workspace has one design. Browser cookies for deleted workspaces now receive a fresh workspace when opening the app. No copied backup design is retained that could later reappear through migration UI.

## Retained because current features use them

- `normalize_structure` and structure initialization: current primitive/operation/recipe commands use these to organize new bodies into Parts and Layouts. They are not an on-start import of old files.
- `simplify_values` and reference snapshots: current commands use private numeric values, explicit named parameters and frozen construction references. Removing these would change current editing and movement behavior.
- Primitive/native feature evaluators and guarded selection encodings: current reference recipes, authored operations, editable history and native import/export depend on them.
- Sketch angle conversion: preserves the intended interior angle and named expressions during normal dimension editing.
- Model validators, preference normalization, safe native journal restore and readable snapshots: these protect the current file format and current user settings rather than resurrecting obsolete projects.
- Explicit reference recipes and the generator remain source-based fixtures; generated saves and meshes are not shipped historical data.

## Verification and limits

- TypeScript and production frontend build passed.
- Frontend unit checks passed, including shortcut removal and current timeline behavior.
- Targeted backend checks covered API commands/previews, movement with current layout occurrence IDs, workspace routing/recovery, native imports, folder transfer, MCP scoping, parts/variations, network origins and shared reports. Old flat-instance assumptions in API tests were updated to current structured occurrence IDs/counts.
- An isolated browser smoke check verified the missing search/palette and migration controls, plus current workspace, Part/Component Editor, Tool and Sketch flows.
- The local server was restarted. Computer Use could not safely verify the browser URL for the final refresh, so the user should refresh the open page. No further browser input was attempted.

Earlier implementation records and planning documents can describe prior iterations; deleted screenshots and generated data are historical evidence, not runtime dependencies. Development caches and logs may be recreated by normal builds and server use.
