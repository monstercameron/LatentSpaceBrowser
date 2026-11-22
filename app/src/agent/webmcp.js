import { DEPTHS } from '../engine/models.js';
import { LANGUAGES } from '../i18n/languages.js';
import { pageLinks, pageMarkdown, sectionsOf } from './pageText.js';

// WebMCP: the page offers tools to an agent in the browser through navigator.modelContext
// (https://developer.chrome.com/docs/ai/webmcp). An agent can search, follow links, read pages, walk the
// trail and change the reading preferences: the same things a person does with the mouse.
//
// Deliberately not offered: the API key and the spending limit. An agent may spend (every page it opens is
// a paid call), but only within the limit the person set, and it can neither read the key nor raise the limit.

const FORMATS = ['a2ui', 'html'];
const MODES = ['system', 'light', 'dark'];
const TEXTS = ['small', 'medium', 'large'];
const NO_ARGS = { type: 'object', properties: {} };

const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
  });

/**
 * The tools, built over a handle on the app:
 *   read()   -> { node, surface, error, spend, budget, hasKey, canGoBack, canGoForward, preferences }
 *   trail()  -> [{ id, topic, depth, current, written }]
 *   search(topic) / follow(topic) -> the new node's id;  home() back() forward() jump(id) save(patch)
 */
export function buildTools(app) {
  /** Waits until a page is finished or has failed. `id` is the node to wait for; without one, any change from `from`. */
  async function settled({ id, from, timeout = 90000, signal }) {
    const started = Date.now();
    while (Date.now() - started < timeout && !signal?.aborted) {
      const s = app.read();
      const there = id ? s.node?.id === id : s.node?.id !== from;
      if (there && (s.node?.page || s.error) && !s.translating) return s;
      await sleep(120, signal);
    }
    return app.read();
  }

  const describe = (s) => {
    if (!s.node) return { page: null, note: 'The launchpad is showing; no page is open.' };
    if (s.error) return { topic: s.node.topic, error: s.error.message ?? String(s.error), code: s.error.code };
    if (!s.node.page || s.translating) return { topic: s.node.topic, status: s.translating ? 'translating' : 'still writing', note: 'Call get_status or read_page again shortly.' };
    const links = pageLinks(s.surface);
    return {
      topic: s.node.topic,
      lens: s.node.lens ?? [],
      sections: sectionsOf(s.surface),
      linkCount: links.length,
      links: links.slice(0, 40).map((l) => l.topic),
      words: pageMarkdown(s.surface).split(/\s+/).length,
      costUsd: s.node.page.metrics?.cost ?? null,
      hint: 'read_page reads it; open_link follows a link.',
    };
  };

  const open = (how) => async (args, options) => {
    const topic = String(args?.topic ?? '').trim();
    if (!topic) return fail('"topic" is required.');
    const before = app.read();
    if (!before.hasKey) return fail('No API key is set. Ask the user to add their Cerebras key in Settings.');
    if (before.budget > 0 && before.spend >= before.budget) return fail('The spending limit the user set is reached. Ask them to raise it in Settings.');
    const id = how === 'search' ? app.search(topic) : app.follow(topic);
    return ok(describe(await settled({ id, signal: options?.signal })));
  };

  const step = (name, canKey, move, description) => ({
    name,
    description,
    inputSchema: NO_ARGS,
    execute: async (_args, options) => {
      const before = app.read();
      if (!before[canKey]) return fail('There is nothing there.');
      move();
      await sleep(300, options?.signal);
      return ok(describe(await settled({ from: before.node?.id, signal: options?.signal })));
    },
  });

  return [
    {
      name: 'search',
      description: 'Start a fresh journey on a topic: LatentSpace writes an encyclopedia page for it (several seconds, a fraction of a cent). Returns the outline and the page\'s links.',
      inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'What to look up, e.g. "Roman aqueducts".' } }, required: ['topic'] },
      execute: open('search'),
    },
    {
      name: 'open_link',
      description: 'Follow a link on the current page. The new page is written knowing the path so far, so it goes deeper instead of starting over. Use a topic from list_links.',
      inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'The link target, as listed by list_links.' } }, required: ['topic'] },
      execute: open('follow'),
    },
    {
      name: 'read_page',
      description: 'The current page as Markdown. Pass "section" (a heading from the outline) to read only that section.',
      inputSchema: { type: 'object', properties: { section: { type: 'string', description: 'A heading from the outline; omit for the whole page.' } } },
      execute: async (args) => {
        const s = app.read();
        if (!s.node) return fail('No page is open. Use search first.');
        if (!s.node.page) return fail('The page is still being written; try again shortly.');
        const text = pageMarkdown(s.surface, args?.section);
        if (text === null) return fail(`No section called "${args.section}". Sections: ${sectionsOf(s.surface).map((x) => x.title).join('; ')}`);
        return ok(`# ${s.node.topic}\n\n${text}`);
      },
    },
    {
      name: 'list_links',
      description: 'The links on the current page that can be opened, each with a short description when the accessibility pass is on.',
      inputSchema: NO_ARGS,
      execute: async () => {
        const s = app.read();
        if (!s.node?.page) return fail('No finished page is open.');
        return ok(pageLinks(s.surface).map((l) => ({ topic: l.topic, text: l.text, description: l.description })));
      },
    },
    step('go_back', 'canGoBack', () => app.back(), 'Go back one page in history.'),
    step('go_forward', 'canGoForward', () => app.forward(), 'Go forward one page in history.'),
    {
      name: 'go_home',
      description: 'Return to the launchpad (no page open).',
      inputSchema: NO_ARGS,
      execute: async () => { app.home(); return ok('At the launchpad.'); },
    },
    {
      name: 'get_trail',
      description: 'Every page visited this session as a tree (depth shows nesting), with the current one marked. Pass jump_to (an id) to open one of them.',
      inputSchema: { type: 'object', properties: { jump_to: { type: 'string', description: 'A trail id to open instead of only listing.' } } },
      execute: async (args, options) => {
        if (args?.jump_to) {
          if (!app.trail().some((r) => r.id === args.jump_to)) return fail('No such id in the trail.');
          app.jump(args.jump_to);
          return ok(describe(await settled({ id: args.jump_to, signal: options?.signal })));
        }
        return ok(app.trail());
      },
    },
    {
      name: 'get_status',
      description: 'Where things stand: the current page, whether it is still being written, the money spent this session, and the reading preferences.',
      inputSchema: NO_ARGS,
      execute: async () => {
        const s = app.read();
        return ok({
          topic: s.node?.topic ?? null,
          state: !s.node ? 'launchpad' : s.error ? 'error' : s.translating ? 'translating' : s.node.page ? 'ready' : 'writing',
          error: s.error?.message ?? null,
          spentUsd: Number(s.spend.toFixed(5)),
          limitUsd: s.budget || null,
          hasApiKey: s.hasKey,
          preferences: s.preferences,
        });
      },
    },
    {
      name: 'set_preferences',
      description: 'Change how pages are written and shown. Applies to pages opened afterwards; pages already written are kept as they were. Cannot change the API key or the spending limit.',
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: LANGUAGES.map((l) => l.id), description: 'Page and interface language. The page on screen is translated in place, keeping its wording; use get_status to see when it is ready.' },
          format: { type: 'string', enum: FORMATS, description: 'a2ui (prose, then a link pass) or html (one pass).' },
          depth: { type: 'string', enum: Object.keys(DEPTHS), description: 'How much each page says.' },
          accessibility: { type: 'boolean', description: 'Add the accessibility pass: summary, abbreviations, language tags, link descriptions.' },
          theme: { type: 'string', enum: MODES },
          text_size: { type: 'string', enum: TEXTS },
        },
      },
      execute: async (args = {}) => {
        const patch = {};
        const pick = (key, allowed, to) => {
          if (args[key] === undefined) return null;
          if (!allowed.includes(args[key])) return `"${key}" must be one of: ${allowed.join(', ')}.`;
          patch[to] = args[key];
          return null;
        };
        const problem = pick('language', LANGUAGES.map((l) => l.id), 'language') ?? pick('format', FORMATS, 'format')
          ?? pick('depth', Object.keys(DEPTHS), 'depth') ?? pick('theme', MODES, 'mode') ?? pick('text_size', TEXTS, 'text');
        if (problem) return fail(problem);
        if (args.accessibility !== undefined) patch.a11y = args.accessibility === true;
        if (!Object.keys(patch).length) return fail('Nothing to change.');
        app.save(patch);
        return ok({ changed: patch });
      },
    },
  ];
}

/** Registers the tools with the browser if it supports WebMCP. Returns a function that removes them. */
export function registerWebMcp(app) {
  const tools = buildTools(app);
  // Reachable by script even where WebMCP is not supported (tests, and agents that drive the page directly).
  window.__latentspaceTools = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  const context = navigator.modelContext ?? document.modelContext ?? null;
  if (!context?.registerTool) return () => { delete window.__latentspaceTools; };
  const controller = new AbortController();
  for (const tool of tools) {
    try {
      context.registerTool(tool, { signal: controller.signal });
    } catch (error) {
      console.warn(`WebMCP: could not register ${tool.name}:`, error);
    }
  }
  return () => {
    controller.abort();
    delete window.__latentspaceTools;
  };
}
