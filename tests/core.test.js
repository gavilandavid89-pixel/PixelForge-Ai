import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterDocument, screenToDocument, validateDimensions, parseHexColor, MAX_DOCUMENT_BYTES, rasterLinePoints, createSelectionMask } from '../src/core.js';

test('layer reordering changes composite stacking and supports undo/redo', () => {
  const doc = new RasterDocument(2, 2);
  const baseId = doc.activeLayer.id;
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  const top = doc.addLayer('Blue top');
  stroke = doc.beginStroke({ color: '#0000ff', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  assert.deepEqual([...doc.composite().slice(0, 4)], [0, 0, 255, 255]);
  assert.equal(doc.moveLayer(top.id, 0), true);
  assert.deepEqual([...doc.composite().slice(0, 4)], [255, 0, 0, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual([...doc.composite().slice(0, 4)], [0, 0, 255, 255]);
  assert.equal(doc.redo(), true);
  assert.deepEqual([...doc.composite().slice(0, 4)], [255, 0, 0, 255]);
  assert.throws(() => doc.moveLayer(baseId, 4), /target index/);
  assert.equal(doc.moveLayer(baseId, doc.layers.indexOf(doc.layers.find(layer => layer.id === baseId))), false);
});

test('layer rename, opacity, duplicate and delete are undoable and preserve pixels', () => {
  const doc = new RasterDocument(2, 2);
  const base = doc.activeLayer;
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  const duplicate = doc.duplicateLayer(base.id);
  assert.equal(doc.layers.length, 2);
  assert.equal(duplicate.name, 'Layer 1 copy');
  assert.deepEqual([...doc.composite().slice(0, 4)], [255, 0, 0, 255]);
  doc.setLayerOpacity(duplicate.id, 0.5);
  assert.deepEqual([...doc.composite().slice(0, 4)], [255, 0, 0, 255]);
  doc.renameLayer(duplicate.id, 'Highlights');
  assert.equal(doc.activeLayer.name, 'Highlights');
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.name, 'Layer 1 copy');
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.opacity, 1);
  assert.equal(doc.undo(), true);
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.activeLayer.id, base.id);
  assert.equal(doc.redo(), true);
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.activeLayer.name, 'Layer 1 copy');
  doc.deleteLayer(duplicate.id);
  assert.equal(doc.layers.length, 1);
  assert.throws(() => doc.deleteLayer(base.id), /at least one layer/);
  assert.equal(doc.undo(), true);
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.layers.find(layer => layer.id === duplicate.id).name, 'Layer 1 copy');
  assert.throws(() => doc.setLayerOpacity(duplicate.id, 1.1), /between 0 and 1/);
  const restored = RasterDocument.fromJSON(doc.toJSON());
  assert.equal(restored.layers.length, 2);
  assert.equal(restored.layers.find(layer => layer.id === duplicate.id).opacity, 1);
});

test('layer lock changes are undoable, redoable, persisted, and enforced by drawing and fill', () => {
  const doc = new RasterDocument(4, 4);
  const id = doc.activeLayer.id;
  doc.setLayerLocked(id, true);
  assert.equal(doc.activeLayer.locked, true);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.locked, false);
  assert.equal(doc.redo(), true);
  assert.equal(doc.activeLayer.locked, true);
  assert.throws(() => doc.beginStroke({ color: '#ff0000' }), /locked/);
  assert.throws(() => doc.fillAt(0, 0, { color: '#00ff00' }), /locked/);
  const restored = RasterDocument.fromJSON(doc.toJSON());
  assert.equal(restored.activeLayer.locked, true);
});

test('rectangular clear is clipped, respects locks and is one undoable pixel action', () => {
  const doc = new RasterDocument(4, 3);
  const stroke = doc.beginStroke({ color: '#33aaee', size: 1 });
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) doc.strokeTo(stroke, x, y);
  doc.endStroke(stroke);
  const before = new Uint8ClampedArray(doc.activeLayer.pixels);
  const historyBefore = doc.history.length;
  assert.equal(doc.clearRect(1, 1, 2, 1), 2);
  assert.equal(doc.history.length, historyBefore + 1);
  assert.equal(doc.sampleColorAt(1, 1, { merged: false }), null);
  assert.equal(doc.sampleColorAt(0, 1, { merged: false }), '#33AAEE');
  assert.equal(doc.undo(), true);
  assert.deepEqual([...doc.activeLayer.pixels], [...before]);
  assert.equal(doc.redo(), true);
  assert.equal(doc.clearRect(-2, -2, 2, 2), 0);
  doc.setLayerLocked(doc.activeLayer.id, true);
  assert.throws(() => doc.clearRect(0, 0, 1, 1), /locked/);
  assert.throws(() => doc.clearRect(0, 0, 0, 1), /positive integers/);
});

test('eyedropper samples visible merged color or active-layer pixels without editing', () => {
  const doc = new RasterDocument(2, 1);
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.strokeTo(stroke, 1, 0); doc.endStroke(stroke);
  doc.addLayer('Highlights');
  stroke = doc.beginStroke({ color: '#0000ff', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  const historyCount = doc.history.length, revision = doc.revision;
  assert.equal(doc.sampleColorAt(0, 0), '#0000FF');
  assert.equal(doc.sampleColorAt(1, 0), '#FF0000');
  assert.equal(doc.sampleColorAt(1, 0, { merged: false }), null);
  assert.throws(() => doc.sampleColorAt(2, 0), /outside the document/);
  assert.equal(doc.history.length, historyCount);
  assert.equal(doc.revision, revision);
});

test('bucket fill respects connected boundaries and is one undoable pixel command', () => {
  const doc = new RasterDocument(5, 3);
  const barrier = doc.beginStroke({ color: '#ff0000', size: 1 });
  for (let y = 0; y < 3; y++) doc.strokeTo(barrier, 2, y);
  doc.endStroke(barrier);
  const beforeFillHistory = doc.history.length;
  const count = doc.fillAt(0, 0, { color: '#00ff00' });
  assert.equal(count, 6);
  assert.equal(doc.history.length, beforeFillHistory + 1);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 255, 0, 255]);
  assert.equal(doc.activeLayer.pixels[(0 * 5 + 4) * 4 + 3], 0);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.pixels[3], 0);
  assert.equal(doc.redo(), true);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 255, 0, 255]);
});

test('bucket fill global mode changes disconnected matching pixels only', () => {
  const doc = new RasterDocument(5, 3);
  const barrier = doc.beginStroke({ color: '#ff0000', size: 1 });
  for (let y = 0; y < 3; y++) doc.strokeTo(barrier, 2, y);
  doc.endStroke(barrier);
  assert.equal(doc.fillAt(0, 0, { color: '#0000ff', contiguous: false }), 12);
  assert.deepEqual([...doc.activeLayer.pixels.slice((4 * 4), (4 * 4) + 4)], [0, 0, 255, 255]);
  assert.deepEqual([...doc.activeLayer.pixels.slice((2 * 4), (2 * 4) + 4)], [255, 0, 0, 255]);
});

test('bucket fill treats erased transparent pixels as one region despite hidden RGB values', () => {
  const doc = new RasterDocument(3, 1);
  doc.activeLayer.pixels.set([200,0,0,0, 0,200,0,0, 0,0,200,255]);
  assert.equal(doc.fillAt(0, 0, { color: '#00ff00' }), 2);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 8)], [0,255,0,255, 0,255,0,255]);
  assert.deepEqual([...doc.activeLayer.pixels.slice(8, 12)], [0,0,200,255]);
});

test('bucket fill tolerance is bounded, detects similar colors, and respects layer locks', () => {
  const doc = new RasterDocument(3, 1);
  doc.activeLayer.pixels.set([0,0,0,255, 5,0,0,255, 255,0,0,255]);
  assert.equal(doc.fillAt(0, 0, { color: '#ffffff', tolerance: 5 }), 2);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 8)], [255,255,255,255, 255,255,255,255]);
  assert.throws(() => doc.fillAt(0, 0, { tolerance: 256 }), /tolerance/);
  doc.activeLayer.locked = true;
  assert.throws(() => doc.fillAt(0, 0, { color: '#000000' }), /locked/);
});

test('dimension validation rejects invalid and oversized canvases', () => {
  assert.throws(() => validateDimensions(0, 20), RangeError);
  assert.throws(() => validateDimensions(2049, 1), RangeError);
  assert.throws(() => validateDimensions(2048, 2049), RangeError);
  assert.deepEqual(validateDimensions(128, 64), { width: 128, height: 64 });
});
test('screen coordinates map into document coordinates with zoom and pan', () => {
  const viewport = { zoom: 4, panX: 20, panY: 12 };
  assert.deepEqual(screenToDocument({ x: 28, y: 20 }, viewport, { width: 10, height: 10 }), { x: 2, y: 2, inside: true });
  assert.equal(screenToDocument({ x: 19, y: 20 }, viewport, { width: 10, height: 10 }).inside, false);
  assert.equal(screenToDocument({ x: 60, y: 20 }, viewport, { width: 10, height: 10 }).inside, false);
});
test('stroke paints, composites and is undoable/redoable as one action', () => {
  const doc = new RasterDocument(8, 8);
  const stroke = doc.beginStroke({ color: '#f00', size: 1 });
  doc.strokeTo(stroke, 2, 3); doc.strokeTo(stroke, 5, 3);
  assert.equal(doc.activeLayer.pixels[(3 * 8 + 2) * 4 + 3], 255);
  doc.endStroke(stroke);
  assert.equal(doc.history.length, 1);
  assert.equal(doc.composite()[(3 * 8 + 4) * 4], 255);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.pixels[(3 * 8 + 2) * 4 + 3], 0);
  assert.equal(doc.redo(), true);
  assert.equal(doc.activeLayer.pixels[(3 * 8 + 2) * 4], 255);
});
test('cancelled stroke restores exact prior pixels without history', () => {
  const doc = new RasterDocument(5, 5), before = new Uint8ClampedArray(doc.activeLayer.pixels);
  const stroke = doc.beginStroke({ color: '#00ff00', size: 2 });
  doc.strokeTo(stroke, 2, 2); doc.endStroke(stroke, { commit: false });
  assert.deepEqual(doc.activeLayer.pixels, before);
  assert.equal(doc.history.length, 0);
  assert.equal(doc.dirty, false);
});
test('eraser clears alpha without painting a background color', () => {
  const doc = new RasterDocument(4, 4);
  let stroke = doc.beginStroke({ color: '#ffffff', size: 1 });
  doc.strokeTo(stroke, 1, 1); doc.endStroke(stroke);
  stroke = doc.beginStroke({ size: 1, mode: 'erase' });
  doc.strokeTo(stroke, 1, 1); doc.endStroke(stroke);
  assert.equal(doc.activeLayer.pixels[(1 * 4 + 1) * 4 + 3], 0);
});
test('layer addition and visibility can be undone and redone', () => {
  const doc = new RasterDocument(4, 4), originalId = doc.activeLayerId;
  const layer = doc.addLayer('Ink');
  assert.equal(doc.layers.length, 2); assert.equal(doc.activeLayerId, layer.id);
  doc.undo(); assert.equal(doc.layers.length, 1); assert.equal(doc.activeLayerId, originalId);
  doc.redo(); assert.equal(doc.layers.length, 2);
  doc.setLayerVisibility(doc.layers[1].id, false); assert.equal(doc.layers[1].visible, false);
  doc.undo(); assert.equal(doc.layers[1].visible, true);
});
test('project serialization round-trips pixels, layers, identity and metadata', () => {
  const doc = new RasterDocument(6, 7, 'Test artwork');
  const stroke = doc.beginStroke({ color: '#abc', size: 1 });
  doc.strokeTo(stroke, 3, 4); doc.endStroke(stroke); doc.addLayer('Highlights');
  const restored = RasterDocument.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  assert.equal(restored.id, doc.id); assert.equal(restored.name, 'Test artwork');
  assert.equal(restored.width, 6); assert.equal(restored.layers.length, 2);
  assert.deepEqual(restored.layers[0].pixels, doc.layers[0].pixels);
  assert.equal(restored.activeLayerId, doc.activeLayerId);
  assert.equal(restored.saveVersion, doc.saveVersion);
  assert.equal(restored.history.length, 0); assert.equal(restored.dirty, false);
});
test('project import rejects mismatched pixel buffers and unsupported versions', () => {
  const invalid = new RasterDocument(2, 2).toJSON(); invalid.layers[0].pixels = 'AA==';
  assert.throws(() => RasterDocument.fromJSON(invalid), /pixel data length/);
  assert.throws(() => RasterDocument.fromJSON({ format: 'pixelforge-project', version: 900, width: 2, height: 2, layers: [] }), /Unsupported/);
});
test('hex color parsing supports short and long formats and rejects invalid values', () => {
  assert.deepEqual(parseHexColor('#abc'), [170, 187, 204]);
  assert.deepEqual(parseHexColor('12ef90'), [18, 239, 144]);
  assert.throws(() => parseHexColor('nope'), TypeError);
});
test('brush sizes create exact square pixel footprints and use bounded tile patches', () => {
  const doc = new RasterDocument(128, 128);
  const stroke = doc.beginStroke({ color: '#ffffff', size: 2 });
  doc.strokeTo(stroke, 10, 10); doc.endStroke(stroke);
  let count = 0;
  for (let i = 3; i < doc.activeLayer.pixels.length; i += 4) if (doc.activeLayer.pixels[i]) count++;
  assert.equal(count, 4);
  assert.equal(doc.history[0].type, 'pixels');
  assert.equal(doc.history[0].tiles.length, 1);
  assert.equal(doc.history[0].tiles[0].before.byteLength, 64 * 64 * 4);
  assert.ok(doc.historyBytes <= doc.maxHistoryBytes);
});
test('new edit after undo clears redo history', () => {
  const doc = new RasterDocument(8, 8);
  let stroke = doc.beginStroke({ color: '#fff', size: 1 });
  doc.strokeTo(stroke, 1, 1); doc.endStroke(stroke); doc.undo();
  assert.equal(doc.future.length, 1);
  stroke = doc.beginStroke({ color: '#f00', size: 1 });
  doc.strokeTo(stroke, 2, 2); doc.endStroke(stroke);
  assert.equal(doc.future.length, 0); assert.equal(doc.redo(), false);
});
test('document refuses layers that exceed its memory budget', () => {
  const doc = new RasterDocument(2048, 2048);
  doc.addLayer('Second layer'); doc.addLayer('Third layer'); doc.addLayer('Fourth layer');
  assert.equal(doc.layers.length * doc.width * doc.height * 4, MAX_DOCUMENT_BYTES);
  assert.throws(() => doc.addLayer('Too much memory'), /64 MiB/);
});

test('stroke commands reject out-of-bounds coordinates without changing pixels', () => {
  const doc = new RasterDocument(8, 8);
  const stroke = doc.beginStroke({ color: '#fff', size: 1 });
  assert.throws(() => doc.strokeTo(stroke, -1, 3), /outside the document bounds/);
  assert.equal(doc.activeLayer.pixels.some(value => value !== 0), false);
  doc.endStroke(stroke, { commit: false });
});

test('compositor blends layers in order and visibility updates the cached composite', () => {
  const doc = new RasterDocument(2, 2);
  const bottom = doc.activeLayer;
  bottom.pixels.set([255, 0, 0, 255], 0);
  const top = doc.addLayer('Blue overlay');
  top.pixels.set([0, 0, 255, 128], 0);
  doc.compositeDirtyTiles.add('0:0');
  const blended = doc.composite();
  assert.ok(blended[0] >= 126 && blended[0] <= 127);
  assert.equal(blended[1], 0);
  assert.ok(blended[2] >= 128 && blended[2] <= 129);
  assert.equal(blended[3], 255);
  doc.setLayerVisibility(top.id, false);
  assert.deepEqual(Array.from(doc.composite().slice(0, 4)), [255, 0, 0, 255]);
});

test('composite exposes dirty tile regions until the renderer acknowledges them', () => {
  const doc = new RasterDocument(130, 70);
  assert.ok(doc.getCompositeDirtyTiles().length > 1);
  doc.composite();
  assert.ok(doc.getCompositeDirtyTiles().length > 1);
  doc.clearCompositeDirtyTiles();
  assert.equal(doc.getCompositeDirtyTiles().length, 0);
  const stroke = doc.beginStroke({ color: '#fff', size: 1 });
  doc.strokeTo(stroke, 129, 69); doc.endStroke(stroke);
  assert.deepEqual(doc.getCompositeDirtyTiles(), [{ tileX: 2, tileY: 1, width: 2, height: 6 }]);
});

test('project import rejects duplicate IDs and invalid opacity values', () => {
  const doc = new RasterDocument(2, 2); doc.addLayer('Second');
  const duplicate = doc.toJSON(); duplicate.layers[1].id = duplicate.layers[0].id;
  assert.throws(() => RasterDocument.fromJSON(duplicate), /duplicate layer IDs/);
  const badOpacity = doc.toJSON(); badOpacity.layers[0].opacity = Number.NaN;
  assert.throws(() => RasterDocument.fromJSON(badOpacity), /opacity must be between/);
});
test('changing active layer marks workspace metadata for autosave without creating edit history', () => {
  const doc = new RasterDocument(4, 4); doc.addLayer('Second');
  doc.dirty = false; const historyCount = doc.history.length;
  doc.setActiveLayer(doc.layers[0].id);
  assert.equal(doc.dirty, true);
  assert.equal(doc.history.length, historyCount);
  assert.equal(doc.activeLayerId, doc.layers[0].id);
});

test('project import rejects empty project IDs and non-boolean layer flags', () => {
  const emptyId = new RasterDocument(2, 2).toJSON(); emptyId.id = '';
  assert.throws(() => RasterDocument.fromJSON(emptyId), /Invalid project ID/);
  const badFlag = new RasterDocument(2, 2).toJSON(); badFlag.layers[0].visible = 'false';
  assert.throws(() => RasterDocument.fromJSON(badFlag), /must be booleans/);
});

test('save version advances for persisted state without conflating workspace state with content revision', () => {
  const doc = new RasterDocument(4, 4);
  const contentRevision = doc.revision, initialSaveVersion = doc.saveVersion;
  doc.addLayer('Second');
  assert.ok(doc.saveVersion > initialSaveVersion);
  const revisionAfterLayer = doc.revision;
  doc.setActiveLayer(doc.layers[0].id);
  assert.equal(doc.revision, revisionAfterLayer);
  assert.ok(doc.saveVersion > initialSaveVersion + 1);
  const stroke = doc.beginStroke({ color: '#fff', size: 1 });
  doc.strokeTo(stroke, 1, 1); doc.endStroke(stroke);
  assert.ok(doc.revision > contentRevision);
  assert.ok(doc.saveVersion > revisionAfterLayer);
});

test('project import rejects invalid active-layer references and revisions', () => {
  const base = new RasterDocument(2, 2).toJSON();
  const badLayer = structuredClone(base); badLayer.activeLayerId = 'missing-layer';
  assert.throws(() => RasterDocument.fromJSON(badLayer), /Active layer ID/);
  const badRevision = structuredClone(base); badRevision.revision = -1;
  assert.throws(() => RasterDocument.fromJSON(badRevision), /revision must be a non-negative integer/);
});

test('layer commands validate names and boolean visibility instead of coercing invalid inputs', () => {
  const doc = new RasterDocument(4, 4);
  assert.throws(() => doc.addLayer('   '), /Layer name/);
  assert.throws(() => doc.addLayer('x'.repeat(181)), /Layer name/);
  assert.throws(() => doc.setLayerVisibility(doc.activeLayerId, 'false'), /must be a boolean/);
  assert.equal(doc.activeLayer.visible, true);
});

test('imported project copies receive independent document and layer identities', () => {
  const original = new RasterDocument(4, 4, 'My artwork');
  const layer = original.addLayer('Ink');
  const source = original.toJSON();
  const copy = RasterDocument.fromJSON(source, { newIdentity: true });
  assert.notEqual(copy.id, original.id);
  assert.notEqual(copy.layers[0].id, original.layers[0].id);
  assert.notEqual(copy.layers[1].id, layer.id);
  assert.equal(copy.activeLayerId, copy.layers[1].id);
  assert.equal(copy.name, 'My artwork (imported)');
  assert.equal(copy.revision, 0);
  assert.equal(copy.saveVersion, 0);
  assert.deepEqual(copy.layers[1].pixels, original.layers[1].pixels);
  assert.equal(original.id, source.id);
});


test('selection masks constrain pencil, eraser, fill, and clear operations and survive one-step undo', () => {
  const doc = new RasterDocument(4, 2);
  const mask = new Uint8Array(8); mask[1] = 1; mask[5] = 1;
  doc.setSelectionMask(mask);
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.strokeTo(stroke, 1, 0); doc.strokeTo(stroke, 2, 0); doc.endStroke(stroke);
  assert.equal(doc.activeLayer.pixels[(0 * 4 + 0) * 4 + 3], 0);
  assert.equal(doc.activeLayer.pixels[(0 * 4 + 1) * 4 + 3], 255);
  assert.equal(doc.activeLayer.pixels[(0 * 4 + 2) * 4 + 3], 0);
  assert.equal(doc.clearRect(0, 0, 4, 2), 1);
  assert.equal(doc.activeLayer.pixels[(0 * 4 + 1) * 4 + 3], 0);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.pixels[(0 * 4 + 1) * 4 + 3], 255);
  doc.setSelectionMask(null);
  assert.equal(doc.fillAt(0, 0, { color: '#00ff00', contiguous: false }), 7);
});

test('selection masks reject invalid dimensions and do not persist as document pixels', () => {
  const doc = new RasterDocument(3, 2);
  assert.throws(() => doc.setSelectionMask(new Uint8Array(5)), /matching document dimensions/);
  assert.throws(() => doc.setSelectionMask([1, 0, 0, 0, 0, 0]), /Uint8Array/);
  const mask = new Uint8Array(6); mask[0] = 1;
  doc.setSelectionMask(mask);
  const roundTrip = RasterDocument.fromJSON(doc.toJSON());
  assert.equal(roundTrip.selectionMask, null);
});


test('pixel clipboard copies and pastes bounded active-layer pixels as one reversible edit', () => {
  const doc = new RasterDocument(4, 3);
  let stroke = doc.beginStroke({ color: '#ff00aa', size: 1 });
  doc.strokeTo(stroke, 1, 1); doc.strokeTo(stroke, 2, 1); doc.endStroke(stroke);
  const clip = doc.copyRect(1, 1, 2, 1);
  assert.deepEqual([clip.x, clip.y, clip.width, clip.height], [1, 1, 2, 1]);
  assert.deepEqual([...clip.pixels], [255, 0, 170, 255, 255, 0, 170, 255]);
  assert.equal(doc.clearRect(1, 1, 2, 1), 2);
  assert.equal(doc.pasteRect(clip), 2);
  assert.equal(doc.activeLayer.pixels[(1 * 4 + 1) * 4 + 3], 255);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.pixels[(1 * 4 + 1) * 4 + 3], 0);
  assert.equal(doc.undo(), true);
  assert.equal(doc.activeLayer.pixels[(1 * 4 + 1) * 4 + 3], 255);
  assert.throws(() => doc.pasteRect({ ...clip, pixels: new Uint8ClampedArray(1) }), /Invalid internal pixel clipboard/);
});

test('pixel clipboard paste clips to canvas bounds and respects selection mask', () => {
  const doc = new RasterDocument(3, 2);
  const clip = { x: -1, y: 0, width: 3, height: 1, pixels: new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255
  ]) };
  const mask = new Uint8Array(6); mask[0] = 1; mask[1] = 0;
  doc.setSelectionMask(mask);
  assert.equal(doc.pasteRect(clip), 1);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 255, 0, 255]);
  assert.deepEqual([...doc.activeLayer.pixels.slice(4, 8)], [0, 0, 0, 0]);
});


test('Bresenham raster lines are integer, connected, reversible in direction, and include both endpoints', () => {
  for (const [x0, y0, x1, y1] of [[0, 0, 7, 3], [5, 9, 1, 2], [3, 4, 3, 4], [2, 1, 2, 8], [9, 2, 1, 2]]) {
    const points = rasterLinePoints(x0, y0, x1, y1);
    assert.deepEqual(points[0], { x: x0, y: y0 });
    assert.deepEqual(points.at(-1), { x: x1, y: y1 });
    assert.equal(new Set(points.map(point => `${point.x},${point.y}`)).size, points.length);
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.abs(points[i].x - points[i - 1].x) <= 1);
      assert.ok(Math.abs(points[i].y - points[i - 1].y) <= 1);
    }
    assert.deepEqual(points, rasterLinePoints(x1, y1, x0, y0).reverse());
  }
  assert.throws(() => rasterLinePoints(0, 0, 1.5, 2), /must be integers/);
});


test('color replacement preserves alpha, respects selection, and is one-step undoable', () => {
  const doc = new RasterDocument(3, 1);
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 });
  doc.strokeTo(stroke, 0, 0); doc.strokeTo(stroke, 1, 0); doc.endStroke(stroke);
  doc.activeLayer.pixels[3] = 128;
  const mask = new Uint8Array([1, 0, 1]); doc.setSelectionMask(mask);
  assert.equal(doc.replaceColor('#ff0000', '#00ff00'), 1);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 255, 0, 128]);
  assert.deepEqual([...doc.activeLayer.pixels.slice(4, 8)], [255, 0, 0, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [255, 0, 0, 128]);
  assert.equal(doc.replaceColor('#ffffff', '#000000'), 0);
  assert.throws(() => doc.replaceColor('#ff0000', '#000000', -1), /tolerance/);
  doc.setLayerLocked(doc.activeLayerId, true);
  assert.throws(() => doc.replaceColor('#ff0000', '#000000'), /locked/);
});


test('horizontal and vertical flips are clipped, selection-aware, and atomically undoable', () => {
  const doc = new RasterDocument(3, 2);
  for (const [x, y, color] of [[0, 0, '#ff0000'], [1, 0, '#00ff00'], [2, 0, '#0000ff'], [0, 1, '#ffff00'], [1, 1, '#ff00ff'], [2, 1, '#00ffff']]) {
    const stroke = doc.beginStroke({ color, size: 1 }); doc.strokeTo(stroke, x, y); doc.endStroke(stroke);
  }
  const before = new Uint8ClampedArray(doc.activeLayer.pixels);
  assert.equal(doc.flipRect(0, 0, 3, 2, 'horizontal'), 4);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 0, 255, 255]);
  assert.deepEqual([...doc.activeLayer.pixels.slice(8, 12)], [255, 0, 0, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual(doc.activeLayer.pixels, before);
  assert.equal(doc.flipRect(0, 0, 3, 2, 'vertical'), 6);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [255, 255, 0, 255]);
  assert.throws(() => doc.flipRect(0, 0, 3, 2, 'diagonal'), /Flip axis/);
});


test('sprite outline fills only transparent neighbors, respects selection, and undoes atomically', () => {
  const doc = new RasterDocument(3, 3);
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1 }); doc.strokeTo(stroke, 1, 1); doc.endStroke(stroke);
  const before = new Uint8ClampedArray(doc.activeLayer.pixels);
  assert.equal(doc.createOutline('#0000ff'), 8);
  assert.deepEqual([...doc.activeLayer.pixels.slice((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 4)], [255, 0, 0, 255]);
  assert.deepEqual([...doc.activeLayer.pixels.slice(0, 4)], [0, 0, 255, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual(doc.activeLayer.pixels, before);
  const mask = new Uint8Array(9); mask[1] = 1; doc.setSelectionMask(mask);
  assert.equal(doc.createOutline('#00ff00'), 1);
  assert.deepEqual([...doc.activeLayer.pixels.slice(4, 8)], [0, 255, 0, 255]);
  assert.throws(() => doc.createOutline('#fff', { diagonals: 'yes' }), /boolean/);
});


test('checker dither fill alternates foreground/background, respects scale and undoes atomically', () => {
  const doc = new RasterDocument(4, 2);
  const count = doc.fillAt(0, 0, { color: '#ff0000', secondaryColor: '#0000ff', contiguous: false, pattern: 'checker' });
  assert.equal(count, 8);
  const pixel = (x, y) => [...doc.activeLayer.pixels.slice((y * doc.width + x) * 4, (y * doc.width + x) * 4 + 4)];
  assert.deepEqual(pixel(0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(1, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(0, 1), [0, 0, 255, 255]);
  assert.deepEqual(pixel(1, 1), [255, 0, 0, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual(pixel(0, 0), [0, 0, 0, 0]);
  assert.equal(doc.fillAt(0, 0, { color: '#ff0000', secondaryColor: '#0000ff', contiguous: false, pattern: 'checker', scale: 2 }), 8);
  assert.deepEqual(pixel(0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(1, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(2, 0), [0, 0, 255, 255]);
  assert.throws(() => doc.fillAt(0, 0, { pattern: 'noise' }), /pattern/);
});


test('brush opacity alpha-composites draw strokes and partially erases with atomic undo', () => {
  const doc = new RasterDocument(1, 1);
  let stroke = doc.beginStroke({ color: '#ff0000', size: 1, opacity: 0.5 });
  doc.strokeTo(stroke, 0, 0); assert.equal(doc.endStroke(stroke), true);
  assert.deepEqual([...doc.activeLayer.pixels], [255, 0, 0, 128]);
  stroke = doc.beginStroke({ color: '#0000ff', size: 1, opacity: 0.5 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  assert.deepEqual([...doc.activeLayer.pixels], [85, 0, 170, 192]);
  assert.equal(doc.undo(), true);
  assert.deepEqual([...doc.activeLayer.pixels], [255, 0, 0, 128]);
  stroke = doc.beginStroke({ size: 1, mode: 'erase', opacity: 0.5 });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  assert.deepEqual([...doc.activeLayer.pixels], [255, 0, 0, 64]);
  assert.throws(() => doc.beginStroke({ opacity: 1.1 }), /opacity/);
  stroke = doc.beginStroke({ opacity: 0 });
  doc.strokeTo(stroke, 0, 0);
  assert.equal(doc.endStroke(stroke), false, 'zero-opacity stroke should not create a history entry');
});


test('unchanged stroke pixels do not create empty undo entries', () => {
  const doc = new RasterDocument(1, 1);
  let stroke = doc.beginStroke({ mode: 'erase' });
  doc.strokeTo(stroke, 0, 0);
  assert.equal(doc.endStroke(stroke), false);
  assert.equal(doc.history.length, 0);
  stroke = doc.beginStroke({ color: '#ff0000' });
  doc.strokeTo(stroke, 0, 0); doc.endStroke(stroke);
  assert.equal(doc.history.length, 1);
  stroke = doc.beginStroke({ color: '#ff0000' });
  doc.strokeTo(stroke, 0, 0);
  assert.equal(doc.endStroke(stroke), false);
  assert.equal(doc.history.length, 1);
});


test('rectangle and ellipse selection masks produce clipped deterministic pixel regions', () => {
  const rectangle = createSelectionMask(5, 5, { x: 1, y: 1, width: 3, height: 3, shape: 'rect' });
  assert.equal(rectangle.reduce((sum, value) => sum + value, 0), 9);
  assert.equal(rectangle[0], 0);
  const ellipse = createSelectionMask(5, 5, { x: 0, y: 0, width: 5, height: 5, shape: 'ellipse' });
  assert.equal(ellipse[2 * 5 + 2], 1, 'ellipse should include its center');
  assert.equal(ellipse[0], 0, 'ellipse should exclude bounding-box corners');
  assert.equal(ellipse[2], 1, 'ellipse should include the top-center pixel');
  assert.equal(createSelectionMask(5, 5, null), null);
  assert.throws(() => createSelectionMask(5, 5, { x: 0, y: 0, width: 2, height: 2, shape: 'lasso' }), /supported rect\/ellipse/);
});

test('copyRect copies only selected pixels and leaves unselected clipboard pixels transparent', () => {
  const doc = new RasterDocument(3, 3);
  const stroke = doc.beginStroke({ color: '#ff0000' });
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) doc.strokeTo(stroke, x, y);
  doc.endStroke(stroke);
  doc.setSelectionMask(createSelectionMask(3, 3, { x: 0, y: 0, width: 3, height: 3, shape: 'ellipse' }));
  const clip = doc.copyRect(0, 0, 3, 3);
  assert.equal(clip.pixels[(0 * 3 + 0) * 4 + 3], 0);
  assert.equal(clip.pixels[(1 * 3 + 1) * 4 + 3], 255);
  assert.equal(clip.pixels[(0 * 3 + 1) * 4 + 3], 255);
});
