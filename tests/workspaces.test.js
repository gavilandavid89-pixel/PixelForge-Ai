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


test('accepting a valid proposal applies all sandbox layer pixels as one undoable transaction', () => {
  const user = new RasterDocument(8, 8, 'User art');
  paint(user, 1, 1, '#ff0000');
  const second = user.addLayer('Highlights');
  paint(user, 2, 2, '#00ff00');
  user.setActiveLayer(user.layers[0].id);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 4, 4, '#0000ff');
  const sandboxHighlights = workspace.sandbox.layers[1];
  workspace.sandbox.setActiveLayer(sandboxHighlights.id);
  const highlightStroke = workspace.sandbox.beginStroke({ color: '#ffffff', size: 1 });
  workspace.sandbox.strokeTo(highlightStroke, 5, 5);
  workspace.sandbox.endStroke(highlightStroke);
  const beforeLayers = user.layers.map(layer => new Uint8ClampedArray(layer.pixels));
  const historyBefore = user.history.length;
  workspace.createProposal('Add blue pixel and highlight');
  const result = workspace.acceptProposal();
  assert.deepEqual(result, { status: 'applied', changedPixels: 2, changedLayers: 2 });
  assert.equal(user.history.length, historyBefore + 1, 'proposal should create one undo entry');
  assert.deepEqual([...user.layers[0].pixels.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4)], [0,0,255,255]);
  assert.deepEqual([...second.pixels.slice((5 * 8 + 5) * 4, (5 * 8 + 5) * 4 + 4)], [255,255,255,255]);
  assert.equal(workspace.hasProposal, false);
  assert.equal(user.undo(), true);
  assert.deepEqual(user.layers.map(layer => [...layer.pixels]), beforeLayers.map(layer => [...layer]));
  assert.equal(user.redo(), true);
  assert.equal(workspace.sandbox.layers[1].id !== second.id, true);
  assert.notEqual(sandboxHighlights.id, second.id);
});

test('accepting a stale proposal is rejected without changing user pixels', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1);
  workspace.createProposal('AI mark');
  paint(user, 7, 7, '#00ff00');
  const before = user.layers.map(layer => [...layer.pixels]);
  assert.equal(workspace.acceptProposal().reason, 'stale-base');
  assert.deepEqual(user.layers.map(layer => [...layer.pixels]), before);
  assert.equal(workspace.hasProposal, true);
});

test('proposal acceptance rejects structural sandbox changes instead of silently dropping them', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  workspace.sandbox.addLayer('AI layer');
  workspace.createProposal('Add layer');
  assert.equal(workspace.acceptProposal().reason, 'unsupported-layer-structure');
  assert.equal(user.layers.length, 1);
  assert.equal(workspace.hasProposal, true);
});

test('proposal acceptance rejects empty proposal state and preserves no-op safety', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  assert.deepEqual(workspace.acceptProposal(), { status: 'rejected', valid: false, reason: 'no-proposal' });
  workspace.createProposal('No pixel changes');
  assert.deepEqual(workspace.acceptProposal(), { status: 'applied', changedPixels: 0, changedLayers: 0 });
  assert.equal(user.history.length, 0);
});


test('proposal snapshot cannot be changed after it is created', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1, '#ff0000');
  workspace.createProposal('First edit');
  paint(workspace.sandbox, 2, 2, '#00ff00');
  const result = workspace.acceptProposal();
  assert.equal(result.reason, 'proposal-changed');
  assert.equal(user.revision, 0);
  assert.equal(workspace.hasProposal, true);
});

test('creating a second proposal cannot silently replace the pending proposal', () => {
  const workspace = new AIWorkspace(new RasterDocument(4, 4));
  const first = workspace.createProposal('First');
  assert.throws(() => workspace.createProposal('Second'), /already pending/);
  assert.equal(workspace.proposalSummary.id, first.id);
});

test('unchanged locked layers do not block an accepted pixel edit on another layer', () => {
  const user = new RasterDocument(8, 8);
  user.addLayer('Locked layer');
  user.setLayerLocked(user.layers[1].id, true);
  user.setActiveLayer(user.layers[0].id);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 3, 3, '#abcdef');
  workspace.createProposal('Edit unlocked layer');
  const result = workspace.acceptProposal();
  assert.deepEqual(result, { status: 'applied', changedPixels: 1, changedLayers: 1 });
  assert.equal(user.sampleColorAt(3, 3, { merged: false }), '#ABCDEF');
});


test('visual diff reports visible pixel changes without exposing or mutating the source document', () => {
  const user = new RasterDocument(6, 5);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 2, 3, '#ff0000');
  const before = new Uint8ClampedArray(user.layers[0].pixels);
  const diff = workspace.getVisualDiff();
  assert.equal(diff.width, 6);
  assert.equal(diff.height, 5);
  assert.equal(diff.changedPixels, 1);
  assert.deepEqual(diff.bounds, { x: 2, y: 3, width: 1, height: 1 });
  assert.deepEqual([...diff.pixels.slice((3 * 6 + 2) * 4, (3 * 6 + 2) * 4 + 4)], [255,72,186,230]);
  assert.deepEqual(user.layers[0].pixels, before);
  assert.equal(user.revision, 0);
});


test('user edits sync into the same sandbox buffers without allocating a new full document each time', () => {
  const user = new RasterDocument(16, 16);
  const workspace = new AIWorkspace(user);
  const sandbox = workspace.sandbox;
  const sandboxPixels = sandbox.layers[0].pixels;
  paint(user, 5, 6, '#123456');
  assert.equal(workspace.syncFromUser().status, 'synced');
  assert.equal(workspace.sandbox, sandbox, 'the isolated document object should be reused for pixel-only syncs');
  assert.equal(workspace.sandbox.layers[0].pixels, sandboxPixels, 'pixel buffer should be reused for incremental tile sync');
  assert.equal(workspace.sandbox.sampleColorAt(5, 6, { merged: false }), '#123456');
  assert.equal(workspace.sandbox.history.length, 0, 'mirror sync must not create AI undo history');
});


test('sync does not silently overwrite an unsubmitted AI sandbox draft', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1, '#ff0000');
  paint(user, 7, 7, '#00ff00');
  assert.deepEqual(workspace.syncFromUser(), { status: 'sandbox-pending', stale: true });
  assert.equal(workspace.sandbox.sampleColorAt(1, 1, { merged: false }), '#FF0000');
  assert.equal(workspace.discardSandboxChanges(), true);
  assert.equal(workspace.sandbox.sampleColorAt(1, 1, { merged: false }), null);
  assert.equal(workspace.sandbox.sampleColorAt(7, 7, { merged: false }), '#00FF00');
});

test('explicit discard flag can synchronize over an unsubmitted sandbox draft', () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  paint(workspace.sandbox, 1, 1, '#ff0000');
  paint(user, 7, 7, '#00ff00');
  assert.equal(workspace.syncFromUser({ discardSandboxChanges: true }).status, 'synced');
  assert.equal(workspace.sandbox.sampleColorAt(1, 1, { merged: false }), null);
  assert.equal(workspace.sandbox.sampleColorAt(7, 7, { merged: false }), '#00FF00');
});
