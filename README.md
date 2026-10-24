# PixelForge AI

An original browser-based editor for pixel art and general 2D raster drawing, designed around precise tools, animation, reusable assets, and future local/self-hosted AI helpers.

## Project rule

Research and define the editing engine before building the visual interface. Use public documentation and open-source projects to learn workflows and feature expectations. Do not copy proprietary code, artwork, icons, or branding. Any reused code must comply with its license and retain required notices.

## Research references

- [Pixelorama source (MIT)](https://github.com/Orama-Interactive/Pixelorama)
- [Pixelorama Android/web/desktop releases](https://github.com/Orama-Interactive/Pixelorama/releases)
- [Piskel source (Apache-2.0)](https://github.com/piskelapp/piskel)
- [LibreSprite source (GPL-2.0)](https://github.com/LibreSprite/LibreSprite)
- [Krita source and license](https://krita.org/en/about/license/)

## Current editing tools

- **Multi-part symmetry:** turn mirroring off or draw in 2, 4, or 8 linked parts. Pencil, eraser, and geometric tools share one gesture and one undo step. Eight-way rotations use real document-space geometry and clip to bounds on non-square canvases instead of stretching the artwork.
- **Selection-aware pixel editing:** rectangular selections constrain pencil, eraser, fill, color replacement, clearing, paste and flips. Copy/cut/paste uses an internal active-layer clipboard; cut and paste are reversible document edits.
- **Pixel transformations:** horizontal/vertical flips work on the selected rectangle or the full active layer. Line and rectangle tools use integer Bresenham rasterization; ellipse outlines are connected pixel-stepped paths. One-pixel sprite outlines preserve existing pixels and can be limited by the active selection.
- **Game asset workflow:** start with templates for character sprites, icons, environment tiles, UI elements, backgrounds and VFX, each with useful editable layers. Export each layer as a padded sprite-sheet frame plus a JSON manifest with frame coordinates, dimensions, visibility, opacity, and centered pivots. Arbitrary atlas packing and engine-specific presets remain planned.
- **Color workflow:** foreground/background swap (X shortcut), eight recent colors, a browser-persisted user palette with GPL import/export, and exact active-layer color replacement that preserves alpha.
- **Painterly foundation:** brush/eraser opacity uses source-over alpha compositing; square and circular brush tips support adjustable hardness with partial edge alpha. A linear foreground-to-background gradient has a non-destructive drag preview and one-step undo. Bucket fill supports checker dithering with adjustable pattern scale.

## Documents

- `docs/EDITOR_RESEARCH.md` — source-code architecture, release/APK references, licensing notes, and feature analysis.
- `docs/FEATURE_SPEC.md` — target feature inventory, including improvements beyond the references.
- `docs/ARTIST_WORKFLOW_MATRIX.md` — detailed acceptance matrix for painting, design, animation, game assets, AI, mobile, accessibility and release QA.
- `docs/MASTER_MAP.md` — master roadmap split into Pixel art, General 2D art, and Video-game/game-asset production, with shared dependencies and truthful implementation checkboxes.
- `docs/ARCHITECTURE.md` — modular editor architecture, input/document contracts, renderer policy and implementation priorities.
- `docs/AI_TOOL_API.md` — AI tool registry, permissions, proposal lifecycle and command contract.
- `docs/ENGINE_TEST_PLAN.md` — central acceptance matrix, release gates, adversarial scenarios and manual test record template.
- `docs/DECISIONS.md` — accepted defaults, provisional behavior, format support and release blockers.
- `docs/REVIEW_AUDIT.md` — multi-angle audit findings, resolutions and remaining release gates.

## Product principles

1. Editing actions must actually work; no decorative, nonfunctional toolbar controls.
2. Preserve pixel precision while supporting ordinary raster painting.
3. Use non-destructive operations where possible and reliable undo/redo everywhere.
4. Keep project files portable, document formats explicit, and exports predictable.
5. The editor must be useful without AI. AI is an optional assistant, not a dependency for drawing.
6. Clearly distinguish procedural generation from neural-model inference; never label one as the other.
7. Share the engine across desktop and mobile, adapting the workspace and input ergonomics to each device.


## Current implementation status

The repository now includes an early, dependency-free raster-editor slice as well as product documentation. It is not yet a complete professional editor; AI sandbox, advanced tools, animation, broad format support and browser/device acceptance coverage remain planned.

Use these labels consistently:
- **Planned** — described but not implemented.
- **Implemented** — code exists; verification may still be incomplete.
- **Verified** — required tests passed in a named environment.
- **Unsupported** — deliberately unavailable for the current build.
- **Blocked** — a named prerequisite prevents implementation or verification.

### Current functional slice

- Dedicated artwork canvas with fit, zoom, pan, pixel-aligned pencil and eraser, connected/global bucket fill with color tolerance, and a temporary eyedropper that samples the visible composite or active layer.
- Mobile touch drawing: dragging on the canvas with pencil/eraser draws immediately; the touch cursor remains visible, the hold-to-draw control is retained as an alternate input, and the pan tool remains explicit for navigation.
- Line, rectangle-outline, and ellipse-outline tools show a temporary on-canvas preview during drag, then commit the final pixel geometry as one atomic undoable action; Escape/tool switching cancels an uncommitted preview.
- Color selection, a conventional brush-size slider plus a center-origin quick-size gesture (drag left to thicken, right to thin, with nonlinear distance response and automatic visual recentering), multiple layers, visibility, lock, stack ordering, rename, duplicate, delete and opacity, with undo/redo; mobile-sized inspector tabs switch between tool settings and layer management. Rectangular marquee selection is a non-destructive canvas overlay with drag-to-select and Escape-to-clear; Delete/Backspace clears selected active-layer pixels as one undoable operation. A toggleable pixel-grid overlay is clipped to the visible canvas and remains outside document pixels and exports; rectangular/isometric/hex grids remain planned. Rectangular selections constrain pencil, eraser, fill, clear, color replacement, paste and flips; Ctrl/Cmd+A selects the full canvas. Internal active-layer copy/cut/paste, horizontal/vertical flips, one-pixel sprite outlines and exact color replacement are undoable. Sprite-sheet export emits a padded PNG plus a JSON frame manifest.
- Undo/redo with tile-based pixel history and a bounded history-memory budget.
- PNG/JPEG/WebP/GIF import with bounded header preflight before decoding (animated files flatten to a still frame), transparent PNG export and editable `.pforge` project import/export. Imported projects receive fresh document/layer IDs so they cannot overwrite their source.
- Local IndexedDB autosave, a saved-project picker (open/switch local projects), and recovery of the last-opened project.
- Canvas-size, per-document pixel-memory and file-size safety limits.
- Automated engine tests run with `npm test`; syntax checks run with `npm run check`.

**Verification boundary:** GitHub Actions run [#40118969942](https://github.com/gavilandavid89-pixel/PixelForge-Ai/actions/runs/40118969942) passes both core checks and the headless-Chromium browser smoke suite. The core job reports **57 passing Node tests, 0 failures**. Coverage includes selection masks, clipboard round trips, color replacement, layer flips, sprite outlines, dither fill, brush/eraser opacity, bounded sprite-sheet layout, palette import/export, and existing document/persistence/input safety tests. Browser smoke covers desktop/mobile layouts, drawing and history, project/image import-export, palette persistence and GPL download, checker dither controls, selection cut/paste and select-all, sprite-sheet PNG/JSON downloads, and symmetry on rectangular canvases. This still does not establish real Android hardware/stylus support, full accessibility conformance, visual regression, or stress performance. See `docs/ENGINE_TEST_PLAN.md` and `docs/MASTER_MAP.md`; unchecked roadmap items remain incomplete.

## Licensing status

The repository does not yet declare a project-wide reuse license. Public visibility on GitHub is not a license grant. Until the owner selects a license, do not advertise this project as open-source or copy code/assets from the benchmark projects into it. The current editor slice has no third-party runtime dependencies; reference projects are research sources only.


## Run locally

Requires Node.js 20 or newer for the test commands. The editor itself has no runtime package dependencies.

```bash
npm test
npm run check
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser. Use a local HTTP server rather than opening `index.html` directly so ES modules and IndexedDB behave consistently.

For the optional headless browser smoke suite, run `npm install --no-save --package-lock=false playwright@1.55.0`, then `npx playwright install chromium` and `node tests/browser-smoke.mjs`. CI does this in a separate job without adding Playwright as an app runtime dependency.
