import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyReducer, journeyOf } from '../src/hooks/useHistory.js';
import { child, leaf, parts, trail } from '../src/lib/topics.js';
import { countLinks, parseStarters, wellFormed } from '../src/services/ai.js';
import { cost, getModel } from '../src/services/models.js';

const page = (id, topic) => ({ id, topic, html: `<h1>${topic}</h1>` });
const EMPTY = { entries: [], index: -1 };

test('topics: a link extends the path and the path is capped', () => {
  assert.equal(child('', 'Lighthouse'), 'Lighthouse');
  assert.equal(child('Lighthouse', 'Navigation'), 'Lighthouse > Navigation');
  assert.equal(child('A > B > C > D', 'E'), 'B > C > D > E');
  assert.equal(leaf('A > B > C'), 'C');
  assert.deepEqual(trail('A > B > C'), ['A', 'B']);
  assert.deepEqual(parts('  Plain topic  '), ['Plain topic']);
  assert.deepEqual(parts('C->D'), ['C->D']);
});

test('history: a new page drops forward history, and a finished page fills its own entry', () => {
  let state = [page('a', 'A'), page('b', 'B')].reduce((s, entry) => historyReducer(s, { type: 'push', entry }), EMPTY);
  state = historyReducer(state, { type: 'locate', id: 'a' }); // browser Back
  state = historyReducer(state, { type: 'push', entry: { id: 'c', topic: 'C' } }); // a link, not yet written
  assert.deepEqual(state.entries.map((e) => e.topic), ['A', 'C']);
  assert.equal(state.entries[state.index].html, undefined);

  state = historyReducer(state, { type: 'locate', id: 'a' }); // Back while C is being written
  state = historyReducer(state, { type: 'fill', id: 'c', page: { html: '<h1>C</h1>' } });
  assert.equal(state.entries[state.index].topic, 'A');
  assert.equal(state.entries[1].html, '<h1>C</h1>');
  assert.equal(historyReducer(state, { type: 'fill', id: 'gone', page: { html: 'x' } }), state);
});

test('history: follows the browser to any entry, including ones it no longer holds', () => {
  let state = EMPTY;
  for (let i = 0; i < 40; i++) state = historyReducer(state, { type: 'push', entry: page(`t${i}`, `T${i}`) });
  assert.equal(state.entries.length, 30);
  assert.equal(state.entries[state.index].topic, 'T39');

  assert.equal(historyReducer(state, { type: 'locate', id: 't20' }).index, 10);
  assert.equal(historyReducer(state, { type: 'locate', id: undefined }).index, -1); // the page the app opened on

  // t3 was dropped for age: it comes back as an unwritten page for its topic.
  const revisited = historyReducer(state, { type: 'locate', id: 't3', topic: 'T3' });
  assert.deepEqual(revisited, { entries: [{ id: 't3', topic: 'T3' }], index: 0 });
});

test('journey: the stops since the reader last went home', () => {
  const entries = [page('a', 'A'), { id: 'h', home: true }, page('b', 'B'), page('c', 'C'), page('d', 'D')];
  assert.deepEqual(journeyOf({ entries, index: 3 }).map((e) => e.topic), ['B', 'C']);
  assert.deepEqual(journeyOf({ entries, index: 1 }), []);
  assert.deepEqual(journeyOf({ entries, index: -1 }), []);
});

test('wellFormed: decides whether the model must repair its reply', () => {
  assert.ok(wellFormed('<h1>Tea</h1><p>Leaf.</p>'));
  assert.ok(wellFormed('\n<h1>Tea</h1>\n<p>Has ``` inside prose.</p>\n'));
  assert.ok(!wellFormed('```html\n<h1>Tea</h1><p>Leaf.</p>\n```'));
  assert.ok(!wellFormed('Here is your article:\n<h1>Tea</h1><p>Leaf.</p>'));
  assert.ok(!wellFormed('<h1>Tea</h1><p>Cut off mid sent'));
  // HTML allows the last </p> to be left off; that is not worth a rewrite.
  assert.ok(wellFormed('<h1>Tea</h1><p>A <a>leaf</a> steeped in water.'));
  assert.ok(wellFormed('<h1>Tea</h1><ul><li>Green</li><li>Black tea (fermented)'));
  assert.ok(!wellFormed('<h1>Tea</h1><p>Leaf.</p>\nLet me know if you want more.'));
  assert.ok(!wellFormed('<h1>Tea</h1><p>Leaf.</p>\n```'));
  assert.ok(!wellFormed('# Tea\n\nMarkdown instead of HTML.'));
});

test('cost: priced per million tokens', () => {
  assert.equal(cost(getModel('qwen-3.8-27b'), 1_000_000, 1_000_000), 0.99 + 1.49);
  assert.equal(getModel('retired-model').id, 'qwen-3.8-27b');
});

test('parseStarters: accepts only a clean list of six distinct topics', () => {
  const six = ['Tide pools', 'Basalt', 'Abacus', 'Sextant', 'Woad', "Zeno's paradoxes"];
  assert.deepEqual(parseStarters(`${six.join('\n')}\n`), six);
  assert.equal(parseStarters(six.slice(0, 5).join('\n')), null);
  assert.equal(parseStarters(six.map((topic) => `- ${topic}`).join('\n')), null);
  assert.equal(parseStarters(`Here are six topics:\n${six.join('\n')}`), null);
  assert.equal(parseStarters([...six.slice(0, 5), '<b>Basalt</b>'].join('\n')), null);
});

test('countLinks: decides whether the model must add links', () => {
  assert.equal(countLinks('<h1>Tea</h1><p><b>Tea</b> is a <b>drink</b>.</p>'), 0);
  assert.equal(countLinks('<p>An <a>infusion</a> of <a href="https://example.org">leaves</a>, <abbr>etc</abbr>.</p>'), 2);
});
