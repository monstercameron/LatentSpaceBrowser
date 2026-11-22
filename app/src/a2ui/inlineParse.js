// Inline markup in a page's text, parsed without React so it can be tested with node.
//   [[text]]  or  [[text|Page title]]   a link (the title is what the link opens)
//   [[text|https://example.com]]        a link out of the app (a target that is a web address)
//   **bold**   *italic*   `code`
// Text arrives half-written while a page streams, so an unfinished opener is hidden, not shown.
// Both paths speak this: the A2UI path's pages are written in it, and the HTML path's pages are
// converted into it (see ui/htmlSurface.js), so one renderer draws both.

//   [[text|Page title|a description]]   a link with a description of where it goes (the accessibility pass)
//   {abbr|NATO|North Atlantic Treaty Organization}   an abbreviation and what it stands for
//   {lang|sola fide|la}                 a phrase in another language, with its language code
const TOKEN = /\[\[([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]]*))?\]\]|\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\{abbr\|([^|}]+)\|([^}]+)\}|\{lang\|([^|}]+)\|([^}]+)\}/g;

export const isExternal = (target) => /^https?:\/\//i.test(target);

/** Text to [{ kind: 'text' | 'bold' | 'italic' | 'code' | 'link' | 'abbr' | 'lang', text, target?, desc?, expansion?, code? }]. */
export function parseInline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'link', text: m[1], target: (m[2] || m[1]).trim(), ...(m[3]?.trim() ? { desc: m[3].trim() } : {}) });
    else if (m[4] !== undefined) out.push({ kind: 'bold', text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'italic', text: m[5] });
    else if (m[6] !== undefined) out.push({ kind: 'code', text: m[6] });
    else if (m[7] !== undefined) out.push({ kind: 'abbr', text: m[7], expansion: m[8].trim() });
    else out.push({ kind: 'lang', text: m[9], code: m[10].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  // Link markup never reaches the screen. An opener whose closer has not arrived yet is dropped, so
  // "**" and "[[" do not flash while a page streams; a stray "]]" or a doubled "[[[[x]]]]" (which a
  // model can produce) loses its brackets instead of showing them.
  const clean = (s) => s.replace(/\[\[|\]\]/g, '');
  return out
    .map((t) => {
      if (t.kind === 'text') return { ...t, text: clean(t.text.replace(/\*\*|\[\[[^\]]*$|\[$|\{(?:abbr|lang)\|[^}]*$/g, '')) };
      if (t.kind === 'link') return { ...t, text: clean(t.text), target: clean(t.target) };
      return t;
    })
    .filter((t) => t.text !== '');
}

// Scripts written without spaces between words: Han, Hiragana, Katakana, Thai, Lao, Burmese, Khmer.
const NO_SPACES = /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-໿က-႟ក-៿]/;
let segmenter;

/**
 * A text split into words and the runs of space between them: "a  b" -> ["a", "  ", "b"]. Where there are
 * no spaces to split on, the browser's word segmenter finds the words (and without it, each character is
 * one), so a sentence in Chinese still arrives, wraps and animates a word at a time.
 */
export function splitWords(text) {
  if (!NO_SPACES.test(text)) return text.split(/(\s+)/).filter(Boolean);
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  const pieces = segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : Array.from(text);
  const out = [];
  for (const piece of pieces) {
    const last = out.at(-1);
    if (/^\s+$/.test(piece) && last !== undefined && /^\s+$/.test(last)) out[out.length - 1] = last + piece;
    else out.push(piece);
  }
  return out;
}
