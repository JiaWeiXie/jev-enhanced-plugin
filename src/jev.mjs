import { TypeSafeClient, noul as makeNoul, choice as makeChoice, score as makeScore } from './vendor/typesafe-sdk.mjs';

export const DEFAULT_MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';
export const noul = makeNoul;
export const choice = makeChoice;
export const score = makeScore;

export class MissingApiKeyError extends Error {
  constructor() {
    super('TYPESAFE_API_KEY is not set');
    this.reason = 'missing_api_key';
  }
}

export class TypeSafeError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

// Untrusted service/replay values cannot become affirmative workflow decisions.
function validateAnswers(response, questions) {
  if (!response || typeof response.answers !== 'object' || !response.answers) {
    throw new TypeSafeError('Missing answers');
  }
  for (const [id, question] of Object.entries(questions)) {
    const answer = response.answers[id];
    if (!answer || answer.type !== question.type) throw new TypeSafeError(`Invalid answer: ${id}`);
    if (question.type === 'noul') {
      if (!probability(answer.noul)) throw new TypeSafeError(`Invalid probability: ${id}`);
      continue;
    }
    const keys = question.type === 'choice'
      ? Object.keys(question.criteria)
      : question.criteria.map((_, index) => String(index));
    const distribution = answer.probabilities;
    if (!distribution || Object.keys(distribution).length !== keys.length ||
      keys.some(key => !probability(distribution[key])) ||
      Math.abs(keys.reduce((sum, key) => sum + distribution[key], 0) - 1) > 0.001 ||
      !probability(answer.confidence)) throw new TypeSafeError(`Invalid distribution: ${id}`);
    if (question.type === 'choice' && !keys.includes(answer.choice)) throw new TypeSafeError(`Invalid choice: ${id}`);
    if (question.type === 'score' && (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1)) {
      throw new TypeSafeError(`Invalid score: ${id}`);
    }
  }
  return response;
}

export function createClient({ mode = 'live', model = DEFAULT_MODEL,
  apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = globalThis.fetch,
  mockAnswers, timeoutMs = 30_000 } = {}) {
  if (!['live', 'dry-run', 'mock'].includes(mode)) throw new TypeError('Unknown client mode');
  if (mode === 'live' && !apiKey) throw new MissingApiKeyError();
  const client = mode === 'live' ? new TypeSafeClient({
    apiKey, baseURL: 'https://api.typesafe.ai', defaultModel: model,
    fetch: fetchImpl, timeout: timeoutMs, retry: { maxRetries: 0 }, logLevel: 'off',
  }) : null;
  return {
    async ask(state, questions) {
      const request = { state, model, questions };
      if (mode === 'dry-run') return { mode, request, answers: null };
      if (mode === 'mock') return { ...validateAnswers({ answers: mockAnswers }, questions), mode, model: null };
      try {
        const response = await client.systemOne(request);
        return { ...validateAnswers(response, questions), mode };
      } catch (error) {
        if (error instanceof TypeSafeError) throw error;
        // Do not leak server bodies, request state, or credentials in diagnostics.
        throw new TypeSafeError('TypeSafe request failed', error.status);
      }
    },
  };
}

export async function loadMockAnswers(path) {
  const { readFile } = await import('node:fs/promises');
  const value = JSON.parse(await readFile(path, 'utf8'));
  return value.answers ?? value;
}
