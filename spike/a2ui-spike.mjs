// Spike: does an A2UI-style JSONL page cost more than the current HTML page?
// Dependency-free. Same topics, same models, same word budget, two output formats.
//
//   node --env-file=.env spike/a2ui-spike.mjs                      full run (16 calls)
//   node --env-file=.env spike/a2ui-spike.mjs --topics "Basalt,Fermentation" --models gpt-oss-120b
//   node spike/a2ui-spike.mjs --selftest                           validator checks, no network
//
// Reads APIKEY (or VITE_APIKEY). Writes spike/results.json.
//
// The A2UI side uses a small CUSTOM catalog (see A2UI_SYSTEM) because the basic
// catalog has no link, heading, aside or table. The message envelope follows
// the v1.0 spec as reported by a2ui.org (createSurface / updateComponents,
// "version": "1.0"). Re-check the exact field names against the spec before
// building on this: they were not verified against the spec text itself.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseLine } from './repair.mjs';
import { applyLinkPhrases, expandCompact, linkPassPrompt, titleOf } from './compact.mjs';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.cerebras.ai/v1/chat/completions';

// Copied from web/src/services/models.js (that file is browser code).
const MODELS = {
  'gpt-oss-120b': { input: 0.35, output: 0.75, effort: 'low' },
  'qwen-3.8-27b': { input: 0.99, output: 1.49, effort: 'none' },
};
const WORDS = 350;
const BUDGET = 1400; // STYLES.short.budget: one writing pass, no continuation in this spike
const DEFAULT_TOPICS = ['Basalt', 'Antikythera mechanism', 'Fermentation', 'Byzantine Empire'];

/* ----------------------------------------------------------------- prompts */

// Verbatim from web/src/services/ai.js, so the HTML baseline is the real one.
const CONTRACT = `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
Reply with one HTML fragment and nothing else. It begins with <h1> and ends with a closing tag. Never use markdown, code fences, commentary, <html>, <body>, or class, style and id attributes.
Tags you may use: h1 h2 h3 p ul ol li a b i blockquote aside table tr th td code pre.
Links are how readers travel, so every page needs them. In each paragraph, wrap the two to four most notable people, places, objects, terms or concepts in a bare <a>...</a> with no attributes. Never link the same thing twice on a page, and never link common words. The link text becomes the next page's topic, so make it a self-contained noun phrase.
Bold is not a link. In running text use <b> exactly once: for the page's own subject, where the lead paragraph introduces it. The subject itself is never a link. Never put any other name in <b>; make it a link instead.
The style, for a page about basalt: <p><b>Basalt</b> is a dark <a>volcanic rock</a> that forms when <a>lava</a> cools quickly at the surface.</p>
Only for a real website whose exact URL you are certain of, use <a href="https://...">. Never guess a URL; use a bare link instead.
Tone: encyclopedic, precise, confident.`;

const HTML_SYSTEM = `${CONTRACT}
Page layout: <h1>title</h1>, an <aside> of 3 to 6 key facts written as <p><b>Label</b> value</p>, a lead paragraph, then <h2> sections.
Length: about ${WORDS} words. Finish the page within that length.`;

const A2UI_SYSTEM = `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
You describe each page as a user interface in the A2UI protocol: a stream of JSON messages, ONE JSON OBJECT PER LINE (JSONL). Reply with those lines and nothing else: no markdown, no code fences, no commentary.

Every message has "version":"1.0" and exactly one more key, either createSurface or updateComponents.
Line 1 is always: {"version":"1.0","createSurface":{"surfaceId":"page","catalogId":"latentspace"}}
Then each line is {"version":"1.0","updateComponents":{"surfaceId":"page","components":[...]}} adding components. A component is {"id":"<unique id>","component":"<Type>", ...props}. Components are a flat list that refer to each other by id.
Line 2 defines the root, and must come before the components it names: {"id":"root","component":"Column","children":["title","facts","lead","s1", ...]}. Then add the components for the page in reading order, one or a few per line.

Component types (nothing else exists):
- Column {children:[ids]}: the root and any grouping.
- Heading {level:1|2|3, text}: the page title is level 1; sections are level 2.
- Prose {text}: one paragraph. Mark links inline as [[Topic]] (the Topic is the next page's title) and the page's own subject in **bold** exactly once, in the lead paragraph. Link the two to four most notable people, places, objects, terms or concepts in each paragraph, never the same thing twice on the page, never common words, never the page's own subject. Make each link a self-contained noun phrase.
- Facts {items:[{label,value}]}: 3 to 6 key facts. Put it right after the title.
- List {ordered:bool, items:[string]}: items may use [[Topic]] links.
- Table {headers:[string], rows:[[string]]}
- Quote {text}
- Tabs {tabs:[{title, child:id}]}: only when the content naturally has parallel views.
Use short ids (title, facts, lead, s1h, s1p...).

Page layout: Heading level 1, Facts, a lead Prose paragraph, then level-2 Heading sections each followed by Prose.
Tone: encyclopedic, precise, confident.
Length: about ${WORDS} words of prose in total. Finish the page within that length.`;

// Variant 2. The model writes only components, one per line; the app supplies the
// A2UI envelope (see toEnvelope). Nothing the model can miscount sits around them.
const LITE_SYSTEM = `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
You describe each page as a list of user-interface components, ONE JSON OBJECT PER LINE (JSONL). Reply with those lines and nothing else: no markdown, no code fences, no commentary. Every line is a complete, single-line, valid JSON object that stands alone.

A component is {"id":"<unique short id>","component":"<Type>", ...props}. Components refer to each other by id.
Line 1 is the root, and must come before the components it names: {"id":"root","component":"Column","children":["title","facts","lead","s1h","s1p", ...]}. Then one component per line, in reading order.

Component types (nothing else exists):
- Column {children:[ids]}: the root and any grouping.
- Heading {level:1|2|3, text}: the page title is level 1; sections are level 2.
- Prose {text}: one paragraph. Mark links inline as [[Topic]] (the Topic is the next page's title) and the page's own subject in **bold** exactly once, in the lead paragraph. Link the two to four most notable people, places, objects, terms or concepts in each paragraph, never the same thing twice on the page, never common words, never the page's own subject. Make each link a self-contained noun phrase.
- Facts {items:[{"label":"..","value":".."}]}: 3 to 6 key facts. Put it right after the title.
- List {ordered:bool, items:[string]}: items may use [[Topic]] links.
- Table {headers:[string], rows:[[string]]}
- Quote {text}
- Tabs {tabs:[{"title":"..","child":"<id>"}]}: only when the content naturally has parallel views.
Every id in a "children" list or a tab "child" must be defined on a line of its own.

Page layout: Heading level 1, Facts, a lead Prose paragraph, then level-2 Heading sections each followed by Prose.
Tone: encyclopedic, precise, confident.
Length: about ${WORDS} words of prose in total. Finish the page within that length.`;

// The link rule from the HTML prompt, carried over: link the phrase as it reads in the
// sentence. The first A2UI prompts said "the Topic is the next page's title", which made
// the models title-case link text ("such as Yeast and Bacteria") and link fewer phrases.
const LINK_RULE = `Links are how readers travel. In each paragraph, wrap the two to four most notable people, places, objects, terms or concepts in [[double brackets]], written exactly as they read in the sentence: [[volcanic rock]], [[Hipparchus]]. Keep ordinary lowercase wording and capitalise only proper names. The text inside the brackets becomes the next page's topic, so make it a self-contained noun phrase. Never link the same thing twice on a page, never link common words, and never link the page's own subject. Mark the page's own subject in **bold** exactly once, in the lead paragraph. Bold is not a link: never put any other name in bold; link it instead.`;

// Variant 2b: the same JSON-lines components, with the HTML prompt's link rule.
const LITE2_SYSTEM = LITE_SYSTEM.replace(/^- Prose \{text\}:.*$/m, `- Prose {text}: one paragraph. ${LINK_RULE}`);

// Variant 3: no JSON at all. The app expands these lines into components (see compact.mjs).
const COMPACT_SYSTEM = `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
You write each page in a compact line-based format. Reply with those lines and nothing else: no code fences, no commentary, no HTML, no JSON.

Each line is one block, chosen by how it starts:
# Title            the page title, always the first line
@ Label: value     one key fact; write 3 to 6 of these lines straight after the title
## Heading         a section heading (two hashes; a single # is only for the title on line 1)
(a plain line)     a paragraph
- item             a list item (only when the content is naturally a list)
> text             a quotation (rarely)

Write plain prose with no link markup: links are added by a second pass. Mark the page's own subject in **bold** exactly once, in the lead paragraph, and never put any other name in bold.

Page layout: the # title, the @ facts, a lead paragraph, then ## sections, each followed by one or two paragraphs.
Tone: encyclopedic, precise, confident.
Length: about ${WORDS} words of prose in total. Finish the page within that length.`;

// The second pass for compact pages: runs after the page is on screen and only names phrases to link.
// Kept short on purpose: its input tokens were most of the pass's cost.
const LINKPASS_SYSTEM = `Add links to an encyclopedia page. You get its numbered paragraphs; **bold** marks the page's subject.
For each paragraph choose two to four phrases to link. Copy each exactly as written in that paragraph: one to four words naming a person, place, object, term or concept. Never the subject or a common word, and never the same thing twice on the page.
Reply with only lines like:
1: phrase | phrase`;

/** The app's half of variants 2, 2b and 3: turns the model's reply into real A2UI messages. */
export function wrapFor(format, text) {
  if (format === 'compact') {
    const { envelope, errors } = expandCompact(text);
    return { wrapped: envelope, extraErrors: errors };
  }
  if (format === 'lite' || format === 'lite2') return { wrapped: toEnvelope(text), extraErrors: [] };
  return { wrapped: null, extraErrors: [] };
}

/** The app's half of variant 2: wraps bare component lines into real A2UI messages. */
export function toEnvelope(raw, surfaceId = 'page') {
  const out = [`{"version":"1.0","createSurface":{"surfaceId":"${surfaceId}","catalogId":"latentspace"}}`];
  for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```'))) {
    // A line normally holds one object, but a model sometimes runs several together.
    for (const piece of splitObjects(line)) {
      const parsed = parseLine(piece);
      if (!parsed) {
        out.push(piece); // keep it, so the validator reports it as the broken JSON it is
        continue;
      }
      out.push(JSON.stringify({ version: '1.0', updateComponents: { surfaceId, components: [parsed.value] } }));
    }
  }
  return out.join('\n');
}

/** Splits `{..}{..}` into top-level objects, respecting strings. Structure only: it never edits a character. */
export function splitObjects(line) {
  const pieces = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0 && --depth === 0) pieces.push(line.slice(start, i + 1));
  }
  // Unbalanced leftovers stay as one piece, so the validator reports a broken line, not a vanished one.
  if (depth > 0) pieces.push(line.slice(start));
  return pieces.length ? pieces : [line];
}

const userPrompt = (topic) => `Topic: ${topic}`;

/* -------------------------------------------------------------- validators */

const VOID_TAGS = new Set(['br', 'hr']);
const END_TAG_OPTIONAL = new Set(['p', 'li', 'td', 'th']);

// Copied from web/src/services/ai.js.
function wellFormed(html) {
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

const stripTags = (html) => html.replace(/<[^>]+>/g, ' ');
const wordCount = (text) => (text.match(/\S+/g) ?? []).length;

function measureHtml(text) {
  const links = (text.match(/<a[\s>]/gi) ?? []).length;
  const valid = wellFormed(text);
  return { valid, errors: valid ? [] : ['not well formed'], links, words: wordCount(stripTags(text)), fenced: /```/.test(text) };
}

const MESSAGE_KEYS = ['createSurface', 'updateComponents'];
const CATALOG = {
  Column: { required: ['children'], refs: (c) => c.children },
  Heading: { required: ['level', 'text'] },
  Prose: { required: ['text'] },
  Facts: { required: ['items'] },
  List: { required: ['items'] },
  Table: { required: ['headers', 'rows'] },
  Quote: { required: ['text'] },
  Tabs: { required: ['tabs'], refs: (c) => (Array.isArray(c.tabs) ? c.tabs.map((t) => t?.child) : []) },
};

/** Validates a JSONL reply as A2UI messages for the spike catalog. */
export function validateA2ui(raw) {
  const errors = [];
  const fenced = /^\s*```/m.test(raw);
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```'));
  const components = new Map();
  let created = false;
  let repairs = 0;

  lines.forEach((line, i) => {
    const parsed = parseLine(line);
    if (!parsed) {
      errors.push(`line ${i + 1}: not JSON, even after bracket repair`);
      return;
    }
    if (parsed.repaired) repairs++;
    const msg = parsed.value;
    const keys = MESSAGE_KEYS.filter((k) => k in msg);
    if (msg?.version !== '1.0') errors.push(`line ${i + 1}: version is not "1.0"`);
    if (keys.length !== 1) return errors.push(`line ${i + 1}: needs exactly one of ${MESSAGE_KEYS.join('/')}`);
    if (keys[0] === 'createSurface') {
      if (i !== 0) errors.push(`line ${i + 1}: createSurface is not first`);
      if (!msg.createSurface?.surfaceId) errors.push('createSurface without surfaceId');
      created = true;
      return;
    }
    if (!created) errors.push(`line ${i + 1}: updateComponents before createSurface`);
    const list = msg.updateComponents?.components;
    if (!Array.isArray(list)) return errors.push(`line ${i + 1}: components is not an array`);
    for (const c of list) {
      if (typeof c?.id !== 'string' || !c.id) errors.push(`line ${i + 1}: component without id`);
      else if (!CATALOG[c.component]) errors.push(`${c.id}: unknown component "${c.component}"`);
      else {
        for (const prop of CATALOG[c.component].required) {
          if (c[prop] === undefined) errors.push(`${c.id}: ${c.component} missing "${prop}"`);
        }
        components.set(c.id, c);
      }
    }
  });

  if (!created) errors.push('no createSurface');
  if (!components.has('root')) errors.push('no root component');

  // Every reference resolves, and everything defined is reachable from root.
  const reached = new Set();
  const visit = (id, trail = []) => {
    if (reached.has(id)) return;
    const c = components.get(id);
    if (!c) return errors.push(`dangling reference "${id}"`);
    if (trail.includes(id)) return errors.push(`cycle at "${id}"`);
    reached.add(id);
    for (const ref of CATALOG[c.component]?.refs?.(c) ?? []) visit(ref, [...trail, id]);
  };
  if (components.has('root')) visit('root');
  const orphans = [...components.keys()].filter((id) => !reached.has(id));
  if (orphans.length) errors.push(`${orphans.length} unreachable component(s): ${orphans.slice(0, 4).join(', ')}`);

  // Content, for comparison with the HTML page.
  let links = 0;
  let words = 0;
  for (const c of components.values()) {
    const texts = [];
    if (c.component === 'Prose' || c.component === 'Quote' || c.component === 'Heading') texts.push(c.text);
    if (c.component === 'List') texts.push(...(c.items ?? []));
    if (c.component === 'Facts') texts.push(...(c.items ?? []).map((it) => `${it?.label} ${it?.value}`));
    if (c.component === 'Table') texts.push(...(c.headers ?? []), ...(c.rows ?? []).flat());
    for (const t of texts.filter((x) => typeof x === 'string')) {
      links += (t.match(/\[\[[^\]]+\]\]/g) ?? []).length;
      words += wordCount(t);
    }
  }
  return { valid: errors.length === 0, errors, links, words, fenced, repairs, components: components.size };
}

/* --------------------------------------------------------------- transport */

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

async function call(apiKey, modelId, system, user, maxTokens = BUDGET) {
  const model = MODELS[modelId];
  const started = performance.now();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      stream: true,
      max_completion_tokens: maxTokens,
      temperature: 0.7,
      reasoning_effort: model.effort,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);

  let text = '';
  let firstToken = 0;
  let finish = null;
  let usage = null;
  for await (const chunk of serverEvents(res)) {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) {
      firstToken ||= performance.now();
      text += choice.delta.content;
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  const ended = performance.now();
  const inTokens = usage?.prompt_tokens ?? 0;
  const outTokens = usage?.completion_tokens ?? 0;
  return {
    text,
    finish,
    ttft: ((firstToken || ended) - started) / 1000,
    seconds: (ended - started) / 1000,
    inTokens,
    outTokens,
    cost: (inTokens * model.input + outTokens * model.output) / 1e6,
  };
}

/* ------------------------------------------------------------------- main */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function selftest() {
  const good = [
    '{"version":"1.0","createSurface":{"surfaceId":"page","catalogId":"latentspace"}}',
    '{"version":"1.0","updateComponents":{"surfaceId":"page","components":[{"id":"root","component":"Column","children":["t","p"]}]}}',
    '{"version":"1.0","updateComponents":{"surfaceId":"page","components":[{"id":"t","component":"Heading","level":1,"text":"Basalt"},{"id":"p","component":"Prose","text":"**Basalt** is a [[volcanic rock]] formed by [[lava]]."}]}}',
  ].join('\n');
  const a = validateA2ui(good);
  const b = validateA2ui(good.replace('"p"]', '"p","ghost"]').replace('"Heading"', '"Banner"'));
  const c = validateA2ui('```json\n' + good + '\n```');
  const d = measureHtml('<h1>Basalt</h1><p>A <a>rock</a>.</p>');
  const lite = [
    '{"id":"root","component":"Column","children":["t","p"]}',
    '{"id":"t","component":"Heading","level":1,"text":"Basalt"}',
    '{"id":"p","component":"Prose","text":"**Basalt** is a [[volcanic rock]]."}',
  ].join('\n');
  const e = validateA2ui(toEnvelope(lite));
  // A missing brace or a stray closer is repaired; an unterminated string is not guessed at.
  const f = validateA2ui(toEnvelope(lite.replace('"Basalt"}', '"Basalt')));
  const gptShape = good.replace('"children":["t","p"]}]}}', '"children":["t","p"]}]}]'); // `]` where `}` belongs
  const qwenShape = good.replace('"children":["t","p"]}]}}', '"children":["t","p"]}]}'); // final `}` dropped
  const g = validateA2ui(gptShape);
  const q = validateA2ui(qwenShape);
  const compact = ['# Basalt', '@ Type: Extrusive rock', '@ Color: Dark gray', '**Basalt** is a [[volcanic rock]] formed by [[lava]].', '## Formation', 'It cools fast.'].join('\n');
  const ex = expandCompact(compact);
  const cx = validateA2ui(ex.envelope);
  const bad = expandCompact('{"id":"root"}\nsome text');
  const checks = [
    ['compact lines expand into a valid A2UI page', ex.errors.length === 0 && cx.valid && cx.links === 2 && cx.components === 6],
    ['link pass wraps phrases, skips subject, taken and missing ones', (() => {
      const page = '# Basalt\n@ Type: rock\n**Basalt** is a volcanic rock formed by [[lava]].\n## Formation\nMagma cools at the mid-ocean ridge.';
      const r = applyLinkPhrases(page, '1: volcanic rock | Basalt | lava | nowhere\n2: mid-ocean ridge');
      return r.added === 2 && r.missed === 1 && r.asked === 5 && r.text.includes('[[volcanic rock]]') && r.text.includes('[[mid-ocean ridge]]') && r.text.includes('**Basalt**') && titleOf(page) === 'Basalt';
    })()],
    ['link pass is shown the subject and every paragraph, numbered', (() => {
      const p = linkPassPrompt('# X\n@ A: b\n**X** is here.\n## S\nMore text.');
      return p === 'Subject: X\n1: **X** is here.\n2: More text.';
    })()],
    ['link pass never links inside an existing link or the bold subject', applyLinkPhrases('# X\n**Alpha beta** and [[gamma delta]] go.', '1: beta | delta').added === 0],
    ['compact reads a later single # as a section', expandCompact('# T\n# S\nx').errors.length === 0],
    ['compact groups consecutive @ lines into one Facts block', ex.envelope.split('"Facts"').length === 2],
    ['compact flags JSON and a missing title', bad.errors.length >= 2],
    ['lite lines wrap into a valid A2UI page', e.valid && e.links === 1],
    ['gpt-oss bracket shape (] for }) is repaired', g.valid && g.repairs === 1],
    ['qwen bracket shape (dropped }) is repaired', q.valid && q.repairs === 1],
    ['objects run together on one line are split', validateA2ui(toEnvelope(lite.split('\n').join(''))).valid],
    ['braces inside strings do not confuse the splitter', splitObjects('{"a":"}{"}{"b":1}').length === 2],
    ['a broken lite line costs only that line', !f.valid && f.components === 2],
    ['good page is valid', a.valid && a.links === 2 && a.words > 5],
    ['dangling ref and unknown component are caught', !b.valid && b.errors.length >= 2],
    ['code fence is flagged but parsed', c.valid && c.fenced],
    ['html baseline measures', d.valid && d.links === 1],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
}

// Re-scores saved replies after a validator or wrapper change, without calling the API.
function rescore() {
  const file = fileURLToPath(new URL('./results.json', import.meta.url));
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of rows.filter((x) => x.format !== 'html' && !x.error)) {
    const { wrapped, extraErrors } = wrapFor(r.format, r.text);
    if (wrapped) r.wrapped = wrapped;
    Object.assign(r, validateA2ui(r.wrapped ?? r.text));
    if (extraErrors.length) Object.assign(r, { valid: false, errors: [...extraErrors, ...r.errors] });
  }
  writeFileSync(file, JSON.stringify(rows, null, 2));
  for (const r of rows.filter((x) => x.format !== 'html')) {
    console.log(`${r.modelId} | ${r.format} | ${r.topic}: ${r.valid ? 'valid' : 'INVALID ' + r.errors.slice(0, 2).join('; ')} (${r.repairs} lines repaired, ${r.links} links)`);
  }
}

// Second pass over saved compact pages: the page is already rendered, so only the link call is new.
async function addLinkPass(apiKey, rows) {
  for (const page of rows.filter((r) => r.format === 'compact' && !r.error)) {
    // --passmodel runs the link pass on one fixed model, whichever model wrote the page.
    const passModel = arg('passmodel') ?? page.modelId;
    const label = `${page.modelId} | compact+links (pass: ${passModel}) | ${page.topic}`;
    try {
      const run = await call(apiKey, passModel, LINKPASS_SYSTEM, linkPassPrompt(page.text), 400);
      const applied = applyLinkPhrases(page.text, run.text);
      const { wrapped, extraErrors } = wrapFor('compact', applied.text);
      const m = validateA2ui(wrapped);
      if (extraErrors.length) Object.assign(m, { valid: false, errors: [...extraErrors, ...m.errors] });
      rows.push({
        modelId: page.modelId, topic: page.topic, format: 'compact+links', passModel, text: applied.text, wrapped, finish: page.finish,
        ttft: page.ttft, renderSeconds: page.seconds, passSeconds: run.seconds, seconds: page.seconds + run.seconds,
        inTokens: page.inTokens + run.inTokens, outTokens: page.outTokens + run.outTokens, passOutTokens: run.outTokens,
        cost: page.cost + run.cost, ...m, linkPass: { added: applied.added, asked: applied.asked, missed: applied.missed, answer: run.text },
      });
      console.log(`${label}: +${applied.added} links (${page.links} -> ${m.links}), ${applied.missed}/${applied.asked} phrases not found, ${run.outTokens} extra out tokens, ${run.seconds.toFixed(2)}s`);
    } catch (error) {
      console.log(`${label}: ERROR ${error.message}`);
    }
  }
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--rescore')) return rescore();
  const apiKey = process.env.APIKEY || process.env.VITE_APIKEY;
  if (!apiKey) throw new Error('Set APIKEY in .env (or the environment) first.');

  const topics = (arg('topics')?.split(',') ?? DEFAULT_TOPICS).map((t) => t.trim()).filter(Boolean);
  const modelIds = arg('models')?.split(',') ?? Object.keys(MODELS);
  const formats = { html: HTML_SYSTEM, a2ui: A2UI_SYSTEM, lite: LITE_SYSTEM, lite2: LITE2_SYSTEM, compact: COMPACT_SYSTEM };
  // --formats lite2,compact runs only those and keeps the other saved results.
  const only = arg('formats')?.split(',');
  const resultsFile = fileURLToPath(new URL('./results.json', import.meta.url));
  const linkpass = process.argv.includes('--linkpass'); // run only the second pass over the saved compact pages
  const rows = only || linkpass
    ? JSON.parse(readFileSync(resultsFile, 'utf8')).filter((r) => !only?.includes(r.format) && !(linkpass && r.format === 'compact+links'))
    : [];
  if (linkpass) await addLinkPass(apiKey, rows);
  const shown = [...Object.keys(formats), 'compact+links'];

  for (const modelId of modelIds) {
    for (const topic of topics) {
      for (const [format, system] of Object.entries(formats).filter(([name]) => !linkpass && (!only || only.includes(name)))) {
        const label = `${modelId} | ${format.padEnd(4)} | ${topic}`;
        try {
          const run = await call(apiKey, modelId, system, userPrompt(topic));
          // For the lite and compact formats the app builds the A2UI messages, then the same validator judges them.
          const { wrapped, extraErrors } = wrapFor(format, run.text);
          const m = format === 'html' ? measureHtml(run.text) : validateA2ui(wrapped ?? run.text);
          if (extraErrors.length) Object.assign(m, { valid: false, errors: [...extraErrors, ...m.errors] });
          rows.push({ modelId, topic, format, ...run, ...m, ...(wrapped ? { wrapped } : {}) });
          console.log(`${label}: ${run.outTokens} out, ${run.seconds.toFixed(2)}s, ${m.valid ? 'valid' : 'INVALID'}, ${m.links} links, ${m.words} words`);
        } catch (error) {
          rows.push({ modelId, topic, format, error: error.message });
          console.log(`${label}: ERROR ${error.message}`);
        }
      }
    }
  }

  console.log('\n=== Mean per model and format (successful calls) ===');
  console.log('model            format        n  in   out   cost$     ttft   total  tps   words links valid  trunc');
  for (const modelId of modelIds) {
    const byFormat = {};
    for (const format of shown) {
      const ok = rows.filter((r) => r.modelId === modelId && r.format === format && !r.error);
      if (!ok.length) continue;
      byFormat[format] = ok;
      const f = (key, digits = 0) => mean(ok.map((r) => r[key])).toFixed(digits);
      const tps = mean(ok.map((r) => r.outTokens / r.seconds)).toFixed(0);
      const valid = `${ok.filter((r) => r.valid).length}/${ok.length}`;
      const trunc = ok.filter((r) => r.finish === 'length').length;
      console.log(
        `${modelId.padEnd(16)} ${format.padEnd(13)} ${String(ok.length).padStart(2)} ${f('inTokens').padStart(4)} ${f('outTokens').padStart(5)} ${f('cost', 5)} ${f('ttft', 2).padStart(6)} ${f('seconds', 2).padStart(6)} ${tps.padStart(5)} ${f('words').padStart(5)} ${f('links', 1).padStart(5)} ${valid.padStart(5)}  ${trunc}`,
      );
    }
    for (const format of shown.filter((name) => name !== 'html')) {
      if (!byFormat.html || !byFormat[format]) continue;
      const ratio = (key) => (mean(byFormat[format].map((r) => r[key])) / mean(byFormat.html.map((r) => r[key]))).toFixed(2);
      console.log(`  -> ${format} / html:  out tokens x${ratio('outTokens')}, cost x${ratio('cost')}, total time x${ratio('seconds')}`);
    }
    for (const name of ['compact+links']) {
      const second = byFormat[name];
      if (!second) continue;
      const hits = second.reduce((n, r) => n + r.linkPass.asked - r.linkPass.missed, 0);
      const asked = second.reduce((n, r) => n + r.linkPass.asked, 0);
      const passIn = mean(second.map((r) => r.inTokens - (rows.find((p) => p.modelId === r.modelId && p.topic === r.topic && p.format === name.split('+')[0])?.inTokens ?? 0)));
      console.log(`  ${name}: page ready after ${mean(second.map((r) => r.renderSeconds)).toFixed(2)}s (vs html ${mean((byFormat.html ?? []).map((r) => r.seconds)).toFixed(2)}s), links land ${mean(second.map((r) => r.passSeconds)).toFixed(2)}s later; pass = ${passIn.toFixed(0)} in + ${mean(second.map((r) => r.passOutTokens)).toFixed(0)} out tokens; ${hits}/${asked} named phrases found`);
    }
  }

  const failures = rows.filter((r) => r.format !== 'html' && !r.error && !r.valid);
  if (failures.length) {
    console.log('\n=== A2UI validation failures ===');
    for (const r of failures) console.log(`${r.modelId} | ${r.format} | ${r.topic}: ${r.errors.slice(0, 3).join('; ')}`);
  }

  const out = fileURLToPath(new URL('./results.json', import.meta.url));
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nFull replies saved to ${out}`);
}

// Run only when executed directly, so the validator can be imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
