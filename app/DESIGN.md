# LatentSpace, redesigned

## The core idea (unchanged)

The model is the browser engine. Every page is written the moment you ask for it, and every link
opens a page that did not exist until you clicked. Speed makes that feel like browsing a static
web, and the cost of every page is shown, because curiosity is not free.

## What the redesign changes

1. **The path is the product.** The page you get depends on how you reached it, so the path (the
   *lens*) is explicit: it is shown above every page, it is part of the URL, and you can drop it
   and write the page again from a fresh start. Your journey is a tree, not a list: go back, click
   something else, and you have branched. The Trail shows the tree.
2. **Two passes, because the page should appear first.** Pass one writes plain prose in a compact
   line format, about half a second to first words. Pass two reads every block (paragraphs, list
   items, quotes and the values in the key facts) and names what is worth a page; the app applies
   it. Links draw themselves in a moment after the text. The model never retypes a
   page to link it.
3. **A2UI under the page.** The compact reply is expanded into A2UI messages (a surface of flat,
   id-linked components) and rendered through a small catalog onto Astryx components. A page is
   UI, not an HTML string, so nothing needs sanitising and richer components (tabs, tables,
   timelines) can be added to the catalog without touching the pipeline.
   **Two paths, one toggle.** The original raw-HTML path is kept beside A2UI: the model writes
   sanitized HTML with its own inline links, in one pass. The toggle in the header (and Settings)
   chooses how the *next* page is written and drawn. A page remembers the path it was written with,
   so pages from both paths live side by side in one journey, and each shows which path made it.
   **One renderer for both.** The model's HTML is sanitized and then *converted* into the same A2UI
   component tree the compact path produces (`ui/htmlSurface.js`): headings, paragraphs with inline
   links, bold, italic and code, lists, quotes, tables, code blocks, and the `<aside>` key facts as a
   facts card. The Astryx catalog then draws it, so the HTML path gets the same type, links, rail,
   contents list and word-by-word spawn as A2UI, with nothing added to the prompt and no HTML ever
   reaching the page. The look is applied from outside the prompt, which costs no tokens. The two
   paths still differ in content, not looks: HTML is one pass with the model's own links (about 14 a
   page against about 57 for A2UI's link pass, and none in the key facts).
4. **Speed on purpose.** Hover or focus a link for a moment and its page starts writing in the
   background, so the click lands on a finished page. It is opt-in and its spend is shown
   separately, because it costs money for pages you may never open.
5. **Every page has a receipt.** Tokens, time to first words, time to links, dollars, per pass.
   A session meter sits in the header, and an optional budget stops the spending.
6. **Reading first, built on Astryx.** One reading column with a rail (key facts, contents),
   Astryx for every control, and a custom theme that keeps the warm paper palette and its contrast.

## Screens

- **Launchpad.** Search, six starting points written by the model for this load, and your recent
  journeys.
- **Reader.** Lens bar, title, prose with links, side rail, receipt.
- **Trail.** The journey as a branching tree. Click to jump. Write a retrospective of the path.
- **Settings.** Key, page model, link model, depth, text size, theme, prefetch, budget.

## Architecture

```
src/
  engine/   models, Cerebras streaming client, prompts, the compact format, the two-pass pipeline
  a2ui/     surface reducer (messages -> component tree) and the Astryx catalog
  state/    settings, the journey tree + browser history, the page cache (also does prefetch)
  ui/       shell, launchpad, reader, trail, receipt, settings
```

`engine/` and the pure parts of `state/` and `a2ui/` have no React or browser imports, so they are
tested with `node --test`.

## Decisions

- Pages are written in a compact line format, not JSON or HTML. In testing, models broke JSON
  brackets, and the compact format was the cheapest (about 0.9x of HTML) and always valid.
- **The link pass** asks for coverage and for names, not descriptions: people, places, works, events,
  materials and established terms get a link; "high density" and "g/cm³" do not. A model may name the
  page a partial reference should open (`the council > Council of Trent`). The app matches
  forgivingly (case, curly quotes, kinds of dash), links a thing once per surface (the key-facts rail
  and the text are separate), skips the page's own subject, and filters units and run-on phrases.
  Measured on ten pages, with a judge listing each page's 15 most article-worthy terms from the
  *unlinked* text: the first strategy covered 57% of them and linked no fact; the refined prompt
  covers 73% (GPT OSS) or 77% (Qwen), links about 58% of fact values, and Qwen rarely names text that
  is not there. A density target ("twenty to thirty links") added one point and more weak links, so
  it was dropped. Qwen is the default link model: it is faster (no hidden reasoning) and covers more,
  at about 26% more cost per page; GPT OSS stays one setting away. The judge is a rough instrument:
  its "weak link" calls are partly opinion.
- **Page structure** follows the patterns technical and encyclopedic writing converge on: a lead that
  says what the subject is and why it matters (inverted pyramid, Wikipedia's lead-section rule),
  then an order chosen by *kind of subject*: a life runs young to old, an event in time order, a
  process step by step, an idea starts in everyday words, a work starts with what it is about. Each
  section has one job, and there is no "Conclusion". The prompt names nine kinds and their order
  (`STRUCTURE` in `engine/prompts.js`, shared by both paths). Checked on ten subjects, one run each,
  by reading each page's skeleton: people now run chronologically, Gothic Revival follows the style
  pattern exactly, Moby-Dick gained a plot section and a reception section, and the filler
  "Conclusion" is gone. It is not obeyed everywhere: the Antikythera mechanism still opens with its
  discovery and Entropy with history, despite "never first". The structure also makes pages about
  19% longer, so the "about 350 words" target is overshot; that is the knob to tighten next.
- **Depth and substance.** A page should explain, not summarize. Three levels (Short, Standard, Deep;
  Standard is the default) set the layout: sections, paragraphs per section, and `###` sub-sections.
  A *substance* block in the prompt asks for context (what came before and around the subject, and
  what it led to), a level deeper inside every section (distinct parts get their own sub-section or
  paragraph), specifics in every paragraph (names, dates, quantities, a mechanism, at least two
  concrete cases per section), cause and effect, what is disputed or commonly misunderstood, and the
  main point first. The path that led to the page is given real space. Generic filler is named in
  the prompt, because it is what fills space first. Measured on ten subjects (a model-judged
  six-point checklist, a count of specifics, and structure): the old "elaborative" level was 1,150
  words in about four sections with no sub-sections (5.4/6); Standard is similar in length and cost
  but averages six sub-sections and scores 5.5/6, and Deep averages 1,860 words and five sub-sections.
  "Wherever a section has distinct parts" produced 0.5 to 2.1 sub-sections per page between runs;
  "in at least two of the sections" produced 6.0, so the shape is stated as a count. A line asking
  for length to come from new specifics only made no measurable difference and was removed.
  Costs: a Standard page is about $0.003 to write and, with its larger link pass, about $0.007 in
  all (the old Short page was about $0.0016); it appears within a fraction of a second and is whole in
  about two seconds. Known limits: models overshoot word targets (Standard averages about 1,150
  words against a target of 900); specifics per 100 words fall at Deep (about 5.6 against 7.3 at
  Short), a sign of padding; and more specifics are more claims to get wrong, so more of them are
  wrong. Pages are not fact-checked.
- **Motion** is ink drying. A new word spawns warm in the accent color, low and fading in, then
  settles. Every word is its own element, keyed by position, so only new words mount and animate.
  Links draw their underline one after another when the second pass lands, with a brief glow. The
  rest is entrance and state: the page, title, section headings (with a hairline that draws on
  scroll), the lens chips, the rail, the Trail's rows and its current marker, the launchpad's slow
  aurora and stars, the spend meter's tick, dialogs, and a circular reveal when the theme changes.
  Words animate only opacity, position and color, because hundreds can be in flight at once; blur and
  glow are kept for headings and links. Everything animated sits inside
  `prefers-reduced-motion: no-preference`, so reduced motion gets the finished state with none.
  The HTML path animates the same way, because it is drawn by the same renderer (below).
- Default model is Qwen 3.8 27B for pages. The first design had links use `gpt-oss-120b`: its input is cheaper, and
  choosing phrases is mechanical.
- Both render paths stay. A2UI keeps the page structured (no markup to sanitize, a catalog to grow);
  HTML is one call and shows its links as it streams. The retrospective always uses the A2UI path.
- The page cache never aborts a started write. A page you left finishes into the cache, so Back is
  instant and nothing is paid for twice.
- Dark mode, theme and fonts come from Astryx tokens. App CSS only lays out the page.

## Language and accessibility

**Language.** The app and the pages it writes can be in any language. Five are one click away (English,
中文, हिन्दी, Español, العربية); anything else is typed into Settings. For a custom language one cheap call
describes it (English name, native name, BCP 47 code, direction), then the model translates the app's 117
interface strings in a few parallel requests (about $0.005, a few seconds) and the result is cached in
`localStorage`. The four shipped catalogs are generated once by `scripts/translate-ui.mjs` and loaded on
demand. They are machine translations and have not been reviewed by native speakers.
Pages are written in the chosen language (the prompt says so; the line markers stay ASCII), the page is
tagged `lang` and `dir`, and the cache key includes the language, so each language is its own page.
Scripts without spaces use `Intl.Segmenter` for the word animation, and link phrases match without word
boundaries.

**Accessibility pass (off by default).** An optional third call reads the finished page and returns
annotations the app applies, never retyping the page: a plain-language summary ("In short"), abbreviations
spelled out on first use, foreign phrases tagged with `lang`, and a description for each link. It uses the
link model and costs roughly a quarter of a cent on a standard page. Annotations are stored beside the page
and work on both the A2UI and HTML paths. Pages written with the pass are cached separately.

## Agents

`src/agent/webmcp.js` offers the app to agents as WebMCP tools. They mirror what a reader does (search, follow
a link so the path carries on, read, walk the trail, set preferences) and wait for a page to finish before
answering, so an agent gets a page, not a half-written draft. Pages are returned as Markdown with links as
topics. The API key and spending limit are deliberately out of reach. The WebMCP spec is still changing, so
registration is feature-detected and failures are logged, never thrown.

## Switching language on a page

A page is written once, in the language it was written in (`page.langKey`). Switching language does not rewrite it:
the stored text (and its accessibility notes) is sent to the model to be translated faithfully, keeping the
sentences, the structure and the links (link titles are translated too, so the next page opens in the new
language). The reader keeps reading the old text, with a "Translating" status, until the translation replaces it.
The result is stored under its language in `page.translations`, so switching back, or on again, is instant and
free. A translation is checked (same sections, most links kept) and refused if it is not. Measured on a standard
page: Spanish in 1.7 s for $0.006, 25 of 25 links and 4 of 4 sections kept; switching back and forth cost nothing.
