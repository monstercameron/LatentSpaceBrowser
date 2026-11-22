import { useSyncExternalStore } from 'react';
import { translateCatalog, validateCatalog } from '../engine/translate.js';
import en from './en.js';
import { catalogKey, CUSTOM } from './languages.js';

// The app's own text, in the current language. `t('key', { name: value })` reads it; a missing key falls
// back to English, then to the key itself, so a gap in a translation shows English instead of a blank.

export const interpolate = (template, vars) =>
  String(template).replace(/\{(\w+)\}/g, (whole, name) => (vars && name in vars ? String(vars[name]) : whole));

export const translateWith = (strings, key, vars) => interpolate(strings[key] ?? en[key] ?? key, vars);

let strings = en;
let version = 0;
const listeners = new Set();
const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export const t = (key, vars) => translateWith(strings, key, vars);

/** Components call this so they redraw when the language (and so the strings) change. */
export function useT() {
  useSyncExternalStore((fn) => (listeners.add(fn), () => listeners.delete(fn)), () => version);
  return t;
}

// The ready-made catalogs are code-split, so only the language in use is downloaded.
const SHIPPED = {
  zh: () => import('./zh.json'),
  hi: () => import('./hi.json'),
  es: () => import('./es.json'),
  ar: () => import('./ar.json'),
};

const CACHE = 'latentspace_i18n_v1:';
const readCached = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE + key));
    return parsed && validateCatalog(en, parsed).missing.length === 0 ? parsed : null;
  } catch {
    return null;
  }
};
const writeCached = (key, catalog) => {
  try {
    localStorage.setItem(CACHE + key, JSON.stringify(catalog));
  } catch {
    // storage full or unavailable: the translation is done again next time
  }
};

/** Is this language's text available without asking the model? */
export const isReady = (language) => language.id === 'en' || language.id in SHIPPED || Boolean(readCached(catalogKey(language)));

/**
 * Makes `language` the one the app speaks. Shipped and cached catalogs are instant; a new custom language
 * is translated by the model (once, then cached). Resolves with what happened, never throws.
 */
export async function applyLanguage(language, { apiKey, modelId } = {}) {
  try {
    if (language.id === 'en') strings = en;
    else if (language.id in SHIPPED) strings = { ...en, ...(await SHIPPED[language.id]()).default };
    else {
      const key = catalogKey(language);
      let catalog = readCached(key);
      let cost = 0;
      if (!catalog) {
        if (language.id !== CUSTOM) throw new Error('unknown language');
        const result = await translateCatalog({ apiKey, modelId, language: language.name, source: en });
        catalog = result.strings;
        cost = result.cost;
        writeCached(key, catalog);
      }
      strings = { ...en, ...catalog };
      notify();
      return { ok: true, cost };
    }
    notify();
    return { ok: true, cost: 0 };
  } catch (error) {
    notify();
    return { ok: false, message: error.message };
  }
}
