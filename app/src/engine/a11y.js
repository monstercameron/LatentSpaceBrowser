import { KEEP_AS_IS, phrasePattern, stem } from './compact.js';

// The optional third pass. After the page is written and linked, a small call reads it and returns four
// kinds of line, which the app applies as annotations. The model never retypes the page, so the pass can
// only add: a plain-language summary, abbreviations spelled out, phrases in other languages tagged so a
// screen reader switches voice, and a description of where each link goes.
//
// Annotations are stored beside the page (`page.a11y`) and applied when it is drawn, so they work on
// pages from both paths: HTML pages are converted into the same component tree first.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/[[\]{}|*`]/g, '').trim();

/** The page as the text the model reads: headings with "#", every other block on its own line, links as written. */
export function a11yDigest(surface) {
  const lines = [];
  const kids = surface.components.root?.children ?? [];
  for (const id of kids) {
    const c = surface.components[id];
    if (!c) continue;
    if (c.component === 'Heading') lines.push(`${'#'.repeat(c.level ?? 2)} ${c.text}`);
    else if (c.component === 'Prose' || c.component === 'Quote') lines.push(c.text);
    else if (c.component === 'List') lines.push(...c.items.map((i) => `- ${i}`));
    else if (c.component === 'Facts') lines.push(...c.items.map((i) => `${i.label}: ${i.value}`));
  }
  return lines.join('\n');
}

/** The model's reply as { summary, abbr: [{ term, expansion }], lang: [{ phrase, code }], links: [{ text, desc }] }. */
export function parseA11y(reply) {
  const out = { summary: '', abbr: [], lang: [], links: [] };
  for (const raw of String(reply).split('\n')) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    const m = line.match(/^(summary|abbr|lang|link)s?\s*:\s*(.+)$/i);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const body = m[2].trim();
    if (kind === 'summary') out.summary ||= clean(body);
    else if (kind === 'abbr') {
      const [term, ...rest] = body.split(/\s*=\s*/);
      if (clean(term) && clean(rest.join('=')) && clean(term).length <= 24) out.abbr.push({ term: clean(term), expansion: clean(rest.join('=')) });
    } else if (kind === 'lang') {
      const [phrase, code] = body.split(/\s*\|\s*/);
      if (clean(phrase) && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test((code ?? '').trim())) out.lang.push({ phrase: clean(phrase), code: code.trim() });
    } else if (kind === 'link') {
      const [text, ...rest] = body.split(/\s*=\s*/);
      if (clean(text) && clean(rest.join('='))) out.links.push({ text: clean(text), desc: clean(rest.join('=')) });
    }
  }
  return out;
}

/** The text slots of a surface, in reading order, as { get, set } so a replacement can be written back. */
function slotsOf(surface) {
  const slots = [];
  for (const id of surface.components.root?.children ?? []) {
    const c = surface.components[id];
    if (!c) continue;
    if (c.component === 'Prose' || c.component === 'Quote') slots.push({ get: () => c.text, set: (v) => (c.text = v) });
    else if (c.component === 'List') c.items.forEach((_, i) => slots.push({ get: () => c.items[i], set: (v) => (c.items[i] = v) }));
    else if (c.component === 'Facts') c.items.forEach((item) => slots.push({ get: () => item.value, set: (v) => (item.value = v) }));
  }
  return slots;
}

/** Wraps the first plain occurrence of `phrase` in `text` with `wrap(hit)`, or returns null. Never inside a link, bold or tag. */
function wrapFirst(text, phrase, wrap) {
  const parts = text.split(KEEP_AS_IS);
  for (const flags of ['u', 'iu']) {
    const found = phrasePattern(phrase, flags);
    const at = parts.findIndex((segment, k) => k % 2 === 0 && found.test(segment));
    if (at >= 0) {
      parts[at] = parts[at].replace(found, (hit) => wrap(hit));
      return parts.join('');
    }
  }
  return null;
}

/**
 * Applies annotations to a surface (a copy: the original is untouched). Abbreviations and foreign phrases
 * are tagged at their first mention, link descriptions are added to the links they describe, and the
 * summary becomes a block right after the title and key facts. Returns { surface, applied }.
 */
export function applyA11y(surface, a11y) {
  if (!a11y) return { surface, applied: { abbr: 0, lang: 0, links: 0, summary: false } };
  const copy = structuredClone(surface);
  const slots = slotsOf(copy);
  const applied = { abbr: 0, lang: 0, links: 0, summary: false };

  const tagFirst = (phrase, wrap) => {
    for (const slot of slots) {
      const next = wrapFirst(slot.get(), phrase, wrap);
      if (next !== null) {
        slot.set(next);
        return true;
      }
    }
    return false;
  };
  for (const { term, expansion } of a11y.abbr ?? []) if (tagFirst(term, (hit) => `{abbr|${hit}|${expansion}}`)) applied.abbr++;
  for (const { phrase, code } of a11y.lang ?? []) if (tagFirst(phrase, (hit) => `{lang|${hit}|${code}}`)) applied.lang++;

  // A link description goes on every link to that page: the link text or its target names it.
  const byKey = new Map((a11y.links ?? []).map((l) => [stem(l.text), l.desc]));
  for (const slot of slots) {
    const text = slot.get();
    const next = text.replace(/\[\[([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (whole, label, target, desc) => {
      const found = byKey.get(stem(label)) ?? byKey.get(stem(target || label));
      if (!found || desc) return whole;
      applied.links++;
      return `[[${label}|${target || label}|${found}]]`;
    });
    if (next !== text) slot.set(next);
  }

  if (a11y.summary) {
    const kids = copy.components.root.children;
    // right after the title and the key facts, before the first paragraph
    const leading = (id) => {
      const c = copy.components[id];
      return Boolean(c) && (c.component === 'Facts' || (c.component === 'Heading' && c.level === 1));
    };
    let at = 0;
    while (at < kids.length && leading(kids[at])) at++;
    copy.components['a11y-summary'] = { id: 'a11y-summary', component: 'Summary', text: a11y.summary };
    kids.splice(at, 0, 'a11y-summary');
    applied.summary = true;
  }
  return { surface: copy, applied };
}
