import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisionSnapshot, toProviderImageParts } from '../src/headless-vision.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';

test('artwork-only observation sends the drawing without editor chrome', () => {
  const snapshot = createVisionSnapshot({ mode: 'artwork', artworkImage: png, project: { width: 64, height: 64 } });
  assert.equal(snapshot.images.length, 1);
  assert.equal(snapshot.images[0].role, 'artwork');
  assert.equal(snapshot.context.mode, 'artwork');
});

test('interface and combined modes require and label their respective screenshots', () => {
  const ui = createVisionSnapshot({ mode: 'interface', interfaceImage: png });
  assert.deepEqual(ui.images.map(x => x.role), ['interface']);
  const both = createVisionSnapshot({ mode: 'combined', interfaceImage: png, artworkImage: png });
  assert.deepEqual(both.images.map(x => x.role), ['interface', 'artwork']);
});

test('animation observations preserve frame order, durations and per-frame images', () => {
  const snapshot = createVisionSnapshot({
    mode: 'artwork', artworkImage: png,
    animation: { fps: 12, loop: true, selectedFrame: 1, frames: [
      { index: 0, durationMs: 80, name: 'contact' , image: png },
      { index: 1, durationMs: 100, name: 'stride', image: png },
      { index: 2, durationMs: 80, name: 'push-off', image: png },
    ] },
  });
  assert.deepEqual(snapshot.context.animation.frames.map(x => x.index), [0, 1, 2]);
  assert.deepEqual(snapshot.context.animation.frames.map(x => x.durationMs), [80, 100, 80]);
  assert.equal(snapshot.images.filter(x => x.role === 'animation-frame').length, 3);
  assert.equal(toProviderImageParts(snapshot).length, 4);
});

test('invalid modes, missing screenshots, malformed frames and oversized sequences are rejected', () => {
  assert.throws(() => createVisionSnapshot({ mode: 'magic' }), /Vision mode/);
  assert.throws(() => createVisionSnapshot({ mode: 'combined', artworkImage: png }), /interface screenshot/);
  assert.throws(() => createVisionSnapshot({ mode: 'artwork' }), /artwork image/);
  assert.throws(() => createVisionSnapshot({ mode: 'artwork', artworkImage: png, animation: { frames: [{ index: 0, durationMs: 0, image: png }] } }), /duration/);
  assert.throws(() => createVisionSnapshot({ mode: 'artwork', artworkImage: png, animation: { frames: Array.from({length:24},(_,index)=>({index,durationMs:100,image:png})) } }), /visible frames/);
});

test('vision packets reject non-PNG, malformed metadata and excessive image payloads', () => {
  assert.throws(() => createVisionSnapshot({ mode: 'artwork', artworkImage: 'https://example.com/a.png' }), /PNG data URL/);
  assert.throws(() => createVisionSnapshot({ mode: 'artwork', artworkImage: png, project: [] }), /project must be an object/);
  assert.throws(() => createVisionSnapshot({ mode: 'artwork', artworkImage: 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024) }), /8 MiB/);
});
