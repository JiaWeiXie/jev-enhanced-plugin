import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, noul, choice, MissingApiKeyError } from '../src/jev.mjs';

const questions = { supported: noul('Does the evidence support the claim?') };

test('dry-run never requires credentials or contacts the service', async () => {
  const client = createClient({ mode: 'dry-run', apiKey: '', fetchImpl: () => assert.fail('network') });
  const result = await client.ask({ claim: 'example' }, questions);
  assert.equal(result.answers, null);
  assert.equal(result.mode, 'dry-run');
});

test('missing credentials cannot produce a live judgment', () => {
  assert.throws(() => createClient({ apiKey: '' }), MissingApiKeyError);
});

test('malformed or incomplete replay answers are rejected, never interpreted as safe', async () => {
  for (const answers of [{}, { supported: { type: 'noul', noul: 1.1 } },
  { supported: { type: 'noul', noul: '1' } }, { supported: { type: 'choice', choice: 'yes' } }]) {
    await assert.rejects(createClient({ mode: 'mock', mockAnswers: answers }).ask({}, questions));
  }
});

test('service failures do not leak response contents', async () => {
  const client = createClient({
    apiKey: 'test-only', fetchImpl: async () =>
      new Response('private source and credential-like material', { status: 401 })
  });
  await assert.rejects(client.ask({}, questions), error =>
    error.status === 401 && !error.message.includes('private source'));
});

test('successful HTTP responses with invalid probabilities remain unavailable', async () => {
  const client = createClient({
    apiKey: 'test-only', fetchImpl: async () => new Response(JSON.stringify({
      model: 'test', answers: { supported: { type: 'noul', noul: -0.1 } }, usage: {},
    }), { headers: { 'Content-Type': 'application/json' } })
  });
  await assert.rejects(client.ask({}, questions));
});

test('an evidence choice cannot invent a candidate outside the supplied set', async () => {
  const q = { evidence: choice('Select supplied evidence', { h1: 'supplied hunk', noMatch: 'none supports' }) };
  const client = createClient({
    mode: 'mock', mockAnswers: {
      evidence: {
        type: 'choice', choice: 'invented-hunk', confidence: 1, probabilities: { h1: 1, noMatch: 0 },
      }
    }
  });
  await assert.rejects(client.ask({}, q));
});
