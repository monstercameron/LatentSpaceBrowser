import { prettyName } from './openaiModels.js';

// The models a page can be written by, on two providers. Prices are USD per million tokens.
// `id` is what the app stores; `api` is the name the provider knows it by (one model can be listed at
// several reasoning efforts). `effort` is the reasoning level the call asks for: reasoning tokens are
// billed as output. `room` is extra output allowance for providers that count reasoning inside the cap.
// Cerebras: https://inference-docs.cerebras.ai/models/overview   OpenAI prices are from OpenAI's help
// centre as reported by secondary sources, and should be checked against the pricing page.
export const PROVIDERS = {
  cerebras: { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions' },
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions' },
};

export const MODELS = [
  { id: 'qwen-3.8-27b', provider: 'cerebras', label: 'Qwen 3.8 27B', hint: 'Default. Reasoning off, so no hidden tokens', input: 0.99, output: 1.49, effort: 'none' },
  { id: 'gpt-oss-120b', provider: 'cerebras', label: 'GPT OSS 120B', hint: 'Cheaper input, but it spends hidden reasoning tokens', input: 0.35, output: 0.75, effort: 'low' },
];

// OpenAI models offered before the live list has loaded (see openAiModel below for how they are built).
export const OPENAI_PRESETS = ['gpt-6.1-terra:medium', 'gpt-6-luna:high'];

export const DEFAULT_MODEL = 'qwen-3.8-27b';
// Measured on ten pages (see DESIGN.md): Qwen linked more of what is worth a page than GPT OSS, rarely
// named text that was not there, and answered sooner, because it has no hidden reasoning to wait for.
// GPT OSS is about a quarter cheaper per page and stays one setting away.
export const DEFAULT_LINK_MODEL = 'qwen-3.8-27b';

// How much a page says. `words` is a target (models overshoot it by a third or so), `budget` caps the
// tokens of the writing pass, and `shape` is how the page is laid out. {h2} and {h3} stand for the
// section and sub-section markers of whichever path writes the page.
export const DEPTHS = {
  short: {
    label: 'Short',
    words: 350,
    budget: 1800,
    shape: 'three or four {h2} sections, most with a single paragraph, and no {h3} sub-sections',
  },
  standard: {
    label: 'Standard',
    words: 900,
    budget: 3600,
    shape: 'four or five {h2} sections of two or three paragraphs each, with {h3} sub-sections in at least two of the sections (two {h3} sub-sections where a section has two distinct parts)',
  },
  deep: {
    label: 'Deep',
    words: 1800,
    budget: 6400,
    shape: 'five or six {h2} sections of three or four paragraphs each, with {h3} sub-sections in at least three of the sections',
  },
};

export const DEFAULT_DEPTH = 'standard';

// Any OpenAI model the key can use, at a reasoning effort, is written "model:effort" (gpt-6.2-sol:medium). The
// app does not need to know the model in advance: the name goes to OpenAI as it is, and the price is taken
// from this table if the model is in it, or estimated (and marked so) if it is not.
export const EFFORTS = ['none', 'low', 'medium', 'high'];
const ROOM = { none: 0, low: 1500, medium: 3000, high: 14000 }; // spare output tokens for reasoning, which counts inside the cap
// USD per million tokens: [input, cached input, output]. OpenAI API list prices, Standard tier, prompts up to 272K tokens
// (developers.openai.com/api/docs/pricing, checked 2026-11-22). A prefix cache read is billed at the cached rate; a cache
// write at 1.25x the input rate (30-minute cache); cached tokens are a subset of the prompt. GPT-5.6 Sol's price is
// promotional until 2026-11-30.
const PRICES = {
  'gpt-6-luna': [0.1, 0.01, 0.5],
  'gpt-6.1-terra': [1, 0.05, 5],
  'gpt-6-sol': [2, 0.2, 10],
  'gpt-6.1-sol': [2, 0.1, 10],
  'gpt-6.2-sol': [2, 0.1, 10],
  'gpt-6-astra': [10, 1, 50],
  'gpt-6.2-astra': [8, 0.4, 40],
  'gpt-5.6-luna': [0.2, 0.02, 1.2],
  'gpt-5.6-terra': [2, 0.2, 12],
  'gpt-5.6-sol': [4, 0.4, 20],
};
const ESTIMATE = [1, 0.1, 5]; // a model not in the table is assumed to cost about what Terra does, reads at a tenth
const WRITE_FACTOR = 1.25; // writing a prefix to the 30-minute cache costs this much times the input rate
const OPENAI_ID = /^(gpt-[a-z0-9.-]+):(none|low|medium|high)$/;

/** A model entry for an OpenAI "model:effort" id, or null if the id is not of that form. */
export function openAiModel(id) {
  const [, api, effort] = OPENAI_ID.exec(id ?? '') ?? [];
  if (!api) return null;
  const [input, cached, output] = PRICES[api] ?? ESTIMATE;
  return { id, api, provider: 'openai', label: `${prettyName(api)} (${effort})`, hint: '', input, cached, write: input * WRITE_FACTOR, output, effort, room: ROOM[effort], estimated: !PRICES[api] };
}

/** Whether an id names a model the app can call. */
export const isModelId = (id) => MODELS.some((m) => m.id === id) || Boolean(openAiModel(id));

export const getModel = (id) => MODELS.find((m) => m.id === id) ?? openAiModel(id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL);

/** The key a model needs, from settings ({ apiKey } is Cerebras's, { openaiKey } is OpenAI's). */
export const keyFor = (settings, modelId) => (getModel(modelId).provider === 'openai' ? settings.openaiKey : settings.apiKey) ?? '';

/**
 * What a call cost. `cached` prompt tokens were read from the provider's prefix cache (billed at the cached rate
 * where the model has one) and `written` were stored in it (billed at the write rate); both are part of `inTokens`.
 */
export const cost = (model, inTokens, outTokens, { cached = 0, written = 0 } = {}) => {
  const plain = Math.max(0, inTokens - cached - written);
  return (plain * model.input + cached * (model.cached ?? model.input) + written * (model.write ?? model.input) + outTokens * model.output) / 1_000_000;
};

/** What the cache did to a call's bill: positive is money saved against paying the plain rate for every prompt token. */
export const cacheEffect = (model, { cached = 0, written = 0 } = {}) =>
  (cached * (model.input - (model.cached ?? model.input)) - written * ((model.write ?? model.input) - model.input)) / 1_000_000;
