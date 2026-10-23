# Proposed architecture

## Core rule
Build the editing engine and document model before polishing the interface. UI components must call tested editor commands; the canvas is not the source of truth.

## Modules
- `core/document`: document schema, dimensions, color mode, layer/frame/cel relationships, version migrations.
- `core/commands`: command interface, transactional edits, undo/redo, coalescing for brush strokes.
- `core/pixels`: pixel buffers, color math, line/fill/shape algorithms, selections and transforms.
- `core/render`: compositing, dirty-region rendering, viewport transform, grid/selection/onion overlays.
- `core/tools`: tool registry and independent implementations with shared pointer/stylus input contract.
- `core/layers`: layer graph, blend modes, masks, groups, adjustment stack and tilemaps.
- `core/animation`: frames, cels, playback, onion skin, tags and keyframes.
- `core/palettes`: palette data, import/export, indexed color and dithering.
- `io/importers` / `io/exporters`: format adapters and validation; export in workers where possible.
- `persistence`: IndexedDB project storage, autosave, backup/recovery and portable project serialization.
- `workers`: expensive fill/filter/encoding tasks; cancellable jobs with progress messages.
- `ai/adapters`: provider-agnostic interface to self-hosted models and deterministic generators.
- `ui`: toolbar, panels, dialogs, timeline and workspace; no direct mutation of raw pixel buffers.
- `tests`: algorithm unit tests, format fixtures, command/history tests, and browser end-to-end tests.

## Document model
A project contains a versioned document, color settings, palettes, layer tree, frame list and metadata. Each frame contains cels that refer to layers. Pixel data should be stored in a representation suited to the document color mode, with sparse/packed storage considered for large transparent documents. UI selections and viewport state are separate from persistent artwork.

## Rendering and performance
- Use Canvas 2D initially for broad compatibility; evaluate WebGL/WebGPU only when profiling justifies it.
- Render the document at native pixel dimensions and scale the viewport separately; nearest-neighbor is the default for pixel art.
- Track dirty rectangles and redraw only changed regions when possible.
- Keep expensive operations off the main thread using Web Workers and transferable buffers.
- Use checkpoints or tile-based history for large operations; avoid copying the entire document for every brush movement.
- Cap dimensions/memory and show clear warnings before allocations likely to exhaust device memory.

## AI boundary
Expose an interface such as `generate(input, options, signal) -> result`, plus `health()`, capability metadata, progress and cancellation. The adapter may target a locally hosted procedural generator or a self-hosted model service. Keep credentials server-side; do not embed secrets in browser code. The UI must identify the backend type and must not call procedural output a neural model.

## Implementation phases
1. Research baseline and feature acceptance checklist.
2. Document model, pixel algorithms, command history, import/export and automated tests.
3. Minimal working editor shell connected to real commands, not a static mockup.
4. Layers, selections, palettes and transformations.
5. Animation timeline, sprite-sheet export and tilemaps.
6. Raster painting, masks/effects and large-canvas optimization.
7. Autosave/recovery, mobile/stylus refinements and accessibility.
8. AI adapters, procedural generators, optional model services, plugins/macros.
9. Release QA, documentation, licensing inventory and Render deployment.

## Dependency and provenance policy
Every dependency must have a recorded version and license. Avoid GPL source reuse unless we intentionally commit to compatible copyleft distribution. No copied proprietary assets, icons, code or branding. Keep a third-party notices file as dependencies are added.
