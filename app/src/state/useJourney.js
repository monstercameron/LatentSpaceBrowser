import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { EMPTY, journeyReducer, subtreeIds } from './journey.js';
import { lensOf, readUrl, urlFor } from './topics.js';

// The browser's own history decides where the reader is. Every page gets a history entry carrying
// its node id, so the browser's Back and Forward buttons and the app's walk the same list. The
// journey tree holds what the browser cannot: the pages themselves, and how they branch.

const KEY = 'latentspace_journey_v2';
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const browserState = () => window.history.state ?? {};

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved && typeof saved.nodes === 'object' && Array.isArray(saved.order)) {
      return { nodes: saved.nodes, order: saved.order.filter((id) => saved.nodes[id]), currentId: null };
    }
  } catch {
    // unreadable or unavailable storage: start fresh
  }
  return EMPTY;
}

/** Where the browser is. A link opened from outside has no id yet, so it is given one. */
function whereBrowserIs() {
  let { id = null, n = 0 } = browserState();
  const fromUrl = readUrl(window.location.search);
  if (!id && fromUrl) {
    id = newId();
    window.history.replaceState({ id, n }, '');
  }
  return { id, n, node: fromUrl ? { topic: fromUrl.topic, lens: fromUrl.lens } : null };
}

// Read fresh on every mount. It stamps the browser's history entry, but only the first time: after
// that the entry has an id, so reading it again gives the same answer. (A cached copy went stale
// when the component remounted during development and overwrote the saved journey.)
function start() {
  window.history.scrollRestoration = 'manual'; // the app restores scroll itself
  const { id, n, node } = whereBrowserIs();
  return { state: journeyReducer(load(), { type: 'locate', id, node }), depth: n };
}

export function useJourney() {
  const [boot] = useState(start);
  const [state, dispatch] = useReducer(journeyReducer, boot.state);
  const [depth, setDepth] = useState(boot.depth);
  const [farthest, setFarthest] = useState(boot.depth); // how deep Back has not yet walked
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ nodes: state.nodes, order: state.order }));
    } catch {
      // over quota or unavailable: the journey then lives in memory only
    }
  }, [state]);

  // The browser's Back and Forward buttons land here, and so do the app's.
  useEffect(() => {
    const follow = () => {
      const { id, n, node } = whereBrowserIs();
      dispatch({ type: 'locate', id, node });
      setDepth(n);
    };
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, []);

  const stamp = useCallback((id, url) => {
    const n = (browserState().n ?? 0) + 1;
    window.history.pushState({ id, n }, '', url || window.location.pathname);
    setDepth(n);
    setFarthest(n);
  }, []);

  /** Opens a page after the current one. `fresh` is a search: no lens, a new branch. Returns its id. */
  const go = useCallback(
    ({ topic, kind = 'page', fresh = false, stops, lens, about = false }) => {
      const { nodes, currentId } = latest.current;
      const id = newId();
      const lensNow = kind === 'retro' ? [] : (lens ?? (fresh ? [] : lensOf(nodes, currentId)));
      stamp(id, urlFor({ kind, topic, lens: lensNow }));
      dispatch({ type: 'push', id, kind, topic, fresh, lens: lensNow, stops, about });
      return id;
    },
    [stamp],
  );

  /** Moves to a node that is already in the tree (the Trail), as a new history entry. */
  const jump = useCallback(
    (id) => {
      const node = latest.current.nodes[id];
      if (!node) return;
      stamp(id, urlFor(node));
      dispatch({ type: 'locate', id });
    },
    [stamp],
  );

  const home = useCallback(() => {
    stamp(null, '');
    dispatch({ type: 'locate', id: null });
  }, [stamp]);

  /** Deletes a page and what grew from it. If the reader was inside it, they move to the page it grew from, or home. */
  const remove = useCallback(
    (id) => {
      const { nodes, currentId } = latest.current;
      if (!nodes[id]) return;
      const inside = subtreeIds(latest.current, id).includes(currentId);
      const parentId = nodes[id].parentId;
      dispatch({ type: 'remove', id });
      if (!inside) return;
      if (parentId && nodes[parentId]) {
        stamp(parentId, urlFor(nodes[parentId]));
        dispatch({ type: 'locate', id: parentId });
      } else {
        stamp(null, '');
        dispatch({ type: 'locate', id: null });
      }
    },
    [stamp],
  );

  const fill = useCallback((id, page) => dispatch({ type: 'fill', id, page }), []);
  const translated = useCallback((id, key, variant) => dispatch({ type: 'translated', id, key, variant }), []);
  const rewrite = useCallback((id, lens) => {
    dispatch({ type: 'rewrite', id, lens });
    const node = latest.current.nodes[id];
    if (node && lens && id === latest.current.currentId) {
      window.history.replaceState({ ...browserState(), id }, '', urlFor({ ...node, lens }));
    }
  }, []);
  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    stamp(null, '');
  }, [stamp]);

  return {
    state,
    current: state.nodes[state.currentId] ?? null,
    go,
    jump,
    home,
    fill,
    remove,
    translated,
    rewrite,
    reset,
    back: useCallback(() => window.history.back(), []),
    forward: useCallback(() => window.history.forward(), []),
    canGoBack: depth > 0,
    canGoForward: depth < farthest,
  };
}
