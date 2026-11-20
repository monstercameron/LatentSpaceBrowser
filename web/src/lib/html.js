import DOMPurify from 'dompurify';
import { child } from './topics.js';

// Model output is untrusted. Only plain document markup survives: no forms,
// images, styles or scripts, so a crafted topic cannot render a phishing page.
const CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'b', 'strong', 'i', 'em',
    'blockquote', 'aside', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'code', 'pre', 'br', 'hr', 'sub', 'sup',
  ],
  ALLOWED_ATTR: ['href', 'colspan', 'rowspan'],
  RETURN_DOM_FRAGMENT: true,
};

const EXTERNAL = /^https?:\/\//i;
const MIN_SECTIONS_FOR_CONTENTS = 3;
let pageTopic = '';

// Bare <a> links become real links to the next page, so they work with the
// keyboard and with "open in new tab". External links open safely elsewhere.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'A') return;
  if (EXTERNAL.test(node.getAttribute('href') ?? '')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
    return;
  }
  const text = node.textContent.trim();
  if (!text) {
    node.removeAttribute('href');
    return;
  }
  const topic = child(pageTopic, text);
  node.setAttribute('href', `?topic=${encodeURIComponent(topic)}`);
  node.setAttribute('data-topic', topic);
});

const element = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

/**
 * Wraps the page's key-facts box in a side rail and adds a contents list made
 * from the page's own headings. Layout only: the model's words are not touched.
 */
function addRail(page) {
  const blocks = [...page.children];
  const facts = blocks.find((node) => node.tagName === 'ASIDE');
  const sections = blocks.filter((node) => node.tagName === 'H2' && node.textContent.trim());
  const wantsContents = sections.length >= MIN_SECTIONS_FOR_CONTENTS;
  if (!facts && !wantsContents) return;

  const rail = element('div', { className: 'rail' });
  if (facts) {
    facts.before(rail);
    rail.append(facts);
  } else {
    const title = blocks.find((node) => node.tagName === 'H1');
    if (title) title.after(rail);
    else page.prepend(rail);
  }

  if (wantsContents) {
    const items = sections.map((heading, i) => {
      heading.id = `section-${i + 1}`;
      return element('li', {}, [element('a', { href: `#${heading.id}`, textContent: heading.textContent.trim() })]);
    });
    const contents = element('nav', { className: 'toc' }, [
      element('p', { textContent: 'On this page' }),
      element('ol', {}, items),
    ]);
    contents.setAttribute('aria-label', 'On this page');
    rail.append(contents);
  }
}

/** Sanitizes a generated page, wires its links relative to `topic` and lays out its side rail. */
export function renderPage(html, topic = '', { rail = true } = {}) {
  pageTopic = topic;
  const page = DOMPurify.sanitize(html, CONFIG);
  if (rail) addRail(page);
  return element('div', {}, [page]).innerHTML;
}
