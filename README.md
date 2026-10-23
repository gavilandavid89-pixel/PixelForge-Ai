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

### Current functional slice\n\n- Dedicated artwork canvas with fit, zoom, pan, pixel-aligned pencil and eraser.\n- Color selection, brush-size control, multiple layers and visibility toggles.\n- Undo/redo with tile-based pixel history and a bounded history-memory budget.\n- PNG/image import, transparent PNG export and editable `.pforge` project import/export.\n- Local IndexedDB autosave and most-recent-project recovery when browser storage is available.\n- Canvas-size, per-document pixel-memory and file-size safety limits.\n- Automated engine tests run with `npm test`; syntax checks run with `npm run check`.\n\n**Verification boundary:** engine unit tests and syntax checks can pass without proving browser rendering, IndexedDB behavior, downloads, touch input or visual quality. Those still require browser automation and real-device checks. See `docs/ENGINE_TEST_PLAN.md`. The first release remains a small end-to-end raster-editor slice; the broad feature specification is the long-term vision, not a claim that every feature is implemented.
