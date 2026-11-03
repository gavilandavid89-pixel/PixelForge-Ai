import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../src/ai-provider.js';
import { createVisionSnapshot } from '../src/headless-vision.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';

test('provider sends labeled UI, artwork and frame images as separate vision inputs', async () => {
  let sent;
  const provider = new OpenAICompatibleProvider({
    endpoint: 'https://example.test/v1/chat/completions', model: 'vision-test',
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'Create a run cycle', actions: [] }) } }] }) };
    },
  });
  const snapshot = createVisionSnapshot({
    mode: 'combined', interfaceImage: png, artworkImage: png,
    project: { width: 96, height: 96, name: 'Runner' },
    animation: { fps: 12, frames: [{ index: 0, durationMs: 80, image: png }, { index: 1, durationMs: 80, image: png }] },
  });
  await provider.generatePlan({ prompt: 'Create a running character', context: { visualObservation: snapshot.context }, imageDataUrls: snapshot.images });
  const userContent = sent.messages[1].content;
  assert.equal(userContent.filter(part => part.type === 'image_url').length, 4);
  assert.match(userContent[0].text, /Editor interface screenshot/);
  assert.match(userContent[0].text, /Animation frame 1/);
  assert.equal(sent.messages[0].role, 'system');
});

test('provider rejects excessive image count and invalid image references before network access', async () => {
  let called = false;
  const provider = new OpenAICompatibleProvider({
    endpoint: 'https://example.test/v1/chat/completions', model: 'vision-test',
    fetchImpl: async () => { called = true; throw new Error('must not call'); },
  });
  await assert.rejects(provider.generatePlan({ prompt: 'inspect', imageDataUrls: Array.from({ length: 25 }, () => ({ label: 'frame', dataUrl: png })) }), /24/);
  await assert.rejects(provider.generatePlan({ prompt: 'inspect', imageDataUrls: [{ label: 'frame', dataUrl: 'https://example.test/frame.png' }] }), /PNG data URL/);
  assert.equal(called, false);
});
