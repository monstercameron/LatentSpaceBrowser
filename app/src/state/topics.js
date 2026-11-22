// A page is reached by a path. The path is the page's lens: what it is written "as it relates to".
// The lens is kept as a list, shown above the page, and carried in the URL so a shared link
// writes the same kind of page.

export const SEP = ' › ';
export const MAX_LENS = 4;

/** The topics of the pages that led to `parentId`, oldest first, ending with the parent itself. */
export function lensOf(nodes, parentId, max = MAX_LENS) {
  const topics = [];
  const seen = new Set();
  for (let id = parentId; id && nodes[id] && !seen.has(id); id = nodes[id].parentId) {
    seen.add(id);
    if (nodes[id].kind === 'page') topics.unshift(nodes[id].topic);
  }
  return topics.slice(-max);
}

export function urlFor(node) {
  if (!node || node.kind !== 'page') return '';
  const params = new URLSearchParams({ topic: node.topic });
  for (const via of node.lens ?? []) params.append('via', via);
  return `?${params}`;
}

/** { topic, lens } from a query string, or null when it names no topic. */
export function readUrl(search) {
  const params = new URLSearchParams(search);
  const topic = params.get('topic')?.trim();
  if (!topic) return null;
  return { topic, lens: params.getAll('via').map((v) => v.trim()).filter(Boolean).slice(-MAX_LENS) };
}

/**
 * Cache identity for a page: the same topic through a different lens, model or path (A2UI or HTML)
 * is a different page. The link model only matters to the A2UI path, which is the one that uses it.
 */
export const pageKey = ({ topic, lens = [] }, settings) =>
  [settings.format, settings.model, settings.format === 'html' ? '' : settings.linkModel, settings.depth, lens.join('>'), topic].join('|');
