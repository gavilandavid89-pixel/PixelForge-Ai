# PixelForge AI — feature specification

This is the capability checklist, not a promise that every item already exists. Implement in vertical slices and keep every visible control functional.

## A. Document and canvas
- New document presets, custom dimensions, DPI metadata, transparent/solid backgrounds.
- Multiple open documents/tabs, dirty-state indicators, recovery after refresh/crash.
- Zoom, pan, fit, 100%, pixel-perfect zoom steps, minimap, rulers, guides and snapping.
- Pixel grid, rectangular/isometric/hex grids, symmetry/mirror view, tile/repeat preview.
- Canvas resize, crop, resample, rotate, flip, trim transparent pixels, center content.
- Reference images with opacity/scale/lock and guides/vanishing-line helpers for raster painting.
- Color profile/bit-depth metadata where supported; make unsupported conversions explicit.

## B. Tools
### Pixel-precise
- Pencil, pixel-perfect line, eraser, fill/bucket with tolerance and contiguous/global modes.
- Eyedropper (current layer / merged image), color replace, gradient, dithering, pixel-perfect shapes.
- Rectangle, rounded rectangle, ellipse, polygon, polyline, curve/bezier, spray, tile stamp.
- Shading tool, outline, lighten/darken, indexed palette mode, pattern fill.
- Symmetry: horizontal, vertical, radial; mirrored drawing; tiled seamless mode.

### General 2D raster
- Brush with size, opacity, flow, hardness, spacing, shape/texture, angle and stabilizer.
- Pressure/tilt support when available; tablet input gracefully falls back to mouse/touch.
- Smudge, blur, sharpen, dodge/burn, clone stamp, healing-like retouch where feasible.
- Gradient fills, selection-bound fills, text, paths and basic vector-like shape layers.
- Antialiasing toggle, brush smoothing and per-tool sampling options.

### Selection and transforms
- Rectangular, elliptical, lasso, polygonal, magic-wand, color-range and contiguous selections.
- Add/subtract/intersect/invert/feather/expand/contract selection.
- Move pixels, move selection, free transform, rotate, scale, skew, perspective/corner pin.
- Nearest-neighbor and higher-quality resampling choices, with preview and cancel.
- Copy/cut/paste, paste-in-place, duplicate selection, floating selection, crop to selection.

## C. Layers and compositing
- Raster, group, reference, text, tilemap and adjustment/effect layer types.
- Visibility, lock, alpha lock, clipping, masks, opacity, blend modes, reorder, group, merge, flatten.
- Non-destructive effects: outline, drop shadow, gradient map, hue/saturation, levels/curves, blur/sharpen.
- Layer/cel linking, per-frame cels, rename, color labels, isolate, search and batch operations.
- Layer comps/visibility snapshots and export selected layers.

## D. Animation and sprites
- Frame timeline with per-frame duration, duplicate/move/delete, playback and loop modes.
- Onion skin with previous/next counts, tint/opacity controls, ghost frames and audio sync.
- Frame tags, named animations, keyframes for opacity/transforms/effects, timeline zoom.
- Draw while playback runs when safe, linked cels, cel copy/swap, frame range selection.
- Sprite-sheet packing with layout, padding, extrusion, trim, pivots/origins, JSON metadata.
- Export PNG sequences, GIF, animated PNG/WebP where supported, sprite sheets and video if feasible.
- Tilemap/tile-set tools for rectangular, isometric and hex layouts; autotiling rules.

## E. Color and palettes
- Foreground/background colors, swap, recent colors, sampled color history.
- HSV/RGB/HSL/HEX and alpha editing, contrast checker, color harmonies and gradients.
- Palette create/rename/reorder/lock, import/export GPL/PAL/TXT/PNG, palette-from-image.
- Indexed mode with controlled palette, nearest-color mapping and dithering.
- Global and document palettes; palette tags/favorites; accessible UI contrast.

## F. Image processing and import/export
- Import PNG/JPEG/WebP/GIF/SVG (SVG rasterized with explicit options); open image sequences and sprite sheets.
- Export PNG, JPEG, WebP, GIF, APNG, sprite sheet, ZIP of frames, selected layers and project file.
- Resize/resample, rotate, flip, color adjustment, threshold, posterize, palette reduction, outline and blur.
- Batch export presets, naming templates, transparent-background control, scale multipliers and metadata.
- Preserve transparency and dimensions; warn before lossy export; never silently overwrite files.
- Portable project format with versioning, migrations and checksums where useful.

## G. Reliability and productivity
- Command-based undo/redo with transactions; no history gaps for normal edits.
- Autosave, crash recovery, backup history, project version snapshots and unsaved-change guard.
- Keyboard shortcuts editable/searchable; temporary tools; command palette; context menus.
- Workspace panels resizable/dockable/collapsible, UI scale, themes, tooltips and shortcuts overlay.
- Touch-friendly controls, stylus support, gestures, palm-rejection hooks where the platform allows.
- Accessibility labels, keyboard navigation, reduced motion, localization.
- Performance profiler panel, memory guardrails, large-document warnings and worker-based exports.
- Automated unit tests for drawing algorithms, file-format tests, undo/redo tests and browser E2E tests.

## H. Differentiators to add beyond the benchmark editors
- Non-destructive workflow stack and editable operation history (with clear limits for memory-heavy steps).
- Command palette that can search tools, actions, files, presets, and AI commands.
- Action recording/macros for repeatable workflows and batch processing.
- Asset browser with tags, favorites, reusable brushes, patterns, palettes, stamps and templates.
- Smart selection helpers and optional image segmentation adapter, but never required for core editing.
- Procedural generators for noise, clouds, terrain, tiles, icons and palette ramps; clearly labeled procedural.
- AI task queue with progress/cancel, input/output previews, mask-aware edits, variation comparison and undoable application.
- AI adapters that can point to self-hosted services; model health/status and resource warnings; no hidden paid API dependency.
- Sprite validation for game engines: transparent margins, pivot checks, frame-size consistency, palette limits and export presets.
- Optional collaboration/versioning later, after local project integrity and offline editing are solid.
- Privacy-first local processing; explicit consent before uploading artwork to a remote inference service.
- Recovery sandbox for untrusted extensions, permission scopes and extension compatibility checks.

## I. Acceptance criteria
- Every tool has a testable behavior and a shortcut or discoverable menu action.
- Undo/redo reverses every committed edit, including multi-step transforms and fills.
- Save/open round-trips preserve dimensions, layers, frames, palettes and metadata supported by the format.
- Export output is pixel-verified against expected dimensions/transparency.
- Large operations can be canceled where possible and never freeze the entire UI indefinitely.
- Mobile/touch is not treated as an afterthought; no essential control is inaccessible on narrow screens.
- AI features are visibly separated from deterministic tools and disclose whether they are procedural or model-powered.


## J. Dual editor and AI proposals

- Every project has an authoritative user editor and an isolated AI working editor.
- User-originated edits synchronize automatically from the user document to the AI workspace.
- AI-originated edits never synchronize automatically back to the user document.
- The AI workspace starts from a consistent snapshot and records the source document revision.
- AI can make and undo its own edits freely inside its sandbox.
- The user can open the AI workspace, inspect a visual diff, accept all changes, accept selected safe changes/regions, or discard the proposal.
- Discarding an AI proposal removes only the sandbox changes; the user document remains untouched.
- Applying accepted changes checks for edits made to the original since the AI snapshot, surfaces conflicts, and commits approved changes as one undoable transaction.
- Stale proposals must never silently overwrite newer user work.
- AI tools cannot invoke proposal application, project deletion or project export. Applying a proposal requires a direct user action in the UI.
- User and AI workspaces have independent document state, pixel buffers and history; copy-on-write may share immutable data only.
- Add automated isolation tests that verify deleting artwork in the AI workspace never deletes the corresponding user artwork.
