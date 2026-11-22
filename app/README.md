# LatentSpace (redesigned)

A recursive, generative encyclopedia: the model is the browser engine, every page is written the
moment you ask, and every link opens a page that did not exist until you clicked it.
See [DESIGN.md](DESIGN.md) for what changed and why.

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # engine, A2UI and state tests (node --test)
npm run build    # static site in ../docs, which GitHub Pages serves (main branch, /docs)
```

Add your Cerebras API key in Settings. It stays in your browser and is sent only to Cerebras.
For development you can instead put `VITE_APIKEY=csk-...` in a `.env` file in the repository root:
it is read by the dev server only, never by a production build.

## How a page is made

There are two paths, and a toggle in the header chooses the next page's. A page keeps the path it
was written with. **HTML** is one call: the model writes HTML with its own inline links, and the app
sanitizes it and converts it into the same components A2UI uses, so both paths look the same.
**A2UI** is the two steps below.

1. **Write.** The page model (Qwen 3.8 27B by default) streams the page in a compact line format.
   The app expands it into A2UI messages and draws it with Astryx components as it arrives.
2. **Link.** A second call (Qwen by default; GPT OSS 120B is about a quarter cheaper) reads every
   block, key facts included, and names what is worth a page.
   The app applies them and the links fade in. The model never retypes the page.

Pages are written to explain, not summarize: context first, then sub-sections that go a level
deeper. Settings has three depths (Short, Standard, Deep); Standard is the default and costs about
$0.007 a page in all, Short about a quarter of that.

Every page has a receipt (time, tokens, dollars, per pass), and the header keeps a running total.
Turn on "Write pages ahead of your click" and hovering a link writes its page in the background.

## Languages and accessibility

Pick a language in the header (five built in) or choose "Other language…" and type any language; the model
translates the interface once and it is remembered. Settings has an **Accessibility pass** switch (off by
default) that adds a third call: a summary, abbreviations spelled out, language tags, and link descriptions.
Regenerate the shipped catalogs with `node --env-file=../.env scripts/translate-ui.mjs`.

## For agents (WebMCP)

The app registers tools with the browser's [WebMCP](https://developer.chrome.com/docs/ai/webmcp) API
(`navigator.modelContext.registerTool`), so an agent in a WebMCP-capable browser can use it the way a reader does:
`search`, `open_link`, `read_page` (whole or one section), `list_links`, `go_back`, `go_forward`, `go_home`,
`get_trail`, `get_status` and `set_preferences`. The tools are in `src/agent/`. Each page an agent opens is a paid
call, so they refuse without an API key or past the spending limit; the key and the limit can be neither read nor
changed through them. Where WebMCP is not supported the same tools are still on `window.__latentspaceTools`.
