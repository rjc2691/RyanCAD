# Development

## Set up and rebuild

Follow the [root installation steps](../../README.md), including OS native dependencies. For reproducible Python development, install `uv` before running bootstrap; it uses the checked-in lockfile. The pip fallback installs the pinned direct dependencies but is not equivalent to a frozen transitive environment.

From the repository root:

```text
uv sync --frozen --extra dev
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
```

- Frontend changes: rebuild, then refresh the browser. The Python server serves `frontend/dist` in a source checkout.
- Python changes: restart the server.
- `pnpm dev` starts a standalone Vite server; the current Vite config has no API proxy. Use the normal built interface for integrated work unless you configure a development proxy.
- Use an isolated data namespace/port for development checks; do not test mutations against someone's open design.

## Validation

Run from the repository root. Commands below use `uv run`; alternatively use the environment's Python directly.

| Check | Command / scope |
|---|---|
| Native installation | `uv run python -m ryancad.check_install` — in-memory solid and sketch solve |
| Backend suite | `uv run python -m pytest -q --basetemp=.cache/dev-tests` |
| UI types and build | `pnpm --dir frontend build` |
| Pure UI model tests | `node --test "scripts/*.test.mjs"` — use Node 24 for these tests, which import TypeScript directly |
| Public design geometry | `uv run python scripts/smoke_geometry.py` |
| Engine timings | `uv run python scripts/benchmark.py` — writes `artifacts/benchmark.json`; not a comparison with commercial CAD |

Target tests to the change, then run the broader suite for release work. Tests use real native geometry where correctness depends on it; mocked success is insufficient for modeling/persistence changes.

### Browser checks

`scripts/ui_*_check.mjs` are headless integration checks, not a command to run against a live user's browser. Many create/modify designs and write artifacts.

1. Read the chosen script's prerequisites and expected starting state.
2. Start an isolated server, commonly:

   ```text
   uv run python -m ryancad --project .cache/ui-check.rycad --port 8898 --no-browser --no-tray --no-lan
   ```

3. Provide Playwright through a local test environment. It is not a production dependency. Scripts support `PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_CHANNEL`; many default to installed Edge (`msedge`).
4. Run the selected script, inspect failures/screenshots, then stop the test server.

Start fresh isolated data when a script requires it. Never point `check_mcp.py --workflow` at meaningful data; it authors operations. `check_mcp.py --help` lists explicit connection/target arguments.

## Make a change

| Change | Update together |
|---|---|
| Model/command | Pydantic validation, reducer, service invariants, capability descriptions, backend tests |
| Geometry operation | Recipe/schema, evaluator, preview and commit behavior, failure/cancellation tests |
| UI workflow | Draft/selection logic, panel and viewport references, hotkeys, narrow-screen access |
| Storage/transfer | Round-trip, history/retry semantics, corrupted-input and recovery tests |
| MCP behavior | HTTP contract, session registration/leases, permissions, adapter tests |

Keep numeric authority in the engine. UI shortcuts and MCP actions must reach the same validated commands. Preserve saved revisions on failure. Do not silently reintroduce cross-component constraints, auto-named public parameters, or a second sketch viewport.

## Package and release

```text
pnpm --dir frontend build
uv build --wheel
```

The wheel includes built assets and public seed designs. It requires a compatible Python/native runtime, but no Node installation to run. Before distribution, install it in a clean environment **outside the source checkout**, run `check_install`, launch it, and check bundled assets, default workspace, modeling, restart recovery, and exports. `scripts/check_wheel.py` is an additional harness with a specific `.cache/package-proof` installation layout; read it before use.

[CI](../../.github/workflows/verify.yml) defines Windows/macOS/Ubuntu checks for build, native runtime, pytest, and wheel packaging. A configured job is not proof of a successful release run; record actual results for the candidate.

## Documentation rules

- Product behavior → `docs/product/`; implementation/build details → `docs/development/`.
- Put every UI workflow in the single [UI guide](../product/USER_GUIDE.md). Backend contracts must make sense without it.
- Replace outdated text; avoid appending dated implementation logs or one document per small feature.
- Keep exact schemas in code/capabilities. Document rules and examples rather than duplicating the entire schema.
- Track proposed work and release gaps in [BETA.md](BETA.md); use bug reports for individual defects. Do not present plans as shipped behavior.
