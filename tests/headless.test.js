import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessRuntime, HeadlessEditorRuntime } from '../src/headless.js';

test('headless runtime starts without a DOM and exposes independent source and sandbox state', () => {
  const runtime = createHeadlessRuntime({ width: 12, height: 9, name: 'Automation test' });
  assert.ok(runtime instanceof HeadlessEditorRuntime);
  assert.equal(runtime.inspect().mode, 'headless');
  assert.deepEqual(
    (({ width, height, name, revision }) => ({ width, height, name, revision }))(runtime.document),
    { width: 12, height: 9, name: 'Automation test', revision: 0 },
  );
  assert.notEqual(runtime.document, runtime.sandbox);
  assert.notEqual(runtime.document.layers[0].pixels, runtime.sandbox.layers[0].pixels);
});

test('headless commands edit only the AI sandbox and produce a measurable diff', () => {
  const runtime = createHeadlessRuntime({ width: 8, height: 8 });
  const result = runtime.execute({
    name: 'canvas.draw_line', x0: 1, y0: 2, x1: 4, y1: 2, color: '#12ABEF',
  });
  assert.equal(result.ok, true);
  assert.equal(runtime.document.revision, 0);
  assert.equal(runtime.document.sampleColorAt(2, 2), null);
  assert.equal(runtime.sandbox.sampleColorAt(2, 2), '#12ABEF');
  assert.deepEqual(
    (({ changedPixels, bounds }) => ({ changedPixels, bounds }))(runtime.getDiff()),
    { changedPixels: 4, bounds: { x: 1, y: 2, width: 4, height: 1 } },
  );
});

test('headless proposal acceptance is explicit, atomic and undoable on the source', () => {
  const runtime = createHeadlessRuntime({ width: 8, height: 8 });
  runtime.execute({ name: 'canvas.draw_line', x0: 3, y0: 3, x1: 3, y1: 3, color: '#ABCDEF' });
  const proposal = runtime.createProposal('Add one pixel');
  assert.ok(proposal.id);
  assert.equal(runtime.inspect().proposal.id, proposal.id);
  assert.deepEqual(runtime.acceptProposal(), { status: 'applied', changedPixels: 1, changedLayers: 1 });
  assert.equal(runtime.document.sampleColorAt(3, 3), '#ABCDEF');
  assert.equal(runtime.document.undo(), true);
  assert.equal(runtime.document.sampleColorAt(3, 3), null);
});

test('headless proposal cannot apply stale source revisions', () => {
  const runtime = createHeadlessRuntime({ width: 8, height: 8 });
  runtime.execute({ name: 'canvas.draw_line', x0: 1, y0: 1, x1: 1, y1: 1, color: '#FF0000' });
  runtime.createProposal('Potential edit');
  const stroke = runtime.document.beginStroke({ color: '#00FF00', size: 1 });
  runtime.document.strokeTo(stroke, 7, 7);
  runtime.document.endStroke(stroke);
  const before = new Uint8ClampedArray(runtime.document.layers[0].pixels);
  assert.equal(runtime.acceptProposal().reason, 'stale-base');
  assert.deepEqual(runtime.document.layers[0].pixels, before);
});

test('headless runtime denies project deletion, export, network and arbitrary code actions', () => {
  const runtime = createHeadlessRuntime({ width: 4, height: 4 });
  for (const name of ['project.delete', 'document.delete', 'project.export', 'canvas.export', 'project.upload', 'project.publish']) {
    assert.equal(runtime.execute({ name }).error.code, 'permission_denied');
  }
  for (const name of ['system.run_shell', 'network.fetch', 'filesystem.write', 'canvas.eval']) {
    assert.equal(runtime.execute({ name }).error.code, 'unknown_action');
  }
  assert.equal(runtime.document.revision, 0);
});

test('headless sandbox discard restores a clean copy of the canonical document', () => {
  const runtime = createHeadlessRuntime({ width: 8, height: 8 });
  runtime.execute({ name: 'canvas.draw_line', x0: 2, y0: 2, x1: 2, y1: 2, color: '#FF0000' });
  assert.equal(runtime.discardSandboxChanges(), true);
  assert.equal(runtime.sandbox.sampleColorAt(2, 2), null);
  assert.equal(runtime.inspect().sandbox.hasChanges, false);
});
