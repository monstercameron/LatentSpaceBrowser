// The compact page format and the app's half of both passes. Pure: no React, no browser.
//
// The model writes one block per line, chosen by how the line starts:
//   # Title           Heading level 1          @ Label: value   one entry of the Facts block
//   ## Section        Heading level 2          - item           one entry of a List
//   ### Sub-section   Heading level 3
//   > text            Quote                    anything else    Prose
// There are no brackets to balance, so nothing the model writes can break the structure.
// expandCompact turns the lines into A2UI messages (a surface of flat, id-linked components).

// Split with a capture group: the odd parts are links, bold, and the accessibility tags, left untouched.
export const KEEP_AS_IS = /(\[\[.*?\]\]|\*\*.*?\*\*|\{(?:abbr|lang)\|.*?\})/;
// A fact line is "@ Label: value", and Chinese, Japanese and others write the colon full-width.
const FACT_COLON = /[:：]/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

const cleanLines = (raw) => raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```'));

/* ------------------------------------------------------------- expansion */

export const SURFACE = 'page';
export const CATALOG = 'latentspace';

/** Compact text to A2UI messages. Safe on half-written text: the last line may simply be short. */
export function expandCompact(raw) {
  const errors = [];
  const lines = cleanLines(raw);
  if (!lines.length) errors.push('empty reply');
  if (lines.length && !/^#\s+\S/.test(lines[0])) errors.push('first line is not "# Title"');
  if (lines.some((l) => /^[{<]/.test(l))) errors.push('JSON or HTML where plain lines were asked for');

  const comps = [];
  const kids = [];
  let n = 0;
  const add = (component) => {
    const id = `c${++n}`;
    comps.push({ id, ...component });
    kids.push(id);
    return comps[comps.length - 1];
  };
  let facts = null;
  let list = null;
  let titled = false; // models sometimes use a single # for sections too; only the first is the title
  for (const line of lines) {
    const isFact = line.startsWith('@ ');
    const isItem = /^-\s+\S/.test(line);
    if (!isFact) facts = null;
    if (!isItem) list = null;
    if (/^###\s+\S/.test(line)) add({ component: 'Heading', level: 3, text: line.replace(/^###\s+/, '') });
    else if (/^##\s+\S/.test(line)) add({ component: 'Heading', level: 2, text: line.replace(/^##\s+/, '') });
    else if (/^#\s+\S/.test(line)) {
      add({ component: 'Heading', level: titled ? 2 : 1, text: line.replace(/^#\s+/, '') });
      titled = true;
    } else if (isFact) {
      const body = line.slice(2);
      const at = body.search(FACT_COLON);
      const label = at < 0 ? body : body.slice(0, at);
      const value = at < 0 ? '' : body.slice(at + 1);
      (facts ??= add({ component: 'Facts', items: [] })).items.push({ label: label.trim(), value: value.trim() });
    } else if (isItem) (list ??= add({ component: 'List', items: [] })).items.push(line.replace(/^-\s+/, ''));
    else if (/^>\s*\S/.test(line)) add({ component: 'Quote', text: line.replace(/^>\s*/, '') });
    else add({ component: 'Prose', text: line });
  }
  if (!comps.some((c) => c.component === 'Heading' && c.level === 2)) errors.push('no ## sections');

  const update = (components) => ({ version: '1.0', updateComponents: { surfaceId: SURFACE, components } });
  const messages = [
    { version: '1.0', createSurface: { surfaceId: SURFACE, catalogId: CATALOG } },
    update([{ id: 'root', component: 'Column', children: kids }]),
    ...comps.map((c) => update([c])),
  ];
  return { messages, errors };
}

/* ------------------------------------------------------------- link pass */
// Pass two. The page is already on screen; a small call names phrases to link, one line per
// paragraph ("3: volcanic rock | lava"), and the app does the wrapping. The model never
// retypes the page, so the pass cannot damage it, and a phrase it gets wrong is skipped.

/**
 * The blocks that can carry links, in reading order: paragraphs, list items, quotes, and the values
 * of key facts. Not the title or the section headings. `prefix` is what the line starts with
 * ("- ", "> ", "@ Label: ") and `text` is the part that can be linked.
 */
export function blocksOf(raw) {
  const out = [];
  raw.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('```') || /^#/.test(t)) return;
    if (t.startsWith('@ ')) {
      const colon = t.search(FACT_COLON);
      if (colon < 0) return;
      out.push({ line: i, kind: 'fact', label: t.slice(2, colon).trim(), prefix: t.slice(0, colon + 1) + ' ', text: t.slice(colon + 1).trim() });
    } else if (/^-\s+\S/.test(t)) out.push({ line: i, kind: 'item', prefix: '- ', text: t.replace(/^-\s+/, '') });
    else if (/^>\s*\S/.test(t)) out.push({ line: i, kind: 'quote', prefix: '> ', text: t.replace(/^>\s*/, '') });
    else out.push({ line: i, kind: 'paragraph', prefix: '', text: t });
  });
  return out.filter((b) => b.text);
}

export const titleOf = (raw) => raw.match(/^\s*#\s+(.+)$/m)?.[1].trim() ?? '';

/** What the link pass is shown: the page's subject and every block, numbered, facts with their label. */
export function linkPassPrompt(raw) {
  const lines = blocksOf(raw).map((b, i) => {
    const tag = b.kind === 'paragraph' ? '' : b.kind === 'fact' ? ` (fact: ${b.label})` : ` (${b.kind})`;
    return `${i + 1}${tag}: ${b.text}`;
  });
  return `Subject: ${titleOf(raw)}\n${lines.join('\n')}`;
}

// Two spellings of one thing must count as one link: "Enzyme" and "enzymes", "the Council".
export const stem = (s) =>
  norm(s)
    .replace(/^(the|a|an) /, '')
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');

const DASHES = '\\-\\u2010-\\u2015\\u2212'; // hyphen, the Unicode hyphens and dashes, minus
// Scripts written without spaces between words: Han, Hiragana, Katakana, Thai, Lao, Burmese, Khmer.
export const NO_SPACES = /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-໿က-႟ក-៿]/;
// A pattern for `phrase` that forgives what models change silently: curly apostrophes, kinds of
// dash, runs of spaces. Never loosens the words themselves.
export function phrasePattern(phrase, flags) {
  const source = escapeRe(phrase.trim())
    .replace(/-|[‐-―−]/g, `[${DASHES}]`)
    .replace(/['’]/g, "['’]")
    .replace(/\s+/g, '\\s+');
  // Where words run together with no spaces (Chinese, Japanese, Thai...), the letters next to a phrase
  // are part of the same sentence, not part of a longer word, so no boundary is required there.
  return NO_SPACES.test(phrase) ? new RegExp(source, flags) : new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, flags);
}

const letterCount = (s) => (s.match(/\p{L}/gu) ?? []).length;

/**
 * A guard against the links a model pads a quota with: units and symbols ("%", "g/cm³"), numbers,
 * and descriptions that run on ("hand-powered analog computer that models..."). A fact value is
 * shorter than a sentence, so it gets less room. The prompt asks for names and established terms;
 * this only rejects what is plainly neither.
 */
export function worthLinking(phrase, kind = 'paragraph') {
  const compact = phrase.replace(/\s/g, '');
  // Without spaces there are no words to count, so a phrase's length stands in for them: about two and
  // a half characters to a word.
  const words = NO_SPACES.test(phrase) ? Math.ceil(compact.length / 2.5) : phrase.trim().split(/\s+/).length;
  if (words > (kind === 'fact' ? 4 : 5)) return false;
  if (letterCount(phrase) < 3) return false; // a symbol, a unit, a number
  return letterCount(phrase) >= compact.length * 0.7; // mostly digits and symbols: a measurement or a date ("g/cm³")
}

/** "phrase" or "phrase > Canonical Title" (also => and ->), brackets tolerated. */
function parseEntry(entry) {
  const cleaned = entry.trim().replace(/^\[\[|\]\]$/g, '');
  const [phrase, target] = cleaned.split(/\s*(?:=>|->|>)\s*/);
  return { phrase: phrase?.trim() ?? '', target: target?.trim() || null };
}

/**
 * Applies a link-pass answer to a compact page. A phrase becomes `[[phrase]]`, or `[[phrase|Title]]`
 * when the model named the page it should open. Only the first plain occurrence is wrapped: never
 * inside an existing link or the bold subject, never the page's own subject, and never a thing that
 * is already linked, however it is spelled. A phrase the model got slightly wrong in case or
 * punctuation still lands; one that is not in the block at all is counted as missed.
 */
export function applyLinkPhrases(raw, answer, { maxPerBlock = 5, quality = true } = {}) {
  const lines = raw.split('\n');
  const blocks = blocksOf(raw);
  const subject = stem(titleOf(raw));
  // "Link a thing once" holds within a surface: the key facts sit in their own rail beside the page, so
  // a term linked there is still linked at its first mention in the text, and the other way round.
  const takenIn = { body: new Set(), facts: new Set() };
  for (const b of blocks) {
    for (const m of b.text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      takenIn[b.kind === 'fact' ? 'facts' : 'body'].add(stem(m[2] ?? m[1]));
    }
  }
  const done = new Set(); // a block takes one row of the answer; a second row for it is ignored
  let added = 0;
  let asked = 0;
  let missed = 0;
  let retargeted = 0;
  let rejected = 0;
  for (const row of answer.split('\n')) {
    const m = row.trim().match(/^(\d+)\s*(?:\([^)]*\))?\s*[:.)-]\s*(.*)$/);
    const number = m ? Number(m[1]) : 0;
    const block = blocks[number - 1];
    if (!block || done.has(number)) continue;
    done.add(number);
    const taken = takenIn[block.kind === 'fact' ? 'facts' : 'body'];
    let text = block.text;
    let n = 0;
    for (const entry of m[2].split('|')) {
      const { phrase, target } = parseEntry(entry);
      if (!phrase) continue;
      asked++;
      const key = stem(target ?? phrase);
      if (!key || key === subject || taken.has(key) || n >= maxPerBlock) continue; // declined by rule
      if (quality && !worthLinking(phrase, block.kind)) {
        rejected++; // a unit, a number, or a description that runs on
        continue;
      }
      const parts = text.split(KEEP_AS_IS);
      let at = -1;
      let found = phrasePattern(phrase, 'u');
      at = parts.findIndex((segment, k) => k % 2 === 0 && found.test(segment));
      if (at < 0) {
        found = phrasePattern(phrase, 'iu'); // the model changed the case
        at = parts.findIndex((segment, k) => k % 2 === 0 && found.test(segment));
      }
      if (at < 0) {
        missed++; // the model named text that is not in this block
        continue;
      }
      const useTarget = target && stem(target) !== stem(phrase);
      parts[at] = parts[at].replace(found, (hit) => (useTarget ? `[[${hit}|${target}]]` : `[[${hit}]]`));
      if (useTarget) retargeted++;
      text = parts.join('');
      taken.add(key);
      added++;
      n++;
    }
    lines[block.line] = block.prefix + text;
  }
  return { text: lines.join('\n'), added, asked, missed, retargeted, rejected };
}

/** How many links a compact page carries, and how many blocks have none. */
export function linkStats(raw) {
  const blocks = blocksOf(raw);
  const counts = blocks.map((b) => (b.text.match(/\[\[/g) ?? []).length);
  return { links: counts.reduce((a, b) => a + b, 0), blocks: blocks.length, bare: counts.filter((c) => c === 0).length };
}
