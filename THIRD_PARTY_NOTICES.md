# Dependency and license inventory

Runtime versions are pinned in `pyproject.toml` and fully resolved in `uv.lock`; client dependencies are resolved in `frontend/pnpm-lock.yaml`. These are the versions exercised locally, not a promise that arbitrary newer versions are compatible. RyanCAD's own distribution license has not been selected by its owner.

| Dependency | Tested version | Upstream license / source |
|---|---|---|
| Python | 3.12.14 | PSF; standard library for storage, processes, AST and filesystem. |
| build123d | 0.13.0 | Apache-2.0; [source](https://github.com/gumyr/build123d). |
| cadquery-ocp-novtk / proxy | 8.0.1.1.0 | Apache-2.0 bindings; [OCP](https://github.com/CadQuery/OCP). Native OCCT has separate obligations. |
| OCCT | 8.0.1 | LGPL-2.1 with OCCT exception; [kernel license](https://dev.opencascade.org/resources/licensing). |
| planegcs | 0.9.6 | LGPL-2.1-or-later; FreeCAD PlaneGCS through [standalone binding](https://github.com/spookylukey/planegcs). |
| Pydantic / core | 2.14.1 / 2.50.1 | MIT. |
| FastAPI | 0.161.1 | MIT. |
| Uvicorn | 0.54.0 | BSD-3-Clause. |
| PyYAML | 6.0.3 | MIT. |
| HTTPX | 0.28.1 | BSD-3-Clause. |
| Official MCP Python SDK / types | 2.3.0 | MIT. |
| NumPy | 2.5.4 | BSD-3-Clause and bundled component notices. |
| React / React DOM | 19.3.1 | MIT. |
| Three.js | 0.180.0 | MIT. |
| lucide-react | 0.468.0 | ISC; included icon/package notices. |

This table is a primary-dependency inventory, not a substitute for transitive package notices. Installed wheels retain their own metadata/licenses, including NumPy's bundled libraries and native binary dependencies. Development-only tools include pytest, Vite, TypeScript, pnpm and Prettier; browser automation uses Playwright and the locally installed browser.

The bundled interface includes React/React DOM, scheduler, Three.js and Lucide notices verbatim in `frontend/public/third-party-licenses.txt`, copied into the production build and installed wheel. Python dependencies are installed as their upstream packages with their own license files. The wheel does not statically incorporate the kernel or solver into RyanCAD's Python source.

Personal-use implementation has not chosen a commercial/open-source distribution strategy. Before distributing a self-contained runtime, inventory every shipped binary and preserve the applicable license texts, source/relinking rights and OCCT exception. The helper/binding license does not remove native-library obligations. No paid geometry SDK or model service was introduced.
