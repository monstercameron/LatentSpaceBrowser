import { MODELS, STYLES } from '../services/models.js';

// Storage keys are unchanged from earlier versions so saved settings carry over.
const KEYS = {
  apiKey: 'cerebras_api_key',
  model: 'cerebras_model',
  style: 'cerebras_style',
  dark: 'latent_browser_dark_mode',
  textSize: 'latent_text_size',
};

export const TEXT_SIZES = {
  small: { label: 'Small' },
  medium: { label: 'Medium' },
  large: { label: 'Large' },
};

const read = (key) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode, quota); settings then last for the page only.
  }
};

/** The key the user saved, or a developer's local .env key. The .env key never reaches a production build. */
export function getApiKey() {
  const saved = read(KEYS.apiKey).trim();
  if (saved) return saved;
  return import.meta.env.DEV ? (import.meta.env.VITE_APIKEY ?? '') : '';
}

export function getSettings() {
  const model = read(KEYS.model);
  const style = read(KEYS.style);
  return {
    apiKey: read(KEYS.apiKey),
    model: MODELS.some((m) => m.id === model) ? model : MODELS[0].id,
    style: style in STYLES ? style : 'elaborative',
    textSize: getTextSize(),
  };
}

export function getTextSize() {
  const size = read(KEYS.textSize);
  return size in TEXT_SIZES ? size : 'medium';
}

/** Article text size is a CSS variable switched by an attribute on <html> (see index.css). */
export const applyTextSize = (size) => {
  document.documentElement.dataset.text = size;
};

export function saveSettings({ apiKey, model, style, textSize }) {
  write(KEYS.apiKey, apiKey.trim().replace(/^Bearer\s+/i, ''));
  write(KEYS.model, model);
  write(KEYS.style, style);
  write(KEYS.textSize, textSize);
  applyTextSize(textSize);
}

export function getDark() {
  const saved = read(KEYS.dark);
  if (saved) return saved === 'true';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export const saveDark = (dark) => write(KEYS.dark, String(dark));

/** Earlier versions kept every article twice in localStorage; free that space. */
export function dropLegacyStorage() {
  try {
    localStorage.removeItem('latent_browser_history');
    localStorage.removeItem('latent_browser_last_journey');
  } catch {
    // nothing to free
  }
}
