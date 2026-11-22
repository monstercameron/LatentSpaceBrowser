// The languages the app offers up front, and how any other language is described.
//
// A language does two jobs: it is the language pages are written in, and the language the app's own
// text is shown in. Five are offered as quick choices (the most spoken languages by total speakers,
// with Arabic included in the five so right-to-left layout is exercised). Any other language can be typed in:
// the model then supplies its code and native name, and translates the interface text on demand.
// Rankings differ between sources, so this is "five of the largest", not a claim of an exact order.

export const LANGUAGES = [
  { id: 'en', code: 'en', name: 'English', native: 'English', rtl: false },
  { id: 'zh', code: 'zh', name: 'Mandarin Chinese (Simplified)', native: '中文', rtl: false },
  { id: 'hi', code: 'hi', name: 'Hindi', native: 'हिन्दी', rtl: false },
  { id: 'es', code: 'es', name: 'Spanish', native: 'Español', rtl: false },
  { id: 'ar', code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
];

export const ENGLISH = LANGUAGES[0];
export const CUSTOM = 'custom';

// Languages written right to left, by primary subtag: used when a custom language's direction is unknown.
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ckb', 'ug', 'ku']);
export const isRtlCode = (code) => RTL.has(String(code ?? '').toLowerCase().split('-')[0]);

/** A BCP 47 tag the browser will accept as a `lang` attribute, or null. */
export function cleanCode(code) {
  const c = String(code ?? '').trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c) ? c : null;
}

/**
 * The language object for a setting. `id` is one of the five, or 'custom' with the description the model
 * supplied ({ name, native, code, rtl }). Anything unusable falls back to English.
 */
export function resolveLanguage(id, custom) {
  const known = LANGUAGES.find((l) => l.id === id);
  if (known) return known;
  if (id === CUSTOM && custom?.name) {
    const code = cleanCode(custom.code);
    return { id: CUSTOM, code, name: custom.name, native: custom.native || custom.name, rtl: custom.rtl ?? isRtlCode(code) };
  }
  return ENGLISH;
}

/** A stable key for caching a language's interface catalog. */
export const catalogKey = (language) => (language.id === CUSTOM ? `custom:${language.name.toLowerCase().trim()}` : language.id);
