import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitWords } from '../src/a2ui/inlineParse.js';
import { a11yDigest, applyA11y, parseA11y } from '../src/engine/a11y.js';
import { applyLinkPhrases, worthLinking } from '../src/engine/compact.js';
import { chunkEntries, parseJsonObject, validateCatalog } from '../src/engine/translate.js';
import { interpolate, translateWith } from '../src/i18n/index.js';

const surface = () => ({
  id: 's',
  components: {
    root: { id: 'root', component: 'Column', children: ['h', 'p1', 'p2'] },
    h: { id: 'h', component: 'Heading', level: 1, text: 'Apollo 11' },
    p1: { id: 'p1', component: 'Prose', text: 'The [[Moon|Moon]] landing used a Saturn V and UTC time. Ad hoc plans.' },
    p2: { id: 'p2', component: 'Prose', text: 'UTC again, with an ad hoc check.' },
  },
});

test('a11y: parseA11y reads the four line kinds and drops malformed ones', () => {
  const out = parseA11y('summary: A short gist.\nabbr: UTC = Coordinated Universal Time\nabbr: nonsense\nlang: ad hoc | la\nlang: bad | not a code!\nlink: Moon = Earth\'s satellite');
  assert.equal(out.summary, 'A short gist.');
  assert.deepEqual(out.abbr, [{ term: 'UTC', expansion: 'Coordinated Universal Time' }]);
  assert.deepEqual(out.lang, [{ phrase: 'ad hoc', code: 'la' }]);
  assert.equal(out.links[0].desc, "Earth's satellite");
});

test('a11y: applyA11y tags first mention only, describes links, inserts the summary, leaves the original alone', () => {
  const original = surface();
  const before = JSON.stringify(original);
  const { surface: out, applied } = applyA11y(original, {
    summary: 'Gist.',
    abbr: [{ term: 'UTC', expansion: 'Coordinated Universal Time' }],
    lang: [{ phrase: 'ad hoc', code: 'la' }],
    links: [{ text: 'Moon', desc: 'natural satellite' }],
  });
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(applied, { abbr: 1, lang: 1, links: 1, summary: true });
  assert.match(out.components.p1.text, /\{abbr\|UTC\|Coordinated Universal Time\}/);
  assert.match(out.components.p1.text, /\{lang\|Ad hoc\|la\}|\{lang\|ad hoc\|la\}/i);
  assert.match(out.components.p1.text, /\[\[Moon\|Moon\|natural satellite\]\]/);
  assert.equal(out.components.p2.text.includes('{abbr|'), false);
  assert.equal(out.components.root.children[1], 'a11y-summary');
  assert.equal(applyA11y(original, null).surface, original);
});

test('a11y: the digest lists headings and prose', () => {
  assert.equal(a11yDigest(surface()).split('\n')[0], '# Apollo 11');
});

test('translate: parseJsonObject tolerates fences and rejects junk', () => {
  assert.deepEqual(parseJsonObject('```json\n{"a":"b"}\n```'), { a: 'b' });
  assert.equal(parseJsonObject('no json'), null);
  assert.equal(parseJsonObject('{broken'), null);
});

test('translate: validateCatalog flags missing, empty and broken placeholders', () => {
  const source = { a: 'Hello {name}', b: 'Plain', c: 'Cost {n}' };
  assert.equal(validateCatalog(source, { a: 'Hola {name}', b: 'Llano', c: 'Coste {n}' }).ok, true);
  const bad = validateCatalog(source, { a: 'Hola', b: ' ', extra: 'x' });
  assert.deepEqual(bad.broken, ['a']);
  assert.deepEqual(bad.missing.sort(), ['b', 'c']);
  assert.deepEqual(bad.extra, ['extra']);
});

test('translate: chunkEntries splits without losing keys', () => {
  const entries = Array.from({ length: 100 }, (_, i) => [`k${i}`, 'v']);
  const parts = chunkEntries(entries, 45);
  assert.deepEqual(parts.map((p) => Object.keys(p).length), [45, 45, 10]);
});

test('i18n: interpolation fills placeholders and falls back to English, then the key', () => {
  assert.equal(interpolate('Hi {name}', { name: 'Ana' }), 'Hi Ana');
  assert.equal(translateWith({}, 'nav.back'), 'Back');
  assert.equal(translateWith({}, 'no.such.key'), 'no.such.key');
});

test('cjk: words are split without spaces and link phrases match without word boundaries', () => {
  const words = splitWords('登月任务成功了');
  assert.ok(words.length > 1);
  assert.equal(words.join(''), '登月任务成功了');
  assert.equal(worthLinking('登月任务', 'body'), true);
  const out = applyLinkPhrases('# 阿波罗\n登月任务成功了。', '1: 登月任务');
  assert.equal(out.added, 1);
  assert.ok(out.text.includes('[[登月任务]]'));
});
