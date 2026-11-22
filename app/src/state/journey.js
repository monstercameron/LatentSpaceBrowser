import { lensOf } from './topics.js';

// The journey is a tree of pages. Going back and following a different link makes a branch.
// A node is { id, kind: 'page' | 'retro', topic, lens, parentId, at, page?, stops? }. `page` is
// what the model wrote; a node without one has not been written yet (or its text was dropped).

export const MAX_WRITTEN = 30; // pages whose text is kept; older nodes stay in the tree without it
export const MAX_NODES = 200;
export const EMPTY = { nodes: {}, order: [], currentId: null };

const withPrune = (state) => {
  let { nodes, order } = state;
  if (order.length > MAX_NODES) {
    const dropped = order.slice(0, order.length - MAX_NODES);
    nodes = Object.fromEntries(Object.entries(nodes).filter(([id]) => !dropped.includes(id)));
    order = order.slice(-MAX_NODES);
  }
  const written = order.filter((id) => nodes[id]?.page);
  if (written.length > MAX_WRITTEN) {
    const forget = new Set(written.slice(0, written.length - MAX_WRITTEN));
    nodes = Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, forget.has(id) ? { ...node, page: undefined } : node]));
  }
  return { ...state, nodes, order };
};

export function journeyReducer(state, action) {
  switch (action.type) {
    // A new page. `fresh` starts a new branch from nowhere with no lens: a search, not a link.
    case 'push': {
      const { id, kind = 'page', topic, fresh = false, lens, stops, about = false } = action;
      const parentId = fresh || kind === 'retro' ? null : state.currentId;
      const node = {
        id,
        kind,
        topic,
        parentId,
        lens: kind === 'retro' ? [] : (lens ?? (fresh ? [] : lensOf(state.nodes, parentId))),
        at: Date.now(),
        ...(stops ? { stops } : {}),
        ...(about ? { about: true } : {}), // the page about the app itself, whatever its title is in this language
      };
      return withPrune({ ...state, nodes: { ...state.nodes, [id]: node }, order: [...state.order, id], currentId: id });
    }
    // The model finished a page. A page that has left the tree is ignored.
    case 'fill':
      if (!state.nodes[action.id]) return state;
      return withPrune({ ...state, nodes: { ...state.nodes, [action.id]: { ...state.nodes[action.id], page: action.page } } });
    // A finished page, translated: kept beside the original under its language, so switching back is free.
    case 'translated': {
      const node = state.nodes[action.id];
      if (!node?.page) return state;
      const page = { ...node.page, translations: { ...node.page.translations, [action.key]: action.variant } };
      return { ...state, nodes: { ...state.nodes, [action.id]: { ...node, page } } };
    }
    // Write this page again, optionally through a different lens.
    case 'rewrite': {
      const node = state.nodes[action.id];
      if (!node) return state;
      return { ...state, nodes: { ...state.nodes, [action.id]: { ...node, lens: action.lens ?? node.lens, page: undefined } } };
    }
    // The browser is now on the history entry with this id (or on none: the launchpad).
    case 'locate': {
      if (!action.id) return { ...state, currentId: null };
      if (state.nodes[action.id]) return { ...state, currentId: action.id };
      if (!action.node) return { ...state, currentId: null };
      // A page this tab no longer holds, or one opened from outside: it becomes a branch of its own.
      const node = { kind: 'page', parentId: null, lens: [], at: Date.now(), ...action.node, id: action.id };
      return withPrune({ ...state, nodes: { ...state.nodes, [action.id]: node }, order: [...state.order, action.id], currentId: action.id });
    }
    case 'reset':
      return EMPTY;
    default:
      return state;
  }
}

/** Ids from the root of its branch down to `id`. */
export function pathTo(nodes, id) {
  const path = [];
  const seen = new Set();
  for (let at = id; at && nodes[at] && !seen.has(at); at = nodes[at].parentId) {
    seen.add(at);
    path.unshift(at);
  }
  return path;
}

/** The topics a retrospective would cover: the pages on the way to `id`, with retrospectives left out. */
export const stopsTo = (nodes, id) => pathTo(nodes, id).map((nid) => nodes[nid]).filter((n) => n.kind === 'page').map((n) => n.topic);

/** The tree flattened for display: [{ node, depth }], each branch in the order it was started. */
export function treeRows(state) {
  const kids = {};
  const roots = [];
  for (const id of state.order) {
    const node = state.nodes[id];
    if (!node) continue;
    if (node.parentId && state.nodes[node.parentId]) (kids[node.parentId] ??= []).push(id);
    else roots.push(id);
  }
  const rows = [];
  const walk = (id, depth) => {
    rows.push({ node: state.nodes[id], depth, siblings: kids[state.nodes[id].parentId]?.length ?? roots.length });
    for (const childId of kids[id] ?? []) walk(childId, depth + 1);
  };
  roots.forEach((id) => walk(id, 0));
  return rows;
}
