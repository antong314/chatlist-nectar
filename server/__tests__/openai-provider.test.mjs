import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../openai-provider.mjs';

test('uses the Responses API with structured output and a replaceable model', async () => {
  let request;
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({ category: 'Taxi', confidence: 0.95, needs_clarification: false }),
          }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await provider.inferCategory({ name: 'Ana', description: 'Airport taxi' });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.store, false);
  assert.equal(request.body.reasoning.effort, 'none');
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.deepEqual(result, { category: 'Taxi', confidence: 0.95, needs_clarification: false });
});

test('fails open to deterministic routing when OpenAI is unavailable', async () => {
  const provider = new OpenAIProvider({ apiKey: '' });
  assert.equal(await provider.classifyMessage('hello'), null);
});
