// Inline markup in a page's text, parsed without React so it can be tested with node.
//   [[text]]  or  [[text|Page title]]   a link (the title is what the link opens)
//   [[text|https://example.com]]        a link out of the app (a target that is a web address)
//   **bold**   *italic*   `code`
// Text arrives half-written while a page streams, so an unfinished opener is hidden, not shown.
// Both paths speak this: the A2UI path's pages are written in it, and the HTML path's pages are
// converted into it (see ui/htmlSurface.js), so one renderer draws both.

const TOKEN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`/g;

export const isExternal = (target) => /^https?:\/\//i.test(target);

/** Text to [{ kind: 'text' | 'bold' | 'italic' | 'code' | 'link', text, target? }]. */
export function parseInline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'link', text: m[1], target: (m[2] ?? m[1]).trim() });
    else if (m[3] !== undefined) out.push({ kind: 'bold', text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'italic', text: m[4] });
    else out.push({ kind: 'code', text: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  // Link markup never reaches the screen. An opener whose closer has not arrived yet is dropped, so
  // "**" and "[[" do not flash while a page streams; a stray "]]" or a doubled "[[[[x]]]]" (which a
  // model can produce) loses its brackets instead of showing them.
  const clean = (s) => s.replace(/\[\[|\]\]/g, '');
  return out
    .map((t) => {
      if (t.kind === 'text') return { ...t, text: clean(t.text.replace(/\*\*|\[\[[^\]]*$|\[$/g, '')) };
      if (t.kind === 'link') return { ...t, text: clean(t.text), target: clean(t.target) };
      return t;
    })
    .filter((t) => t.text !== '');
}

/** A text split into words and the runs of space between them: "a  b" -> ["a", "  ", "b"]. */
export const splitWords = (text) => text.split(/(\s+)/).filter(Boolean);
