# LatentSpace Browser

**LatentSpace** is a recursive, generative encyclopedia that explores the concept of browsing the "latent space" of a Large Language Model (LLM).

Unlike a traditional search engine that indexes the static web, LatentSpace generates content on-the-fly, creating a dynamic, infinite graph of knowledge where every link is a new query and every page is a unique synthesis of information.

## The Concept

The core idea is to treat the LLM not just as a chatbot, but as a **browser engine** for a web that doesn't exist until you ask for it.

*   **Recursive Exploration:** Every highlighted term in a generated article is a potential portal to a deeper layer of the latent space. Clicking a link doesn't fetch a URL; it triggers a new generation process, maintaining context and continuity.
*   **The "Latent Web":** We are navigating the high-dimensional vector space of the model's training data. This browser provides a UI to traverse these semantic relationships in a human-readable format.
*   **Ephemeral Knowledge:** The content is transient. It exists only for the moment of observation, tailored specifically to the user's journey.

## The Experiment

This project is an experiment in **interface design for generative AI**.

1.  **Speed as a Feature:** By leveraging **Cerebras Inference**, we achieve near-instant generation speeds (high tokens per second). This reduces the friction of "waiting for AI," making the experience feel like browsing a local static site rather than querying a remote model.
2.  **Transparency:** We expose the "cost of curiosity." The interface tracks Time to First Token (TTFT), Tokens Per Second (TPS), and the actual dollar cost of your session, demystifying the economics of LLM usage.
3.  **Reasoning Traces:** (Experimental) Visualizing the model's "thought process" before it renders the final content, giving users insight into how the latent space is being navigated.

## Features

*   **Infinite Generative Wikipedia:** Start with any topic, and the browser generates a structured, link-rich article.
*   **Recursive Navigation:** Clickable terms automatically generate new pages.
*   **Bring Your Own Key (BYOK):** Securely use your own Cerebras API key (stored locally in your browser).
*   **Session History:** Track your journey through the latent space.
*   **Performance Metrics:** Real-time display of generation speed and cost.
*   **Dark Mode:** Fully responsive UI with dark/light theme support.

## Tech Stack

*   **Frontend:** React, Vite, Tailwind CSS
*   **AI Inference:** Cerebras Cloud SDK (Llama 3.1 models)
*   **Deployment:** GitHub Pages (Static SPA)

## Running Locally

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    cd web
    npm install
    ```
3.  Run the development server:
    ```bash
    npm run dev
    ```
4.  Open your browser and enter your Cerebras API Key.

---

*Note: This is a research prototype. Hallucinations are a feature of the latent space, not a bug.*
