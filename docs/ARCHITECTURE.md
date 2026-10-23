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


## Dual-editor architecture: user workspace and AI sandbox

The application has two editor workspaces backed by separate document states:

- **User document (authoritative):** the only canonical project. Manual user edits are committed here.
- **AI working document (isolated branch):** initialized from a consistent snapshot of the user's document and then edited independently by AI. It may be discarded at any time without affecting the user document.

### Synchronization rules

1. User edits flow into the AI workspace automatically as incremental, versioned updates when safe; otherwise the AI workspace is refreshed from a new snapshot.
2. AI edits never flow directly into the user document.
3. AI suggestions are stored as a proposal/branch with a base document revision, command list and affected regions—not as mutations to the canonical document.
4. The user may inspect the AI workspace, accept the full proposal, accept selected changes/regions, or reject/discard it.
5. Rejecting or deleting a proposal deletes only the sandbox state/proposal; it cannot delete or roll back the user document.
6. If the user edits the original while a proposal is being prepared, compare revisions and detect conflicts before applying. Never silently overwrite newer user work.
7. Applying a proposal creates a single undoable transaction on the user document. The application should preview the diff and report conflicts first.
8. The AI sandbox is disposable and recoverable separately; canonical project deletion and export remain human-only operations.

### Suggested modules

- `core/workspaces`: user workspace, AI sandbox lifecycle and document revision IDs.
- `core/sync`: one-way user-to-sandbox patches, snapshot refresh, conflict detection.
- `core/proposals`: proposal manifests, diffs, region/layer-level acceptance and discard.
- `core/commands`: validated commands shared by both workspaces, with workspace-scoped permissions.
- `core/permissions`: deny AI project deletion/export and deny sandbox-to-user writes except through an explicit user-approved apply transaction.

Do not implement the sandbox as a second UI canvas that merely points at the same mutable document object. It must have independent document state, pixel buffers, layer/frame data and history. Shared immutable assets may be referenced safely if edits use copy-on-write.


## Shared input and tool behavior contract

- Implement one input controller that maps touch, mouse and stylus coordinates into document coordinates and owns cursor movement, activation state, stroke begin/update/end, cancellation and tool switching.
- Each tool registers an interaction category such as `freehand-stroke`, `drag-preview`, `discrete-action`, `selection`, or `navigation`. Tools reuse the common cursor contract where applicable instead of implementing independent gesture handling.
- Freehand painting tools (pencil, brush, eraser, smudge and compatible retouch tools) share cursor positioning and hold-to-apply mechanics. Geometry tools share cursor tracking but can preview a shape during drag and commit on release.
- The bucket/fill tool is a discrete action, explicitly outside the continuous stroke contract. It executes only on deliberate tap/click activation and supports a preview/options stage when appropriate.
- Keep view navigation, cursor movement, and applying a tool as separate state dimensions. Pointer cancellation, focus loss, orientation changes and tool switches must safely terminate active operations.
- Linked settings are per-property preferences, not a single global preset overwrite. Tool identity and tool-specific settings remain independent unless the user links selected properties.

## Grid and export services

- Render grids, guides, rulers, pixel boundaries, selections and animation overlays as separate view overlays. Grid geometry/configuration is independent from pixel data and is excluded from normal exports.
- Implement an export-format registry whose adapters declare tested support for alpha, animation, layers, color depth, metadata, compression and dimension limits.
- The export pipeline works from an immutable document snapshot or export-only composite, supports optional background compositing and custom output dimensions, and never mutates the canonical source document.
- Validate output dimensions and estimated memory before allocation; use workers and cancellable jobs for expensive encoders/large outputs when supported.
- Keep native project serialization separate from flattened interchange formats. Export permissions are enforced in the command/API layer; AI sandbox tools cannot export or route around the human-only export action.
- Every format adapter requires fixture-based tests for dimensions, alpha/background behavior and supported capabilities before it appears in the user's export list.


## Multi-document identity and AI context isolation

The workspace must not infer AI permissions from whichever tab happens to have focus. Model these independently:

- `openDocumentIds`: documents currently open in the workspace.
- `activeDocumentId`: the current manual editing destination.
- `aiContextScope`: either `selected-document` or `all-authorized`.
- `aiContextDocumentIds`: a frozen, user-approved list captured when a request begins.
- `aiTargetDocumentIds`: the destination set for the resulting proposal; defaults to the selected document and is separate from context scope.
- `baseRevisions`: immutable revision IDs for every document included in the request.

Every AI job receives an immutable request manifest containing these IDs, scope, revision IDs, permission set and user prompt. Tab focus changes cannot mutate a running job's manifest. The UI should show the selected target and whether ALL context is enabled before submission.

### Selected-document and ALL semantics

- **Selected document**: expose only the chosen document's authorized snapshot and required metadata.
- **ALL**: allow analysis across the explicitly included, authorized open documents/projects. The model may infer shared visual direction and relationships, but context breadth does not expand write permissions.
- Under either scope, proposal generation is read-only with respect to canonical documents. Proposal application requires a validated, user-approved transaction.
- A multi-document proposal must enumerate each target document, base revision and change summary. Require explicit approval of the complete target set; no implicit fan-out from ALL.
- Exclude documents by default if access is not authorized. Do not transmit remote-provider content until the user has explicitly consented to that transfer.

### Clone semantics

Cloning creates a new document/project identity with independent mutable layer/frame/pixel state, history, save identity and proposal state. Record optional source lineage (source ID and source revision) for comparison, but never share mutable buffers. Immutable assets may use copy-on-write. Clone deletion and proposal cleanup must be scoped to their own IDs and cannot cascade to the source.

### Required invariants

1. Active-tab changes never retarget an existing AI job.
2. ALL changes context only; it does not grant multi-document write access.
3. Every applied proposal validates all base revisions and presents conflicts when any target has changed.
4. Proposal discard/delete cannot delete, restore or rewrite canonical documents.
5. AI export and canonical project deletion remain human-only actions.
6. Unit and integration tests simulate rapid tab switching, split-view changes, clone edits, excluded documents, stale revisions and rejected proposals.
