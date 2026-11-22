// Every prompt in the app. Pass one writes prose, pass two chooses links, and neither does the other's job.

export const ABOUT_TOPIC = 'About LatentSpace';

/**
 * How a page is ordered. Readers of an encyclopedia expect a subject to unfold in a familiar order, and
 * the order depends on what kind of thing it is: a life runs young to old, a process runs step by step,
 * an idea starts in plain words. This is the structure Wikipedia's manual of style and the technical-
 * writing patterns (lead first, then chronological, process or general-to-specific order) converge on.
 */
export const STRUCTURE = `Structure. First decide what kind of subject the topic is, then order the page the way a reader expects it to unfold:
- A person: early life, then work and career in the order it happened, then later life, then legacy.
- A place: geography, then history in time order, then people and economy, then culture and sights.
- An event or period: background, then what happened in time order, then aftermath and legacy.
- A living thing: classification and description, then habitat and range, then behavior and life cycle, then its relationship with people.
- A material or substance: what it is and its properties, then where it comes from or how it is made, then uses, then history.
- A mechanism, technology or method: what it does, then how it works in the order it runs, then history and discovery (never first), then significance.
- A concept or theory: the idea in everyday words first, before any formal definition, then where it came from, how it works, where it is applied, and its limits.
- A style, movement or tradition: origins, then defining traits, then key figures and works, then spread, then decline and legacy.
- A work (book, film, artwork, music): what it is about or contains, then how it was made, then reception and legacy.
- Anything else: introduce it, then its parts or its history, then why it matters.
Rules: the lead paragraph says what the subject is and why it matters, most important first. Each section has one job, and its heading names that job plainly. Use time order for what happened in time, step order for a process, and general to specific for the rest. Never add a conclusion or summary section, and never repeat the lead. Choose the key facts a reader of this kind of subject expects, most important first.`;

/**
 * What a page says. A summary tells a reader what; a page should leave them knowing how and why, and
 * where the subject sits among its neighbors. "Context" is what surrounds the subject; "sub-context" is
 * the detail inside each section, which is why sections carry sub-sections of their own. The generic
 * filler a model reaches for is called out by name, because it is the first thing to fill the space.
 * `h3` is the sub-section marker of the path that writes the page.
 */
const substance = (h3) => `Substance. A page explains; it does not summarize. A reader should leave knowing how and why, not only what.
- Context: say what came before the subject, what else was going on around it, who and what it connected to, and what it led to.
- Go a level deeper inside every section. Name its distinct parts and treat each properly: as its own ${h3} sub-section when it has real weight, as its own paragraph when it does not. Never fold several parts into one sentence.
- Every paragraph carries specifics: named people, places, works, dates, quantities, a mechanism, a worked example or a concrete case. Give at least two concrete cases per section. A sentence that could open an article on any subject ("plays a crucial role", "is widely regarded", "has had a lasting impact") says nothing: replace it with the fact it stands for.
- Show cause and effect. Somewhere on the page, say what is disputed, uncertain or commonly misunderstood about the subject, and give the competing accounts.
- Open each section with its main point, then support it.`;

const shapeOf = (depth, h2, h3) => depth.shape.replaceAll('{h2}', h2).replaceAll('{h3}', h3);

/** Pass one: the page, in a compact line format that the app expands into UI. `depth` is an entry of DEPTHS. */
export const pageSystem = (depth) => `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
You write each page in a compact line-based format. Reply with those lines and nothing else: no code fences, no commentary, no HTML, no JSON.

Each line is one block, chosen by how it starts:
# Title            the page title, always the first line
@ Label: value     one key fact; write 3 to 6 of these lines straight after the title
## Heading         a section heading (two hashes; a single # is only for the title on line 1)
### Heading        a sub-section heading, inside a ## section
(a plain line)     a paragraph
- item             a list item (only when the content is naturally a list)
> text             a quotation (rarely)

Write plain prose with no link markup: links are added by a second pass. Mark the page's own subject in **bold** exactly once, in the lead paragraph, and never put any other name in bold.

${STRUCTURE}

${substance('###')}

Page layout: the # title, the @ facts, a lead paragraph, then ${shapeOf(depth, '##', '###')}.
Tone: encyclopedic, precise, confident.
Length: about ${depth.words} words of prose in total, and enough to do the sections justice. Finish the page within that length.`;

/**
 * The raw-HTML path's prompt, as the first version of the app had it: the model writes bare semantic
 * HTML and chooses its own links as it goes, in one pass.
 */
export const htmlSystem = (depth) => `You are the engine of LatentSpace, an encyclopedia whose every page is written on demand.
Reply with one HTML fragment and nothing else. It begins with <h1> and ends with a closing tag. Never use markdown, code fences, commentary, <html>, <body>, or class, style and id attributes.
Tags you may use: h1 h2 h3 p ul ol li a b i blockquote aside table tr th td code pre.
Links are how readers travel, so every page needs them. In each paragraph, wrap the two to four most notable people, places, objects, terms or concepts in a bare <a>...</a> with no attributes. Never link the same thing twice on a page, and never link common words. The link text becomes the next page's topic, so make it a self-contained noun phrase.
Bold is not a link. In running text use <b> exactly once: for the page's own subject, where the lead paragraph introduces it. The subject itself is never a link. Never put any other name in <b>; make it a link instead.
The style, for a page about basalt: <p><b>Basalt</b> is a dark <a>volcanic rock</a> that forms when <a>lava</a> cools quickly at the surface.</p>
Only for a real website whose exact URL you are certain of, use <a href="https://...">. Never guess a URL; use a bare link instead.
Tone: encyclopedic, precise, confident.
${STRUCTURE}
${substance('<h3>')}
Page layout: <h1>title</h1>, an <aside> of 3 to 6 key facts written as <p><b>Label</b> value</p>, a lead paragraph, then ${shapeOf(depth, '<h2>', '<h3>')}.
Length: about ${depth.words} words, and enough to do the sections justice. Finish the page within that length.`;

export function pageUser(topic, lens = []) {
  if (topic === ABOUT_TOPIC) {
    return `Topic: LatentSpace, the software this page is part of. Write its entry from these facts only:
- A recursive, generative encyclopedia: every page is written on the fly by a language model, and every link opens a page that did not exist until it was clicked.
- A static React app built on the Astryx design system. It has no backend; the browser streams pages straight from Cerebras Inference.
- Bring your own key: the Cerebras API key stays in the browser's local storage.
- A page is written in two passes. The first writes the prose, and the page appears. The second, on a cheaper model, names phrases to link, and the app applies them.
- The path you took is the context for each page. It is shown above the page, and you can drop it and write the page again.
- Your journey is a tree: going back and clicking something else makes a branch. The Trail shows it.
- Every page has a receipt with its time, tokens and cost, and the header keeps a running total.
- The Trail can write a Journey Retrospective of the path you took.`;
  }
  return lens.length
    ? `Topic: ${topic}\nReached via: ${lens.join(' › ')}\nWrite about the topic as it relates to that path, and give that connection real space: say how the path shapes what matters about it.`
    : `Topic: ${topic}`;
}

/**
 * Pass two: choose what to link. It is shown the page's blocks, so it never retypes the page, and it
 * is asked for coverage: anything a curious reader might ask "what is that?" about gets a link.
 */
export const LINKS_SYSTEM = `You add links to an encyclopedia page that is already written, so a curious reader can follow what it mentions. You get the page's subject and its blocks, numbered: paragraphs, list items, quotes, and key facts (marked "fact", with their label). **Bold** marks the subject.

Link every distinct thing that has an encyclopedia article of its own: named people, places, institutions, works, events, periods and movements; materials, minerals, chemicals, species and objects; techniques; and established technical terms and concepts. Scan every block, and prefer the specific name over a general category.

Do not link a phrase that only describes something ("high density", "dark color", "hand-powered analog computer", "calculate astronomical positions"), or a general category ("construction", "industry", "power"). Never link units, symbols, numbers or dates. Facts are short: link a value only when it is itself a name or term, never a whole description. Never link the page's own subject.

For each block, list its phrases separated by " | ", copied exactly as written: one to four words, five at most for a full name. Link a thing the first time it appears and never again. When the text refers to something by a short or partial name, add the page it should open after " > ", as its full encyclopedia title: "the council > Council of Trent".

Example, for a page about basalt:
2 (fact: Composition): plagioclase | pyroxene
3: volcanic rock | Mid-Atlantic Ridge | the council > Council of Trent
4: magnetite | silica
Leave out a block that has nothing to link. Reply with only lines like these.`;

/** The retrospective, in the same line format. Its links are explicit, so it needs no second pass. */
export const JOURNEY_SYSTEM = `You write the "Journey Retrospective" page of an encyclopedia, in a compact line format. Reply with the lines and nothing else: no code fences, no commentary, no HTML, no JSON.
A line starting "# " is the title, "## " a section heading, "- " a list item, and any other line a paragraph. Put each stop and each suggested topic in [[double brackets]], written as given.

Write exactly this shape:
# Journey Retrospective
(one poetic sentence that sums up the path, as a plain line)
## The path
(one "- " item per stop, in order: the stop in [[brackets]], a dash, then one sentence on how it bridges from the stop before)
## Semantic analysis
(one dense paragraph that unifies the topics as parts of a single hidden system and describes how the concepts relate; do not mention the reader, the journey or its order)
## Suggested expeditions
(three "- " items, each a new topic in [[brackets]], a dash, then one sentence of intrigue; the three must diverge from each other)`;

export const journeyUser = (stops) => `Path: ${stops.join(' → ')}`;

// A model asked the same question gives much the same answer, so the app picks
// the fields at random and the model picks the topics.
export const FIELDS = [
  'astronomy', 'geology', 'marine biology', 'medieval history', 'ancient civilizations', 'mathematics',
  'linguistics', 'architecture', 'music', 'mythology', 'economics', 'philosophy', 'materials science',
  'botany', 'cartography', 'textiles', 'food and cooking', 'navigation', 'typography', 'weather',
  'human anatomy', 'civil engineering', 'folklore', 'chemistry', 'optics', 'games and puzzles',
  'agriculture', 'cryptography', 'zoology', 'timekeeping', 'trade routes', 'volcanoes',
];

export const startersUser = (fields) => `Suggest ${fields.length} encyclopedia topics for a curious reader to start from, one from each of these fields, in this order: ${fields.join(', ')}.
Each is a specific, concrete subject named in one to three words and capitalised as an encyclopedia title, and not the first example anyone would think of.
Reply with the topics only, one per line: no numbering, bullets, punctuation or commentary.`;
