import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterDocument } from '../src/core.js';
import { AIWorkspace, cloneRasterDocument } from '../src/workspaces.js';

function paint(doc, x, y, color = '#ff0000') {
  const stroke = doc.beginStroke({ color, size: 1 });
  doc.strokeTo(stroke, x, y);
  doc.endStroke(stroke);
}

test('sandbox clone has independent document, layers, pixels and history', () => {
  const user = new RasterDocument(8, 8, 'User art');
  paint(user, 2, 3);
  const sandbox = cloneRasterDocument(user);
  assert.notEqual(sandbox.id, user.id);
  assert.notEqual(sandbox.layers[0].id, user.layers[0].id);
  assert.notEqual(sandbox.layers[0].pixels, user.layers[0].pixels);
  assert.equal(sandbox.revision, user.revision);
  paint(sandbox, 4, 5, '#00ff00');
  assert.notDeepEqual([...sandbox.layers[0].pixels], [...user.layers[0].pixels]);
  assert.equal(user.history.length, 1);
  assert.equal(sandbox.history.length, 1);
});

test('AI workspace never mutates canonical pixels and detects stale proposals', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1);
  assert.equal(user.revision, 0);
  workspace.createProposal('Add a highlight');
  paint(user, 2, 2);
  assert.deepEqual(workspace.validateProposalBase(), {
    valid: false, reason: 'stale-base', expectedRevision: 0, actualRevision: user.revision,
  });
});

test('pending proposal blocks implicit sync; explicit discard refreshes from user', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1);
  workspace.createProposal('New detail');
  paint(user, 3, 3);
  assert.equal(workspace.syncFromUser().status, 'proposal-pending');
  assert.equal(workspace.hasProposal, true);
  assert.equal(workspace.syncFromUser({ discardProposal: true }).status, 'synced');
  assert.equal(workspace.hasProposal, false);
  assert.deepEqual([...workspace.sandbox.layers[0].pixels], [...user.layers[0].pixels]);
});

test('discarding a proposal does not roll back or delete canonical work', () => {
  const user = new RasterDocument(8, 8);
  paint(user, 2, 2);
  const before = [...user.layers[0].pixels];
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 4, 4, '#0000ff');
  workspace.createProposal('Blue mark');
  assert.equal(workspace.discardProposal(), true);
  assert.deepEqual([...user.layers[0].pixels], before);
  assert.equal(workspace.discardProposal(), false);
});

test('AI workspace exposes no project deletion or export operations', () => {
  const workspace = new AIWorkspace(new RasterDocument(8, 8));
  assert.equal('deleteProject' in workspace, false);
  assert.equal('exportProject' in workspace, false);
});
