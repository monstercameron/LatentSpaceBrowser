// Models on Cerebras shared inference. Prices are USD per million tokens.
// `effort` is the lowest reasoning level each model accepts: reasoning tokens are billed as output.
// https://inference-docs.cerebras.ai/models/overview
export const MODELS = [
  { id: 'qwen-3.8-27b', label: 'Qwen 3.8 27B', hint: 'Default. Reasoning off, so no hidden tokens', input: 0.99, output: 1.49, effort: 'none' },
  { id: 'gpt-oss-120b', label: 'GPT OSS 120B', hint: 'Cheaper input, but it spends hidden reasoning tokens', input: 0.35, output: 0.75, effort: 'low' },
];

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

export const getModel = (id) => MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL);

export const cost = (model, inTokens, outTokens) => (inTokens * model.input + outTokens * model.output) / 1_000_000;
