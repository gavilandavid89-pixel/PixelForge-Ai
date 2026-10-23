# PixelForge AI — AI tool-control contract

Status: design specification; not yet implemented.

## Goal

AI agents must operate the actual editor through the same tested command system as a human—not merely describe edits or manipulate screenshots. The API is provider-independent so different local/self-hosted models can use it.

## Permission boundary

AI agents may inspect the active project and perform normal editing actions: create/edit artwork, draw pixels, use raster brushes, select regions, transform content, manage layers and frames, edit palettes, apply effects, run generators, and change ordinary document settings.

Two operations are always denied to AI agents:
1. **Delete the project/document itself.**
2. **Export the project or its contents to an external file/destination.**

These denials must be enforced by the command/API layer, not just hidden from the AI prompt or UI. AI tools must not bypass the restrictions through scripts, plugins, raw filesystem access, browser APIs, direct network calls, or an alternate export endpoint. Only an explicit human action in the application may perform these protected operations.

AI may make normal edits—including removing pixels or deleting an individual layer/frame—because these are editing actions, but they must go through undoable commands. If “delete” is later defined to prohibit any deletion of artwork/layers/frames, that should become a separate permission flag; it must not be inferred from the project-deletion restriction.

## Tool API principles

- **Structured actions only:** no arbitrary JavaScript, shell, filesystem, or unrestricted browser execution.
- **Same command engine:** AI actions use the same validation, transactions, history and rendering pipeline as manual actions.
- **Scoped context:** tools receive the active document, selected layer/frame, selection bounds, palette, dimensions and relevant metadata—not unrelated account data.
- **Previewable plans:** multi-step jobs expose a concise plan and estimated scope before applying. Low-risk direct edits can run immediately; large or ambiguous operations should request confirmation.
- **Undoability:** each operation produces a history entry; compound tasks use a transaction so the user can undo the task as one unit where practical.
- **Bounded resources:** validate dimensions, pixel counts, iteration counts, memory estimates and execution time. Expensive jobs run in workers, report progress, and can be cancelled.
- **No silent export or upload:** export, sharing, publishing and remote upload are not AI capabilities. A model backend must not receive artwork unless the user explicitly enables a remote provider for that task.
- **Provenance:** record agent/provider, action names, affected regions/layers, timestamp, result, and undo availability. Do not log secrets or unnecessary artwork content.
- **Truthful status:** AI must distinguish a proposed edit from an applied edit and a completed operation from a failed/cancelled one.

## Initial tool families

### 1. Inspect and understand
- document.get_summary
- document.get_dimensions
- document.get_active_context
- document.get_layer_tree
- document.get_frame_timeline
- document.get_palette
- canvas.get_pixel
- canvas.sample_region (bounded resolution)
- selection.get_state
- history.get_recent_actions
- diagnostics.get_performance_budget

Inspection returns structured data and optionally a small, bounded preview. It does not permit project export.

### 2. Canvas and pixel operations
- canvas.draw_pixels, canvas.draw_line, canvas.draw_shape
- canvas.fill_region with explicit contiguous/global mode and tolerance
- canvas.replace_color with scope and maximum affected-pixel limit
- canvas.apply_brush_stroke with points, pressure, size, opacity and blend mode
- canvas.apply_gradient, canvas.apply_dither, canvas.apply_pattern
- canvas.clear_region (undoable and scoped)
- canvas.transform_region with interpolation mode
- canvas.apply_symmetry, canvas.preview_tile_seam

All coordinates are document-space coordinates, not screen pixels. Inputs must be validated against canvas bounds. Large changes return affected bounds and pixel counts.

### 3. Selection
- selection.create_rect, selection.create_ellipse, selection.create_lasso
- selection.from_color, selection.from_alpha, selection.grow, selection.shrink, selection.feather
- selection.invert, selection.combine, selection.clear
- selection.move, selection.copy_internal, selection.transform

Selection copy is internal to the current editor session/document; it is not an export operation.

### 4. Layers and compositing
- layers.list, layers.create, layers.rename, layers.reorder
- layers.set_visibility, layers.set_opacity, layers.set_blend_mode, layers.set_lock
- layers.duplicate, layers.merge, layers.delete
- layers.add_mask, layers.apply_effect, layers.set_clipping
- layers.set_active

Layer/frame deletion is an ordinary editable action, must be scoped to a named ID, and must be undoable. Deleting the entire project remains denied.

### 5. Animation and tilemaps
- animation.list_frames, animation.create_frame, animation.duplicate_frame, animation.move_frame, animation.delete_frame
- animation.set_duration, animation.set_loop, animation.create_tag
- animation.set_onion_skin, animation.edit_cel
- tilemap.paint, tilemap.fill, tilemap.set_rules, tilemap.validate_seams

### 6. Color, palette, brushes and effects
- palette.add_color, palette.remove_color, palette.reorder, palette.map_image
- brush.create_preset, brush.set_parameters, brush.apply_stroke
- effects.preview, effects.apply, effects.remove, effects.reorder
- image.adjust_levels, image.adjust_hue_saturation, image.posterize, image.reduce_palette

Non-destructive previews should be preferred when supported.

### 7. Generators and AI image workflows
- generator.noise, generator.terrain, generator.clouds, generator.palette_ramp, generator.tile
- ai.generate_variations, ai.inpaint_masked_region, ai.segment_subject, ai.upscale_preview
- ai.get_provider_status, ai.cancel_job, ai.compare_results, ai.apply_result

The interface must label outputs as **procedural** or **model-generated**. Model calls require provider capability checks, resource limits and explicit consent before artwork is sent to a remote service. Applying a result is an undoable editor command.

### 8. Productivity and diagnostics
- history.undo, history.redo, history.create_checkpoint
- macro.record, macro.run (only registered editor commands)
- assets.search, assets.place
- document.validate_sprite, document.validate_animation
- diagnostics.profile_operation, diagnostics.report_warnings

The AI may save normal internal recovery checkpoints through the editor's persistence layer, but it may not invoke project export or project deletion.

## Tool-call schema

Each call should have a stable ID, versioned name, validated JSON arguments, an operation scope and a cancellation signal. Each result should return:
- status: success | rejected | failed | cancelled
- summary: concise human-readable outcome
- affected: layer/frame IDs, region bounds and counts where applicable
- history_entry_id: if an undoable edit was committed
- warnings: validation, clipping, resource or quality warnings
- preview_ref: optional in-editor preview reference (not a downloadable/exported file)

Unknown tools, unknown arguments and unsupported versions are rejected closed.

## Mandatory enforcement tests

1. Attempt project deletion through every AI adapter: rejected.
2. Attempt project export through every AI adapter: rejected.
3. Attempt export through macros/scripts/plugins invoked by AI: rejected.
4. Ordinary pixel/layer/frame edits create history entries and can be undone.
5. Invalid coordinates, oversized canvases and unbounded fill requests are rejected safely.
6. Cancelling a worker leaves the document consistent.
7. Remote AI requests cannot happen until the user has opted in to that provider/task.
8. Prompt injection inside imported artwork, filenames, metadata or reference images cannot grant additional permissions.
9. An agent cannot call raw network, filesystem or arbitrary code-execution facilities.
10. A rejected operation reports rejection; it never claims success.

## Implementation order

1. Implement the command bus and history contract first.
2. Add a typed registry with schemas, permission scopes and resource limits.
3. Expose read-only inspection tools.
4. Expose reversible pixel/selection/layer actions.
5. Add animation, palettes, filters, macros and procedural generators.
6. Add provider adapters and model-backed tools only after consent, cancellation and audit behavior pass tests.
