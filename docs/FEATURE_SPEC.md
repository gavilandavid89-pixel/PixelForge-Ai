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


## K. Proposal selection with freehand lasso

- In the AI proposal review workspace, provide a freehand lasso tool: the user drags a continuous stroke around the area they want to keep; closing the loop completes the selection.
- Support multiple separate selected regions in one review session. Each new lasso can be configured to add to, subtract from, or replace the current selection; default to adding when the user starts a separate region.
- Show a clear overlay for selected and unselected proposal pixels, with zoom-aware handles and a pixel-precise boundary option for pixel art.
- Let the user preview and accept only the selected regions of the AI proposal. Pixels outside the accepted mask must not be applied to the original document.
- Include selection actions such as accept selected, invert selection, clear selection, and refine/add/subtract regions.
- On touch devices, a long press on a selected region or selection entry opens a compact contextual menu with **Remove from selection** and **Delete from AI proposal**. These are distinct actions: removing from selection preserves the proposal artwork; deleting removes it only from the AI sandbox/proposal.
- Long-press must not immediately delete artwork. The contextual action must be explicitly tapped; destructive proposal edits should be undoable.
- Support mouse, touch and stylus input; expose equivalent toolbar/context-menu actions for users who cannot or do not want to long-press.
- Selection is a review mask, not a destructive crop by default. The original user document remains unchanged until the user explicitly accepts the chosen proposal changes.
- Tests: disjoint lasso regions, open-loop completion behavior, add/subtract selection modes, long-press menu without accidental deletion, delete/undo within the AI sandbox, selected-region-only application, and proof that unselected pixels and the original document remain unchanged.


## L. Mobile-first canvas stability and touch drawing

### View lock
- Provide a clearly visible **Lock view** control that freezes the current canvas zoom and pan position without locking the document, layers, tools, or pixel edits.
- While locked, ignore canvas-navigation gestures (pinch-to-zoom, two-finger pan, accidental drag gestures) while continuing to process valid drawing, selection, and tool gestures.
- Provide a clear unlock action that is always reachable; do not trap the user in a locked view.
- Persist the preferred zoom/pan per document and restore it when reopening the document where viewport/layout constraints permit.
- Handle browser page scrolling separately from canvas gestures: prevent accidental page scroll while an active canvas gesture is in progress, but preserve normal page navigation outside the canvas and accessible controls.
- Offer an explicit reset/fit view action and a safe recovery path if the saved viewport no longer fits after orientation or viewport-size changes.
- Keep view lock separate from layer lock and document read-only state.

### Mobile drawing ergonomics
- Make the canvas the primary touch area, with compact collapsible panels and a reachable tool/action dock; avoid placing essential controls only in distant corners.
- Add configurable touch input modes: draw with one finger; navigate with two fingers; optional stylus-first drawing with finger gestures reserved for navigation when supported.
- Include a configurable touch/stylus stroke stabilizer, adjustable brush cursor/preview, and an optional offset touch indicator/magnifier so the finger does not obscure the target pixel.
- Support pressure and tilt when provided by a stylus; gracefully fall back to touch/mouse input.
- Add quick undo/redo buttons in the mobile drawing area, adjustable UI scale, larger hit targets, and customizable gesture shortcuts.
- Provide quick access to eyedropper, brush/eraser toggle, color picker, brush size, zoom presets, and view lock without opening deep menus.
- Avoid accidental browser back/forward gestures and page scrolling during active canvas interaction where the platform allows, without breaking browser navigation globally.
- Preserve precision at high zoom with pixel-grid feedback and predictable coordinate mapping; keep the stroke aligned with the displayed canvas after zoom, pan, orientation changes, and viewport resizing.
- Keep touch actions undoable; use a short configurable delay for long-press context menus and never make long-press alone destructive.
- Test on narrow mobile viewports and touch input: view lock, scroll/pinch suppression, draw/navigation gesture separation, stylus/touch fallback, undo/redo reachability, orientation changes, and no coordinate drift.


## M. Collapsible interface and virtual pencil input

### Collapsible tool interface
- The canvas is the primary full-screen workspace. Tool panels are hidden/collapsed by default on mobile so they do not permanently cover or constrain the drawing area.
- Provide a compact edge toggle: `>` opens the tools interface and `<` closes it. The toggle remains reachable in both states.
- Opening reveals tools, layers, colors, AI proposal review, and settings. Closing hides the panel without changing document pixels, active selection, zoom, or pan.
- Preserve the viewport center/zoom when the panel opens or closes. Recompute layout and input coordinates without shifting artwork or causing coordinate drift.
- Do not overlay the canvas with a permanently visible tool dock. The toggle must have an accessible label and clear open/closed state.

### Virtual pencil and explicit draw-to-ink control
- Provide a virtual pencil/cursor that the user can position by dragging a finger anywhere in the canvas interaction area, even when the brush is not actively drawing.
- Add a dedicated `🖌️` draw/ink hold control. While held, movement of the virtual pencil generates a stroke; releasing it stops drawing immediately so the pencil can be repositioned without leaving a mark.
- Press-and-hold drawing is the default. A configurable latch/toggle alternative may be offered for accessibility.
- Map virtual pencil position predictably to canvas coordinates at any zoom/pan. Show a cursor preview where practical without obscuring the target pixel.
- Moving the pencil while ink is inactive must not alter pixels. Inking must not accidentally pan or zoom the canvas.
- Handle pointer cancellation, interruptions, app/browser focus loss, and touch release safely; always end an active stroke on cancellation or release.
- Make the ink control a large touch target with a clear active indicator. Support touch and stylus without requiring the user to keep a finger over the exact pixel being drawn.
- Keep quick undo/redo and brush/eraser/color controls inside the collapsible panel; no essential editing option should permanently cover artwork.
- Tests: open/close preserves viewport and artwork; hidden panel is not touch-blocking; pencil movement without ink creates no pixels; holding ink while moving creates one continuous stroke; release stops the stroke; cancellation leaves no stuck stroke; coordinate mapping remains correct under zoom/pan and responsive layout.
