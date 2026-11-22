import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY, MAX_WRITTEN, journeyReducer, pathTo, stopsTo, treeRows } from '../src/state/journey.js';
import { DEFAULTS, normalize } from '../src/state/settings.js';
import { ensure, forget, has, unusedPrefetchCost } from '../src/state/cache.js';
import { getSpend } from '../src/state/spend.js';
import { MAX_LENS, lensOf, pageKey, readUrl, urlFor } from '../src/state/topics.js';

const push = (state, id, topic, extra = {}) => journeyReducer(state, { type: 'push', id, topic, ...extra });
const page = (cost = 0.001) => ({ compact: '# X', metrics: { cost } });

test('lens: a link carries the path so far, capped, and a search starts from nothing', () => {
  let s = push(EMPTY, 'a', 'Lighthouse');
  s = push(s, 'b', 'Navigation');
  s = push(s, 'c', 'Compass');
  assert.deepEqual(s.nodes.c.lens, ['Lighthouse', 'Navigation']);
  assert.equal(s.nodes.c.parentId, 'b');
  s = push(s, 'd', 'Magnetism', { fresh: true });
  assert.deepEqual(s.nodes.d.lens, []);
  assert.equal(s.nodes.d.parentId, null);
  let long = EMPTY;
  for (const [i, t] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) long = push(long, `n${i}`, t);
  assert.equal(long.nodes.n5.lens.length, MAX_LENS);
  assert.deepEqual(long.nodes.n5.lens, ['B', 'C', 'D', 'E']);
});

test('url: the lens travels in the address, and a shared link reads back the same page', () => {
  const node = { kind: 'page', topic: 'Compass', lens: ['Lighthouse', 'Navigation'] };
  assert.equal(urlFor(node), '?topic=Compass&via=Lighthouse&via=Navigation');
  assert.deepEqual(readUrl(urlFor(node)), { topic: 'Compass', lens: ['Lighthouse', 'Navigation'] });
  assert.equal(readUrl(''), null);
  assert.equal(readUrl('?topic=%20'), null);
  assert.equal(urlFor({ kind: 'retro', topic: 'Journey Retrospective', lens: [] }), '');
  assert.deepEqual(readUrl('?topic=A&via=1&via=2&via=3&via=4&via=5').lens, ['2', '3', '4', '5']);
});

test('keys: the HTML and A2UI paths never share a page, and HTML ignores the link model', () => {
  const a = { format: 'a2ui', model: 'm', linkModel: 'l', depth: 'short' };
  const h = { ...a, format: 'html' };
  assert.notEqual(pageKey({ topic: 'X' }, a), pageKey({ topic: 'X' }, h));
  assert.notEqual(pageKey({ topic: 'X' }, a), pageKey({ topic: 'X' }, { ...a, linkModel: 'other' }));
  assert.equal(pageKey({ topic: 'X' }, h), pageKey({ topic: 'X' }, { ...h, linkModel: 'other' }), 'the HTML path has no link pass');
});

test('settings: depth is short, standard or deep, defaults to standard, and the old name "long" means deep', () => {
  assert.equal(normalize({}).depth, 'standard');
  assert.equal(normalize({ depth: 'deep' }).depth, 'deep');
  assert.equal(normalize({ depth: 'long' }).depth, 'deep');
  assert.equal(normalize({ depth: 'short' }).depth, 'short');
  assert.equal(normalize({ depth: 'huge' }).depth, 'standard');
});

test('settings: the page format is html or a2ui, and anything else is a2ui', () => {
  assert.equal(normalize({ format: 'html' }).format, 'html');
  assert.equal(normalize({ format: 'xml' }).format, 'a2ui');
  assert.equal(normalize({}).format, 'a2ui');
});

test('keys: the same topic through a different lens or model is a different page', () => {
  const settings = { format: 'a2ui', model: 'm', linkModel: 'l', depth: 'short' };
  assert.notEqual(pageKey({ topic: 'X', lens: ['a'] }, settings), pageKey({ topic: 'X', lens: [] }, settings));
  assert.notEqual(pageKey({ topic: 'X' }, settings), pageKey({ topic: 'X' }, { ...settings, depth: 'long' }));
  assert.equal(pageKey({ topic: 'X', lens: ['a'] }, settings), pageKey({ topic: 'X', lens: ['a'] }, settings));
});

test('tree: going back and following another link makes a branch', () => {
  let s = push(push(push(EMPTY, 'a', 'A'), 'b', 'B'), 'c', 'C');
  s = journeyReducer(s, { type: 'locate', id: 'a' }); // Back, twice
  s = push(s, 'd', 'D'); // a different link from A
  assert.deepEqual(pathTo(s.nodes, 'd'), ['a', 'd']);
  assert.deepEqual(treeRows(s).map((r) => `${'-'.repeat(r.depth)}${r.node.topic}`), ['A', '-B', '--C', '-D']);
  assert.deepEqual(stopsTo(s.nodes, 'c'), ['A', 'B', 'C']);
  assert.deepEqual(s.nodes.d.lens, ['A']);
});

test('tree: a finished page fills its own node, even after the reader moved on', () => {
  let s = push(push(EMPTY, 'a', 'A'), 'b', 'B');
  s = journeyReducer(s, { type: 'locate', id: 'a' });
  s = journeyReducer(s, { type: 'fill', id: 'b', page: page() });
  assert.equal(s.currentId, 'a');
  assert.ok(s.nodes.b.page);
  assert.equal(journeyReducer(s, { type: 'fill', id: 'gone', page: page() }), s);
});

test('tree: only the newest pages keep their text, but every node stays in the tree', () => {
  let s = EMPTY;
  for (let i = 0; i < MAX_WRITTEN + 5; i++) {
    s = push(s, `n${i}`, `T${i}`);
    s = journeyReducer(s, { type: 'fill', id: `n${i}`, page: page() });
  }
  assert.equal(Object.keys(s.nodes).length, MAX_WRITTEN + 5);
  assert.equal(s.nodes.n0.page, undefined);
  assert.ok(s.nodes[`n${MAX_WRITTEN + 4}`].page);
});

test('tree: rewriting a page clears its text and can change its lens', () => {
  let s = push(push(EMPTY, 'a', 'A'), 'b', 'B');
  s = journeyReducer(s, { type: 'fill', id: 'b', page: page() });
  s = journeyReducer(s, { type: 'rewrite', id: 'b', lens: [] });
  assert.equal(s.nodes.b.page, undefined);
  assert.deepEqual(s.nodes.b.lens, []);
  assert.deepEqual(journeyReducer(s, { type: 'rewrite', id: 'b' }).nodes.b.lens, [], 'no lens given keeps the lens');
});

test('tree: a page this tab does not hold becomes a branch of its own, and home is no page', () => {
  let s = journeyReducer(EMPTY, { type: 'locate', id: 'x', node: { topic: 'Shared', lens: ['Via'] } });
  assert.equal(s.currentId, 'x');
  assert.deepEqual(s.nodes.x.lens, ['Via']);
  assert.equal(s.nodes.x.parentId, null);
  assert.equal(journeyReducer(s, { type: 'locate', id: null }).currentId, null);
  assert.equal(journeyReducer(s, { type: 'locate', id: 'unknown' }).currentId, null);
});

test('tree: a retrospective is not part of any lens', () => {
  let s = push(push(EMPTY, 'a', 'A'), 'b', 'B');
  s = push(s, 'r', 'Journey Retrospective', { kind: 'retro', stops: ['A', 'B'] });
  assert.equal(s.nodes.r.parentId, null);
  s = push(s, 'c', 'Suggested');
  assert.deepEqual(lensOf(s.nodes, 'r'), [], 'nothing before it counts');
  assert.deepEqual(s.nodes.c.lens, []);
});

test('settings: stored values that are not understood fall back to their defaults', () => {
  assert.deepEqual(normalize({}), { ...DEFAULTS });
  const n = normalize({ apiKey: ' Bearer csk-1 ', model: 'nope', depth: 'huge', text: 'tiny', mode: 'sepia', prefetch: 'yes', budget: -3 });
  assert.equal(n.apiKey, 'csk-1');
  assert.equal(n.model, DEFAULTS.model);
  assert.equal(n.depth, DEFAULTS.depth);
  assert.equal(n.text, 'medium');
  assert.equal(n.mode, 'system');
  assert.equal(n.prefetch, false);
  assert.equal(n.budget, 0);
  assert.equal(normalize({ prefetch: true, budget: 0.05, mode: 'dark', model: 'gpt-oss-120b' }).model, 'gpt-oss-120b');
});

test('cache: one write per key, a guess becomes a request, and a failure can be retried', async () => {
  let runs = 0;
  const run = (page) => () => { runs++; return Promise.resolve(page); };
  const before = getSpend();

  const a = ensure('k1', run(page(0.002)), { prefetch: true });
  assert.equal(a.adopted, false);
  const b = ensure('k1', run(page(9)));
  assert.equal(a, b, 'joins the write in flight');
  assert.equal(b.adopted, true);
  assert.equal(runs, 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(a.state.settled && a.state.page);
  assert.ok(Math.abs(getSpend() - before - 0.002) < 1e-9, 'a finished page is added to the spend once');

  ensure('k2', run(page(0.004)), { prefetch: true });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(Math.abs(unusedPrefetchCost() - 0.004) < 1e-9, 'only the guess nobody opened counts as unused');

  const failing = ensure('k3', () => Promise.reject(new Error('boom')));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(failing.state.error.message, 'boom');
  assert.equal(has('k3'), false, 'a failed write is dropped so asking again retries');
  forget('k1');
  assert.equal(has('k1'), false);
});

test('cache: subscribers hear the draft as it grows and see where the write is the moment they join', async () => {
  let emit;
  const entry = ensure('k4', (onEvent) => { emit = onEvent; return new Promise(() => {}); });
  const seen = [];
  const off = entry.subscribe((s) => seen.push(s.draft?.text ?? null));
  emit({ stage: 'prose', text: 'He' });
  emit({ stage: 'prose', text: 'Hello' });
  off();
  emit({ stage: 'prose', text: 'ignored' });
  assert.deepEqual(seen, [null, 'He', 'Hello']);
  const late = [];
  entry.subscribe((s) => late.push(s.draft?.text));
  assert.deepEqual(late, ['ignored']);
});
