import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linksIn, pageLinks, pageMarkdown, plain, sectionsOf } from '../src/agent/pageText.js';
import { buildTools } from '../src/agent/webmcp.js';

const surface = {
  id: 's',
  components: {
    root: { id: 'root', component: 'Column', children: ['t', 'f', 'p', 'h2', 'p2', 'h3', 'p3', 'h2b', 'p4'] },
    t: { id: 't', component: 'Heading', level: 1, text: 'Basalt' },
    f: { id: 'f', component: 'Facts', items: [{ label: 'Type', value: '[[Extrusive rock]]' }] },
    p: { id: 'p', component: 'Prose', text: '**Basalt** forms from [[lava|Lava flow|molten rock]] and {abbr|UTC|time}.' },
    h2: { id: 'h2', component: 'Heading', level: 2, text: 'Formation' },
    p2: { id: 'p2', component: 'Prose', text: 'It cools at [[ridges]]; see [[the site|https://example.org]].' },
    h3: { id: 'h3', component: 'Heading', level: 3, text: 'Ridges' },
    p3: { id: 'p3', component: 'Prose', text: 'Spreading.' },
    h2b: { id: 'h2b', component: 'Heading', level: 2, text: 'Uses' },
    p4: { id: 'p4', component: 'Prose', text: 'Roads.' },
  },
};

test('agent: plain text drops markup and keeps the words', () => {
  assert.equal(plain('**Basalt** from [[lava|Lava flow|x]] and {abbr|UTC|time}'), 'Basalt from lava and UTC');
});

test('agent: links separate pages from outside sites, dedupe, and keep descriptions', () => {
  const all = linksIn('[[lava|Lava flow|molten rock]] [[the site|https://example.org]]');
  assert.equal(all[0].topic, 'Lava flow');
  assert.equal(all[0].description, 'molten rock');
  assert.equal(all[1].url, 'https://example.org');
  assert.deepEqual(pageLinks(surface).map((l) => l.topic), ['Extrusive rock', 'Lava flow', 'ridges']);
});

test('agent: a section includes its sub-sections and stops at the next section', () => {
  const part = pageMarkdown(surface, 'formation');
  assert.match(part, /## Formation/);
  assert.match(part, /### Ridges/);
  assert.doesNotMatch(part, /Uses|Roads/);
  assert.equal(pageMarkdown(surface, 'nope'), null);
  assert.deepEqual(sectionsOf(surface).map((s) => s.title), ['Formation', 'Ridges', 'Uses']);
});

function fakeApp(overrides = {}) {
  const state = { node: { id: 'n1', topic: 'Basalt', page: {} }, surface, error: null, spend: 0.01, budget: 0, hasKey: true, canGoBack: false, canGoForward: false, preferences: {} };
  const saved = [];
  const app = {
    read: () => state,
    trail: () => [{ id: 'n1' }],
    search: (topic) => { state.node = { id: 'n2', topic, page: { metrics: { cost: 0.004 } } }; return 'n2'; },
    follow: (topic) => app.search(topic),
    home() {}, back() {}, forward() {}, jump() {},
    save: (patch) => saved.push(patch),
    ...overrides,
  };
  return { app, state, saved, tool: (name) => buildTools(app).find((t) => t.name === name) };
}

test('agent: every tool has a name, a description and a schema', () => {
  const names = buildTools(fakeApp().app).map((t) => t.name);
  assert.deepEqual(names, ['search', 'open_link', 'read_page', 'list_links', 'go_back', 'go_forward', 'go_home', 'get_trail', 'get_status', 'set_preferences']);
  for (const t of buildTools(fakeApp().app)) assert.ok(t.description && t.inputSchema.type === 'object');
});

test('agent: search waits for the new page and describes it', async () => {
  const { tool } = fakeApp();
  const out = await tool('search').execute({ topic: 'Granite' });
  assert.equal(JSON.parse(out.content[0].text).topic, 'Granite');
});

test('agent: spending is refused without a key or past the limit the user set', async () => {
  const noKey = fakeApp();
  noKey.state.hasKey = false;
  assert.equal((await noKey.tool('search').execute({ topic: 'x' })).isError, true);
  const spent = fakeApp();
  spent.state.budget = 0.01;
  assert.match((await spent.tool('open_link').execute({ topic: 'x' })).content[0].text, /limit/);
});

test('agent: preferences are validated, and the key and limit cannot be set', async () => {
  const { tool, saved } = fakeApp();
  assert.equal((await tool('set_preferences').execute({ language: 'xx' })).isError, true);
  assert.equal((await tool('set_preferences').execute({})).isError, true);
  await tool('set_preferences').execute({ language: 'es', accessibility: true, apiKey: 'csk-1', budget: 99 });
  assert.deepEqual(saved, [{ language: 'es', a11y: true }]);
});

test('agent: reading a missing section names the real ones', async () => {
  const out = await fakeApp().tool('read_page').execute({ section: 'Nope' });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /Formation; Ridges; Uses/);
});

import { a11yLines, checkTranslation } from '../src/engine/translatePage.js';
import { parseA11y } from '../src/engine/a11y.js';
import { journeyReducer } from '../src/state/journey.js';

const COMPACT = '# Basalt\n@ Type: Rock\n**Basalt** forms from [[lava|Lava flow]] and [[ridges]].\n## Formation\nIt cools at [[vents]].';

test('translate: a translation must keep the structure and most of its links', () => {
  const good = '# Basalto\n@ Tipo: Roca\n**Basalto** se forma de [[lava|Flujo de lava]] y [[dorsales]].\n## Formación\nSe enfría en [[respiraderos]].';
  assert.equal(checkTranslation(COMPACT, good, 'a2ui'), null);
  assert.match(checkTranslation(COMPACT, '# Basalto\nTodo sin enlaces y sin secciones.', 'a2ui'), /structure|sections|links/);
  assert.match(checkTranslation('<h1>A</h1><p><a>x</a></p>', '<h1>A</h1><p>x</p>', 'html'), /links/);
  assert.match(checkTranslation(COMPACT, '  ', 'a2ui'), /empty/);
});

test('translate: accessibility notes survive a round trip through their line format', () => {
  const a11y = { summary: 'Gist.', abbr: [{ term: 'UTC', expansion: 'Universal time' }], lang: [{ phrase: 'ad hoc', code: 'la' }], links: [{ text: 'Moon', desc: 'a satellite' }] };
  assert.deepEqual(parseA11y(a11yLines(a11y)), a11y);
  assert.equal(a11yLines(null), '');
});

test('journey: a translation is kept beside the page under its language, and the original stays', () => {
  let state = { nodes: { n: { id: 'n', topic: 'T', page: { langKey: 'en', compact: 'x' } } }, order: ['n'], currentId: 'n' };
  state = journeyReducer(state, { type: 'translated', id: 'n', key: 'es', variant: { compact: 'y' } });
  state = journeyReducer(state, { type: 'translated', id: 'n', key: 'zh', variant: { compact: 'z' } });
  assert.equal(state.nodes.n.page.compact, 'x');
  assert.deepEqual(Object.keys(state.nodes.n.page.translations), ['es', 'zh']);
  assert.equal(journeyReducer(state, { type: 'translated', id: 'gone', key: 'es', variant: {} }), state);
});

import { pickActive } from '../src/ui/useActiveSection.js';

test('contents: the section being read is the last heading past the reading line, or the last at the end', () => {
  const tops = [{ id: 'a', top: -400 }, { id: 'b', top: 60 }, { id: 'c', top: 500 }];
  assert.equal(pickActive(tops, false), 'b');
  assert.equal(pickActive([{ id: 'a', top: 300 }], false), null);
  assert.equal(pickActive(tops, true), 'c');
  assert.equal(pickActive([], true), null);
});
