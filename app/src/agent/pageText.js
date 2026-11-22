// A page as plain text for an agent, and the links on it. Pure functions of a surface.

const LINK = /\[\[([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]]*))?\]\]/g;

/** Inline markup to plain text: links keep their words, formatting marks and tags go. */
export function plain(text) {
  return String(text ?? '')
    .replace(LINK, (_, label) => label)
    .replace(/\{(?:abbr|lang)\|([^|}]*)\|[^}]*\}/g, '$1')
    .replace(/⁠/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Every link in a text: { text, topic, url, description }. Internal links open a page (topic); external ones a site (url). */
export function linksIn(text) {
  const out = [];
  for (const [, label, target, desc] of String(text ?? '').matchAll(LINK)) {
    const external = /^https?:\/\//i.test(target ?? '');
    out.push({
      text: label.trim(),
      topic: external ? null : (target || label).trim(),
      url: external ? target.trim() : null,
      description: desc?.trim() || null,
    });
  }
  return out;
}

function eachText(surface) {
  const texts = [];
  for (const id of surface.components.root?.children ?? []) {
    const c = surface.components[id];
    if (!c) continue;
    if (c.component === 'Prose' || c.component === 'Quote') texts.push(c.text);
    else if (c.component === 'List') texts.push(...c.items);
    else if (c.component === 'Facts') texts.push(...c.items.map((i) => i.value));
  }
  return texts;
}

/** The distinct internal links of a page, in reading order. */
export function pageLinks(surface) {
  const seen = new Set();
  return eachText(surface)
    .flatMap(linksIn)
    .filter((l) => l.topic && !seen.has(l.topic.toLowerCase()) && seen.add(l.topic.toLowerCase()));
}

/** The page as Markdown. `section` (a heading's words, any case) limits it to one section and its sub-sections. */
export function pageMarkdown(surface, section) {
  const blocks = [];
  for (const id of surface.components.root?.children ?? []) {
    const c = surface.components[id];
    if (!c) continue;
    switch (c.component) {
      case 'Heading': blocks.push({ heading: c, text: `${'#'.repeat(c.level ?? 2)} ${plain(c.text)}` }); break;
      case 'Summary': blocks.push({ text: `> In short: ${plain(c.text)}` }); break;
      case 'Prose': blocks.push({ text: plain(c.text) }); break;
      case 'Quote': blocks.push({ text: `> ${plain(c.text)}` }); break;
      case 'List': blocks.push({ text: c.items.map((i, n) => `${c.ordered ? `${n + 1}.` : '-'} ${plain(i)}`).join('\n') }); break;
      case 'Facts': blocks.push({ text: c.items.map((i) => `- **${plain(i.label)}:** ${plain(i.value)}`).join('\n') }); break;
      case 'Table': blocks.push({ text: [c.headers, ...(c.rows ?? [])].filter(Boolean).map((r) => `| ${r.map(plain).join(' | ')} |`).join('\n') }); break;
      case 'Code': blocks.push({ text: `\`\`\`\n${c.text ?? c.code ?? ''}\n\`\`\`` }); break;
      default: break;
    }
  }
  if (!section) return blocks.map((b) => b.text).join('\n\n');
  const want = section.trim().toLowerCase();
  const start = blocks.findIndex((b) => b.heading && plain(b.heading.text).toLowerCase() === want);
  if (start < 0) return null;
  const level = blocks[start].heading.level ?? 2;
  let end = start + 1;
  while (end < blocks.length && !(blocks[end].heading && (blocks[end].heading.level ?? 2) <= level)) end++;
  return blocks.slice(start, end).map((b) => b.text).join('\n\n');
}

/** The section and sub-section headings, for choosing what to read. */
export const sectionsOf = (surface) =>
  (surface.components.root?.children ?? [])
    .map((id) => surface.components[id])
    .filter((c) => c?.component === 'Heading' && c.level >= 2)
    .map((c) => ({ level: c.level, title: plain(c.text) }));
