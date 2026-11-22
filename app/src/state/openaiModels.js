import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { fetchOpenAiModels } from '../engine/openaiModels.js';

// The models OpenAI says this key can use, kept for a day so Settings does not ask every time it opens.
const KEY = 'latentspace_openai_models_v1';
const MAX_AGE = 24 * 60 * 60 * 1000;

const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && Array.isArray(saved.models) ? saved : null;
  } catch {
    return null;
  }
};
let cached = read(); // { models: [{ id, created }], at }
const listeners = new Set();

function store(models) {
  cached = { models, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // storage unavailable: the list lasts for the page only
  }
  listeners.forEach((fn) => fn());
}

/** The models available to the OpenAI key, newest first, with a refresh. Fetches on its own when there is a key and no fresh list. */
export function useOpenAiModels(apiKey) {
  const saved = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => cached);
  const [state, setState] = useState({ busy: false, error: null });

  const refresh = useCallback(async () => {
    if (!apiKey) return;
    setState({ busy: true, error: null });
    try {
      store(await fetchOpenAiModels(apiKey));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error: error.message });
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && (!saved || Date.now() - saved.at > MAX_AGE)) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the key changes; `saved` is read once
  }, [apiKey]);

  return { models: apiKey ? (saved?.models ?? []) : [], ...state, refresh };
}
