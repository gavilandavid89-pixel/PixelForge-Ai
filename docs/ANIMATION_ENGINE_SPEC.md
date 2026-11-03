# Animation timeline core — implementation slice

## Scope
This module introduces tested, DOM-free timeline data primitives. It is not yet the editor timeline UI, playback renderer, encoder, or complete command-history integration.

## Implemented in this slice
- Stable frame IDs and independent per-layer RGBA cel buffers.
- Add blank frames and duplicate frames without sharing mutable pixel memory.
- Reorder, select and delete frames while preserving identity.
- Per-frame duration, project FPS, loop setting and total playback duration.
- Named animation tags bound to stable frame IDs.
- Bounded frame count, dimensions and estimated pixel-memory allocation.
- Read-only snapshots and defensive copies of cel pixels.

## Deliberately not claimed yet
- Integration with the raster document and AI sandbox command executor.
- Atomic undo/redo transactions for frame/cel operations.
- Browser timeline controls, onion skin, playback renderer or contact-sheet UI.
- Video/GIF/APNG/WebP encoding or downloadable export.

The next integration step is to make frame/cel edits first-class editor commands, route AI commands into the selected sandbox frame, and include frame changes in proposal validation/acceptance. Only after that should the browser timeline and playback renderer be connected.
