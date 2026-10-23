# Editor research — PixelForge AI

Research baseline: 23 October 2026. Links below point to upstream projects and their official release/documentation locations. This is a feature and architecture study, not a claim that every binary has been downloaded or every menu has been exhaustively tested.

## 1. Pixelorama — primary feature benchmark

- Source: https://github.com/Orama-Interactive/Pixelorama
- Releases (includes the official Android APK when supplied for a release): https://github.com/Orama-Interactive/Pixelorama/releases
- Documentation: https://orama-interactive.github.io/Pixelorama-Docs
- License: MIT, according to the upstream repository.
- Latest release observed during this research: v1.2.3, dated 15 September 2026.
- Official release assets included `Pixelorama.apk` (~95 MB), plus desktop builds. The project also provides a web build, but upstream describes early-access web builds as potentially unstable.

### Features worth matching or improving
- Broad drawing-tool collection and configurable left/right mouse tools.
- Timeline with frames and layers, onion skinning, frame tags, audio synchronization, and drawing during playback.
- Pixel-art-specific scaling/rotation algorithms and indexed color mode.
- Rectangular, isometric, and hexagonal tilemaps; autotiling.
- Clipping masks, layer effects, outlines, gradient maps, drop shadows, blend modes.
- Palette management, grids, guides, tiled drawing, automatic backups.
- PNG, animated PNG, GIF, sprite sheets, video and additional format export/import.
- 3D layers and drawing on 3D objects, project metadata, extensions, CLI export automation.
- Recent release notes also show keyframe animation for opacity/effects, SVG export, and other workflow refinements.

### Architectural lesson
Pixelorama is built on Godot/GDScript. Its design and workflows are excellent references, but porting the full application to a browser would be a major rewrite, not a direct copy/paste job. We should model the capabilities and implement the web engine in TypeScript/Web APIs. MIT allows reuse with license/notice obligations if we choose to reuse particular code; default approach is independent implementation.

## 2. Piskel — web architecture benchmark

- Source: https://github.com/piskelapp/piskel
- Releases: https://github.com/piskelapp/piskel/releases
- Live editor: https://www.piskelapp.com/
- License: Apache-2.0, according to upstream.
- Latest release listed by the repository during this research: v0.15.0. Its source repository is a JavaScript/HTML/CSS browser application; upstream README says it does not support mobile/tablets.

### Architecture patterns observed in the source
The source's `src/piskel-script-list.js` explicitly separates:
- core configuration and event bus;
- utilities for pixels, colors, frames, layers, serialization and resizing;
- document models for Piskel, frames, layers and palettes;
- selection managers and selection types;
- drawing loop, canvas/layer/frame renderers and onion-skin renderer;
- controllers for drawing, tools, transforms, frames, layers, palettes, import/export and settings;
- persistence, IndexedDB backups, history/undo and palette import/export;
- GIF/PNG/ZIP exporters and browser workers.

### Lessons
This separation is directly relevant to a browser editor. We should preserve a clean boundary between document state, rendering, tool input, history, persistence, UI, and export. We should not inherit Piskel's lack of touch support, limited extensibility, or older architecture constraints.

## 3. LibreSprite — precision and native-editor architecture benchmark

- Source: https://github.com/LibreSprite/LibreSprite
- Releases: https://github.com/LibreSprite/LibreSprite/releases
- License: GPL-2.0, according to upstream.
- Its latest release page during this research listed desktop builds and source archives, but no Android APK in the visible assets. Use the upstream releases page to check for future assets rather than downloading APKs from third-party mirrors.

### Features and source structure
- Real-time animation preview and onion skinning.
- Multiple sprites/documents, palettes, frames and layers.
- Tiled drawing, pixel-precise shape tools, shading mode and several sprite formats.
- Source modules are explicitly layered: base utilities, document model, platform abstraction, filters, renderer, UI, application and undo/history. The source README also describes a reusable undo library.

### Lessons
The document model and undo system should not be coupled to a specific UI framework. Filters, rendering, and input/platform handling should be independent modules. GPL-2.0 has stronger copyleft obligations than MIT/Apache-2.0; do not copy GPL code into PixelForge unless we intentionally accept and comply with those obligations.

## 4. Krita — general 2D painting benchmark

- Official downloads/source: https://krita.org/en/download/
- License: GPL-3.0 for Krita as a whole, according to its official licensing page: https://krita.org/en/about/license/
- The official download page links Android builds separately. Krita is a broad painting application rather than a pixel-art-first editor.

### Workflows to learn from
- Brush engines and brush presets, pressure-sensitive tablet input, stabilizers, blending and color management.
- Selections, masks, layers, transforms, filters, reference images, assistants/guides, and customizable workspaces.
- Large-canvas performance and recovery features.

### Lessons
PixelForge needs a raster-painting mode beyond pixel-art tools: configurable brushes, pressure/tilt where available, selection masks, non-destructive adjustment/effect layers, reference images, and color-aware export. Krita's GPL-3.0 means its code is a feature reference only unless we explicitly choose a compatible copyleft strategy.

## 5. Android/APK acquisition notes

Official sources found:
- Pixelorama Android APK is listed as a release asset: https://github.com/Orama-Interactive/Pixelorama/releases
- Krita's official download page offers Android APK builds: https://krita.org/en/download/
- LibreSprite's official release page is the correct place to check assets: https://github.com/LibreSprite/LibreSprite/releases
- Piskel is a browser/desktop project and upstream says it does not support mobile/tablets; it is a source-code reference rather than an Android APK target.

For safety and provenance, use only upstream releases and official project pages, not repackaged APK mirror sites. APKs can help verify Android-specific UI behavior, touch targets, stylus shortcuts, and performance; the source code is the stronger reference for internal architecture. The binary assets are not being committed to this repository: they are large, unnecessary for the web build, and may have separate redistribution implications.

## 6. Licensing and implementation policy

| Project | License | How PixelForge will use it |
|---|---|---|
| Pixelorama | MIT | Feature benchmark; selectively reusable code only with required notices |
| Piskel | Apache-2.0 | Browser architecture benchmark; any reuse must preserve license and notices |
| LibreSprite | GPL-2.0 | Behavior and module-architecture reference; no code copying by default |
| Krita | GPL-3.0 | Painting workflow reference; no code copying by default |

We will not copy proprietary Aseprite code or assets, remove attribution, or reproduce another product's exact branding/UI. Aseprite itself moved away from GPL after 2016; LibreSprite is a separate fork from the last GPLv2-covered commit. Implement common editing concepts in original code and track provenance for any dependency or borrowed snippet.

## 7. Initial conclusions

1. Pixelorama is the strongest broad feature checklist.
2. Piskel provides the clearest web-native architectural reference.
3. LibreSprite is useful for understanding document/render/history separation and precise sprite workflows.
4. Krita reveals the raster-painting features needed for a genuinely useful 2D mode.
5. The biggest differentiators should be: robust touch/stylus support, autosave and crash recovery, command palette, reusable actions/macros, non-destructive edits, advanced selection/transform, palette tools, batch export, accessibility, plugin API, and AI-assisted workflows that remain optional and transparent.
