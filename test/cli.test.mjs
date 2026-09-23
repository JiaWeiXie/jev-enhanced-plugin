import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
function run(pack, input, args = []) {
  return spawnSync(process.execPath, [cli, pack, '--state', '-', '--json', ...args], {
    input, encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' },
  });
}
function invoke(input, args = []) {
  return run('humanizer', JSON.stringify(input), args);
}

test('misspelled dry-run does not silently attempt live mode', () => {
  const result = invoke({ passages: ['Private input'] }, ['--dryrun']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});

test('missing required collection is an input error, not a clean empty judgment', () => {
  const result = invoke({ text: 'Wrong shape must not disappear' }, ['--dry-run']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});

test('missing key preserves prose while clearly marking judgments unavailable', () => {
  const result = invoke({ passages: ['Keep 420 ms and `retry_count=3`.'], locale: 'en', context: 'Preserve facts.' });
  assert.equal(result.status, 3);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'unavailable');
  assert.equal(output.answers, null);
  assert.equal(output.result.passages[0].text, 'Keep 420 ms and `retry_count=3`.');
  assert.equal(output.result.rewritten, false);
});

test('malformed JSON fails without echoing the supplied state back to the operator', () => {
  const result = run('humanizer', '{"passages": ["ZQX-PRIVATE-MARKER-7731"],}', ['--dry-run']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('ZQX-PRIVATE-MARKER-7731'));
  assert.match(result.stderr, /State must be valid JSON/);
});

test('pack state validation failure is reported as an input error', () => {
  const result = run('reply-check', JSON.stringify({ draft: 'Sure, sending it over.' }), ['--dry-run']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /request/);
});

test('dry-run shows the filtered model state, not the raw pack state', () => {
  const state = { draft: 'Done.\n\nMore.', request: 'Fix it.', banned: ['ZQX-WATCHED-4410'] };
  const result = run('reply-check', JSON.stringify(state), ['--dry-run']);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.request.state, { request: 'Fix it.', draftOpening: 'Done.', draft: 'Done.\n\nMore.' });
  assert.deepEqual(Object.keys(output.request.state), ['request', 'draftOpening', 'draft'], 'reference before material');
  assert.ok(!result.stdout.includes('ZQX-WATCHED-4410'));
});
