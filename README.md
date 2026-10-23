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

## Documents

- `docs/EDITOR_RESEARCH.md` — source-code architecture, release/APK references, licensing notes, and feature analysis.
- `docs/FEATURE_SPEC.md` — target feature inventory, including improvements beyond the references.
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

### Current functional slice\n\n- Dedicated artwork canvas with fit, zoom, pan, pixel-aligned pencil and eraser.
- Mobile virtual cursor: touch movement is view-only; a separate hold-to-draw/erase control is required to modify pixels.\n- Color selection, brush-size control, multiple layers and visibility toggles.\n- Undo/redo with tile-based pixel history and a bounded history-memory budget.\n- PNG/image import, transparent PNG export and editable `.pforge` project import/export.\n- Local IndexedDB autosave and most-recent-project recovery when browser storage is available.\n- Canvas-size, per-document pixel-memory and file-size safety limits.\n- Automated engine tests run with `npm test`; syntax checks run with `npm run check`.\n\n**Verification boundary:** GitHub Actions now passes 18 engine tests and a headless-Chromium smoke path covering startup, drawing, undo/redo, layers, PNG export, IndexedDB recovery, keyboard save and the mobile virtual-cursor/hold-to-draw contract. This does not yet establish real Android/stylus support, accessibility conformance, visual regression or performance under stress. See `docs/ENGINE_TEST_PLAN.md`. The first release remains a small end-to-end raster-editor slice; the broad feature specification is the long-term vision, not a claim that every feature is implemented.


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

For the optional headless browser smoke suite, install Playwright and Chromium, then run `node tests/browser-smoke.mjs`. CI does this in a separate job without adding Playwright as an app runtime dependency.
