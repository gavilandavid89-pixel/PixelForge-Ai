# PixelForge AI — multi-angle review audit

Review date: 2026-10-23  
Scope: repository documentation, first raster-editor slice, AI boundary, mobile interaction, persistence, resource limits and release verification.

The following review roles were applied independently, then reconciled against the same acceptance contracts. These are review lenses, not claims that separate people or external auditors reviewed the repository.

## 1. Product architect — scope and consistency

**Risk found:** the long-term feature inventory was easy to mistake for a first-release commitment. Some sections described advanced animation, masks, broad formats, AI and community features alongside basic drawing without a hard release boundary.

**Resolution:** `docs/FEATURE_SPEC.md` section AQ defines the first functional release as a small end-to-end raster workflow. `docs/ENGINE_TEST_PLAN.md` gates later features on verified prerequisites. `docs/DECISIONS.md` labels provisional and blocked choices explicitly.

**Current state:** no advanced feature should be shown as available until a working command and acceptance test exist.

## 2. Pixel-engine engineer — memory, history and rendering

**Risks found:** full-layer snapshots for every brush stroke could consume excessive memory at large canvas sizes; recomputing and transferring the entire composite for every viewport repaint would also undermine responsiveness.

**Resolutions:**
- Stroke undo uses 64 × 64 tile snapshots rather than cloning a whole layer for every stroke.
- History has entry-count and estimated-memory budgets.
- The document has dimension, total-pixel and combined-layer-memory limits.
- Compositing tracks dirty tiles; the visible renderer updates only dirty tile regions after the initial full paint.
- Pixel coordinates and imported layer metadata are validated before mutation.

**Verification:** engine tests cover stroke rollback, undo/redo, tile bounds, dirty-tile lifecycle, alpha compositing, memory caps and malformed project metadata.

## 3. Mobile interaction designer — touch precision and accidental edits

**Risk found:** ordinary pointer-down drawing on every touch contradicted the specified virtual-cursor interaction, where moving a finger should not paint unless a separate draw control is held.

**Resolution:** touch movement positions a view-only virtual cursor. A separate momentary `🖌️` control applies the selected pencil/eraser while held. Releasing the hold stops drawing; cancellation/focus loss cancels safely. The cursor overlay is not document content and cannot enter PNG export.

**Verification:** the Chromium smoke suite checks that touch movement without hold creates no undo entry, simultaneous hold/cursor touches create a stroke, and releasing hold stops further marks as one undoable action.

**Still outstanding:** physical Android device, real stylus, palm rejection and accessibility testing. Mobile emulation is not proof of hardware support.

## 4. Security and privacy reviewer — permissions and imported files

**Risks found:** the AI API originally exposed a result-application name that could be misread as a direct canonical-document write permission. Importing an older project with the same ID could overwrite a local source, and malformed project metadata could contain ambiguous identities or flags.

**Resolutions:**
- The AI-callable operation is `ai.create_proposal`; `ai.apply_result` is explicitly not an AI-callable tool and legacy aliases are rejected closed.
- Canonical acceptance remains a separate human-originated, destination-scoped transaction with revision validation.
- Native project import creates fresh project and layer IDs, resets imported revision/history and preserves the source record. A basic local project picker makes saved copies and sources selectable.
- Project/layer IDs, duplicate IDs, dimensions, pixel-buffer lengths, opacity, revision metadata and boolean layer flags are validated.
- File-size, dimensions, total pixel-memory and history-memory limits are explicit.

**Current state:** provider-backed AI, remote upload and sandbox permissions are specified but not implemented in the editor. The present app sends no artwork to an AI provider.

## 5. QA and release engineer — evidence rather than appearance

**Resolutions:**
- Added Node-based regression tests and a CI workflow.
- Added headless-Chromium smoke coverage for startup, mouse drawing, undo/redo, layers, PNG signature, project-copy import, saved-project switching, last-opened recovery, keyboard save and mobile virtual-cursor behavior.
- Test documentation distinguishes verified checks from release gates that remain open.

**Latest verified browser run:** [GitHub Actions run #72](https://github.com/gavilandavid89-pixel/PixelForge-Ai/actions/runs/39908071542) — both core and browser-smoke jobs passed on the tested commit.

**Not claimed:** visual-regression approval, physical Android/stylus readiness, screen-reader conformance, stress-performance targets or completion of the full editor.

## 6. Product operations reviewer — portability and release obligations

**Risks found:** format support and the repository's reuse license could be inferred from the public repository or the long-term feature list.

**Resolutions:**
- `docs/DECISIONS.md` states the current format scope: browser-decoded still-image import, first-frame GIF import, PNG export and a provisional JSON-based `.pforge` project format.
- The project has no declared reuse license. Public visibility is not permission to reuse code. No third-party code or artwork has been copied into this slice.
- The current project format is explicitly provisional, uncompressed and versioned; it is not advertised as a final archival format.

**Release blocker:** the repository owner must choose a project license before an external release that grants reuse rights. This is a deliberate owner decision, not a technical ambiguity to guess at.

## Reconciled state

### Critical first-slice ambiguities addressed

- What touch movement does when the user is not drawing.
- How the hold-to-draw state starts, commits, cancels and stops.
- Which data belongs to artwork versus view/UI overlays.
- How history memory and total document pixel memory are bounded.
- What import/export formats and limits actually mean.
- How the AI boundary prevents direct canonical writes and self-approval.
- Which checks are actually verified and which release gates remain open.

### Deliberate gaps, not hidden assumptions

- No AI sandbox/provider implementation yet.
- No animation timeline, advanced masks/effects, broad interchange formats, macro/plugin runtime or community layer yet.
- No full project-library UI or cross-device sync.
- No physical Android/stylus or accessibility audit yet.
- No numeric performance promises until representative device baselines exist.
- Project license not selected.

These are explicit roadmap/release gates. They must not be described as implemented. For the current bootstrap slice, no additional critical cross-document contradiction was found after reconciling the specification, architecture, AI contract, decisions and acceptance plan.
