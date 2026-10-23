# PixelForge AI — feature specification

This is the capability checklist, not a promise that every item already exists. Implement in vertical slices and keep every visible control functional.

## A. Document and canvas
- New document presets, custom dimensions, DPI metadata, transparent/solid backgrounds.
- Multiple open documents/tabs, dirty-state indicators, recovery after refresh/crash.
- Zoom, pan, fit, 100%, pixel-perfect zoom steps, minimap, rulers, guides and snapping.
- Optional canvas grid independent of the art style: choose no grid, pixel grid, or configurable rectangular/isometric/hex grids; adjust cell width/height or spacing, line strength/opacity, color and subdivisions. Grid is a non-destructive view overlay and is never included in exports unless the user explicitly enables a separate guides/grid export option. Also support symmetry/mirror view and tile/repeat preview.
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


## N. Modular workspace, distributed panels, and shared tool mechanics

### Workspace layout
- Do not force all options into a bottom toolbar. Distribute panels around the canvas using established desktop/mobile editor conventions, while keeping the canvas central and usable.
- Every panel is independently openable/closable, movable where the device layout allows, resizable, collapsible, and configurable. Provide a one-action way to hide all panels and restore the last workspace layout.
- Persist each workspace layout: panel visibility, position/anchor, dimensions, expanded sections, and compact/comfortable density. Provide reset-to-default and named workspace presets.
- The edge toggle remains available to open/close the relevant interface; hiding panels must not disable canvas input or cause viewport/canvas coordinate drift.
- Tools may expose nested option groups, flyouts, inspectors, or expandable subpanels so a large feature set does not crowd the canvas. Keep advanced controls discoverable and searchable.
- Support responsive layouts: on narrow screens, panels may become drawers or floating sheets; on wider screens, docked side/top/bottom panels are allowed. Do not assume one fixed arrangement.
- Provide UI scale, panel spacing, icon size, label visibility, touch-target size, and compact/comfortable density controls. Respect minimum readable sizes and prevent panels from covering critical interactions without a way to move or close them.

### Free-position virtual tool cursor (no joystick)
- The virtual pencil/tool cursor is directly controlled by dragging anywhere in the eligible canvas interaction surface; there is no joystick, fixed control pad, or required origin point.
- The finger drag delta moves the virtual cursor continuously, independent of where the gesture began. Releasing and starting a new drag elsewhere continues from the cursor's current location rather than snapping to a fixed origin.
- Keep navigation gestures distinct from cursor movement and drawing. The cursor input must never silently become a joystick or relative movement pad.
- Define safe input boundaries around interactive UI controls: dragging from the canvas moves the cursor; touching a panel control activates that control. The user must be able to reposition panels and hide them so the available interaction area can be maximized.

### Shared mechanics across tools
- Separate the active tool's **behavior profile** from the selected tool identity. A persistent **Ink/Draw hold** control starts and stops the active tool's stroke; changing the active tool while this mode is enabled switches the tool identity but preserves the compatible interaction mechanics.
- Example: with ink mode enabled, selecting the eraser makes the same cursor movement erase instead of paint. The corresponding hold control uses a tool-aware icon/label (eraser icon when erasing) while retaining the same press/hold/release semantics.
- Example: switching from pencil to brush can preserve cursor movement, hold-to-ink behavior, stroke start/stop, stabilizer, and other compatible settings, while tool-specific properties (brush tip, texture, size, opacity, pixel-perfect behavior) remain distinct.
- Add configurable tool profiles/variants and a compatibility matrix. Shared settings can be linked or unlinked individually; switching tools must not unexpectedly overwrite tool-specific presets.
- Provide explicit linked-settings indicators and a quick way to choose which properties follow across tools, e.g. size, opacity, stabilizer, pressure response, spacing, texture, and symmetry. Defaults should be sensible per tool, with a clear user override.
- When changing between destructive and non-destructive actions (e.g. paint and erase), update the hold control's visual state immediately and safely finish any active stroke before switching. Never leave an active stroke stuck.
- The hold control is an interaction modifier, not a fixed screen joystick: press-and-hold enables inking with the currently selected tool while the cursor is dragged anywhere on the canvas. Releasing stops the stroke. An optional accessibility latch mode may be configured separately.
- Ensure erasing is scoped to the selected layer/target and obeys lock/mask constraints; show a clear blocked-action explanation rather than silently doing nothing.

### Tool and UI customization
- Add global defaults plus per-tool overrides for size, variants, spacing, opacity, flow, hardness, angle, stabilization, cursor preview, pressure/tilt, symmetry, and pixel-perfect constraints where relevant.
- Allow user-defined tool presets, duplicate/rename/reset, favorites, recent tools, and customizable shortcuts/gestures.
- Use a consistent option-schema system so tools can contribute nested controls without bespoke layout code for each tool. Persist settings with versioning and migrate them safely when schemas evolve.
- Test distributed panels, hide-all/restore, layout persistence, UI scale and density, nested option groups, cursor movement from different starting points, no joystick behavior, shared draw/erase mechanics, compatible settings linkage, and safe active-stroke termination during tool changes.


## O. User-initiated AI only
- The AI must not draw, modify artwork, generate variations, or start background creative tasks merely because the user is drawing, changes tools, moves the cursor, or edits the canvas.
- AI generation/editing tasks may begin only after an explicit user request or a deliberate user action that clearly starts a named AI operation.
- Passive UI events, document synchronization into the AI workspace, selection changes, and tool changes must never be interpreted as permission to generate artwork.
- The AI sandbox may stay synchronized with user-originated edits for context, but this synchronization is not an instruction to act. No AI-generated changes occur until the user asks.
- Show queued/running AI tasks with clear controls to cancel; do not auto-apply any result. Every result remains a reviewable proposal requiring explicit user acceptance.
- Test that drawing, erasing, changing tools, moving the cursor, opening panels, and synchronizing the sandbox never trigger AI generation by themselves.

## P. Future product shell and creative community (planned, not part of the first editor milestone)
- Provide a separate main/home screen before opening the editor, with a clear list/grid of the user's projects and actions to create, open, rename, duplicate, organize, and archive projects.
- Keep projects separate and independently persisted; show thumbnails, last-opened information, dimensions, and unsaved/recovery status where available.
- Include a user profile page with display name, avatar, short biography/description, and the user's own published/shared artworks when the social phase is implemented.
- Plan a small art feed where users can voluntarily publish artworks, browse other creators' posts, and open artwork details. This is a future phase, not a dependency for the core editor.
- Design future publishing around explicit consent: private projects remain private by default; publishing requires a clear user action and review of what will be shared. Do not expose local project files or unpublished art automatically.
- Keep social/community features modular and isolated from the document engine, AI sandbox, and local project storage. Community availability must not be required to draw or edit offline.
- Future social phase should define moderation, reporting/blocking, privacy controls, storage/cost limits, and safe account/profile handling before implementation.
- Recommended milestones: (1) reliable editor engine and project format, (2) local project home/library, (3) profiles and account sync if needed, (4) voluntary art publishing/feed and community safety systems.


## Q. Shared cursor contract for painting and drawing tools

- Every freehand painting/drawing tool uses the same virtual cursor positioning and stroke lifecycle: cursor movement is independent from whether the tool is currently applying marks, and the dedicated hold control starts/stops the active tool action.
- This shared contract applies to pencil, pixel brush, raster brush, eraser, smudge, blur/sharpen brushes, dodge/burn, clone/retouch tools, spray, and other tools whose behavior follows a dragged stroke. New tools must declare whether they implement the shared stroke contract.
- Geometric drawing tools (line, rectangle, ellipse, polygon, curve and similar) reuse the same cursor coordinates and pointer tracking, but may use a drag-to-preview / release-to-commit interaction appropriate to their shape rather than stamping continuously.
- The fill/bucket tool is the explicit exception: it is a discrete tap/click operation, not a continuous cursor stroke. It uses its own fill preview/options (contiguous or global, tolerance, sampling target, gap behavior) and must not unexpectedly fill merely because the user moves the cursor or changes tools.
- Eyedropper and selection/navigation tools are actions rather than paint strokes; they may share cursor positioning but must declare their own activation semantics.
- Changing among compatible stroke tools preserves the virtual cursor position, input modality, stroke lifecycle, and individually linked settings. Tool-specific parameters remain separate unless the user explicitly links them.
- The input controller, cursor mapper and stroke lifecycle must be implemented once and reused by tools; do not create slightly different cursor mechanics in every tool. Tool behavior is supplied through a registered tool profile/adapter.
- Switching tools ends any active stroke safely, commits/undoes it according to normal command rules, and never leaves an action stuck. Movement without the required activation state never changes artwork.
- Tests cover every tool category, especially pencil-to-brush, pencil-to-eraser, eraser-to-smudge, and paint-tool-to-bucket transitions; the bucket must perform no fill on passive cursor movement and must fill only after deliberate activation.

## R. Grid and non-pixel-art workspace modes

- Grid visibility is optional and can be switched off completely; pixel art is a supported workflow, not a forced project mode.
- Offer a one-tap grid visibility toggle plus a grid settings panel for grid type, spacing/cell width and height, subdivisions, origin/offset, line color, opacity, thickness and snapping.
- Support rectangular grids with independent horizontal/vertical spacing, square/pixel grids, isometric grids and hexagonal grids where practical. Keep unsupported grid modes clearly labeled rather than faking their geometry.
- Grid display and snapping are separate settings: users can show a grid without snapping, snap without showing the grid, or disable both.
- Keep guides, rulers, pixel-grid overlays, selection boundaries and animation overlays as separate render layers so they can be toggled independently.
- The grid is a view aid and must not alter image pixels, document dimensions, saved artwork or export output by default. If exporting a grid/guide overlay is supported, expose it as an explicit, reversible export option.

## S. Export formats, dimensions, background and transparency

### Export format registry
- Provide an export dialog that lists every format actually supported by the current build, grouped by still images, animation, sprite sheets/sequences, palettes and native project/backup formats. Never advertise a format as available until its encoder/adapter is implemented and tested.
- Core raster targets should include PNG, JPEG, WebP, GIF, APNG and SVG import/rasterization as applicable; animated exports should include GIF, APNG and animated WebP where the runtime encoder is reliable. Support frame sequences and sprite sheets, plus ZIP bundles of sequences/metadata when feasible.
- Add format adapters through a registry so formats can be added without rewriting the document engine. Show capability differences such as alpha support, animation, color depth, metadata, frame/layer support and lossy compression before export.
- Preserve the editable native project format separately from flattened image exports. Never imply a PNG/JPEG or sprite sheet preserves editable layers/timeline unless its format and export options explicitly do so.
- Warn when a target format cannot represent transparency, animation, color depth, layers or metadata. Offer a suitable alternative when possible rather than silently discarding content.

### Dimensions, scaling and bounds
- Let the user set exact output width and height independently, including non-square dimensions, and optionally lock/unlock aspect ratio.
- Offer original document size, custom pixel dimensions, scale multipliers, resize/resample, crop/trim and sprite-sheet layout controls. Explain whether each option changes the source document or only the exported copy; export settings must not silently resize the project.
- Support the full range of dimensions allowed by the chosen encoder, browser/runtime and available memory, with per-format limits surfaced in the UI. Do not claim mathematically unlimited dimensions: validate dimensions and estimated memory before allocation, show clear errors/warnings, and offer tiled/worker-based processing where practical.
- Provide presets for common uses (icons, game sprites, social images, high-resolution raster artwork and sprite sheets) while always allowing custom width/height within validated limits.
- For sprite sheets, expose columns/rows or packing, padding, extrusion, trimming, frame order, pivot/origin and metadata sidecar options where supported.

### Background and alpha controls
- Provide explicit output background choices: transparent, black, white, custom solid color, or the document's configured background. Include an alpha/transparency preview checkerboard that is UI-only and never exported as pixels.
- For formats with alpha, preserve transparency by default when the source contains transparent pixels unless the user chooses a background. For formats without alpha (such as JPEG), require or clearly select a compositing background; default to a safe visible choice and show the resulting preview.
- Support exporting on a black background, white background, custom color, or transparent background without modifying the original document. Composite only in the export pipeline unless the user deliberately changes the document background.
- Include options for matte color, alpha handling, transparent-pixel trimming, padding, bleed/extrusion and color profile/metadata when supported. Clearly identify lossy formats and quality/compression settings.
- Show a final preview with dimensions, estimated file size where feasible, background/alpha state and format-specific warnings. Never silently overwrite an existing file; support safe filenames, batch naming templates and cancellation.
- Include export presets and rememberable user presets, but require an explicit user action to export. Export remains a human-only capability; the AI agent cannot invoke export or bypass the UI permission boundary.

### Export verification
- Tests verify exact output dimensions, alpha preservation, black/white/custom compositing, JPEG background behavior, format capability declarations, animation frame count/order, sprite-sheet bounds, cancellation, large-dimension validation and no mutation of the source document.
