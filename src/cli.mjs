#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createClient, loadMockAnswers, MissingApiKeyError, TypeSafeError } from './jev.mjs';
import { packs, getPack } from '../packs/registry.mjs';

const usage = `Usage: node src/cli.mjs <pack> --state <file|-> [--dry-run | --mock <file>] [--json]
Live mode sends supplied state to TypeSafe. Supply only approved, minimal evidence.
--dry-run performs no inference. --mock replays synthetic or recorded values, not live judgments.
Packs: ${Object.keys(packs).join(', ')}\n`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: {
      state: { type: 'string' }, 'dry-run': { type: 'boolean' }, mock: { type: 'string' },
      json: { type: 'boolean' }, help: { type: 'boolean' }, list: { type: 'boolean' },
    }
  });
  if (values.help || values.list) { process.stdout.write(usage); return; }
  if (positionals.length !== 1 || !values.state || !getPack(positionals[0])) throw new Error(usage);
  if (values['dry-run'] && values.mock) throw new Error('Choose either --dry-run or --mock');
  const pack = getPack(positionals[0]);
  let text;
  if (values.state === '-') {
    process.stdin.setEncoding('utf8');
    text = '';
    for await (const chunk of process.stdin) text += chunk;
  } else text = await readFile(values.state, 'utf8');
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    throw new Error('State must be valid JSON');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('State must be a JSON object');
  const problem = pack.validateState(state);
  if (problem) throw new Error(problem);
  const questions = pack.buildQuestions(state, {});
  // The model sees only what the questions reference; code-only fields stay local.
  const modelState = pack.buildState(state);
  const mode = values['dry-run'] ? 'dry-run' : values.mock ? 'mock' : 'live';
  let response;
  let reason = null;
  try {
    if (mode !== 'dry-run' && Object.keys(questions).length === 0) {
      response = { mode: 'not-needed', answers: {} };
    } else {
      const client = createClient({ mode, mockAnswers: values.mock ? await loadMockAnswers(values.mock) : null });
      response = await client.ask(modelState, questions);
    }
  } catch (error) {
    if (!(error instanceof MissingApiKeyError || error instanceof TypeSafeError)) throw error;
    reason = error.reason ?? 'judgments_unavailable';
    response = { mode: 'unavailable', answers: null, degraded: reason };
    process.stderr.write(`${reason}: continue the skill using evidence, without Jev judgments.\n`);
    process.exitCode = 3;
  }
  if (mode === 'dry-run') {
    process.stdout.write(JSON.stringify(response, null, 2) + '\n');
    return;
  }
  const result = pack.decide(response, state, {});
  const output = {
    mode: response.mode, model: response.model ?? null,
    usage: response.usage ?? null, reason, answers: response.answers, result
  };
  process.stdout.write(values.json ? JSON.stringify(output, null, 2) + '\n'
    : `Mode: ${response.mode}\n${pack.render(result, state)}`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
