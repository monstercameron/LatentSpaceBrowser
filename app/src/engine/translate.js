import { chat } from './cerebras.js';

// Translating the app's own text into any language, and describing a language the reader typed in.
// Both ask the model, so a custom language needs an API key; the five quick choices ship ready-made
// catalogs and do not.

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s) => [...String(s).matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/** The first JSON object in a model reply, or null. Tolerates a code fence around it. */
export function parseJsonObject(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Checks a translated catalog against the English source. A translation is usable when every key is
 * there, nothing is empty, and every {placeholder} survived unchanged (a lost one would show a blank).
 */
export function validateCatalog(source, candidate) {
  const missing = [];
  const broken = [];
  for (const [key, text] of Object.entries(source)) {
    const got = candidate?.[key];
    if (typeof got !== 'string' || !got.trim()) missing.push(key);
    else if (placeholders(text).join() !== placeholders(got).join()) broken.push(key);
  }
  const extra = Object.keys(candidate ?? {}).filter((k) => !(k in source));
  return { ok: missing.length === 0 && broken.length === 0, missing, broken, extra };
}

/** Splits the catalog so each request stays small enough to answer in full. */
export function chunkEntries(entries, size = 45) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(Object.fromEntries(entries.slice(i, i + size)));
  return out;
}

const TRANSLATE_SYSTEM = (language) => `You translate the interface text of a web app into ${language}.
You get one JSON object of English strings (keys to text). Reply with one JSON object with exactly the same keys, each value translated into ${language}, and nothing else: no commentary, no code fence.
Keep every {placeholder} exactly as written, braces and word included. Keep the brand names LatentSpace, Cerebras, A2UI and HTML in Latin letters. Keep the typographic marks “ ” … and · where they read naturally. The strings are labels, buttons and short sentences, so translate them concisely and the way a native speaker of ${language} would say them in an app, not word for word.`;

/**
 * The English catalog translated into `language` (a name, in any language). Strings the model drops or
 * breaks fall back to English, and the translation is refused if too many do.
 */
export async function translateCatalog({ apiKey, modelId, language, source, signal }) {
  const parts = await Promise.all(
    chunkEntries(Object.entries(source)).map((part) =>
      chat({
        apiKey,
        modelId,
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM(language) },
          { role: 'user', content: JSON.stringify(part, null, 1) },
        ],
        maxTokens: 6000,
        temperature: 0.2,
        signal,
      }).then((run) => ({ run, json: parseJsonObject(run.text) })),
    ),
  );
  const candidate = Object.assign({}, ...parts.map((p) => p.json ?? {}));
  const check = validateCatalog(source, candidate);
  const bad = new Set([...check.missing, ...check.broken]);
  if (bad.size > Object.keys(source).length * 0.2) throw new Error(`the translation was incomplete (${bad.size} of ${Object.keys(source).length} strings)`);
  const strings = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, bad.has(k) ? v : candidate[k]]));
  return { strings, fellBack: [...bad], cost: parts.reduce((n, p) => n + p.run.cost, 0) };
}

const DESCRIBE_SYSTEM = `The user typed the name of a language, in any language or script. Reply with one JSON object and nothing else:
{"valid": true or false, "name": "the English name of the language", "native": "its name written in that language", "code": "its shortest valid BCP 47 language code, such as sw or pt-BR", "rtl": true or false}
"valid" is false if the text is not a real human language you can write fluently.`;

/** Describes a language the reader typed in: { name, native, code, rtl }, or throws if it is not one. */
export async function describeLanguage({ apiKey, modelId, text, signal }) {
  const run = await chat({
    apiKey,
    modelId,
    messages: [
      { role: 'system', content: DESCRIBE_SYSTEM },
      { role: 'user', content: text.trim().slice(0, 80) },
    ],
    maxTokens: 200,
    temperature: 0,
    signal,
  });
  const info = parseJsonObject(run.text);
  if (!info?.valid || !info.name) throw new Error('that does not look like a language the model can write');
  return { name: String(info.name), native: String(info.native || info.name), code: String(info.code ?? ''), rtl: info.rtl === true, cost: run.cost };
}
