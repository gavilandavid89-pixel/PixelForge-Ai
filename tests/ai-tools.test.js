import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterDocument } from '../src/core.js';
import { AIWorkspace } from '../src/workspaces.js';
import { AICommandSession } from '../src/ai-tools.js';

function paint(doc, x, y, color = '#ff0000') {
  const stroke = doc.beginStroke({ color, size: 1 });
  doc.strokeTo(stroke, x, y);
  doc.endStroke(stroke);
}

test('structured AI drawing commands modify only the isolated sandbox', () => {
  const user = new RasterDocument(8, 8, 'Original');
  const session = new AICommandSession(new AIWorkspace(user));
  const result = session.execute({ name: 'canvas.draw_line', x0: 1, y0: 2, x1: 4, y1: 2, color: '#12ABEF' });
  assert.equal(result.ok, true);
  assert.equal(user.revision, 0);
  assert.equal(session.execute({ name: 'canvas.get_pixel', x: 2, y: 2 }).result.color, '#12ABEF');
  assert.equal(user.sampleColorAt(2, 2), null);
});

test('AI tools validate coordinates, color, sizes, and rectangles before mutation', () => {
  const user = new RasterDocument(8, 8);
  const session = new AICommandSession(new AIWorkspace(user));
  assert.equal(session.execute({ name: 'canvas.draw_line', x0: -1, y0: 0, x1: 2, y1: 2, color: '#ffffff' }).ok, false);
  assert.equal(session.execute({ name: 'canvas.draw_line', x0: 0, y0: 0, x1: 2, y1: 2, color: 'red' }).error.code, 'invalid_arguments');
  assert.equal(session.execute({ name: 'canvas.clear_region', x: 0, y: 0, width: 9, height: 2 }).ok, false);
  assert.equal(session.execute({ name: 'canvas.fill', x: 0, y: 0, color: '#000000', tolerance: 999 }).ok, false);
  assert.equal(user.revision, 0);
});

test('AI tool fill and clear are undoable within the sandbox', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  const session = new AICommandSession(workspace);
  assert.equal(session.execute({ name: 'canvas.fill', x: 0, y: 0, color: '#334455' }).result.changedPixels, 64);
  assert.equal(session.execute({ name: 'canvas.clear_region', x: 2, y: 2, width: 2, height: 2 }).result.changedPixels, 4);
  assert.equal(workspace.sandbox.undo(), true);
  assert.equal(workspace.sandbox.sampleColorAt(2, 2), '#334455');
  assert.equal(user.revision, 0);
});

test('AI tools deny project deletion/export and arbitrary actions', () => {
  const session = new AICommandSession(new AIWorkspace(new RasterDocument(4, 4)));
  for (const name of ['project.delete', 'document.delete', 'project.export', 'canvas.export', 'project.upload', 'project.publish']) {
    assert.equal(session.execute({ name }).error.code, 'permission_denied');
  }
  assert.equal(session.execute({ name: 'system.run_shell', command: 'anything' }).error.code, 'unknown_action');
  assert.equal(session.execute({ name: 'canvas.eval', code: 'anything' }).error.code, 'unknown_action');
});

test('AI tool selection and pixel transforms preserve structured bounds', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  const session = new AICommandSession(workspace);
  paint(workspace.sandbox, 1, 1);
  const selection = session.execute({ name: 'selection.create_rect', x: 1, y: 1, width: 1, height: 1 });
  assert.equal(selection.result.selectedPixels, 1);
  const transformed = session.execute({ name: 'canvas.transform_region', x: 1, y: 1, width: 1, height: 1, dx: 2 });
  assert.equal(transformed.ok, true);
  assert.equal(transformed.result.bounds.x, 3);
  assert.equal(session.execute({ name: 'document.get_summary' }).result.layerCount, 1);
  assert.equal(user.revision, 0);
});

test('AI command session requires the isolated workspace controller', () => {
  assert.throws(() => new AICommandSession(new RasterDocument(4, 4)), /AIWorkspace/);
});


test('pending proposals freeze further AI mutations but still allow inspection', () => {
  const workspace = new AIWorkspace(new RasterDocument(4, 4));
  const session = new AICommandSession(workspace);
  session.execute({ name: 'canvas.draw_line', x0: 0, y0: 0, x1: 0, y1: 0, color: '#ff0000' });
  session.createProposal('First change');
  assert.equal(session.execute({ name: 'document.get_summary' }).ok, true);
  assert.equal(session.execute({ name: 'canvas.draw_line', x0: 1, y0: 1, x1: 1, y1: 1, color: '#00ff00' }).error.code, 'proposal_pending');
  assert.equal(workspace.acceptProposal().reason, undefined);
});
