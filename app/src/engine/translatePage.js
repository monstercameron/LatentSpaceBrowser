import { chat } from './cerebras.js';
import { keyFor } from './models.js';
import { describe } from './pipeline.js';
import { parseA11y } from './a11y.js';
import { expandCompact } from './compact.js';
import { cleanHtmlReply, wellFormed } from './html.js';
import { ApiError } from './cerebras.js';

// Switching language on a page that is already written. The reader keeps what they were reading: the same
// sentences, the same structure, the same links, only in another language. So this is a translation of the
// stored page, not a new page written from the topic. The result is kept beside the original (by language),
// so switching back, or forward again, costs nothing.

const COMPACT_RULES = `The page is in a compact line format. Keep every line's marker exactly as it is (#, ##, ###, @ Label: value, - , >) and keep the same lines in the same order. Translate the words after the marker. For "@ Label: value" lines translate both the label and the value, and keep the "@ " and the colon.`;
const HTML_RULES = `The page is an HTML fragment. Keep every tag and attribute exactly where it is and translate only the text between them. Do not add, remove or reorder elements.`;

const system = (language, format) => `You translate a page of an encyclopedia into ${language.name}.
Translate it faithfully, sentence by sentence: keep the same meaning, the same level of detail and the same tone. Do not summarise, shorten, explain, add or leave anything out. Write names the way ${language.name} readers write them.
${format === 'html' ? HTML_RULES : COMPACT_RULES}
Inline markup stays in place:
- [[text]] and [[text|Title]] and [[text|Title|description]] are links. Translate "text". "Title" is the page the link opens, so translate it too (to the way a ${language.name} encyclopedia would title it), and translate the description. A link to a web address ([[text|https://...]]) keeps its address.
- **bold**, *italic* and \`code\` keep their marks.
- {abbr|TERM|expansion}: keep TERM (translate it only if ${language.name} readers use a different abbreviation) and translate the expansion. {lang|phrase|code}: leave the phrase and the code as they are.
Reply with the translated page and nothing else: no commentary, no code fences.`;

const A11Y_SYSTEM = (language) => `You translate accessibility notes for an encyclopedia page into ${language.name}. Each line starts with summary:, abbr:, lang: or link:. Keep the line starters and the separators (" = " and " | ") exactly. Translate the summary sentence. In "abbr: TERM = expansion" keep TERM and translate the expansion. In "lang: phrase | code" change nothing. In "link: text = description" translate both sides: the text is the words of a link on the page, translated the way the page itself now says them. Reply with the lines only.`;

/** The annotations as the lines the accessibility pass writes, so they can be translated and read back the same way. */
export function a11yLines(a11y) {
  if (!a11y) return '';
  return [
    a11y.summary && `summary: ${a11y.summary}`,
    ...(a11y.abbr ?? []).map((a) => `abbr: ${a.term} = ${a.expansion}`),
    ...(a11y.lang ?? []).map((l) => `lang: ${l.phrase} | ${l.code}`),
    ...(a11y.links ?? []).map((l) => `link: ${l.text} = ${l.desc}`),
  ].filter(Boolean).join('\n');
}

const linkCount = (text) => (String(text).match(/\[\[|<a[\s>]/g) ?? []).length;

/**
 * Whether a translation can stand in for the page: it has the same shape (lines, or well-formed HTML) and kept
 * most of its links. The model rewrites freely, so it is checked, not trusted.
 */
export function checkTranslation(original, translated, format) {
  if (!translated.trim()) return 'the translation was empty';
  if (format === 'html') {
    if (!wellFormed(translated)) return 'the translated page was cut off or malformed';
  } else {
    const was = expandCompact(original);
    const now = expandCompact(translated);
    if (now.errors.length > was.errors.length) return 'the translated page lost its structure';
    const count = (text, re) => (text.match(re) ?? []).length;
    if (count(translated, /^## /gm) < count(original, /^## /gm)) return 'the translation dropped sections';
  }
  const had = linkCount(original);
  if (had > 0 && linkCount(translated) < had * 0.6) return 'the translation lost too many links';
  return null;
}

/**
 * Translates a finished page into `settings.lang`. `page` is the original (or any variant) with
 * { format, compact | html, a11y? }. Resolves with { text, a11y, lang, metrics } for the new language.
 */
export async function translatePage({ page, settings, signal }) {
  const language = settings.lang;
  const format = page.format;
  const source = format === 'html' ? page.html : page.compact;
  const budget = Math.min(16000, Math.max(1500, Math.ceil(source.length * 0.9)));

  const [body, notes] = await Promise.all([
    chat({
      apiKey: keyFor(settings, settings.model),
      modelId: settings.model,
      messages: [{ role: 'system', content: system(language, format) }, { role: 'user', content: source }],
      maxTokens: budget,
      temperature: 0.2,
      signal,
    }),
    page.a11y
      ? chat({
        apiKey: keyFor(settings, settings.linkModel),
        modelId: settings.linkModel,
        messages: [{ role: 'system', content: A11Y_SYSTEM(language) }, { role: 'user', content: a11yLines(page.a11y) }],
        maxTokens: 2400,
        temperature: 0.2,
        signal,
      })
      : null,
  ]);

  const text = format === 'html' ? cleanHtmlReply(body.text) : body.text.replace(/^```\w*\n?|\n?```$/g, '').trim();
  const problem = checkTranslation(source, text, format);
  if (problem) throw new ApiError(problem, 0, 'format');

  const runs = [describe('translate', body), ...(notes ? [describe('translate', notes)] : [])];
  const total = (key) => runs.reduce((n, r) => n + r[key], 0);
  return {
    text,
    a11y: notes ? parseA11y(notes.text) : null,
    lang: { code: language.code ?? null, rtl: language.rtl === true },
    metrics: { passes: runs, ready: runs[0].seconds, done: total('seconds'), ttft: runs[0].ttft, inTokens: total('inTokens'), outTokens: total('outTokens'), cost: total('cost') },
  };
}
