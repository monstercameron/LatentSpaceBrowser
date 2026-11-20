# LatentSpace Browser

**LatentSpace** is a recursive, generative encyclopedia that explores the concept of browsing the "latent space" of a Large Language Model (LLM).

**[Try the Live Demo](https://monstercameron.github.io/LatentSpaceBrowser/)**

Unlike a traditional search engine that indexes the static web, LatentSpace generates content on-the-fly, creating a dynamic, infinite graph of knowledge where every link is a new query and every page is a unique synthesis of information.

## The Concept

The core idea is to treat the LLM not just as a chatbot, but as a **browser engine** for a web that doesn't exist until you ask for it.

*   **Recursive Exploration:** Every highlighted term in a generated article is a potential portal to a deeper layer of the latent space. Clicking a link doesn't fetch a URL; it triggers a new generation process, maintaining context and continuity.
*   **The "Latent Web":** We are navigating the high-dimensional vector space of the model's training data. This browser provides a UI to traverse these semantic relationships in a human-readable format.
*   **Ephemeral Knowledge:** The content is transient. It exists only for the moment of observation, tailored specifically to the user's journey.

## The Experiment

This project is an experiment in **interface design for generative AI**.

1.  **Speed as a Feature:** By leveraging **Cerebras Inference**, pages stream in at well over a thousand tokens per second, so the experience feels like browsing a static site rather than querying a remote model.
2.  **Transparency:** We expose the "cost of curiosity." Every page shows its real time to first token, tokens per second, tokens in and out, and dollar cost, plus a running total for the session.
3.  **Reasoning Traces:** When the model returns its reasoning, it is shown in a collapsible section under the page.

## Features

*   **Infinite Generative Wikipedia:** Start with any topic, and the browser generates a structured, link-rich article.
*   **Fresh starting points:** Each page load asks the model for six new topics to begin from (about 100 tokens). The app picks six random fields and the model picks a topic from each.
*   **Recursive Navigation:** Every link opens a new page, written with the path you took as context. Links are real URLs, so opening one in a new tab works.
*   **Real browser history:** Every page has its own address (`?topic=...`) and its own entry in the browser's history, so the browser's Back and Forward buttons walk the topics you visited without writing them again. Going back while a page is loading cancels it.
*   **Explore Anything:** Select any text in a page to explore it as a topic.
*   **Journey Retrospective:** Going home ends the journey with a model-written look back at the path you took and three places to go next.
*   **Bring Your Own Key (BYOK):** Your API key is stored locally in your browser and sent only to Cerebras.
*   **Model Selector:** GPT OSS 120B or Qwen 3.8 27B.
*   **Depth Control:** "Short but sweet" (about 350 words) or "Elaborative" (about 1,300 words).
*   **Built for reading:** Lines of about 70 characters, a side rail with key facts and a contents list, three text sizes, and Back returns you to where you were on the page.
*   **Dark Mode:** Follows your system by default; fully responsive. Text meets WCAG AAA contrast (7:1) and control outlines meet 3:1 in both themes.

## How a page is made

The model is the engine, and it is asked to do as little typing as possible.

*   **Lean output.** The model writes bare semantic HTML (`<h1>`, `<aside>`, `<p>`, `<a>`...) with no classes and no link attributes; the app styles it. Earlier versions had the model emit Tailwind classes and a context path on every element, which was most of each reply. A typical long article went from about 8,200 output tokens to about 1,500 to 2,000.
*   **The app keeps the path.** A link is just `<a>Topic</a>`. The app remembers the last few steps of your path and sends them with the next request.
*   **Reasoning kept low.** Each model runs at its lowest reasoning setting, since reasoning tokens are billed as output.
*   **The model fixes its own pages.** If a reply is cut off at the token limit, the model is asked to continue its draft. If a reply breaks the format (a code fence, a preamble, markdown), the model is asked to repair it. If a page comes back with almost no links, the model is asked to add them. The code only decides whether another pass is needed; it never rewrites content. (The contents list is built by the app from the page's own headings, which costs no tokens.) The pass count is shown when more than one was used.
*   **Untrusted by default.** Generated HTML is sanitized to a small set of document tags before it is shown.
*   **Light on memory.** A journey lives in the tab's session storage (capped at 30 pages) and is freed when the tab closes.

## Tech Stack

*   **Frontend:** React, Vite, Tailwind CSS
*   **AI Inference:** Cerebras chat completions API, streamed with `fetch` (no SDK)
*   **Deployment:** GitHub Pages (static site built into `docs/`)

## Running Locally

1.  Clone the repository.
2.  Install dependencies and start the dev server:
    ```bash
    cd web
    npm install
    npm run dev
    ```
3.  Open the app and add your Cerebras API key in Settings.

Other commands, run from `web/`:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the path, history and format-check logic |
| `npm run lint` | ESLint |
| `npm run build` | Builds the site into `docs/` for GitHub Pages |
| `npm run test:e2e` | Playwright smoke test (needs `npx playwright install` once) |

For development you can instead put `VITE_APIKEY=csk-...` in a `.env` file in the repository root. That key is read by the dev server only; production builds never include it.

---

*Note: This is a research prototype. Hallucinations are a feature of the latent space, not a bug.*
