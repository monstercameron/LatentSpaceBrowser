// The raw-HTML path: the model writes an HTML fragment with its own inline links, and the app
// sanitizes it. These are the pure parts (no DOM), so they can be tested with node.

const VOID_TAGS = new Set(['br', 'hr']);
const END_TAG_OPTIONAL = new Set(['p', 'li', 'td', 'th']); // HTML lets these be left unclosed

/** Drops a code fence the model sometimes wraps around the fragment. */
export function cleanHtmlReply(text) {
  return text
    .trim()
    .replace(/^```(?:html)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/**
 * True when a reply honours the contract: a fragment that opens with <h1> and ends inside the page.
 * A last paragraph left without its </p> is valid HTML and not a fault; text after the page has
 * closed (a sign-off) or a sentence that stops midway is.
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

/** How many links a page carries. */
export const countLinks = (html) => (html.match(/<a[\s>]/gi) ?? []).length;
