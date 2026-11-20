import { getApiKey, getSettings } from '../lib/settings.js';
import { leaf, trail, SEP } from '../lib/topics.js';
import { STYLES, cost, getModel } from './models.js';

const API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MAX_CONTINUATIONS = 2;

export const ABOUT_TOPIC = 'About LatentSpace';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/* ---------------------------------------------------------------- prompts */

// The page is styled by the app, so the model writes bare semantic HTML. No
// classes and no link attributes: that markup used to be most of every reply.
const CONTRACT = `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
Reply with one HTML fragment and nothing else. It begins with <h1> and ends with a closing tag. Never use markdown, code fences, commentary, <html>, <body>, or class, style and id attributes.
Tags you may use: h1 h2 h3 p ul ol li a b i blockquote aside table tr th td code pre.
Links are how readers travel, so every page needs them. In each paragraph, wrap the two to four most notable people, places, objects, terms or concepts in a bare <a>...</a> with no attributes. Never link the same thing twice on a page, and never link common words. The link text becomes the next page's topic, so make it a self-contained noun phrase.
Bold is not a link. In running text use <b> exactly once: for the page's own subject, where the lead paragraph introduces it. The subject itself is never a link. Never put any other name in <b>; make it a link instead.
The style, for a page about basalt: <p><b>Basalt</b> is a dark <a>volcanic rock</a> that forms when <a>lava</a> cools quickly at the surface.</p>
Only for a real website whose exact URL you are certain of, use <a href="https://...">. Never guess a URL; use a bare link instead.
Tone: encyclopedic, precise, confident.`;

const ARTICLE = (words) => `${CONTRACT}
Page layout: <h1>title</h1>, an <aside> of 3 to 6 key facts written as <p><b>Label</b> value</p>, a lead paragraph, then <h2> sections.
Length: about ${words} words. Finish the page within that length.`;

const CONTINUE = (draft) => `Your reply hit the token limit and was cut off. Its last characters were:
${draft.slice(-100)}
Continue from the very next character, even if that is the middle of a word or a tag: repeat nothing, restart nothing, add no commentary. Bring the page to a close within 120 words and close every tag that is still open.`;

const REPAIR = `${CONTRACT}
The fragment you are given breaks these rules. Return it corrected, with its wording otherwise unchanged.`;

const RELINK = `${CONTRACT}
The fragment you are given has almost no links, so its reader has nowhere to go. Return it with its wording unchanged and its links added by the rule above: two to four bare <a>...</a> links in each paragraph, no more, and nothing linked twice. Where a name you link is in <b>, replace the <b> with the <a>.`;

function articlePrompt(topic) {
  if (topic === ABOUT_TOPIC) {
    return `Topic: LatentSpace, the software this page is part of. Write its entry from these facts only:
- A recursive, generative encyclopedia: every page is written on the fly by a language model, and every link opens a page that did not exist until it was clicked.
- A static React and Vite app styled with Tailwind CSS. It has no backend; the browser streams pages straight from Cerebras Inference.
- Bring your own key: the Cerebras API key stays in the browser's local storage.
- The model writes plain semantic HTML and the app styles it, which keeps pages cheap. The app tracks the reader's path and sends it as context with each click.
- When a reply is cut off or malformed, the model is asked to continue or repair its own page.
- Each page reports time to first token, tokens per second and cost.
- Going home ends the journey with a "Journey Retrospective" written by the model.`;
  }
  const path = trail(topic);
  if (path.length === 0) return `Topic: ${topic}`;
  return `Topic: ${leaf(topic)}
Reached via: ${path.join(SEP)}
Write about the topic as it relates to that path.`;
}

const JOURNEY = (stops) => `A reader travelled this path through LatentSpace: ${stops.join(' → ')}.
Write the "Journey Retrospective" page in exactly this shape:
<h1>Journey Retrospective</h1>
<p><i>One poetic sentence that sums up the path.</i></p>
<ol> with one <li> per stop, in order: <a>the stop</a>, a dash, then one sentence on how it bridges from the stop before.
<h2>Semantic Analysis</h2> and one dense <p> that unifies the topics as parts of a single hidden system. Describe how the concepts relate. Do not mention the reader, the journey or its order.
<h2>Suggested Expeditions</h2> and a <ul> of 3 <li>, each <a>a new topic</a>, a dash, then one sentence of intrigue. The three must diverge from each other.`;

// A model asked the same question gives much the same answer, so the app picks
// the fields at random and the model picks the topics.
const FIELDS = [
  'astronomy', 'geology', 'marine biology', 'medieval history', 'ancient civilizations', 'mathematics',
  'linguistics', 'architecture', 'music', 'mythology', 'economics', 'philosophy', 'materials science',
  'botany', 'cartography', 'textiles', 'food and cooking', 'navigation', 'typography', 'weather',
  'human anatomy', 'civil engineering', 'folklore', 'chemistry', 'optics', 'games and puzzles',
  'agriculture', 'cryptography', 'zoology', 'timekeeping', 'trade routes', 'volcanoes',
];

const STARTERS = (fields) => `Suggest ${fields.length} encyclopedia topics for a curious reader to start from, one from each of these fields, in this order: ${fields.join(', ')}.
Each is a specific, concrete subject named in one to three words and capitalised as an encyclopedia title, and not the first example anyone would think of.
Reply with the topics only, one per line: no numbering, bullets, punctuation or commentary.`;

/* ------------------------------------------------------------- transport */

async function toError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.message ?? body?.error?.message ?? '';
  } catch {
    // no JSON body
  }
  const reasons = {
    401: 'Cerebras rejected the API key.',
    403: 'This API key is not allowed to use that model.',
    404: 'That model is not available for this API key.',
    429: 'Rate limit reached. Wait a moment and try again.',
  };
  const reason = reasons[res.status] ?? `Cerebras returned an error (${res.status}).`;
  return new ApiError(detail ? `${reason} ${detail}` : reason, res.status);
}

async function* serverEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      yield JSON.parse(data);
    }
  }
}

/** One streamed model call. Returns its text, how it ended and what it used. */
async function pass({ model, messages, maxTokens, temperature = 0.7, signal, onText }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiError('Add your Cerebras API key in Settings to start exploring.', 401);

  const started = performance.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.id,
        messages,
        stream: true,
        max_completion_tokens: maxTokens,
        temperature,
        reasoning_effort: model.effort,
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Cerebras sends no CORS headers on a rejected key, so the browser reports
    // that case exactly like a dropped connection.
    throw new ApiError('No answer from Cerebras. The connection dropped or the API key was rejected: check the key in Settings.', 0);
  }
  if (!res.ok) throw await toError(res);

  let text = '';
  let reasoning = '';
  let finish = null;
  let usage = null;
  let firstToken = 0;
  for await (const chunk of serverEvents(res)) {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    if (delta?.reasoning) reasoning += delta.reasoning;
    if (delta?.content) {
      firstToken ||= performance.now();
      text += delta.content;
      onText?.(text);
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }

  const ended = performance.now();
  return {
    text,
    reasoning,
    finish,
    ttft: ((firstToken || ended) - started) / 1000,
    seconds: (ended - started) / 1000,
    inTokens: usage?.prompt_tokens ?? 0,
    outTokens: usage?.completion_tokens ?? 0,
  };
}

/* ------------------------------------------------------------- multi-pass */

const VOID_TAGS = new Set(['br', 'hr']);
const END_TAG_OPTIONAL = new Set(['p', 'li', 'td', 'th']); // HTML lets these be left unclosed

/**
 * True when a reply honours the contract: a fragment that opens with <h1> and
 * ends inside the page. A last paragraph left without its </p> is valid HTML
 * and not a fault. Text after the page has closed (a sign-off, a code fence)
 * or a sentence that stops midway is.
 */
export function wellFormed(html) {
  const text = html.trim();
  if (!/^<h1[\s>]/i.test(text)) return false;
  if (/<\/[a-z][a-z0-9]*>$/i.test(text)) return true;

  const open = [];
  for (const [, closing, name] of text.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = name.toLowerCase();
    if (VOID_TAGS.has(tag)) continue;
    if (!closing) open.push(tag);
    else if (open.includes(tag)) open.length = open.lastIndexOf(tag);
  }
  return END_TAG_OPTIONAL.has(open.at(-1)) && /[.!?)"'’”]$/.test(text);
}

const throttle = (fn, ms = 80) => {
  let last = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
};

/** How many links a page carries. */
export const countLinks = (html) => (html.match(/<a[\s>]/gi) ?? []).length;

/**
 * Writes a page in up to four kinds of pass. Every fix comes from the model:
 *   1. write     - the page itself
 *   2. continue  - only if the reply was cut off, the model finishes its own draft
 *   3. repair    - only if the result breaks the format contract, the model rewrites it
 *   4. link      - only if the page has too few links to travel by, the model adds them
 * The code only decides whether another pass is needed.
 */
async function compose({ system, user, budget, minLinks = 0, signal, onUpdate }) {
  const model = getModel(getSettings().model);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const show = throttle((html, status) => onUpdate?.({ html, status }));
  const runs = [];

  let run = await pass({ model, messages, maxTokens: budget, signal, onText: (t) => show(t, 'Writing') });
  runs.push(run);
  let html = run.text;

  for (let i = 0; run.finish === 'length' && i < MAX_CONTINUATIONS; i++) {
    const draft = html;
    run = await pass({
      model,
      messages: [...messages, { role: 'assistant', content: draft }, { role: 'user', content: CONTINUE(draft) }],
      maxTokens: Math.round(budget / 3),
      signal,
      onText: (t) => show(draft + t, 'Continuing'),
    });
    runs.push(run);
    html = draft + run.text;
  }
  const truncated = run.finish === 'length';

  if (!truncated && !wellFormed(html)) {
    run = await pass({
      model,
      messages: [
        { role: 'system', content: REPAIR },
        { role: 'user', content: html },
      ],
      maxTokens: Math.round(html.length / 3) + 300,
      signal,
      onText: (t) => show(t, 'Repairing'),
    });
    runs.push(run);
    if (run.text.trim()) html = run.text;
  }

  if (!truncated && countLinks(html) < minLinks) {
    const unlinked = html;
    run = await pass({
      model,
      messages: [
        { role: 'system', content: RELINK },
        { role: 'user', content: unlinked },
      ],
      maxTokens: Math.round(unlinked.length / 3) + 600,
      signal,
      onText: (t) => show(t, 'Linking'),
    });
    runs.push(run);
    // Kept only if the model did what was asked and returned a whole page.
    if (run.finish !== 'length' && wellFormed(run.text) && countLinks(run.text) > countLinks(unlinked)) html = run.text;
  }

  const sum = (key) => runs.reduce((total, r) => total + r[key], 0);
  const seconds = sum('seconds');
  const outTokens = sum('outTokens');
  const inTokens = sum('inTokens');
  return {
    html: html.trim(),
    reasoning: runs.map((r) => r.reasoning).join('\n').trim().slice(0, 4000),
    truncated,
    metrics: {
      model: model.id,
      passes: runs.length,
      ttft: runs[0].ttft,
      seconds,
      tps: seconds > 0 ? outTokens / seconds : 0,
      inTokens,
      outTokens,
      cost: cost(model, inTokens, outTokens),
    },
  };
}

/* ------------------------------------------------------------------ pages */

export function generateArticle(topic, { signal, onUpdate } = {}) {
  const style = STYLES[getSettings().style];
  return compose({
    system: ARTICLE(style.words),
    user: articlePrompt(topic),
    budget: style.budget,
    minLinks: Math.ceil(style.words / 250), // fewer than this and the page is close to a dead end
    signal,
    onUpdate,
  });
}

const STARTER_COUNT = 6;

// Shown when there is no model answer to show: no connection, or a reply that is not a clean list.
const SPARE_STARTERS = [
  'Lighthouse', 'Fermentation', 'Byzantine Empire', 'Tidal locking', 'Game theory', 'Mycelium',
  'Damascus steel', 'Antikythera mechanism', 'Bioluminescence', 'Silk Road', 'Fibonacci sequence', 'Cuneiform',
  'Plate tectonics', 'Gothic architecture', 'Polyphony', 'Aurora', 'Sourdough', 'Longitude',
];

const sample = (list, count) => {
  const pool = [...list];
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  return picked;
};

export const spareStarters = () => sample(SPARE_STARTERS, STARTER_COUNT);

/** The topics in a starters reply, or null when it is not a clean list of the right length. */
export function parseStarters(text, count = STARTER_COUNT) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  // A topic is a short title: no list markers, markup or "Here are..." lead-in.
  const clean = lines.every((line) => /^[\p{L}\p{N}][^<>:*#]{1,39}$/u.test(line) && !/^\d+[.)]\s/.test(line));
  return clean && lines.length === count && new Set(lines).size === count ? lines : null;
}

/** Six places to start, written by the model for this page load. */
export async function generateStarters({ signal } = {}) {
  const model = getModel(getSettings().model);
  const run = await pass({
    model,
    messages: [{ role: 'user', content: STARTERS(sample(FIELDS, STARTER_COUNT)) }],
    maxTokens: 300,
    temperature: 1,
    signal,
  });
  return {
    topics: parseStarters(run.text) ?? spareStarters(),
    cost: cost(model, run.inTokens, run.outTokens),
  };
}

export function generateJourney(topics, { signal, onUpdate } = {}) {
  return compose({
    system: CONTRACT,
    user: JOURNEY(topics.map(leaf)),
    budget: 500 + topics.length * 60,
    signal,
    onUpdate,
  });
}
