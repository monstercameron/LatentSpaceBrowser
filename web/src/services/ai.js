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

const API_KEY = import.meta.env.VITE_APIKEY || import.meta.env.APIKEY || ''; 

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

const SYSTEM_PROMPT = `
You are the engine of "LatentSpace", a recursive encyclopedia. 
Your goal is to generate a Wikipedia-style article in valid HTML format based on the user's prompt (topic).

**Formatting Rules:**
1. Return ONLY the HTML content for the article body. Do NOT wrap in <html>, <head>, or <body> tags. Do NOT use markdown code blocks.
2. Use Tailwind CSS classes for styling.
3. The structure should include:
   - A main title (h1) with class "text-3xl font-serif font-medium mb-4 border-b border-gray-200 pb-2".
   - An optional infobox (div) floated to the right with class "float-right ml-6 mb-6 w-72 bg-gray-50 border border-gray-200 p-4 text-sm hidden lg:block".
   - Paragraphs (p) with class "mb-4 leading-relaxed text-gray-800".
   - Section headings (h2) with class "text-2xl font-serif font-medium mt-8 mb-4 border-b border-gray-200 pb-1".
   - Lists (ul/ol) with class "list-disc pl-6 mb-4 space-y-2".
4. **CRITICAL:** You must include hyperlinks (<a href="#" data-prompt="Link Concept (context: Current Topic)" class="text-blue-600 hover:underline">Link Text</a>) for related concepts, entities, or interesting tangents within the text. 
   - **Contextual Linking:** The \`data-prompt\` attribute is MANDATORY. It must combine the linked concept with the current article's topic to ensure the next generation is contextually relevant.
     - Example: If the article is about "Apple (fruit)" and you link "seeds", the \`data-prompt\` should be "Seeds (context: Apple fruit)".
     - Example: If the article is about "Apple Inc." and you link "Jobs", the \`data-prompt\` should be "Steve Jobs (context: Apple Inc.)".
   - **Hyperlink Aggressively:** Linkify almost every non-generic noun, proper noun, technical term, or concept. The goal is to allow the user to "surf" the latent space endlessly. If a word represents a distinct concept, link it.

**Content Style:**
- Encyclopedic, neutral, and informative.
- If the topic is abstract or fictional, treat it as real within the context of the Latent Space.
`;

export async function generateArticle(topic) {
  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Generate an article about: ${topic}` }
      ],
      model: getModel(),
      stream: false, // We can switch to stream later if needed, but for now simple await
    });

    const content = completion.choices[0].message.content;
    return content.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
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
    
    Your goal is to generate a beautiful, visual summary of this journey in HTML using Tailwind CSS.
    
    **Design Requirements:**
    1. **Title:** "Journey Retrospective" (h1) with a minimalist, high-contrast black and white style.
    2. **Intro:** A short, poetic paragraph about the thematic thread connecting these topics.
    3. **Visual Flow:** Create a vertical timeline visualization.
       - **Aesthetic:** Use a sophisticated black and white theme.
       - **Structure:** Use a simple, elegant vertical line (border-l-2 border-black) with circular nodes for each step. Do NOT attempt to generate complex SVG curves or paths, as they often break.
       - **Layout:** 
         - Use a flexbox layout.
         - On the left of the line: The step number or a small icon.
         - On the right of the line: The content card.
       - For each step in the journey:
         - Show the topic name as a clickable link (<a href="#" data-prompt="Topic" class="...">Topic</a>).
         - Provide a 1-sentence summary of why this step was interesting or how it connected to the previous one.
    4. **Future Paths:** At the end, suggest 3 new divergent paths the user could take next, based on the entire journey context.
    
    **Technical Rules:**
    - Return ONLY HTML.
    - Use Tailwind CSS for all styling.
    - Ensure all links use the \`data-prompt\` attribute so they are clickable.
    - Do NOT include markdown code blocks.
    - Do NOT use inline SVGs for the timeline structure; use CSS borders and shapes instead.
  `;

  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: "You are a creative web designer and writer." },
        { role: 'user', content: JOURNEY_PROMPT }
      ],
      model: getModel(),
      stream: false,
    });

    const content = completion.choices[0].message.content;
    return content.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  } catch (error) {
    console.error("Error generating journey summary:", error);
    throw error;
  }
}
