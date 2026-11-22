import { useSyncExternalStore } from 'react';
import { DEFAULT_DEPTH, DEFAULT_LINK_MODEL, DEFAULT_MODEL, DEPTHS, MODELS } from '../engine/models.js';

// One small external store, so any component can read settings and any change reaches all of them.
const KEY = 'latentspace_settings_v2';
const LEGACY_KEY = 'cerebras_api_key'; // the first version kept the key under this name

export const DEFAULTS = {
  apiKey: '',
  model: DEFAULT_MODEL,
  linkModel: DEFAULT_LINK_MODEL,
  depth: DEFAULT_DEPTH, // short | standard | deep
  format: 'a2ui', // how pages are written and drawn: a2ui (compact lines, two passes) | html (raw HTML, one pass)
  text: 'medium', // small | medium | large
  mode: 'system', // light | dark | system
  prefetch: false, // start writing a link's page when it is hovered
  budget: 0, // stop spending at this many dollars for the session; 0 is no limit
};

const TEXT = ['small', 'medium', 'large'];
const MODES = ['light', 'dark', 'system'];

/** Anything stored that is not understood falls back to its default. */
export function normalize(raw = {}) {
  const ids = MODELS.map((m) => m.id);
  return {
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim().replace(/^Bearer\s+/i, '') : DEFAULTS.apiKey,
    model: ids.includes(raw.model) ? raw.model : DEFAULTS.model,
    linkModel: ids.includes(raw.linkModel) ? raw.linkModel : DEFAULTS.linkModel,
    // "long" was the old name of the deepest level
    depth: (raw.depth === 'long' ? 'deep' : raw.depth) in DEPTHS ? (raw.depth === 'long' ? 'deep' : raw.depth) : DEFAULTS.depth,
    format: raw.format === 'html' ? 'html' : 'a2ui',
    text: TEXT.includes(raw.text) ? raw.text : DEFAULTS.text,
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
    prefetch: raw.prefetch === true,
    budget: Number.isFinite(raw.budget) && raw.budget > 0 ? raw.budget : 0,
  };
}

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

function load() {
  try {
    const saved = JSON.parse(read(KEY));
    if (saved && typeof saved === 'object') return normalize(saved);
  } catch {
    // unreadable: use defaults
  }
  return normalize({ apiKey: read(LEGACY_KEY) ?? '' });
}

let current = load();
const listeners = new Set();

export const getSettings = () => current;

export function saveSettings(patch) {
  current = normalize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable: settings then last for the page only
  }
  listeners.forEach((fn) => fn());
}

/** The key the reader saved, or a developer's local .env key. The .env key never reaches a production build. */
export function getApiKey() {
  return current.apiKey || (import.meta.env?.DEV ? (import.meta.env.VITE_APIKEY ?? '') : '');
}

/** Settings as the engine wants them: the effective key included. */
export const engineSettings = () => ({ ...current, apiKey: getApiKey() });

export function useSettings() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSettings,
  );
}
