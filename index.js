require('dotenv').config();
const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const { performance } = require('perf_hooks');

const client = new Cerebras({
  apiKey: process.env.APIKEY,
});

async function main() {
  const model = 'llama-3.1-8b'; // Defaulting to a known model if the user's one is invalid, but I will try the user's first.
  // The user asked for 'gpt-oss-120b'. I will use that.
  const userModel = 'gpt-oss-120b'; 
  
  console.log(`Querying model: ${userModel}...`);

  try {
    const startTime = performance.now();
    let tokenCount = 0;
    let firstTokenTime = 0;

    const stream = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Write a poem about cars.' }],
      model: userModel,
      stream: true,
    });

    let finalUsage = null;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        if (tokenCount === 0) {
            firstTokenTime = performance.now();
            console.log(`TTFT (Time To First Token): ${((firstTokenTime - startTime) / 1000).toFixed(2)}s`);
            console.log(`-- Stream Started --`);
        }
        process.stdout.write(content);
        tokenCount++; // This counts chunks, not tokens
      }
      
      if (chunk.usage) {
          finalUsage = chunk.usage;
      }
    }

    const endTime = performance.now();
    const totalSeconds = (endTime - startTime) / 1000;
    const generationSeconds = (endTime - firstTokenTime) / 1000;
    
    // Use actual token count from usage if available, otherwise fallback to chunk count (which is inaccurate)
    const actualTokens = finalUsage ? finalUsage.completion_tokens : tokenCount;
    
    console.log('\n\n--- Stats ---');
    console.log(`Total tokens: ${actualTokens} ${finalUsage ? '(from usage)' : '(chunks)'}`);
    console.log(`Total time: ${totalSeconds.toFixed(2)}s`);
    console.log(`Streaming time: ${generationSeconds.toFixed(2)}s`);
    
    // Streaming TPS: Tokens generated during the streaming phase / time of streaming phase
    // We use actualTokens - 1 because the first token arrived at 'firstTokenTime' (start of interval)
    // and the rest arrived during 'generationSeconds'. 
    // However, for simplicity and standard reporting, we often just use actualTokens / generationSeconds.
    // Let's provide the simple metric as requested.
    if (generationSeconds > 0) {
        console.log(`Streaming TPS: ${(actualTokens / generationSeconds).toFixed(2)}`);
    }

  } catch (error) {
    console.error("Error querying API:", error);
    if (error.status === 404 || error.status === 400) {
        console.log("Tip: Check if the model name is correct. You might want to try 'llama3.1-8b' or 'llama3.1-70b'.");
    }
  }
}

main();
