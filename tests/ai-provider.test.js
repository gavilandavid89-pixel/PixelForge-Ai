import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterDocument } from '../src/core.js';
import { AIWorkspace } from '../src/workspaces.js';
import { AICommandSession } from '../src/ai-tools.js';
import { AIEditCoordinator, OpenAICompatibleProvider } from '../src/ai-provider.js';

function paint(doc, x, y, color = '#ff0000') {
  const stroke = doc.beginStroke({ color, size: 1 });
  doc.strokeTo(stroke, x, y);
  doc.endStroke(stroke);
}

function response(content, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }) };
}

test('OpenAI-compatible adapter sends structured context and parses a bounded JSON plan', async () => {
  let request;
  const provider = new OpenAICompatibleProvider({
    endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', apiKey: 'temporary-secret',
    fetchImpl: async (url, options) => { request = { url, options }; return response({ summary: 'Draw a red mark', actions: [{ name: 'canvas.draw_line', x0: 1, y0: 1, x1: 2, y1: 1, color: '#ff0000' }] }); },
  });
  const plan = await provider.generatePlan({ prompt: 'Add a red mark', context: { document: { width: 8, height: 8 } } });
  assert.equal(request.url, 'https://example.test/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer temporary-secret');
  assert.equal(JSON.parse(request.options.body).model, 'test-model');
  assert.deepEqual(plan.actions[0], { name: 'canvas.draw_line', x0: 1, y0: 1, x1: 2, y1: 1, color: '#ff0000' });
});

test('provider adapter rejects insecure remote endpoints and malformed plans', async () => {
  assert.throws(() => new OpenAICompatibleProvider({ endpoint: 'http://example.test/api', model: 'x', fetchImpl: async () => response({}) }), /localhost/);
  const provider = new OpenAICompatibleProvider({
    endpoint: 'http://localhost:11434/v1/chat/completions', model: 'local-model',
    fetchImpl: async () => response('not JSON'),
  });
  await assert.rejects(() => provider.generatePlan({ prompt: 'Draw' }), /Provider must return a JSON plan/);
});

test('coordinator creates an isolated proposal and applies it only after explicit acceptance', async () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  const session = new AICommandSession(workspace);
  const coordinator = new AIEditCoordinator({
    workspace, session,
    provider: { generatePlan: async () => ({ summary: 'Add a blue pixel', actions: [{ name: 'canvas.draw_line', x0: 3, y0: 4, x1: 3, y1: 4, color: '#0000ff' }] }) },
  });
  const result = await coordinator.requestEdit('Add a blue pixel');
  assert.equal(result.status, 'proposal');
  assert.equal(user.revision, 0);
  assert.equal(workspace.sandbox.sampleColorAt(3, 4, { merged: false }), '#0000FF');
  assert.equal(workspace.hasProposal, true);
  assert.equal(workspace.acceptProposal().status, 'applied');
  assert.equal(user.sampleColorAt(3, 4, { merged: false }), '#0000FF');
});

test('coordinator requires explicit artwork consent and never calls provider without it', async () => {
  const workspace = new AIWorkspace(new RasterDocument(4, 4));
  const session = new AICommandSession(workspace);
  let called = false;
  const coordinator = new AIEditCoordinator({ workspace, session, provider: { generatePlan: async () => { called = true; return { summary: 'x', actions: [] }; } } });
  assert.equal((await coordinator.requestEdit('Describe this', { imageDataUrl: 'data:image/png;base64,AAAA' })).reason, 'artwork-consent-required');
  assert.equal(called, false);
});

test('coordinator rejects a stale source if the user edits while the provider is thinking', async () => {
  const user = new RasterDocument(8, 8);
  const workspace = new AIWorkspace(user);
  const session = new AICommandSession(workspace);
  const coordinator = new AIEditCoordinator({
    workspace, session,
    provider: { generatePlan: async () => { paint(user, 7, 7, '#00ff00'); return { summary: 'Add red', actions: [{ name: 'canvas.draw_line', x0: 1, y0: 1, x1: 1, y1: 1, color: '#ff0000' }] }; },
  });
  const result = await coordinator.requestEdit('Add red');
  assert.deepEqual(result, { status: 'rejected', reason: 'stale-source' });
  assert.equal(user.sampleColorAt(7, 7, { merged: false }), '#00FF00');
  assert.equal(workspace.sandbox.sampleColorAt(1, 1, { merged: false }), null);
});

test('coordinator rolls back all sandbox edits if a later action is denied', async () => {
  const workspace = new AIWorkspace(new RasterDocument(8, 8));
  const session = new AICommandSession(workspace);
  const coordinator = new AIEditCoordinator({
    workspace, session,
    provider: { generatePlan: async () => ({ summary: 'Bad plan', actions: [
      { name: 'canvas.draw_line', x0: 1, y0: 1, x1: 1, y1: 1, color: '#ff0000' },
      { name: 'project.export' },
    ] }) },
  });
  const result = await coordinator.requestEdit('Make a mark');
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'action-rejected');
  assert.equal(workspace.sandbox.sampleColorAt(1, 1, { merged: false }), null);
  assert.equal(workspace.hasSandboxChanges, false);
});
