# PixelForge AI — complete artist workflow matrix

This is the product acceptance matrix for the long-term goal: a capable, browser-based art studio for illustration, pixel art, game assets, concept art, photo-based paintovers, comics and 2D animation. It is a roadmap and test contract, **not a claim that all features are already implemented**.

## Product rule

Every advertised control must execute a real, testable operation. Unsupported file features must be reported before destructive conversion. All artwork-changing operations must be undoable or explicitly documented as non-destructive. The editor must remain useful with AI disabled and must not require a paid remote model.

## 1. Core studio and project management

- [ ] New document presets for icon, sprite, portrait, illustration, comic page, wallpaper and print; custom width/height, DPI/PPI metadata, background transparency and color settings.
- [ ] Multiple documents, tabs, duplicate, rename, close, close-all, dirty markers and unsaved-change guards.
- [ ] Native editable project format with schema version, migrations, checksums, validation and stable document/layer/frame IDs.
- [ ] Autosave, crash/refresh recovery, named snapshots, backup history, restore preview and storage quota warnings.
- [ ] Recent projects, local project browser, import-as-copy, safe replace confirmation and explicit storage usage controls.
- [ ] Searchable command palette, contextual menus, configurable shortcuts, temporary tools and shortcut reference.
- [ ] Dockable/collapsible panels, workspace presets, reset layout, UI scale, light/dark/high-contrast themes and focus mode.

## 2. Canvas navigation and visual aids

- [ ] Zoom around pointer, fit, 100%, pixel-perfect steps, pan, minimap, rotate view and reset view.
- [ ] Rulers, draggable guides, snapping, configurable pixel/grid overlays and perspective guides.
- [ ] Grids: none, pixel, rectangular, isometric and hex; spacing/subdivision, color and opacity.
- [ ] Symmetry guides (horizontal, vertical, radial) and seamless tile/repeat preview.
- [ ] Reference-image board with move, scale, opacity, lock and visibility controls.
- [ ] View overlays are separate from artwork pixels and excluded from export by default.
- [ ] Canvas resize, crop, trim transparent margins, center, rotate and flip; resampling is distinct from changing canvas bounds.

## 3. Drawing and painting tools

### Precision and pixel art
- [x] Pencil, eraser, connected/global bucket fill with tolerance, temporary eyedropper, rectangular selection overlay and pan.
- [ ] Pixel-perfect line, rectangle, ellipse, rounded rectangle, polygon, polyline, curve, spray and tile stamp.
- [ ] Dithering, indexed palette, color replace, outline, shading, lighten/darken and pattern fill.
- [ ] Tile-aware drawing and seam preview for repeatable game textures.

### Natural-media and illustration
- [ ] Brush engine with size, opacity, flow, hardness, spacing, shape, texture, angle, rotation, blending and stabilizer.
- [ ] Brush presets, import/export, tagging, favorites, searchable library, per-brush dynamics and reset-to-default.
- [ ] Pressure, tilt and barrel behavior where available; mouse/touch fallback; optional stroke smoothing and pressure curve.
- [ ] Smudge, blur, sharpen, dodge/burn, clone stamp and retouch tools with clear sampling rules.
- [ ] Line, curve and shape previews that can be cancelled before commit.
- [ ] Drawing assistants for perspective, parallel lines, ellipses and symmetry.

## 4. Selection, clipboard and transforms

- [x] Non-destructive rectangular marquee overlay.
- [ ] Ellipse, freehand lasso, polygon, magic wand, color-range and contiguous selections.
- [ ] Add/subtract/intersect, invert, feather, expand, contract, save/load selection and selection boundaries.
- [ ] Copy, cut, paste, paste-in-place, duplicate, floating selection and clipboard interoperability where browser permissions permit.
- [ ] Move pixels versus move selection; free transform, rotate, scale, flip, skew, perspective and corner pin.
- [ ] Transform preview, interpolation choice, cancel/commit and one coherent undo transaction.
- [ ] All operations clip safely to canvas bounds and never silently lose pixels.

## 5. Layers and compositing

- [x] Raster layers, visibility, lock, add, stack reorder and undo/redo for implemented operations.
- [ ] Rename, duplicate, delete with confirmation, opacity, blend modes, alpha lock, clipping, groups and color labels.
- [ ] Layer masks, clipping masks, vector/shape layers, editable text layers, reference layers, adjustment layers and effect layers.
- [ ] Merge selected, merge down, flatten copy, isolate, search, batch operations and layer visibility comps.
- [ ] Per-layer sampling options and clear distinction between active-layer and merged-image behavior.
- [ ] Blend/composite correctness verified against pixel fixtures; unsupported blend modes never silently fall back.

## 6. Color, palettes and print

- [ ] Foreground/background, swap, recent colors, color history and multi-stop gradient editor.
- [ ] RGB, HSL, HSV, HEX and alpha entry; numeric color channels and color sampler readout.
- [ ] Palette create, rename, reorder, lock, tags, favorites, global/document scopes and palette-from-image.
- [ ] Palette import/export for documented formats such as GPL, PAL, TXT and PNG.
- [ ] Color harmony helpers, contrast checks, color-vision simulation and accessible UI contrast.
- [ ] Explicitly supported color spaces, ICC profile handling and bit depth; accurate conversion only when implemented and tested.
- [ ] Print setup: physical dimensions, DPI metadata, soft-proofing where supported and clear warnings for unsupported CMYK/spot-color workflows.

## 7. Text, vector-like work and layout

- [ ] Editable text objects with font family, size, weight, line-height, letter spacing, alignment, paragraph boxes and text-on-path where feasible.
- [ ] Font availability warnings and safe fallback; text remains editable until explicitly rasterized.
- [ ] Paths and Bézier curves with editable nodes, fill, stroke, joins, caps and snapping.
- [ ] Shape layers, alignment/distribution, guides, margins, grids and reusable layout templates.
- [ ] SVG import/export capability matrix; rasterization choices are explicit and previewed.

## 8. Animation, sprites and game-art pipeline

- [ ] Timeline, frame/cel creation, duration, reorder, duplicate, delete, playback, loop and frame range.
- [ ] Onion skin with previous/next frame count, opacity, tint, and visibility controls.
- [ ] Frame tags, named animations, linked cels, cel copy/swap and keyframes for supported transforms/effects.
- [ ] Audio track and frame/audio sync where feasible.
- [ ] Sprite-sheet packing with rows/columns/maximum size, padding, extrusion, trim, pivots/origins and JSON metadata.
- [ ] PNG sequence, sprite sheet, GIF/APNG/WebP animation and video exports only when the output is implemented and verified.
- [ ] Tile sets and rectangular/isometric/hex tilemaps; autotiling rules and seam validation.
- [ ] Game-engine validation presets for Godot and common 2D pipelines: frame dimensions, alpha margins, pivots, naming, atlas limits and animation metadata.

## 9. Import, export and interoperability

- [x] Current slice supports PNG/JPEG/WebP/GIF still-image import, transparent PNG export and editable .pforge project import/export.
- [ ] Format-by-format support matrix: dimensions, alpha, layers, masks, text, animation, profiles and metadata preserved or flattened.
- [ ] PSD/ORA/SVG/TIFF/PDF and layered/animated formats added only with explicit tested capability boundaries.
- [ ] Export dialog with destination, format, scale, background, transparency, quality, frame range, selected layers and naming template.
- [ ] Batch export, slices/assets, frame sequences, ZIP packaging and export presets.
- [ ] Validate the actual exported file by reopening/decoding it in tests; never treat file existence alone as success.
- [ ] Warn before lossy export, flattening, unsupported metadata loss or overwriting an existing file.

## 10. Filters, effects and procedural helpers

- [ ] Non-destructive adjustment stack for levels, curves, hue/saturation, exposure, threshold, posterize, gradient map and palette reduction.
- [ ] Blur, sharpen, outline, drop shadow, noise and texture effects with preview and cancellation.
- [ ] Procedural generators for noise, clouds, terrain, tiles, icons, texture and palette ramps.
- [ ] Clearly label deterministic/procedural generation versus neural-model generation.
- [ ] Worker-based long tasks with progress, cancellation, memory estimate and recoverable failure state.

## 11. AI studio — safe, optional, and integrated

- [x] Independent AI sandbox snapshot and basic proposal lifecycle primitives.
- [ ] AI can inspect only the user-approved document/layers/regions and a frozen revision manifest.
- [ ] Task modes: explain, suggest, generate, edit selected region, remove/replace, extend canvas, cleanup line art, colorize, create variations and assist with asset preparation, depending on backend capability.
- [ ] Prompt, negative prompt where supported, model/backend selection, generation parameters, seed and reusable task presets.
- [ ] Mask/selection-aware input, transparent output where supported, reference images and explicit input/output dimensions.
- [ ] Task queue, progress, cancellation, retry, provider health, resource estimates, error details and result history.
- [ ] Before/after and side-by-side comparison, opacity wipe, zoom-synced previews and variation grid.
- [ ] Accept whole proposal, selected layers/regions or selected operations; reject proposal without affecting original; every acceptance is one undoable transaction.
- [ ] Revision conflict checks; never overwrite newer manual work or silently re-target a task after switching documents.
- [ ] Explicit consent before sending artwork off-device, clear destination/provider disclosure, privacy controls and deletion of temporary remote assets when supported.
- [ ] Credentials stay server-side; optional self-hosted adapters; no hidden paid API or network requirement for ordinary drawing.
- [ ] Procedural fallback is never misrepresented as neural AI; unavailable model features are disabled with explanation rather than fake success.

## 12. Mobile, touch and stylus parity

- [ ] Responsive layouts for phone, tablet and desktop; compact panels and configurable tool dock.
- [ ] Large touch targets, safe-area support, reachable controls, adjustable UI scale and landscape/portrait layouts as screen space allows.
- [ ] One-finger drawing, explicit navigation mode, two-finger pan/zoom/rotate, gesture cancellation and prevention of accidental strokes.
- [ ] Stylus pressure/tilt when browser/device supports it; palm rejection only where the platform exposes reliable signals.
- [ ] Virtual cursor/hold-to-draw fallback on touch-only devices; no hover-only functionality.
- [ ] On-screen undo/redo, color picker, selection handles, timeline controls and full export/import workflows on mobile.
- [ ] Test actual Android devices at low memory and modest CPU; document browser limitations honestly.

## 13. Accessibility, localization and ergonomics

- [ ] Keyboard navigation and shortcuts for every essential action; visible focus and screen-reader names.
- [ ] UI contrast, scalable text, non-color-only state cues and reduced-motion option.
- [ ] Tooltips and contextual help with input-specific instructions; avoid tooltips as the only way to learn a feature.
- [ ] Localization-ready strings, number/date formatting and no hard-coded UI text in core logic.
- [ ] Autosave state, task progress, errors and destructive confirmations announced accessibly.

## 14. Performance, safety and quality gates

- [ ] Dirty-region rendering, bounded memory, sparse/tiled storage evaluation and worker-based heavy operations.
- [ ] No full-canvas clone per pointer sample; no long synchronous operation without progress/cancellation where appropriate.
- [ ] Import preflight, decompression limits, dimension validation, malformed-file tests and untrusted metadata isolation.
- [ ] Unit tests for algorithms, pixel-exact fixtures, undo/redo, serialization, conflict handling and export reopen.
- [ ] Browser smoke/E2E tests for keyboard, mouse, touch and document lifecycle.
- [ ] Visual regression, accessibility audit, stress test, memory profile and real-device test records.
- [ ] Every release documents browser/device, test commands, pass/fail/blocked status and known limitations.

## Delivery sequence

1. **Integrity and daily-use basics:** multi-document lifecycle, save/recovery, selection clipboard, transforms, robust history and command palette.
2. **Professional raster core:** brush engine/presets, shapes, selections, layers/groups/masks, gradients and color workflows.
3. **Asset production:** animation timeline, sprite-sheet exporter, tilemaps, game-engine validation and batch export.
4. **Design/illustration depth:** editable text, paths, adjustments, reference board, print/color management and import interoperability.
5. **AI integration:** task queue, provider adapters, masks, variations, revision-safe proposals and user-approved apply.
6. **Release quality:** mobile device testing, accessibility, performance, security, documentation and deployment.

Each phase is delivered as integrated vertical slices with UI, core implementation, persistence, tests and documentation. Do not add a toolbar button before its behavior exists. Do not mark a feature verified without passing evidence.
