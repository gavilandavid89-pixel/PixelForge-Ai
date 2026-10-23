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
- `docs/ARCHITECTURE.md` — proposed modular web-editor architecture and implementation priorities.

## Product principles

1. Editing actions must actually work; no decorative, nonfunctional toolbar controls.
2. Preserve pixel precision while supporting ordinary raster painting.
3. Use non-destructive operations where possible and reliable undo/redo everywhere.
4. Keep project files portable, document formats explicit, and exports predictable.
5. The editor must be useful without AI. AI is an optional assistant, not a dependency for drawing.
6. Clearly distinguish procedural generation from neural-model inference; never label one as the other.
7. Optimize for desktop first while keeping touch, stylus, and mobile layouts in mind.
