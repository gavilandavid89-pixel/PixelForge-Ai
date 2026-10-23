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
- `aiContextScope`: `selected-document`, `all-perspective`, or `all-reference`.
- `aiContextDocumentIds`: a frozen, user-approved list captured when a request begins.
- `workspaceViewSnapshot`: for `all-perspective`, an immutable manifest of the visible canvas panes at request time, including pane order/bounds, document IDs, each pane's viewport/crop/zoom/rotation and active pane. Include layout metadata only; never transmit toolbar/panel UI as artwork. Supply artwork-only pane renders, not metadata alone, wherever the provider supports vision.
- `referenceDocumentIds`: for `all-reference`, the explicit authorized collection of source documents the AI may inspect independently.
- `aiTargetDocumentIds`: the destination set for the resulting proposal; defaults to the selected document and is separate from context scope.
- `baseRevisions`: immutable revision IDs for every document included in the request.

Every AI job receives an immutable request manifest containing these IDs, scope, revision IDs, permission set and user prompt. Tab focus changes cannot mutate a running job's manifest. The UI should show the selected target and whether ALL context is enabled before submission.

### Selected-document and ALL semantics

- **Selected document**: expose only the chosen document's authorized snapshot and required metadata.
- **ALL · Perspective · Actual**: provide one artwork-only viewport render for every currently visible canvas pane. Each render preserves that pane's current zoom, pan/crop and rotation; keep pane IDs/order/bounds in a separate manifest rather than merging documents into one coordinate system. Content outside a pane's viewport is not seen and must not be treated as blank or inspected.
- **ALL · Perspective · Standard**: for each currently visible canvas pane, start from an unobstructed fit-to-canvas render of that pane's complete document, independent of the user's current viewport zoom, pan or rotation. Do not rotate/transform source pixels; normalize only the inspection view. Give the AI bounded, read-only crop/pan tools per document, preserving each full-canvas overview as context. Track inspected regions/scales; if detail remains ambiguous, report uncertainty rather than inventing it. AI inspection must not change the user's viewport or artwork.
- Both submodes obtain artwork from the document renderer/compositor, never from a raw application screenshot. Exclude toolbars, menus, docks, floating panels, cursor/selection overlays, guides and all other editor chrome. If an overlay covers artwork on screen, render the underlying artwork so the overlay cannot hide a hand, face or line. Hidden tabs/off-screen documents are excluded from Perspective; Reference may include separately authorized hidden documents. If unobstructed rendering or region inspection is unavailable, report incomplete coverage honestly.
- **ALL · Reference**: pass the explicitly authorized collection of included documents as separate references so the AI can compare and reason across them, even when they are not visible in the workspace. Reference workflows may include style/consistency review, palette and motif extraction, character/world-bible synthesis, reference-guided proposals for one chosen destination, and contradiction comparison. Every workflow must expose its source list and remain proposal-only until user approval.
- These modes are mutually distinct and each request freezes its context manifest at submission. A tab switch or layout change does not rewrite an in-flight request.
- Under every scope, proposal generation is read-only with respect to canonical documents. Proposal application requires a validated, user-approved transaction.
- A multi-document proposal must enumerate each target document, base revision and change summary. Require explicit approval of the complete target set; no implicit fan-out from ALL.
- Exclude documents by default if access is not authorized. Do not transmit remote-provider content until the user has explicitly consented to that transfer.

### Clone semantics

Cloning and importing a native project as a copy create a new document/project identity and fresh layer/frame IDs with independent mutable pixel state, history, save identity and proposal state. Record optional source lineage (source ID and source revision) for comparison, but never share mutable buffers. Immutable assets may use copy-on-write. Import-as-copy preserves the source's stored project ID; the local project picker makes both source and copy selectable. Clone deletion and proposal cleanup must be scoped to their own IDs and cannot cascade to the source.

### Required invariants

1. Active-tab changes never retarget an existing AI job.
2. ALL changes context only; it does not grant multi-document write access.
3. Every applied proposal validates all base revisions and presents conflicts when any target has changed.
4. Proposal discard/delete cannot delete, restore or rewrite canonical documents.
5. AI export and canonical project deletion remain human-only actions.
6. Unit and integration tests simulate rapid tab switching, split-view changes, clone edits, excluded documents, stale revisions and rejected proposals.


## Dedicated canvas renderer and isolated editor contexts

The application shell may use web technologies, but the artwork area is a dedicated rendering surface with its own coordinate system and render lifecycle. Do not implement the canvas as an ordinary webpage section whose layout, toolbar DOM, or CSS becomes part of the document. On web, use an appropriate dedicated canvas/GPU renderer; a future native build may use its platform renderer while preserving the same document and tool contracts.

### Rendering boundaries

- Separate `application-shell`, `canvas-renderer`, `document-model`, `input-controller`, `user-tool-registry`, `ai-tool-registry`, and `export-renderer`.
- UI panels are overlays/layout siblings, never document layers. Canvas composition and export consume document state only; they never screenshot the app UI.
- Maintain stable document-space coordinates independently from screen coordinates. Moving/resizing panels or entering full-screen changes view layout, not artwork pixels or document coordinates.
- Provide an artwork-only render API for AI context capture and export, with explicit viewport/full-document modes. AI vision input must not contain toolbars, docks, cursor overlays, selection handles or panel occlusion.

### Separate user and AI sessions

Represent each editing context with its own session state, including document/snapshot identity, viewport, active tool, tool parameters, cursor, selection, active layer/frame, temporary previews, clipboard scope, history and cancellation token. User and AI sessions may call shared immutable algorithms, but must not share mutable interaction state.

- The **User Canvas** owns canonical edits and user input.
- The **AI Sandbox Canvas** receives a revision-pinned snapshot and owns all AI-generated modifications and proposal history.
- AI observation tools (zoom, pan, crop, inspect-pixel/region) operate only on an AI inspection viewport over a read-only snapshot.
- AI write commands target only the sandbox. Applying a proposal requires explicit user approval, a revision/conflict check and one undoable transaction against a named destination document.
- Cancellation, timeout, failure, or sandbox discard cannot mutate the user document. Enforce this in command permissions, not only in UI.
- Tool names may overlap (e.g. brush, eraser, zoom), but user and AI tool registries, active-tool state and permissions remain distinct. A user changing tools or viewport must not affect AI jobs; AI inspection must not move the user's cursor or change their view.
- Tests must check state isolation, renderer/export separation, no UI contamination, revision stability on cancelled jobs, and destination-scoped proposal application.


## Normative contracts: document, commands and history

These rules are implementation requirements, not suggestions:

- The document model is the source of truth. UI components and render surfaces never mutate raw canonical buffers directly.
- Every persisted entity has a stable ID scoped to its project/document; identity is never inferred from tab order, filenames or array indices.
- Keep content `revision` separate from persisted-state `saveVersion`: changing active layer/workspace metadata must be saved without pretending the artwork content changed. Autosave clears the dirty flag only if the saveVersion still matches the snapshot that was written.
- Every mutation runs through a validated command/transaction boundary with expected revision, permissions, resource limits and declared dependencies.
- A command is atomic: it either commits all intended changes and one history entry, or leaves canonical state unchanged. Multi-command transactions roll back as a unit.
- One user gesture produces one logical history action. Freehand samples are grouped until pointer-up, tool switch, focus loss, orientation interruption, explicit cancellation or commit.
- Undo/redo restore document state and revision lineage consistently; viewport-only actions do not enter artwork history unless the user explicitly chooses to persist a workspace layout.
- Persistent save, recovery checkpoint, in-memory history, AI proposal and exported file are distinct records with distinct IDs and lifecycles.
- Autosave writes atomically. A failed or interrupted write must not replace the last valid saved version. Recovery offers a choice and never silently overwrites a newer document.
- Export and AI context capture consume immutable snapshots. Neither operation mutates canonical state.

## Input state machine and gesture arbitration

The input controller owns gesture arbitration and coordinate conversion. Tools declare their interaction category and supported pointer types; tools do not independently compete for raw gestures.

Required states: `idle`, `cursor-positioning`, `drawing`, `drag-preview`, `discrete-action`, `selection`, `navigation`, and `cancelled`. Implementations may refine these states but must preserve the externally observable rules.

- Cursor movement is not a drawing action. Drawing starts only when the explicit draw activation is active and the selected tool supports a continuous stroke.
- Bucket/fill and similar actions are discrete; they execute once on deliberate activation, never as a side effect of cursor travel.
- Two-finger navigation has priority as a navigation gesture and cannot create a paint stroke. Stylus input may draw while touch is reserved for navigation only if the device/input capabilities can distinguish them reliably.
- On ambiguous input, prefer no destructive edit and provide predictable feedback.
- Every transition caused by pointer-up, pointer-cancel, lost focus, app suspension, orientation/viewport resize or tool switch must either commit the valid operation once or cancel it without partial mutation.
- Document-space coordinates are calculated through one tested transform pipeline covering device-pixel ratio, viewport scale, pan, view rotation and screen/layout changes.

## Renderer selection and performance policy

Keep the renderer behind a stable interface. Start with the simplest renderer that passes the visual and performance test suite on the supported baseline devices; do not make a GPU backend a product requirement merely for appearance.

1. Establish repeatable small, medium and stress fixtures with dimensions, layer/frame counts and alpha complexity.
2. Measure input-to-visible-pixel latency, stroke throughput, compositing time, fill/filter latency, memory, save and export on named browsers/devices.
3. Keep Canvas 2D if it meets the published budgets. Evaluate WebGL/WebGPU or another backend only when measured regressions justify the added complexity and the target environment supports it.
4. A backend switch must pass pixel-equivalence tests for supported operations, coordinate tests, context-loss/recovery tests and the same document/command contracts.
5. Maintain a safe fallback for unsupported GPU features. Do not claim a performance target without publishing the device, fixture, measurement method and result.
6. Use dirty-region rendering and workers where profiling demonstrates value; do not move mutable document ownership into an uncoordinated worker.

## Desktop and mobile product contract

The editor shares a document model, command layer, algorithms, tool semantics, file contracts and acceptance tests across form factors. Layout and input presentation adapt to the device.

- Desktop: keyboard/mouse/stylus efficiency, resizable panels, timeline and multi-document workspace.
- Mobile: canvas-first layout, touch-safe targets, virtual cursor/draw activation, reachable undo/redo and panel hiding/reopening.
- Essential drawing, save, undo/redo, import and export workflows must not require a desktop-only hover or keyboard shortcut.
- A gesture is never the only access path for an essential command; provide a visible control or accessible alternative.
- No platform is declared supported solely because it loads. At least one real desktop browser and one real Android touch device must pass the corresponding release-gate tests.

## Partial proposal application and dependency graph

Every AI proposal is a version-pinned ordered command set. Each operation declares its affected entities/regions and dependencies. Review may select an operation subset only when the dependency closure is satisfied and the resulting transaction is semantically valid.

Pixel-region selection is a presentation aid, not a guarantee that every operation can be clipped safely. Document-wide changes (canvas dimensions, color mode, global palette, layer-tree structure, animation timing or linked masks/effects) require explicit operation-level review and may only be accepted as whole atomic groups. If safe separation cannot be proven, disable partial acceptance for that group and explain the limitation. Every accepted subset remains one undoable transaction.

## Format capability truthfulness

Format adapters publish a capability declaration derived from implementation and fixture tests: alpha, animation, layers, color depth, profiles, metadata, compression and dimension limits. UI options are generated from the tested declaration, not from aspirational feature lists. Import warnings identify data that will be flattened, converted or discarded; silent loss of supported editable content is a release-blocking defect. Native project serialization remains separate from flattened interchange formats.

## Implementation status vocabulary

Use only these status labels in project docs and UI:
- **Planned**: specified but not implemented.
- **Implemented**: code exists, but acceptance evidence may be incomplete.
- **Verified**: required tests passed in a named environment.
- **Unsupported**: deliberately unavailable for this build/format.
- **Blocked**: a named prerequisite prevents implementation or verification.

A screenshot, mockup, static control or code review alone does not make an operation verified.


## Current bootstrap implementation versus target architecture

The first functional slice deliberately has fewer modules than the target architecture. The current repository layout is:

- `src/core.js`: raster document, pixel layers, tiled compositing cache, validated stroke coordinates, tile-based undo/redo, content revisions, persisted-state versions and project serialization.
- `src/persistence.js`: IndexedDB snapshots, saved-project listing, ID-scoped loading and last-opened-project recovery.
- `src/image-import.js`: bounded PNG/JPEG/WebP/GIF header inspection and dimension validation before browser pixel decoding.
- `src/editor.js`: bootstrap UI orchestration, Canvas 2D rendering, pointer/keyboard input, layer controls and import/export flows.
- `index.html` and `styles.css`: application shell and responsive presentation.
- `tests/core.test.js`: deterministic engine tests run with Node's built-in test runner.
- `tests/image-import.test.js`: bounded image-header preflight tests for PNG, JPEG, WebP and GIF.

The renderer and input controller are still co-located in the bootstrap controller; they are **not yet** independent production modules. Before adding complex tools, extract renderer and input-controller modules behind stable interfaces and add browser-level tests. Do not describe this early layout as the final modular architecture.

## Resource guardrails in the first slice

- Document dimensions: at most 2048 pixels per side and 4,194,304 pixels total.
- Combined raw pixel buffers across all layers: at most 64 MiB.
- Layer count: at most 64, additionally constrained by the combined pixel-memory budget.
- Import file size: at most 100 MiB before decoding.
- Undo history: at most 30 entries and 64 MiB estimated history payload, using 64 × 64 pixel tile snapshots for strokes.

These are conservative bootstrap limits, not claims about the final editor. Any increase requires stress tests on named target devices, including composite/rendering temporaries, autosave serialization and export allocations—not just raw layer buffers.


## Mobile virtual cursor and hold-to-apply contract

The first slice now implements the planned mobile interaction rather than treating every touch as a direct drawing stroke:

- Mouse and stylus pointer input use direct strokes in this build.
- A touch on the artwork surface positions a virtual cursor and is view-only by default. Moving that finger without the hold control must not create pixels or an undo entry.
- The dedicated `draw-hold` control is a momentary hold, not a toggle. While held, a second touch can draw or erase using the selected tool. Releasing the hold commits the current valid stroke; pointer cancellation or focus loss cancels it.
- The hold control must also work as a true keyboard-held control when focused: Space/Enter keydown enters the pressed state and keyup releases it. Do not swallow native Space activation for other focused buttons or links; editor shortcuts must respect editable fields and native controls.
- Touch cursor graphics are rendered as a view overlay on the display canvas only. They are excluded from document pixels, native project data, PNG exports and AI artwork captures.
- The cursor touch and hold-control touch have separate pointer identities. Releasing either pointer must not accidentally leave drawing active.
- If the selected tool is Pan, the draw-hold control is disabled. Switching tools while a stroke is active cancels that stroke safely and resets the hold state.
- Browser smoke tests must verify: touch movement without hold creates no undo entry; simultaneous hold + canvas touch creates one undoable stroke; releasing the hold stops subsequent painting; cancelling either pointer leaves no partial edit.

This first implementation covers pencil/eraser with the shared hold gesture. Additional painting tools must opt into the same input contract rather than adding competing touch handlers.


## Autosave race invariant

A save operation captures both an immutable project snapshot and its `saveVersion`. After the storage transaction completes, mark the document clean only if the live document still has that version. Explicit save commits a valid active stroke, releases the draw-hold state and blocks new drawing input until the flush finishes; Escape and focus loss cancel the active stroke instead. If edits or workspace-state changes occurred during the write, keep it dirty and save the newer snapshot before a document switch or explicit flush completes. A late completion for an old document must never clear the dirty flag or overwrite status for a different active document. This protects against editing while IndexedDB is busy, concurrent manual/autosave requests and rapid document changes.


## Safe image import boundary

Only PNG, JPEG, WebP and GIF are advertised for image import. Before invoking the browser decoder, inspect at most the first 1 MiB for the format's dimensions, validate those dimensions against the document pixel limits, and reject unsupported or unverifiable headers. After decoding, validate the returned dimensions again; permit width/height swapping for valid EXIF-oriented JPEGs. Animated image formats flatten to a still frame in this slice. The file-size cap is checked before header parsing. Never decode first and only then discover that the requested dimensions exceed the editor's resource budget.
