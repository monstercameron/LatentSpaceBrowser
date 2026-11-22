// The app's half of the "compact" format. Browser- and Node-safe (no imports).
//
// The model writes a page as plain lines, one block per line, chosen by how the line starts:
//   # Title           -> Heading level 1
//   ## Section        -> Heading level 2
//   @ Label: value    -> one entry of the Facts block (consecutive lines are grouped)
//   - item            -> one entry of a List (consecutive lines are grouped)
//   > text            -> Quote
//   anything else     -> Prose paragraph
// There are no brackets to balance, so nothing the model writes can break the
// structure. expandCompact turns the lines into A2UI messages for the spike catalog.

/* ------------------------------------------------------------ link pass */
// The second pass. The page is already on screen; a small call then names phrases to
// link, one line per paragraph ("3: volcanic rock | lava"), and the app does the
// wrapping. The model never retypes the page, so the pass costs a few dozen output
// tokens, cannot damage the text, and its phrases that are not found are simply skipped.

const KEEP_AS_IS = /(\[\[.*?\]\]|\*\*.*?\*\*)/; // split with a capture group: odd parts are links and bold
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

/** The paragraph lines of a compact page: not a title, heading, fact, list item or quote. */
export function paragraphsOf(raw) {
  const out = [];
  raw.split('\n').forEach((line, i) => {
    const text = line.trim();
    if (text && !text.startsWith('```') && !/^(#|@ |-\s+\S|>\s*\S)/.test(text)) out.push({ line: i, text });
  });
  return out;
}

export const titleOf = (raw) => raw.match(/^\s*#\s+(.+)$/m)?.[1].trim() ?? '';

/** What the link pass is shown: the page's subject and its paragraphs, numbered. */
export const linkPassPrompt = (raw) =>
  `Subject: ${titleOf(raw)}\n${paragraphsOf(raw).map((p, i) => `${i + 1}: ${p.text}`).join('\n')}`;

/**
 * Applies a link-pass answer to a compact page. Only the first plain occurrence of a
 * phrase is wrapped: never inside an existing link or the bold subject, never the page's
 * own subject, never a thing already linked elsewhere on the page.
 */
export function applyLinkPhrases(raw, answer, { maxPerParagraph = 4 } = {}) {
  const lines = raw.split('\n');
  const paras = paragraphsOf(raw);
  const subject = norm(titleOf(raw));
  const taken = new Set((raw.match(/\[\[(.+?)\]\]/g) ?? []).map((m) => norm(m.slice(2, -2))));
  let added = 0;
  let asked = 0;
  let missed = 0;
  for (const row of answer.split('\n')) {
    const m = row.trim().match(/^(\d+)\s*[:.)-]\s*(.*)$/);
    const para = m && paras[Number(m[1]) - 1];
    if (!para) continue;
    let text = lines[para.line].trim();
    let n = 0;
    for (const phrase of m[2].split('|').map((p) => p.trim().replace(/^\[\[|\]\]$/g, '')).filter(Boolean)) {
      asked++;
      const key = norm(phrase);
      if (!key || key === subject || taken.has(key) || n >= maxPerParagraph) continue; // declined by rule
      const found = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, 'u');
      const parts = text.split(KEEP_AS_IS);
      const at = parts.findIndex((segment, k) => k % 2 === 0 && found.test(segment));
      if (at < 0) {
        missed++; // the model named text that is not in this paragraph
        continue;
      }
      parts[at] = parts[at].replace(found, (hit) => `[[${hit}]]`);
      text = parts.join('');
      taken.add(key);
      added++;
      n++;
    }
    lines[para.line] = text;
  }
  return { text: lines.join('\n'), added, asked, missed };
}

/* -------------------------------------------------------------- expander */

export function expandCompact(raw, surfaceId = 'page') {
  const errors = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```'));
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
  let titled = false; // models sometimes use a single # for section headings too; only the first is the title
  for (const line of lines) {
    const isFact = line.startsWith('@ ');
    const isItem = /^-\s+\S/.test(line);
    if (!isFact) facts = null;
    if (!isItem) list = null;
    if (/^##\s+\S/.test(line)) add({ component: 'Heading', level: 2, text: line.replace(/^##\s+/, '') });
    else if (/^#\s+\S/.test(line)) {
      add({ component: 'Heading', level: titled ? 2 : 1, text: line.replace(/^#\s+/, '') });
      titled = true;
    }
    else if (isFact) {
      const [label, ...rest] = line.slice(2).split(':');
      const item = { label: label.trim(), value: rest.join(':').trim() };
      if (!item.value) errors.push(`fact without "Label: value": ${line.slice(0, 40)}`);
      (facts ??= add({ component: 'Facts', items: [] })).items.push(item);
    } else if (isItem) (list ??= add({ component: 'List', ordered: false, items: [] })).items.push(line.replace(/^-\s+/, ''));
    else if (/^>\s*\S/.test(line)) add({ component: 'Quote', text: line.replace(/^>\s*/, '') });
    else add({ component: 'Prose', text: line });
  }
  if (!comps.some((c) => c.component === 'Heading' && c.level === 2)) errors.push('no ## sections');

  const message = (components) => JSON.stringify({ version: '1.0', updateComponents: { surfaceId, components } });
  const envelope = [
    JSON.stringify({ version: '1.0', createSurface: { surfaceId, catalogId: 'latentspace' } }),
    message([{ id: 'root', component: 'Column', children: kids }]),
    ...comps.map((c) => message([c])),
  ].join('\n');
  return { envelope, errors };
}
