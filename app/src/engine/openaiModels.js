// Which OpenAI models this key can use, from OpenAI's own model list (GET /v1/models), so the reader can pick
// the newest ones as they appear instead of waiting for the app to know their names.
//
// The list says what exists, not what suits this app, so it is narrowed to text models that take the
// reasoning_effort setting (the GPT-5 line and later), with dated snapshots folded into their plain name.

const URL = 'https://api.openai.com/v1/models';
// Not for writing pages: speech, images, live audio, search-only, coding-only, and the pro tier (Responses API only).
const NOT_TEXT = /(-codex|-search|-live|-realtime|-audio|-image|-transcribe|-tts|-pro$|-pro-|-diarize|-translate|-whisper|^chat-latest)/;
const SNAPSHOT = /-\d{4}-\d{2}-\d{2}$/;

/** The major version of "gpt-6.1-terra" (6), or 0 when the id is not in the GPT-N line. */
export const versionOf = (id) => Number(/^gpt-(\d+)/.exec(id)?.[1] ?? 0);

/** Whether an id from the list is a model this app can write pages with. */
export const isUsable = (id) => versionOf(id) >= 5 && !NOT_TEXT.test(id) && !SNAPSHOT.test(id);

/** The usable models from a /v1/models reply, newest first: [{ id, created }]. */
export function pickModels(reply, limit = 8) {
  return (reply?.data ?? [])
    .filter((m) => typeof m?.id === 'string' && isUsable(m.id))
    .map((m) => ({ id: m.id, created: Number(m.created) || 0 }))
    .sort((a, b) => b.created - a.created)
    .slice(0, limit);
}

/** "gpt-6.1-terra" as "GPT 6.1 Terra". */
export const prettyName = (api) =>
  api
    .replace(/^gpt-/, 'GPT ')
    .split('-')
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/** Asks OpenAI which models the key can use. Resolves with [{ id, created }], newest first. */
export async function fetchOpenAiModels(apiKey, signal) {
  if (!apiKey) throw new Error('Add an OpenAI API key first.');
  let res;
  try {
    res = await fetch(URL, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('No answer from OpenAI: the connection dropped or the key was rejected.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `OpenAI returned an error (${res.status}).`);
  }
  return pickModels(await res.json());
}
