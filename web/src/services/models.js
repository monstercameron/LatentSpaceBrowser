// Models on Cerebras shared inference. Prices are USD per million tokens.
// `effort` is the lowest reasoning level each model accepts: reasoning tokens
// are billed as output, and an encyclopedia page does not need many.
// https://inference-docs.cerebras.ai/models/overview
export const MODELS = [
  {
    id: 'gpt-oss-120b',
    label: 'GPT OSS 120B',
    hint: 'Fastest and cheapest',
    input: 0.35,
    output: 0.75,
    effort: 'low',
  },
  {
    id: 'qwen-3.8-27b',
    label: 'Qwen 3.8 27B',
    hint: 'Reasoning off, no hidden tokens',
    input: 0.99,
    output: 1.49,
    effort: 'none',
  },
];

// `budget` caps one writing pass (max_completion_tokens).
export const STYLES = {
  short: { label: 'Short but sweet', hint: 'about 350 words', words: 350, budget: 1400 },
  elaborative: { label: 'Elaborative', hint: 'about 1,300 words', words: 1300, budget: 4200 },
};

export const getModel = (id) => MODELS.find((m) => m.id === id) ?? MODELS[0];

export const cost = (model, inTokens, outTokens) =>
  (inTokens * model.input + outTokens * model.output) / 1_000_000;
