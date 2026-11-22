import { cost, getModel } from './models.js';

const API_URL = 'https://api.cerebras.ai/v1/chat/completions';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const REASONS = {
  401: 'Cerebras rejected the API key.',
  403: 'This API key is not allowed to use that model.',
  404: 'That model is not available for this API key.',
  429: 'Rate limit reached. Wait a moment and try again.',
};

async function toError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.message ?? body?.error?.message ?? '';
  } catch {
    // no JSON body
  }
  const reason = REASONS[res.status] ?? `Cerebras returned an error (${res.status}).`;
  return new ApiError(detail ? `${reason} ${detail}` : reason, res.status);
}

async function* serverEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      yield JSON.parse(data);
    }
  }
}

/**
 * One streamed model call. Resolves with its text, how it ended, and what it used and cost.
 * `onText` receives the whole text so far each time it grows.
 */
export async function chat({ apiKey, modelId, messages, maxTokens, temperature = 0.7, signal, onText }) {
  if (!apiKey) throw new ApiError('Add your Cerebras API key in Settings to start exploring.', 401);
  const model = getModel(modelId);

  const started = performance.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.id,
        messages,
        stream: true,
        max_completion_tokens: maxTokens,
        temperature,
        reasoning_effort: model.effort,
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Cerebras sends no CORS headers on a rejected key, so the browser reports
    // that case exactly like a dropped connection.
    throw new ApiError('No answer from Cerebras. The connection dropped or the API key was rejected: check the key in Settings.', 0);
  }
  if (!res.ok) throw await toError(res);

  let text = '';
  let reasoning = '';
  let finish = null;
  let usage = null;
  let firstToken = 0;
  for await (const chunk of serverEvents(res)) {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.reasoning) reasoning += choice.delta.reasoning;
    if (choice?.delta?.content) {
      firstToken ||= performance.now();
      text += choice.delta.content;
      onText?.(text);
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }

  const ended = performance.now();
  const inTokens = usage?.prompt_tokens ?? 0;
  const outTokens = usage?.completion_tokens ?? 0;
  return {
    text,
    reasoning,
    finish,
    modelId: model.id,
    ttft: ((firstToken || ended) - started) / 1000,
    seconds: (ended - started) / 1000,
    inTokens,
    outTokens,
    cost: cost(model, inTokens, outTokens),
  };
}
