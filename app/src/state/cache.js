import { addSpend } from './spend.js';

// Every page is written through this cache, whether the reader asked for it or the app guessed
// (a hovered link). One write per key: asking again joins the write in flight or returns the
// finished page. A write that has started is never aborted: a page you left finishes into the
// cache, so Back is instant and nothing is paid for twice.

const MAX_ENTRIES = 60;
const entries = new Map();

function makeEntry(key, adopted) {
  const entry = {
    key,
    adopted, // false while only a prefetch has asked for it
    state: { draft: null, page: null, error: null, settled: false },
    listeners: new Set(),
  };
  entry.set = (patch) => {
    entry.state = { ...entry.state, ...patch };
    entry.listeners.forEach((fn) => fn(entry.state));
  };
  /** Calls `fn` now with where the write is, and again on every change. Returns the unsubscribe. */
  entry.subscribe = (fn) => {
    entry.listeners.add(fn);
    fn(entry.state);
    return () => entry.listeners.delete(fn);
  };
  return entry;
}

function evict() {
  for (const [key, entry] of entries) {
    if (entries.size <= MAX_ENTRIES) return;
    if (entry.state.settled) entries.delete(key);
  }
}

/** The write for `key`, started by `run(onEvent)` if there is none. `prefetch` marks a guess, not a request. */
export function ensure(key, run, { prefetch = false } = {}) {
  const found = entries.get(key);
  if (found) {
    if (!prefetch) found.adopted = true;
    return found;
  }
  const entry = makeEntry(key, !prefetch);
  entries.set(key, entry);
  evict();
  run((draft) => entry.set({ draft })).then(
    (page) => {
      addSpend(page.metrics.cost);
      entry.set({ page, settled: true });
    },
    (error) => {
      entries.delete(key); // so asking again tries again
      entry.set({ error, settled: true });
    },
  );
  return entry;
}

export const has = (key) => entries.has(key);

/** Drop a finished write, so the next ask writes the page again. */
export const forget = (key) => entries.delete(key);

/** What guessed pages that the reader never opened have cost so far. */
export function unusedPrefetchCost() {
  let usd = 0;
  for (const entry of entries.values()) if (!entry.adopted && entry.state.page) usd += entry.state.page.metrics.cost;
  return usd;
}
