import { applyLinkPhrases, expandCompact, linkPassPrompt } from './compact.js';
import { ApiError, chat } from './cerebras.js';
import { cleanHtmlReply, wellFormed } from './html.js';
import { DEFAULT_DEPTH, DEPTHS, keyFor } from './models.js';
import { a11ySystem, FIELDS, htmlSystem, journeySystem, journeyUser, linksSystem, pageSystem, pageUser, startersUser } from './prompts.js';
import { parseA11y } from './a11y.js';

/** What a page records about the language it was written in, so it can be drawn with the right `lang` and direction. */
const langInfo = (lang) => (lang ? { code: lang.code ?? null, rtl: lang.rtl === true } : { code: 'en', rtl: false });

const sum = (passes, key) => passes.reduce((total, p) => total + (p[key] ?? 0), 0); // old pages lack the cache fields
// `id` names the pass (write, html, links, retro, a11y); the interface says it in the reader's language.
export const describe = (id, run) => ({
  id,
  model: run.modelId,
  ttft: run.ttft,
  seconds: run.seconds,
  inTokens: run.inTokens,
  outTokens: run.outTokens,
  cost: run.cost,
  cached: run.cachedTokens ?? 0,
  written: run.writtenTokens ?? 0,
  cacheEffect: run.cacheEffect ?? 0,
});

/** What a page cost, for its receipt. `ready` is when the text was on screen, `done` when the links landed. */
export function summarize(passes, extra = {}) {
  return {
    passes,
    ready: passes[0].seconds,
    done: sum(passes, 'seconds'),
    ttft: passes[0].ttft,
    inTokens: sum(passes, 'inTokens'),
    outTokens: sum(passes, 'outTokens'),
    cost: sum(passes, 'cost'),
    cacheEffect: sum(passes, 'cacheEffect'),
    ...extra,
  };
}

// Streamed text arrives many times a second; the page only needs to repaint a dozen or so.
function throttled(fn, ms = 80) {
  let last = 0;
  return (event) => {
    if (event.final || event.stage !== 'prose') return fn?.(event);
    const now = performance.now();
    if (now - last < ms) return undefined;
    last = now;
    return fn?.(event);
  };
}

function check(text) {
  const { errors } = expandCompact(text);
  const fatal = errors.find((e) => !e.startsWith('no ##'));
  if (fatal) throw new ApiError('The model did not reply in the page format. Try again.', 0, 'format');
}

/**
 * Writes a page in two passes.
 *   1. prose  - the page itself, streamed; `onEvent({ stage: 'prose', text })` as it grows
 *   2. links  - a cheaper model names phrases to link; `onEvent({ stage: 'links', text })` when applied
 * The page is complete after pass one. A failed link pass costs the page its links, not its text.
 */
export async function writePage({ topic, lens, about = false, settings, signal, onEvent: report }) {
  const onEvent = throttled(report);
  const depth = DEPTHS[settings.depth] ?? DEPTHS[DEFAULT_DEPTH];
  const prose = await chat({
    apiKey: keyFor(settings, settings.model),
    modelId: settings.model,
    messages: [
      { role: 'system', content: pageSystem(depth, settings.lang) },
      { role: 'user', content: pageUser(topic, lens, about) },
    ],
    maxTokens: depth.budget,
    signal,
    onText: (text) => onEvent?.({ stage: 'prose', text }),
  });
  check(prose.text);
  const passes = [describe('write', prose)];
  let text = prose.text.trim();
  const truncated = prose.finish === 'length';
  onEvent?.({ stage: 'prose', text, final: true });

  let linkError = null;
  if (!truncated) {
    try {
      const run = await chat({
        apiKey: keyFor(settings, settings.linkModel),
        modelId: settings.linkModel,
        messages: [
          { role: 'system', content: linksSystem(settings.lang) },
          { role: 'user', content: linkPassPrompt(text) },
        ],
        maxTokens: 2400, // a deeper page has more to link, and a reasoning model spends part of this thinking
        signal,
      });
      const applied = applyLinkPhrases(text, run.text);
      text = applied.text;
      passes.push({ ...describe('links', run), added: applied.added, missed: applied.missed, retargeted: applied.retargeted });
      onEvent?.({ stage: 'links', text });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      linkError = error.message;
    }
  }
  return { format: 'a2ui', lang: langInfo(settings.lang), compact: text, truncated, linkError, metrics: summarize(passes) };
}

/**
 * The optional accessibility pass: a small call reads the finished page (as `digest`, see a11yDigest) and
 * returns annotations. Resolves with { a11y, pass }, where `pass` is its line for the receipt.
 */
export async function writeA11y({ digest, settings, signal }) {
  const run = await chat({
    apiKey: keyFor(settings, settings.linkModel),
    modelId: settings.linkModel,
    messages: [
      { role: 'system', content: a11ySystem(settings.lang) },
      { role: 'user', content: digest },
    ],
    maxTokens: 2400,
    temperature: 0.2,
    signal,
  });
  const a11y = parseA11y(run.text);
  return { a11y, pass: { ...describe('a11y', run), summary: Boolean(a11y.summary), abbr: a11y.abbr.length, lang: a11y.lang.length, links: a11y.links.length } };
}

/**
 * The raw-HTML path, in one pass: the model writes HTML with its own links, and the app sanitizes it
 * when it draws it. `onEvent({ stage: 'prose', text, format: 'html' })` as it streams. There is no
 * second pass, so the page, links included, is whole when the text ends.
 */
export async function writeHtmlPage({ topic, lens, about = false, settings, signal, onEvent: report }) {
  const onEvent = throttled(report);
  const depth = DEPTHS[settings.depth] ?? DEPTHS[DEFAULT_DEPTH];
  const run = await chat({
    apiKey: keyFor(settings, settings.model),
    modelId: settings.model,
    messages: [
      { role: 'system', content: htmlSystem(depth, settings.lang) },
      { role: 'user', content: pageUser(topic, lens, about) },
    ],
    maxTokens: depth.budget,
    signal,
    onText: (text) => onEvent({ stage: 'prose', text, format: 'html' }),
  });
  const html = cleanHtmlReply(run.text);
  const truncated = run.finish === 'length';
  // A cut-off page is shown, with its warning. Anything else that breaks the format is an error.
  if (!truncated && !wellFormed(html)) throw new ApiError('The model did not reply in the page format. Try again.', 0, 'format');
  onEvent({ stage: 'prose', text: html, final: true, format: 'html' });
  return { format: 'html', lang: langInfo(settings.lang), html, truncated, linkError: null, metrics: summarize([describe('html', run)]) };
}

/** Writes a page by whichever path the reader chose in settings. */
export const writeByFormat = (options) => (options.settings.format === 'html' ? writeHtmlPage(options) : writePage(options));

/** The journey retrospective: one pass, with explicit links. */
export async function writeJourney({ stops, settings, signal, onEvent: report }) {
  const onEvent = throttled(report);
  const run = await chat({
    apiKey: keyFor(settings, settings.model),
    modelId: settings.model,
    messages: [
      { role: 'system', content: journeySystem(settings.lang) },
      { role: 'user', content: journeyUser(stops) },
    ],
    maxTokens: 500 + stops.length * 90,
    signal,
    onText: (text) => onEvent?.({ stage: 'prose', text }),
  });
  check(run.text);
  onEvent?.({ stage: 'prose', text: run.text.trim(), final: true });
  return { format: 'a2ui', lang: langInfo(settings.lang), compact: run.text.trim(), truncated: run.finish === 'length', linkError: null, metrics: summarize([describe('retro', run)]) };
}

/* ---------------------------------------------------------------- starters */

const STARTER_COUNT = 6;
export const SPARE_STARTERS = [
  'Lighthouse', 'Fermentation', 'Byzantine Empire', 'Tidal locking', 'Game theory', 'Mycelium',
  'Damascus steel', 'Antikythera mechanism', 'Bioluminescence', 'Silk Road', 'Fibonacci sequence', 'Cuneiform',
  'Plate tectonics', 'Gothic architecture', 'Polyphony', 'Aurora', 'Sourdough', 'Longitude',
];

export function sample(list, count) {
  const pool = [...list];
  const picked = [];
  while (picked.length < count && pool.length) picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  return picked;
}

/** The topics in a starters reply, or null when it is not a clean list of the right length. */
export function parseStarters(text, count = STARTER_COUNT) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const clean = lines.every((line) => /^[\p{L}\p{N}][^<>:*#]{1,39}$/u.test(line) && !/^\d+[.)]\s/.test(line));
  return clean && lines.length === count && new Set(lines).size === count ? lines : null;
}

/** Six places to start, written by the model for this page load. Falls back to a fixed list. */
export async function writeStarters({ settings, signal }) {
  const run = await chat({
    apiKey: keyFor(settings, settings.model),
    modelId: settings.model,
    messages: [{ role: 'user', content: startersUser(sample(FIELDS, STARTER_COUNT), settings.lang) }],
    maxTokens: 300,
    temperature: 1,
    signal,
  });
  return { topics: parseStarters(run.text) ?? sample(SPARE_STARTERS, STARTER_COUNT), cost: run.cost };
}
