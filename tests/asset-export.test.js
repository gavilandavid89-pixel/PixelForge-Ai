import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpriteSheetLayout, MAX_ATLAS_DIMENSION, MAX_ATLAS_PIXELS } from '../src/asset-export.js';

test('sprite sheet layout creates deterministic grid frames and centered pivots', () => {
  const layout = createSpriteSheetLayout(5, 16, 12, { columns: 3, padding: 1 });
  assert.deepEqual([layout.width, layout.height, layout.rows, layout.columns], [54, 28, 2, 3]);
  assert.deepEqual(layout.frames.map(frame => [frame.x, frame.y]), [[1, 1], [19, 1], [37, 1], [1, 15], [19, 15]]);
  assert.deepEqual([layout.frames[0].pivotX, layout.frames[0].pivotY], [8, 6]);
});

test('sprite sheet layout rejects invalid dimensions, columns, padding and memory budgets', () => {
  assert.throws(() => createSpriteSheetLayout(0, 16, 16), /valid positive integers/);
  assert.throws(() => createSpriteSheetLayout(4, 16, 16, { columns: 5 }), /valid positive integers/);
  assert.throws(() => createSpriteSheetLayout(2, 16, 16, { padding: -1 }), /valid positive integers/);
  assert.throws(() => createSpriteSheetLayout(2, MAX_ATLAS_DIMENSION, 1, { columns: 2, padding: 1 }), /safe export limits/);
  assert.ok(MAX_ATLAS_PIXELS > 0);
});
