import Cerebras from '@cerebras/cerebras_cloud_sdk';

// Initialize the client
// Note: In a real production app, you'd want to proxy this through a backend to hide the key.
// For this demo, we assume the key is available in the environment or hardcoded for local use.
// Since Vite exposes env vars prefixed with VITE_, we should check that too if we were using .env files.
// However, we are reusing the node process.env from the previous context if possible, 
// but in the browser, we need to rely on Vite's import.meta.env or a hardcoded key for the demo if not set up.
// For now, we'll assume the user might need to input it or it's hardcoded for the "demo" feel.
// We will try to use the one from the node script if we can, but browser can't access process.env directly like that.
// Let's use a placeholder or expect the user to provide it in the UI if it fails.
// Actually, for this specific request, I will use the key I saw earlier in the .env file 
// but I should be careful. The user said "not api key is in .env". 
// Vite exposes env vars prefixed with VITE_ by default, but we can also access others if configured.
// However, since we can't easily change the .env file prefix right now without editing it, 
// and the user asked to grab it from .env where it is named APIKEY.
// Vite by default only exposes VITE_ prefixed variables to the client.
// To fix this properly without changing .env, we can use the define option in vite.config.js or just hardcode for this session as a fallback
// but let's try to do it the "right" way by updating the .env file to have a VITE_ prefix or updating vite config to expose it.
// Actually, the easiest way for the user is if I just update the .env file to have VITE_APIKEY as well.
// But I'll try to read it as is. If it fails, I will fallback to the hardcoded one which matches the file.

const API_KEY = import.meta.env.VITE_APIKEY || ''; 

function getClient() {
  const storedKey = localStorage.getItem('cerebras_api_key');
  const apiKey = storedKey ? storedKey.trim() : API_KEY;
  
  if (!apiKey) {
    throw new Error("No API key found. Please click 'BYOK' to enter your key.");
  }

  return new Cerebras({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true 
  });
}

function getModel() {
  return localStorage.getItem('cerebras_model') || 'gpt-oss-120b';
}

const MODEL_PRICING = {
  'zai-glm-4.6': { input: 2.25, output: 2.75 },
  'gpt-oss-120b': { input: 0.35, output: 0.75 },
  'llama3.1-8b': { input: 0.10, output: 0.10 },
  'llama-3.3-70b': { input: 0.85, output: 1.20 },
  'qwen-3-32b': { input: 0.40, output: 0.80 },
  'qwen-3-235b-a22b-instruct-2507': { input: 0.60, output: 1.20 }
};

function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return (inputCost + outputCost).toFixed(6);
}

function cleanAiResponse(content) {
  // 1. Try to find content inside ```html ... ```
  const htmlBlockMatch = content.match(/```html([\s\S]*?)```/i);
  if (htmlBlockMatch) {
    return htmlBlockMatch[1].trim();
  }
  
  // 2. Try to find content inside generic ``` ... ```
  const genericBlockMatch = content.match(/```([\s\S]*?)```/i);
  if (genericBlockMatch) {
    return genericBlockMatch[1].trim();
  }

  // 3. Fallback: strip start/end markers if they exist at the boundaries
  return content
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

const BASE_SYSTEM_PROMPT = `
You are the engine of "LatentSpace", a recursive encyclopedia. 
Your goal is to generate a Wikipedia-style article in valid HTML format based on the user's prompt (topic).

**Hyperlink Strategy (The Context Chain):**
- **CRITICAL:** You must include hyperlinks (<a href="#" data-prompt="..." class="text-blue-600 hover:underline font-medium transition-colors">Link Text</a>) for related concepts.
- **Contextual Data-Prompt:** The \`data-prompt\` attribute MUST preserve the "Context Chain" of the journey.
  - Format: \`Previous Context > Current Topic > New Concept\`
  - Use " > " (chevrons) as the separator.
  - Example: If the user is on "Apple > Macintosh", and you link "GUI", the data-prompt must be "Apple > Macintosh > GUI".
  - This ensures that when the user clicks, the next generation knows exactly how they arrived there.
- **Link Density:** Hyperlink aggressively. Every proper noun, technical term, or distinct concept should be a portal to a new page.
- **MANDATORY LINKING:** You MUST wrap EVERY significant proper noun, technical term, entity, or concept in a link. Do not leave interesting terms as plain text. If it can be a page, link it.
- **External Links:** If you reference a real-world website, source, or tool that exists outside the Latent Space (e.g., "GitHub", "OpenAI", "Wikipedia"), use a standard anchor tag: <a href="https://..." target="_blank" class="text-blue-600 hover:underline external-link">Link Text</a>.

**Tone:**
- Encyclopedic, authoritative, and exhaustive.
- If the topic is abstract, treat it with the seriousness of a physical phenomenon.
`;

const STYLE_INSTRUCTIONS = {
  short: `
**Content Requirements:**
1. **Length:** Concise and punchy (aim for 2,000 - 4,000 tokens). Focus on the core essence.
2. **Structure:**
   - A main title (h1) with class "text-3xl font-serif font-bold mb-4 border-b border-gray-300 pb-2".
   - Short, crisp paragraphs (p) with class "mb-4 leading-relaxed text-gray-800".
   - Section headings (h2) with class "text-xl font-serif font-bold mt-6 mb-3".
   - Lists (ul/ol) with class "list-disc pl-6 mb-4 space-y-1".
3. **Formatting:** Return ONLY the HTML content for the article body. Do NOT wrap in <html>, <head>, or <body> tags.
`,
  elaborative: `
**Content Requirements:**
1. **Length & Depth:** HIGHLY DETAILED, LONG-FORM (aim for 7,000 - 12,000 tokens). Do not summarize. Go deep into history, technical mechanisms, controversies, theoretical implications, and related fields.
2. **Structure:**
   - A main title (h1) with class "text-4xl font-serif font-bold mb-6 border-b-2 border-gray-800 pb-4".
   - An optional infobox (div) floated to the right with class "float-right ml-8 mb-8 w-80 bg-gray-50 border border-gray-200 p-6 text-sm hidden lg:block shadow-sm rounded".
   - Long, detailed paragraphs (p) with class "mb-6 leading-loose text-lg text-gray-800 font-light".
   - Section headings (h2) with class "text-3xl font-serif font-bold mt-12 mb-6 border-b border-gray-300 pb-2".
   - Sub-headings (h3) with class "text-2xl font-serif font-semibold mt-8 mb-4 text-gray-700".
   - Lists (ul/ol) with class "list-disc pl-8 mb-6 space-y-3 text-lg".
3. **Formatting:** Return ONLY the HTML content for the article body. Do NOT wrap in <html>, <head>, or <body> tags.
`
};

export async function generateArticle(topic, history = [], style = 'elaborative') {
  try {
    const client = getClient();
    
    // Construct the prompt with history context
    let prompt = `Generate a comprehensive article about: ${topic}`;
    
    // If the topic itself doesn't look like a chain, and we have history, append it for context
    // But if the topic IS a chain (from a link click), we trust it.
    const isChain = topic.includes(' > ');
    if (!isChain && history.length > 0) {
       const contextChain = history.join(' > ');
       prompt += `\n\nContext Chain: ${contextChain} > ${topic}`;
       prompt += `\n(Note: The user arrived here via this path. Ensure the content reflects this specific context.)`;
    } else if (isChain) {
       prompt += `\n\n(Note: This is a specific path in the latent space. Focus on the final concept in the context of the preceding chain.)`;
    }

    if (topic === "About LatentSpace") {
      prompt = `
        Generate a technical "About" page for "LatentSpace" as if it were an encyclopedia article about the software itself.
        
        **Key Technical Details to Include:**
        - **Concept:** A recursive, generative encyclopedia where every article is hallucinated on the fly by an AI. It explores the "latent space" of the model.
        - **Architecture:** Built with React and Vite for the frontend.
        - **AI Engine:** Powered by the Cerebras Cloud SDK for ultra-fast inference.
        - **State Management:** Uses a custom 'useHistory' hook to manage the navigation stack (push, pop, journey tracking).
        - **Persistence:** Uses LocalStorage to save API keys, model selection, dark mode preference, and history.
        - **Key Features:**
          - **Latent Links:** Hyperlinks are generated with context (data-prompt) to guide the next generation, creating a coherent browsing path.
          - **Journey Retrospective:** A visual summary of the user's browsing path generated by a "Cartographer" persona.
          - **BYOK (Bring Your Own Key):** Client-side only architecture where the user provides their own Cerebras API key.
          - **Reasoning Traces:** Visualizes the model's internal reasoning process (e.g., <think> tags) if available.
          - **Dark Mode:** Global dark mode support with CSS overrides for generated content.
        
        Treat "LatentSpace" as a significant software project and write about it in the neutral, informative tone of the encyclopedia.
      `;
    }

    const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.elaborative}`;

    const startTime = performance.now();
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      model: getModel(),
      stream: false, 
      max_tokens: 8192, // Explicitly allow for long generation
      temperature: 0.7, // Slightly higher for more creative/diverse content
    });
    const endTime = performance.now();

    const content = completion.choices[0].message.content;
    const cleanContent = cleanAiResponse(content);
    
    const usage = completion.usage || {};
    const totalTokens = usage.total_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const promptTokens = usage.prompt_tokens || 0;
    const elapsedTime = (endTime - startTime) / 1000; // seconds
    const tps = completionTokens > 0 && elapsedTime > 0 ? (completionTokens / elapsedTime).toFixed(2) : 'N/A';
    const cost = calculateCost(getModel(), promptTokens, completionTokens);

    return {
      content: cleanContent,
      metrics: {
        totalTokens,
        elapsedTime: elapsedTime.toFixed(2),
        tps,
        // For non-streaming, TTFT is essentially the full latency, but we'll just omit it or set it to elapsed
        // The user asked for TTFT specifically. In non-streaming, TTFT ~= Total Time.
        ttft: elapsedTime.toFixed(2),
        cost
      }
    };
  } catch (error) {
    console.error("Error generating article:", error);
    throw error;
  }
}

export async function generateJourneySummary(journey) {
  const journeyTopics = journey.map(j => j.topic).join(' → ');
  
  const JOURNEY_PROMPT = `
    You are the "Cartographer of Latent Space". 
    The user has just completed a journey through the following topics: ${journeyTopics}.
    
    Your goal is to generate a sophisticated "Expedition Report" in HTML using Tailwind CSS.
    
    **Structure & Design:**
    
    1.  **Header:**
        - Title: "Journey Retrospective" (text-4xl font-serif font-bold mb-2).
        - Subtitle: A poetic 1-sentence summary of the path taken (e.g., "From the digital abstraction of X to the biological reality of Y").
    
    2.  **The Visualization (The Path):**
        - Create a vertical "Metro Line" style visualization.
        - Use a continuous vertical border (border-l-2 border-gray-300 ml-4) to connect the steps.
        - For each step in the journey:
            - **Container:** A relative container with padding-left (pl-8) and margin-bottom (mb-8).
            - **Node:** A circle on the line (absolute left-0 top-2 w-8 h-8 -ml-4 bg-white border-2 border-gray-800 rounded-full flex items-center justify-center text-xs font-bold) to mark the stop number.
            - **Card:** A distinct card to the right containing:
                - **Topic:** Large, bold, clickable link (<a href="#" data-prompt="Topic" class="text-xl font-bold hover:underline text-blue-600">Topic</a>).
                - **Context:** A brief explanation of how this topic relates to the previous one (the "semantic bridge").
                - **Flavor:** Invent a "Semantic Distance" score (e.g., "Drift: 12%") or "Concept Class" (e.g., "Abstract", "Physical", "Historical").
    
    3.  **The Analysis (The Pattern):**
        - A distinct section titled "Semantic Analysis" (h2 text-2xl font-serif font-bold mt-12 mb-4).
        - **CRITICAL:** Do NOT describe the "journey", "the path", "the start", or "the end". Do NOT use words like "began", "drifted", "shifted", or "progression". Do NOT mention the user.
        - **Goal:** Write a single, deep philosophical or technical paragraph that unifies these topics into a coherent concept. Treat the topics as if they are components of a single hidden system. Explain the *relationship* between the concepts directly.
        - **Style:** Abstract, academic, and profound.
    
    4.  **Future Trajectories (Next Steps):**
        - A section titled "Suggested Expeditions" (h2 text-2xl font-serif font-bold mt-8 mb-4).
        - Suggest 3 divergent paths for the next journey.
        - Display these as attractive "Portal" cards (border p-4 rounded hover:bg-gray-50 transition).
        - Each suggestion must be a clickable link with \`data-prompt\`.
    
    **Technical Constraints:**
    - Return ONLY HTML.
    - Use Tailwind CSS for all styling.
    - **CRITICAL:** Ensure the vertical line aligns perfectly with the nodes. Use \`relative\` containers for the steps and \`absolute\` positioning for the dots.
    - Do NOT use external images or SVGs that might break. Use CSS shapes.
  `;

  try {
    const client = getClient();
    const startTime = performance.now();
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: "You are a creative web designer and writer." },
        { role: 'user', content: JOURNEY_PROMPT }
      ],
      model: getModel(),
      stream: false,
    });
    const endTime = performance.now();

    const content = completion.choices[0].message.content;
    const cleanContent = cleanAiResponse(content);

    const usage = completion.usage || {};
    const totalTokens = usage.total_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const promptTokens = usage.prompt_tokens || 0;
    const elapsedTime = (endTime - startTime) / 1000; // seconds
    const tps = completionTokens > 0 && elapsedTime > 0 ? (completionTokens / elapsedTime).toFixed(2) : 'N/A';
    const cost = calculateCost(getModel(), promptTokens, completionTokens);

    return {
      content: cleanContent,
      metrics: {
        totalTokens,
        elapsedTime: elapsedTime.toFixed(2),
        tps,
        ttft: elapsedTime.toFixed(2),
        cost
      }
    };
  } catch (error) {
    console.error("Error generating journey summary:", error);
    throw error;
  }
}
