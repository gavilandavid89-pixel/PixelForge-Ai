# PixelForge AI — engine test plan and acceptance matrix

## Status and rule

This file is the central acceptance-test index. It describes tests to implement; a listed test is **not passed** until it exists, runs, and its result is recorded. Do not describe planned behavior as implemented.

- Product requirements live in `docs/FEATURE_SPEC.md`.
- Technical boundaries and architecture live in `docs/ARCHITECTURE.md`.
- AI command names, schemas and permissions live in `docs/AI_TOOL_API.md`.
- Any mismatch must be resolved by updating the canonical documents in the same change.
- A release gate cannot be waived because a UI looks correct; test the command/model boundary directly.

## Test result vocabulary

- **Not implemented**: feature or test does not exist.
- **Blocked**: test cannot run because a prerequisite is missing.
- **Fail**: a test ran and contradicted its acceptance criterion.
- **Pass**: automated or documented manual evidence satisfies the criterion on the stated environment.
- **Not applicable**: explicitly justified for this build target.

Never label a test pass based on code inspection alone. Record commit, browser/device, test command, result, and known limitations.

## Release gates

### Gate 0 — repository and build integrity

- [ ] Repository contains a reproducible project manifest, lockfile and documented supported runtime.
- [ ] Clean checkout can install dependencies without relying on developer-local files or secrets.
- [ ] Build and test commands are documented and deterministic.
- [ ] Lint/type checks, unit tests and production build run in CI.
- [ ] Dependency versions, licenses and required notices are inventoried.
- [ ] No API secrets, personal tokens or private user artwork are committed.
- [ ] README distinguishes planned, implemented, tested and unsupported capabilities.

### Gate 1 — canonical document and command model

- [ ] Every document, layer, frame, cel, asset and proposal has a stable scoped ID.
- [ ] Commands validate arguments and permissions before mutation.
- [ ] A command either commits atomically or leaves the document unchanged.
- [ ] Each committed edit has a revision and history entry.
- [ ] Undo then redo restores the exact state; undoing a grouped gesture does not expose partial brush samples.
- [ ] Cancelled, rejected, failed and timed-out commands leave canonical state unchanged.
- [ ] History coalescing has explicit boundaries: pointer-up, tool switch, focus loss, cancellation and command completion.
- [ ] Revision conflicts are surfaced; stale commands are never silently applied.
- [ ] Undo/history storage is bounded and reports when a large action needs a checkpoint or memory budget.

### Gate 2 — canvas coordinates, rendering and input

- [ ] Document coordinates are independent from CSS/layout/screen coordinates.
- [ ] Zoom, pan, view rotation, fit-to-canvas, panel movement and fullscreen transitions do not alter document pixels.
- [ ] Input mapping round-trips known document points across zoom, pan, rotation, device-pixel ratio and resize.
- [ ] UI panels, cursors, selection handles, guides and grids never enter artwork exports or AI artwork captures unless a specific overlay export option is explicitly selected.
- [ ] Pointer/touch/stylus cancellation and focus loss always terminate active strokes safely.
- [ ] Drawing, cursor movement, navigation and discrete actions are distinct states.
- [ ] Moving the virtual cursor without activating draw does not modify pixels.
- [ ] Pencil/brush/eraser/smudge share the documented continuous-stroke contract where compatible.
- [ ] Bucket/fill executes only on deliberate activation; cursor movement alone never fills.
- [ ] Shape tools preview during drag and commit once on release; cancellation discards preview.
- [ ] Two-finger navigation cannot accidentally draw; tool switching mid-gesture has deterministic cancellation behavior.
- [ ] Pointer pressure/tilt degrade gracefully when hardware does not provide them.
- [ ] Screen-reader/keyboard alternatives exist for essential actions; gestures are not the only way to use critical functions.

### Gate 3 — document structure, layers, pixels and color

- [ ] Layer order, visibility, opacity, blend mode, lock, group and mask behavior have reference tests.
- [ ] Alpha compositing and blend modes have pixel-exact fixtures where deterministic.
- [ ] Selection operations (add/subtract/intersect/invert/feather/grow/shrink) respect bounds and undo.
- [ ] Transform previews do not mutate the source until commit; cancel restores the exact prior state.
- [ ] Resize-canvas and resample-image are separate operations with distinct tests.
- [ ] Indexed-color/palette conversion declares quantization and transparency behavior.
- [ ] Color-profile conversion, bit depth and unsupported modes fail clearly rather than silently corrupting color.
- [ ] Text/vector-like objects remain editable until an explicit rasterization/conversion operation.
- [ ] Unsupported layer/effect features are reported during import/export, never silently discarded.

### Gate 4 — animation and assets

- [ ] Frame/cel identity, duration, ordering, tags, loop behavior and onion-skin overlays are tested independently.
- [ ] Playback does not mutate frame data or pollute undo history.
- [ ] Sprite-sheet dimensions, order, padding, trim, pivot/anchor and metadata match the export manifest.
- [ ] Tilemap operations respect tile bounds and seam validation rules.
- [ ] Importers reject malformed, oversized or unsupported files safely.
- [ ] Decoders are isolated from command execution and cannot execute imported metadata as code.
- [ ] Duplicate/import/place/rename/delete asset actions have deterministic history and identity behavior.

### Gate 5 — save, recovery and export

- [ ] Native project serialization round-trips layers, frames, color settings, metadata and supported editable objects.
- [ ] Schema migrations are versioned and test older supported fixtures.
- [ ] Autosave writes recoverable snapshots atomically; interrupted writes cannot replace a valid save with a partial file.
- [ ] Recovery presents available versions and timestamps; it never silently replaces a newer canonical revision.
- [ ] Storage quota failures are visible and do not falsely report a successful save.
- [ ] Export consumes an immutable snapshot and never changes the source document or history.
- [ ] Export format options are shown only for tested capabilities.
- [ ] Dimensions, memory estimates and format limits are validated before large allocations.
- [ ] Alpha, background composition, scaling, metadata and animation behavior have fixture-based tests for each advertised format.
- [ ] Cancel/failure during export leaves the source unchanged and removes incomplete temporary output where possible.
- [ ] Exported files are reopened/decoded in tests to verify dimensions and content, not merely that a file exists.

### Gate 6 — AI isolation, privacy and proposals

- [ ] AI context manifest freezes source IDs, revisions, mode, destination, provider, permissions and user prompt at submission.
- [ ] Rapid tab switches and split-view changes cannot retarget an in-flight task.
- [ ] Perspective · Actual captures the current artwork viewport without editor chrome; outside-viewport regions are not inferred as blank.
- [ ] Perspective · Standard starts with the full unobstructed artwork and uses bounded read-only region inspection; inspection does not change user viewport.
- [ ] Reference scope includes only explicitly selected/authorized documents and shows the included source list.
- [ ] Context preview itself never starts a model request.
- [ ] Remote transfer requires explicit, provider/task-specific consent before artwork is transmitted.
- [ ] AI tools cannot export, delete a canonical project, invoke arbitrary code/network/filesystem access or approve their own proposal.
- [ ] Permissions are enforced in the command service, not only hidden in UI.
- [ ] AI edits only its sandbox branch; canonical document revision and bytes remain unchanged during generation, failure, cancellation and discard.
- [ ] Every proposal records base revisions, ordered commands, dependencies, affected regions, validation results and diff.
- [ ] Partial acceptance is allowed only for dependency-safe operation groups; dependent operations are applied atomically or rejected with explanation.
- [ ] Human acceptance is a distinct UI-originated action, validates all base revisions and applies to a named destination as one undoable transaction.
- [ ] Stale proposals show conflicts and require an explicit resolution; no silent overwrite or automatic retarget.
- [ ] Multi-document proposals enumerate every target and require explicit approval of the full target set.
- [ ] Clone edits, renames and deletion cannot mutate the source; shared immutable data uses copy-on-write for mutable paths.
- [ ] Prompt injection in artwork, filenames, metadata and reference content cannot grant additional permissions.
- [ ] Tool errors return accurate rejected/failed/cancelled status and never claim success.

### Gate 7 — performance, reliability and device support

- [ ] Establish baseline devices, browsers, canvas sizes, layer counts and frame counts before setting numeric performance claims.
- [ ] Measure input-to-visible-pixel latency, brush throughput, compositing, fill, transforms, save, recovery and export separately.
- [ ] Large operations use cancellable workers when appropriate and report progress without blocking basic input.
- [ ] Memory estimates are checked before allocations; oversized work is rejected or offered a safe alternative.
- [ ] Dirty-region rendering is verified against full-frame rendering for equivalent output.
- [ ] Long sessions do not show unbounded history, event listeners, temporary buffers or worker leaks.
- [ ] Browser/device limitations are reported; unsupported GPU features have a safe fallback.
- [ ] Test at least one desktop configuration and one real Android touch device before claiming cross-device readiness.
- [ ] Accessibility and localization smoke tests cover critical workflows.

## Required adversarial scenarios

1. Switch active tab while AI is generating; proposal remains pinned to the original manifest.
2. Edit source document after AI snapshot; acceptance detects a revision conflict.
3. Cancel at each stage: queued, inspecting, generating, applying to sandbox, reviewing and before commit.
4. Inject malformed coordinates, huge dimensions, unbounded flood fill and invalid IDs; no partial mutation.
5. Attempt proposal approval, export and project deletion through every AI adapter, macro and extension path; all unauthorized paths reject.
6. Delete/discard clone or proposal while source is open; source identity, revision and pixels remain unchanged.
7. Simulate browser crash, quota exhaustion, interrupted autosave and interrupted export.
8. Open malformed image/project files and metadata containing instruction-like text.
9. Move/resize/hide panels during strokes, zoom and AI capture; document coordinates and capture semantics remain correct.
10. Run multi-touch navigation while the draw control is active and verify deterministic gesture ownership.
11. Partially accept a proposal whose operations have dependencies; reject unsafe subsets.
12. Export with transparent background, opaque background, non-integer scale, animation and unsupported metadata; behavior matches the adapter capability declaration.

## Manual test record template

For each manual run record:

- Test ID:
- Commit:
- Environment/device/browser:
- Preconditions/fixture:
- Steps:
- Expected result:
- Actual result:
- Pass/fail/blocked:
- Evidence or log:
- Known limitation:

## Performance targets policy

Do not invent universal numeric performance targets before profiling. First publish baseline measurements for representative small, medium and stress documents on named devices. Then set measurable targets and regression budgets. Any target must include document dimensions, layer/frame counts, device/browser, test method and percentile/measurement window.

## First implementation slice

The first shippable slice must be deliberately small and end-to-end functional:

1. Create/open/save raster documents through a basic local project picker with versioned native serialization.
2. Dedicated canvas surface with pan/zoom and stable document coordinates.
3. Pencil, eraser, color selection and a real stroke controller.
4. Atomic commands, undo/redo and a basic layer model.
5. Import supported still images and export transparent PNG; import/export `.pforge` copies with independent identities and tested alpha behavior.
6. Autosave/recovery baseline and error reporting.
7. Unit/integration tests for coordinate mapping, strokes, history, save round-trip and export immutability.

Do not expose controls for features that are not implemented. Animation, advanced masks/effects, broad format support, AI providers, macros and community features remain gated until their prerequisites pass.


## Current verification record

### Engine-core checks — 2026-10-23

- Environment: Node.js 22.16.0, Linux container.
- Command: `npm test`.
- Result: **28 passed, 0 failed** (including bounded image-header parsing and malformed/oversized image cases).
- Command: `npm run check`.
- Result: **passed** (JavaScript syntax checks for core, persistence, image-import preflight and editor controller).
- Covered: dimension and memory guards, coordinate mapping, pixel stroke, compositing, undo/redo, cancellation rollback, eraser alpha, layer visibility/addition, native project round-trip, invalid project rejection, color parsing, tile-patch history, redo invalidation, bounds and memory guards, ordered alpha compositing and dirty-tile tracking, duplicate/invalid identity rejection, strict layer-command validation, active-layer save state, save-version monotonicity and independent imported-project/layer IDs.
- Not covered by the Node core run: browser rendering, pointer capture, IndexedDB behavior, file downloads, visual regression, screen-reader audit or physical device testing. The separate browser-smoke job covers a subset of these.
- Release status: core checks are verified in Node and browser smoke checks are verified in headless Chromium. Physical Android/stylus behavior, accessibility conformance, stress performance and the full release gates remain open. Do not label the full professional editor as release-ready.

Next test milestone: expand browser coverage for image import, malformed files, pointer cancellation/focus loss, responsive resizing, storage failures and accessibility; then run a manual smoke test on a physical Android touch device.


### Browser smoke checks — GitHub Actions run #134

- Environment: GitHub-hosted Linux runner, headless Chromium, desktop viewport 1440 × 960 and mobile-emulated viewport 390 × 844.
- Result: **passed**.
- Verified path: application startup; legacy version-1 IndexedDB migration into the metadata index; visible canvas; mouse stroke changes the rendered canvas; undo/redo state; keyboard activation of a focused tool button; keyboard-held draw control press/release and focus-loss cancellation; layer addition; PNG download has a valid PNG signature and preserves transparent pixels; IndexedDB save/reload restores the last-opened document; project export/import creates a new project ID and fresh layer IDs without overwriting the source; the local project picker lists both projects and can switch between them; reopening the imported project is restored after reload; successful PNG, JPEG, WebP and GIF imports preserve decoded dimensions; oversized image dimensions are rejected before decode without replacing the active document; save during a live stroke commits exactly one undoable stroke; mobile-emulated pan; touch cursor movement without the hold control creates no undo entry; simultaneous two-touch hold-and-cursor input creates an undoable stroke; releasing the hold while the cursor remains active stops drawing without creating a second history action; Escape cancellation does not create history; Ctrl/Cmd+S saves the current document; no uncaught page errors.
- Run: https://github.com/gavilandavid89-pixel/PixelForge-Ai/actions/runs/40041707286
- Limitation: mobile emulation is not a substitute for testing a physical Android device or stylus hardware. This is a smoke test, not a full visual, accessibility, performance or adversarial browser suite.
