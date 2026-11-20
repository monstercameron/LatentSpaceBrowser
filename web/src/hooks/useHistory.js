import { useCallback, useEffect, useReducer, useState } from 'react';

const KEY = 'latent_history_v2';
const MAX_ENTRIES = 30;
const EMPTY = { entries: [], index: -1 };

/*
 * The browser's own history decides where the reader is. Every page gets a
 * browser history entry carrying that page's id, so the browser's Back and
 * Forward buttons and the app's walk the same list. This reducer holds what
 * the browser cannot: the pages themselves.
 *
 * An entry is { id, topic } for an article or { id, home: true, stops } for a
 * home page that ends a journey. It gains `html` once the model has written
 * it. index -1 is the bare home page the app first opened on.
 */
export function historyReducer(state, action) {
  switch (action.type) {
    // A new page. Forward history is dropped, as the browser drops its own.
    case 'push': {
      const entries = [...state.entries.slice(0, state.index + 1), action.entry].slice(-MAX_ENTRIES);
      return { entries, index: entries.length - 1 };
    }
    // The model finished a page. A page that has left history is ignored.
    case 'fill': {
      if (!state.entries.some((entry) => entry.id === action.id)) return state;
      return {
        ...state,
        entries: state.entries.map((entry) => (entry.id === action.id ? { ...entry, ...action.page } : entry)),
      };
    }
    // The browser is now on the history entry with this id.
    case 'locate': {
      const index = state.entries.findIndex((entry) => entry.id === action.id);
      if (index >= 0) return { ...state, index };
      if (!action.id) return { ...state, index: -1 };
      // A page this tab no longer holds (dropped for age, or storage was cleared): it is written again.
      const entry = action.topic ? { id: action.id, topic: action.topic } : { id: action.id, home: true };
      return { entries: [entry], index: 0 };
    }
    default:
      return state;
  }
}

/** The pages walked since the reader last went home, up to where they are now. */
export function journeyOf({ entries, index }) {
  const walked = entries.slice(0, index + 1);
  return walked.slice(walked.findLastIndex((entry) => entry.home) + 1);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const browserState = () => window.history.state ?? {};
const urlTopic = () => new URLSearchParams(window.location.search).get('topic')?.trim() ?? '';
const urlFor = (entry) => (entry.topic ? `?topic=${encodeURIComponent(entry.topic)}` : window.location.pathname);

// A journey belongs to its tab: sessionStorage survives a reload, keeps tabs
// from overwriting each other, and is freed when the tab closes.
function load() {
  try {
    sessionStorage.removeItem('latent_history'); // the format before pages had ids
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (Array.isArray(saved?.entries) && saved.entries.length > 0) {
      const index = Number.isInteger(saved.index) ? saved.index : -1;
      return { entries: saved.entries, index: Math.min(Math.max(index, -1), saved.entries.length - 1) };
    }
  } catch {
    // unreadable or unavailable storage: start fresh
  }
  return EMPTY;
}

/** What the reducer should be told about the browser's current history entry. */
function whereBrowserIs() {
  let { id } = browserState();
  const { n = 0 } = browserState();
  const topic = urlTopic();
  // A link opened from outside (?topic=...) has no id yet: give its entry one.
  const arrived = !id && Boolean(topic);
  if (arrived) {
    id = newId();
    window.history.replaceState({ id, n }, '');
  }
  return { id, n, topic, arrived };
}

// Worked out once per page load, because it stamps the browser's history entry.
let boot = null;
function start() {
  if (!boot) {
    window.history.scrollRestoration = 'manual'; // the app restores scroll itself
    const { id, n, topic, arrived } = whereBrowserIs();
    const saved = load();
    const state = arrived
      ? historyReducer(saved, { type: 'push', entry: { id, topic } })
      : historyReducer(saved, { type: 'locate', id, topic });
    boot = { state, depth: n };
  }
  return boot;
}

export function useHistory() {
  const [state, dispatch] = useReducer(historyReducer, undefined, () => start().state);
  // How many of this app's pages lie behind the reader in the browser's history.
  const [depth, setDepth] = useState(() => start().depth);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // over quota or unavailable: history then lives in memory only
    }
  }, [state]);

  // The browser's Back and Forward buttons land here, and so do the app's.
  useEffect(() => {
    const follow = () => {
      const { id, n, topic, arrived } = whereBrowserIs();
      dispatch(arrived ? { type: 'push', entry: { id, topic } } : { type: 'locate', id, topic });
      setDepth(n);
    };
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, []);

  /** Adds a page after the current one and moves the browser to it. Returns its id. */
  const push = useCallback((page) => {
    const entry = { ...page, id: newId() };
    const n = (browserState().n ?? 0) + 1;
    window.history.pushState({ id: entry.id, n }, '', urlFor(entry));
    dispatch({ type: 'push', entry });
    setDepth(n);
    return entry.id;
  }, []);

  const fill = useCallback((id, page) => dispatch({ type: 'fill', id, page }), []);
  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);

  return {
    entries: state.entries,
    current: state.entries[state.index] ?? null,
    journey: journeyOf(state),
    canGoBack: depth > 0,
    canGoForward: state.index < state.entries.length - 1,
    push,
    fill,
    back,
    forward,
  };
}
