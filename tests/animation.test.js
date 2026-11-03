import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationTimeline } from '../src/animation.js';

function makeTimeline(options = {}) {
  return new AnimationTimeline({ width: 4, height: 4, layers: [{ id: 'body', name: 'Body' }, { id: 'details', name: 'Details' }], ...options });
}

test('timeline starts with one independent transparent frame and stable layer IDs', () => {
  const timeline = makeTimeline(), snapshot = timeline.snapshot();
  assert.equal(snapshot.frames.length, 1); assert.equal(snapshot.frames[0].index, 0);
  assert.equal(snapshot.layers[0].id, 'body'); assert.equal(timeline.getCel(snapshot.frames[0].id, 'body').length, 64);
});
test('duplicating a frame copies cels without sharing mutable pixel buffers', () => {
  const timeline = makeTimeline(), first = timeline.frames[0], pixels = new Uint8ClampedArray(64);
  pixels.set([255, 0, 0, 255], 0); timeline.setCel(first.id, 'body', pixels);
  const second = timeline.duplicateFrame(first.id, { name: 'Contact pose' }), copied = timeline.getCel(second.id, 'body');
  assert.deepEqual(copied, pixels); copied[0] = 0;
  assert.equal(timeline.getCel(first.id, 'body')[0], 255); assert.equal(timeline.getCel(second.id, 'body')[0], 255);
});
test('frames can be inserted, reordered, selected and deleted without losing stable identity', () => {
  const timeline = makeTimeline(), first = timeline.frames[0], second = timeline.addFrame({ name: 'Passing pose' }), third = timeline.addFrame({ name: 'Contact pose' });
  assert.equal(timeline.frameCount, 3); assert.equal(timeline.moveFrame(third.id, 0), true);
  assert.deepEqual(timeline.frames.map(frame => frame.id), [third.id, first.id, second.id]);
  timeline.selectFrame(first.id); timeline.deleteFrame(first.id);
  assert.equal(timeline.selectedFrameId, third.id); assert.equal(timeline.frameCount, 2);
});
test('frame durations, fps, loop and total playback duration are validated', () => {
  const timeline = makeTimeline({ fps: 10, durationMs: 100 }), first = timeline.frames[0], second = timeline.addFrame({ durationMs: 150 });
  assert.equal(timeline.setFrameDuration(first.id, 120), true); assert.equal(timeline.totalDurationMs, 270);
  assert.equal(timeline.setFPS(24), true); assert.equal(timeline.setLoop(false), true);
  assert.equal(timeline.snapshot().fps, 24); assert.equal(timeline.snapshot().loop, false);
  assert.throws(() => timeline.setFrameDuration(second.id, 0), RangeError); assert.throws(() => timeline.setFPS(121), RangeError);
});
test('animation tags address stable frame IDs and produce a bounded playback range', () => {
  const timeline = makeTimeline(), first = timeline.frames[0], second = timeline.addFrame(), third = timeline.addFrame();
  const tag = timeline.createTag('Run', first.id, second.id);
  assert.deepEqual(timeline.getPlaybackFrames({ tagId: tag.id }).map(frame => frame.id), [first.id, second.id]);
  assert.equal(timeline.getTags()[0].endIndex, 1); assert.throws(() => timeline.createTag('Invalid', third.id, first.id), RangeError);
});
test('deleting a frame removes tags that depend on that frame and preserves one-frame minimum', () => {
  const timeline = makeTimeline(), first = timeline.frames[0], second = timeline.addFrame();
  timeline.createTag('Idle', first.id, second.id); timeline.deleteFrame(first.id);
  assert.equal(timeline.getTags().length, 0); assert.throws(() => timeline.deleteFrame(second.id), /at least one frame/);
});
test('cel updates validate dimensions and do not increment revision for identical pixels', () => {
  const timeline = makeTimeline(), frame = timeline.frames[0], blank = new Uint8ClampedArray(64);
  assert.equal(timeline.setCel(frame.id, 'body', blank), false); blank[3] = 255;
  assert.equal(timeline.setCel(frame.id, 'body', blank), true); assert.equal(timeline.revision, 1);
  assert.throws(() => timeline.setCel(frame.id, 'body', new Uint8ClampedArray(4)), TypeError);
  assert.throws(() => timeline.setCel(frame.id, 'missing', blank), RangeError);
});
test('timeline enforces frame count and total pixel-memory budgets before allocation', () => {
  const limitedFrames = makeTimeline({ maxFrames: 1 });
  assert.throws(() => limitedFrames.addFrame(), /frame limit/);
  const limitedMemory = makeTimeline({ maxBytes: 4 * 4 * 4 * 2 * 1 });
  assert.throws(() => limitedMemory.addFrame(), /memory budget/);
});
