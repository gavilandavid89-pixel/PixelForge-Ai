# PixelForge AI — accepted decisions and implementation status

This file records current defaults so product, architecture, UI and tests do not silently make different assumptions. A decision marked **Provisional** is valid for the early slice but must not be represented as a full-product promise. A decision marked **Blocked** needs an owner decision before the affected feature can ship.

## Accepted defaults

| Topic | Current decision | Status / consequence |
|---|---|---|
| Product target | Responsive browser editor, shared document engine, desktop and mobile layouts | Accepted; physical Android support is not yet verified |
| Renderer | Dedicated HTML canvas surface using Canvas 2D for the first slice | Provisional; change backend only when measured budgets justify it |
| Desktop input | Mouse/stylus directly draw with the active pencil/eraser; Space+drag or Pan tool navigates | Implemented in the first slice |
| Mobile input | Touch moves a view-only virtual cursor; the separate hold control applies the selected pencil/eraser; Pan tool navigates | Implemented and covered by Chromium mobile emulation; physical Android still required |
| Document coordinates | Integer pixel coordinates in document space, independent of screen/layout coordinates | Accepted |
| Pixel brush | Hard-edged square stamp with integer size; size 1 is one pixel | Implemented |
| Layers | Ordered RGBA layers with visibility, active-layer selection and add-layer; default normal compositing at 100% opacity | Provisional first-slice subset; rename/reorder/delete, opacity editing, masks, groups and blend-mode controls are not shipped |
| Color | 8-bit RGBA buffers, browser-default sRGB canvas behavior; no ICC-profile-managed editing workflow in this slice | Provisional; color-management features are planned |
| Native project | Version 1 `.pforge` file is JSON containing document metadata and base64-encoded RGBA layer buffers | Provisional bootstrap format; uncompressed and not a final archival format |\n| Project import identity | Importing a `.pforge` creates a copy with fresh document and layer IDs and reset revision/history; the source record remains available in the local project picker | Implemented and covered by browser smoke tests |
| Image import | Browser-decoded PNG/JPEG/WebP and GIF first frame, plus `.pforge` project JSON | Browser-decoder dependent; animated GIF timelines are not imported |
| Image export | PNG with transparent pixels preserved; editable project export is separate | Implemented; no other export formats are advertised |
| Persistence | IndexedDB stores local project snapshots, a basic saved-project list/open picker, and a separate last-opened timestamp; startup recovers the last-opened project | Implemented; rename/delete, multi-tab editing and cross-device sync are not shipped |
| Autosave | Debounced save after changes, plus manual save and Ctrl/Cmd+S; storage failures are reported | Implemented; save failure must not be described as success |
| History | One action per stroke, 64×64 tile snapshots, maximum 30 entries and 64 MiB estimated history payload | Provisional guardrails; large edits may evict older undo entries |
| Resource limits | 2048 px per side, 4,194,304 total pixels, 64 MiB total raw layer pixels, 64 layers subject to the pixel budget, 100 MiB import-file cap | Implemented safety limits for the bootstrap build |
| AI | No provider-backed AI, sandbox, proposal review or remote transfer is implemented in the current app slice | Planned only; the AI API document is a contract, not a claim of a working agent |
| Performance | Dirty-tile compositing/render updates and bounded memory; numeric latency budgets wait for named-device baselines | Partially implemented; no universal FPS/latency claim |
| License | No project-wide reuse license is declared. Public visibility is not permission to reuse the code. | **Blocked for external release** until the repository owner chooses a license |
| Third-party code | Research repositories are references only; no code/assets/branding are copied from them in this slice | Accepted |

## Canonical source of truth by topic

- Product behavior and long-term vision: `docs/FEATURE_SPEC.md`.
- Architecture and cross-module invariants: `docs/ARCHITECTURE.md`.
- AI tool names, permission enforcement and proposal transaction rules: `docs/AI_TOOL_API.md`.
- Acceptance tests and release gates: `docs/ENGINE_TEST_PLAN.md`.
- This file records accepted choices and marks provisional/blocked decisions; it does not override security requirements in the architecture or AI API.

## Change-control rule

A behavior change that affects multiple areas must update the relevant spec, architecture/API contract, and acceptance tests in the same change. If an implementation cannot meet a requirement, mark it unsupported/blocked and explain the limitation; do not silently reinterpret the requirement. Any new format/tool shown as available must have a working command and a test that proves its advertised behavior.
