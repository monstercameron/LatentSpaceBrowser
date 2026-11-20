// Command-line smoke test for a Cerebras key and model. No dependencies.
//   node --env-file=.env index.js [model] [prompt]
// Reads APIKEY (or VITE_APIKEY) from the environment.

const apiKey = process.env.APIKEY || process.env.VITE_APIKEY;
const [model = 'gpt-oss-120b', prompt = 'Write a four-line poem about lighthouses.'] = process.argv.slice(2);

async function main() {
  if (!apiKey) throw new Error('Set APIKEY in .env (or the environment) first.');
  console.log(`Querying ${model}...`);

  const started = performance.now();
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Cerebras returned ${res.status}: ${await res.text()}`);

  let firstToken = 0;
  let usage = null;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const bytes of res.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!data || data === '[DONE]') continue;
      const chunk = JSON.parse(data);
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        firstToken ||= performance.now();
        process.stdout.write(text);
      }
      usage = chunk.usage ?? usage;
    }
  }

  const seconds = (performance.now() - started) / 1000;
  console.log('\n\n--- Stats ---');
  console.log(`Time to first token: ${((firstToken - started) / 1000).toFixed(2)}s`);
  console.log(`Total time: ${seconds.toFixed(2)}s`);
  if (usage) {
    console.log(`Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
    console.log(`Speed: ${(usage.completion_tokens / seconds).toFixed(0)} tokens/s`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
