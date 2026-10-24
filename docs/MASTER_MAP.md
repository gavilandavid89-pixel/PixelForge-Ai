# PixelForge AI — master product map

Single source of truth for three areas: **Pixel art**, **General 2D art**, and **Video-game/game-asset production**. Documentation alone never counts as implementation. A box is checked only when working behavior and verification exist.

## Product-wide contract
- [x] Browser raster editor, modular ES modules and CI.
- [x] Local-first projects, versioned .pforge serialization and independent project import.
- [x] AI workspace/proposal primitives isolated from canonical artwork.
- [ ] Every artwork mutation uses one atomic, reversible command; no silent history gaps.
- [ ] Pixel-verified save/open/import/export round trips and malformed-file defenses.
- [ ] Mobile touch, keyboard/mouse parity, accessibility, reduced motion and localization acceptance tests.
- [ ] No remote artwork upload without explicit consent; no hidden paid-model dependency.
- [ ] AI may operate editor tools, but cannot delete the project or export project/content without explicit user action.
- [ ] Large-operation memory budgets, progress/cancel, recovery and performance tests.
- [ ] Every visible control works; unsupported capabilities are labeled, not simulated.

## Shared core (dependencies for all areas)
### Document, pixels, layers, persistence
- [x] RGBA raster document with dimension/memory limits.
- [x] Raster layers, visibility, lock, stack ordering and tiled composite cache.
- [x] Pencil, eraser, connected/global fill with tolerance and merged/active-layer eyedropper.
- [x] Tile-patch undo/redo for strokes and fill.
- [x] Versioned project serialization, validated import and local autosave.
- [x] Layer rename, duplicate, delete and opacity with undo/redo, including memory limits and last-layer protection.
- [x] Persistent-in-session selection mask constrains pencil, eraser, bucket fill and clearing; masks are dimension-validated and intentionally excluded from artwork serialization.
- [ ] Selection mask support for shape tools, copy/cut/paste and transforms.
- [ ] Unified command/transaction API for tools, filters, selections and AI edits.
- [ ] Schema migrations, checksums, recovery snapshots and storage-quota UX.
- [ ] Worker-friendly large operations and cancellable exports.
- [ ] Multiple open documents/tabs and unsaved-change guards.
### Navigation, QA, usability
- [x] Zoom, pan, fit, pixel-grid overlay, line/rectangle/ellipse preview and symmetry overlay.
- [x] Mobile pointer input, brush-size gesture, cursor mode and hold-to-draw.
- [ ] 100% and pixel-step zoom, rotate view, minimap, rulers, snapping and editable guides.
- [ ] Touch gesture arbitration tested on real devices, including multi-touch cancellation.
- [ ] Command palette, shortcut reference, UI scale, themes, contrast, localization and focus-visible behavior.
- [ ] Automated desktop/mobile regression, keyboard navigation and accessibility checks.

## Area 1 — Pixel art
### Precision tools
- [x] Integer-coordinate pencil and eraser.
- [x] Connected/global bucket fill, tolerance and transparent-pixel handling.
- [x] Temporary eyedropper with merged/active-layer sampling.
- [x] Line, rectangle outline and ellipse outline with preview, cancel and atomic undo.
- [x] Off/2/4/8 symmetry modes and one-step undo.
- [x] Eight-way symmetry uses document-space rotations, clips out-of-bounds copies on rectangular canvases and has browser regression coverage.
- [x] Integer Bresenham line rasterization and connected pixel-stepped rectangle/ellipse outlines; selection masks constrain shape commits.
- [ ] Dedicated curve algorithms and pixel-perfect ellipse midpoint rasterization.
- [x] Selection-constrained pencil, eraser, bucket fill and clear operations.
- [ ] Selection-constrained geometric shapes and transforms.
- [x] Exact opaque-pixel color replacement on the active layer, preserving alpha, respecting selection masks and supporting atomic undo.
- [x] One-pixel sprite outline on transparent neighbors, with selection-mask support and one-step undo.
- [x] Checker dither fill using foreground/background colors, with adjustable 1–16 pixel pattern scale, connected/global fill modes, selection-mask support and atomic undo.
- [ ] Shading, lighten/darken, additional dithering matrices, pattern fill and tile stamp.
- [ ] Indexed palette mode, nearest-color mapping and palette-safe operations.
### Selections and transforms
- [x] Rectangular marquee visual overlay plus Ctrl/Cmd+A select-all; Escape clears without altering artwork history.
- [x] Delete/Backspace clears selected active-layer pixels as one undoable operation; locked layers reject the edit.
- [x] Rectangular, elliptical and freehand lasso selections generate masks shared by pencil, eraser, fill, clear, color replacement, clipboard, outline and flip operations.
- [x] Magic-wand selection by connected or global matching colors, with RGBA-aware transparency and tolerance.
- [x] Invert, expand and contract selection masks with bounded Manhattan-distance radius and visible pixel contours for custom masks.
- [ ] Click-to-place polygon selection, feathering, add/subtract/intersect selection modes and saved selection sets.
- [ ] Add/subtract/intersect/invert/feather/expand/contract and saved selections.
- [x] Internal active-layer pixel copy/cut/paste with clipped bounds, selection-aware paste, and atomic undo for cut/paste.
- [ ] Move/duplicate pasted pixels independently, system clipboard interoperability, and copy merged composite.
- [x] Horizontal/vertical flip of the selected rectangle or whole active layer, selection-aware and one-step undoable.
- [ ] Move pixels vs move selection; rotate, scale, skew, crop and transform previews.
- [ ] Preview/cancel/commit, interpolation choices, clipping and single-step undo.
### Palettes and sprite animation
- [x] Foreground/background color swap and eight-color recent history with keyboard shortcut.
- [ ] Persistent user palettes, named color history and palette import/export.
- [x] Local editable palette swatches with browser persistence and GPL/hex/RGB-list import plus GPL export.
- [ ] Named palette sets, reorder/lock/tags/favorites, PAL/PNG export and palette-from-image.
- [ ] Frame/cel timeline, duration, duplicate/reorder/delete, playback and loops.
- [ ] Onion skin, frame tags, named animations, linked cels and frame-range selection.
- [ ] Sprite sheets and PNG/GIF/APNG/WebP outputs only after decoder/encoder tests.

## Area 2 — General 2D art
### Brush and painting engine
- [x] Basic hard-edge brush and size control.
- [x] Brush/eraser opacity slider with source-over alpha compositing, partial erasing and atomic undo.
- [ ] Flow, hardness, spacing, shape/texture, angle, rotation and stabilizer.
- [ ] Brush presets/library: create, rename, favorite, tag, import/export and reset.
- [ ] Pressure/tilt when available, mouse/touch fallback, smoothing and tablet/palm behavior.
- [ ] Smudge, blur, sharpen, dodge/burn, clone stamp and retouch with explicit sampling rules.
- [ ] Antialiasing modes and separate pixel-perfect vs painterly behavior.
### Illustration and composition
- [ ] Gradient tool/editor and selection-aware fills.
- [ ] Editable text, font fallback warnings and explicit rasterization.
- [ ] Paths/Bézier curves and editable shape layers.
- [ ] Reference-image board with opacity/scale/lock/visibility and guides.
- [ ] Rulers, grids, alignment/distribution, margins and layout templates.
- [ ] Hue/saturation, levels/curves, exposure, threshold, posterize and palette reduction.
- [ ] Non-destructive effect stack with preview/cancel/undo.
- [ ] SVG import with explicit rasterization; export only when tested.
### Layered illustration
- [ ] Opacity, tested blend modes, alpha lock, clipping and masks.
- [ ] Groups, merge down/selected, flatten copy, isolate and visibility snapshots.
- [ ] Raster/reference/text/shape/adjustment layers with honest capability boundaries.
- [ ] Color labels, search, batch operations and selected-layer export.
- [ ] Larger-canvas memory budgeting and recoverable cancellation.

## Area 3 — Video games and game assets
### Asset creation
- [ ] Reusable asset browser with tags, favorites, variants and project organization.
- [x] Starter templates for character sprites, game icons, environment tiles, UI elements, backgrounds and VFX, with useful layer stacks and editable dimensions.
- [ ] Templates for props, animation-ready character sheets, multi-state UI components and engine-specific asset specs.
- [ ] Named animation cycles (idle/run/jump/attack/hurt) using the same timeline engine.
- [ ] Sprite pivots/origins, collision/attachment markers and per-frame metadata.
- [ ] Rectangular/isometric/hex tilesets and tilemaps.
- [ ] Autotiling, adjacency rules, seamless-tile preview and seam checks.
- [ ] Procedural terrain/texture/icon/palette generators, clearly labeled procedural vs neural.
### Export and engine integration
- [x] Layer-to-sprite-sheet grid packing with transparent padding, centered pivots and a JSON frame manifest; dimensions/memory limits are validated.
- [ ] Arbitrary sprite atlas packing, edge extrusion, alpha trimming, configurable pivots and atlas-boundary validation.
- [ ] PNG sequence, sheets, GIF/APNG/WebP and ZIP only after output validation.
- [ ] Godot preset for frame size, filtering, pivots, animation names, alpha margins and metadata.
- [ ] Other engine presets only after format-specific tests.
- [ ] Batch export, slices, naming templates and reusable presets.
- [ ] Validation report for dimensions, alpha margins, padding, duplicate names, atlas bounds and animation consistency.
- [ ] Never silently overwrite; warn on lossy flattening or unsupported metadata.
- [ ] Round-trip tests compare exported pixels and metadata.
### AI-assisted production
- [x] Isolated AI workspace and proposal create/discard/conflict primitives.
- [ ] AI task queue with progress/cancel/retries and recoverable failure.
- [ ] Mask-aware edits, side-by-side variations and explicit apply transaction.
- [ ] AI orchestration must use implemented editor operations and shared history, never bypass it.
- [ ] Optional provider adapters; explicit consent before remote inference.
- [ ] Generated batches include names/dimensions/pivots/metadata and validation before user-approved export.

## Validation and release gates
- [x] Core unit tests and browser smoke tests run in GitHub Actions.
- [ ] Unit tests cover layer commands, selection masks, compositing, transform bounds and undo/redo.
- [ ] Browser tests cover desktop/mobile, shortcuts, pointer cancellation, import/export and recovery.
- [ ] Pixel fixtures verify decoded PNG pixels, alpha, dimensions and project round trips.
- [ ] Fuzz/malformed-file tests cover project/image import and memory limits.
- [ ] Performance tests cover maximum dimensions, layers, fill, transforms and batch export.
- [ ] Actual Android touch-device verification before claiming mobile complete.
- [ ] Release gate: no dead controls or console errors; unsupported formats documented; recovery verified; README matches shipped code.

## Execution order
1. Stabilize shared engine, history and persistence.
2. Finish pixel-art operations and persistent selections.
3. Complete layer/compositing and transforms used by both pixel art and illustration.
4. Expand the general 2D brush and illustration workflow.
5. Add animation timeline and reusable asset organization.
6. Add tilesets, atlas packing, engine metadata and validation.
7. Close mobile, performance, accessibility and release gates.

Parallel work is allowed only when tasks do not conflict in files or shared APIs. Update this map alongside each implementation. Never check a box based on documentation alone.


## Selection verification gate
Selection-only operations must not enter artwork undo history. Every selection-mask change must update the visible contour and constrain all applicable pixel-mutating tools. Browser tests must exercise selections on both transparent and opaque regions so the magic wand cannot accidentally assume the selected area is smaller than the canvas.

