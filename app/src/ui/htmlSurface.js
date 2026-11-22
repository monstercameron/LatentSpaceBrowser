import DOMPurify from 'dompurify';
import { emptySurface } from '../a2ui/surface.js';

// The raw-HTML path. The model writes an HTML fragment with its own links; this turns it into the same
// A2UI component tree the compact path produces, so one renderer (the Astryx catalog) draws both, with
// the same type, links, key-facts card, contents list and animation. Nothing here asks the model for
// anything: the look is the app's, applied from outside the prompt, which costs no tokens.
//
// Model output is untrusted. DOMPurify keeps only plain document markup (no forms, images, styles or
// scripts), and the conversion then keeps only text and structure, so no markup reaches the page.
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
const space = (s) => s.replace(/\s+/g, ' ');

// Text carries the compact inline markup (see a2ui/inlineParse.js), so anything in the text that would
// be read as markup is made harmless first.
const plainText = (s) => space(s).replace(/\*/g, '∗').replace(/`/g, "'").replace(/\[{2,}|\]{2,}/g, '');

/** The inline markup of a node's content: **bold**, *italic*, `code`, [[links]]. */
function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += plainText(child.textContent);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') out += ' ';
    else if (tag === 'a') {
      const text = space(child.textContent).replace(/[|[\]*`]/g, ' ').trim();
      const href = child.getAttribute('href') ?? '';
      if (!text) continue;
      // A bare <a>Topic</a> opens the next page. A real address leaves the app.
      out += EXTERNAL.test(href) ? `[[${text}|${href.replace(/\|/g, '%7C').replace(/]/g, '%5D')}]]` : `[[${text}]]`;
    } else if (tag === 'b' || tag === 'strong') {
      const inner = inline(child).replace(/\*\*/g, '').trim();
      out += inner ? `**${inner}**` : '';
    } else if (tag === 'i' || tag === 'em') {
      const inner = inline(child).replace(/\*/g, '').trim();
      out += inner ? `*${inner}*` : '';
    } else if (tag === 'code') out += `\`${plainText(child.textContent)}\``;
    else out += inline(child);
  }
  return out;
}

/** A list's items, nested lists flattened into the same list. */
function listItems(list) {
  const items = [];
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    const copy = li.cloneNode(true);
    const nested = [...copy.querySelectorAll('ul, ol')];
    nested.forEach((n) => n.remove());
    const text = inline(copy).trim();
    if (text) items.push(text);
    nested.forEach((n) => items.push(...listItems(n)));
  }
  return items;
}

/** <aside> key facts: each <p><b>Label</b> value</p> (or <li>) becomes { label, value }. */
function factItems(aside) {
  const items = [];
  for (const row of aside.querySelectorAll('p, li')) {
    const copy = row.cloneNode(true);
    const label = copy.querySelector('b, strong');
    const name = label ? space(label.textContent).replace(/[:：]\s*$/, '').trim() : '';
    label?.remove();
    const value = inline(copy).trim().replace(/^[:：\-–—]\s*/, '');
    if (name || value) items.push({ label: name || '·', value: value || '' });
  }
  return items;
}

function tableOf(table) {
  const cells = (tr) => [...tr.children].filter((c) => c.tagName === 'TH' || c.tagName === 'TD').map((c) => inline(c).trim());
  const trs = [...table.querySelectorAll('tr')];
  const headRow = trs.find((tr) => tr.querySelector('th') && !tr.querySelector('td'));
  const rows = trs.filter((tr) => tr !== headRow).map(cells).filter((r) => r.length);
  return { headers: headRow ? cells(headRow) : [], rows };
}

/**
 * HTML to an A2UI surface: { id, components } with a `root` column, as the compact path builds.
 * Safe on half-written HTML: the parser closes what the model has not closed yet.
 */
export function htmlToSurface(html) {
  if (!html.trim()) return emptySurface();
  const holder = document.createElement('div');
  holder.append(DOMPurify.sanitize(html, CONFIG));

  const components = {};
  const kids = [];
  let n = 0;
  let titled = false; // only the first <h1> is the title
  const add = (component) => {
    const id = `c${++n}`;
    components[id] = { id, ...component };
    kids.push(id);
  };

  const visit = (node) => {
    if (node.nodeType === 3) {
      const text = plainText(node.textContent).trim();
      if (text) add({ component: 'Prose', text });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const text = () => inline(node).trim();
    if (tag === 'h1') {
      add({ component: 'Heading', level: titled ? 2 : 1, text: space(node.textContent).trim() });
      titled = true;
    } else if (tag === 'h2') add({ component: 'Heading', level: 2, text: space(node.textContent).trim() });
    else if (tag === 'h3' || tag === 'h4') add({ component: 'Heading', level: 3, text: space(node.textContent).trim() });
    else if (tag === 'p') {
      const t = text();
      if (t) add({ component: 'Prose', text: t });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = listItems(node);
      if (items.length) add({ component: 'List', ordered: tag === 'ol', items });
    } else if (tag === 'blockquote') {
      const t = text();
      if (t) add({ component: 'Quote', text: t });
    } else if (tag === 'aside') {
      const items = factItems(node);
      if (items.length) add({ component: 'Facts', items });
    } else if (tag === 'table') {
      const t = tableOf(node);
      if (t.rows.length) add({ component: 'Table', ...t });
    } else if (tag === 'pre') add({ component: 'Code', text: node.textContent.replace(/\s+$/, '') });
    else if (tag !== 'hr' && tag !== 'br') {
      const t = text(); // an inline element at the top level: keep its words as a paragraph
      if (t) add({ component: 'Prose', text: t });
    }
  };
  holder.childNodes.forEach(visit);

  components.root = { id: 'root', component: 'Column', children: kids };
  return { id: 'page', catalogId: 'latentspace', components };
}
