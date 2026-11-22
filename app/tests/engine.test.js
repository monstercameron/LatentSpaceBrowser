import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isExternal, parseInline, splitWords } from '../src/a2ui/inlineParse.js';
import { childrenOf, headingsOf, surfaceFrom } from '../src/a2ui/surface.js';
import { applyLinkPhrases, blocksOf, expandCompact, linkPassPrompt, linkStats, titleOf, worthLinking } from '../src/engine/compact.js';
import { countLinks, cleanHtmlReply, wellFormed } from '../src/engine/html.js';
import { DEFAULT_MODEL, DEPTHS, cost, getModel } from '../src/engine/models.js';
import { htmlSystem, pageSystem, pageUser } from '../src/engine/prompts.js';
import { parseStarters, sample, summarize } from '../src/engine/pipeline.js';

const PAGE = [
  '# Basalt',
  '@ Type: Extrusive rock',
  '@ Density: 2.9 to 3.0 g/cm³',
  '**Basalt** is a volcanic rock formed by lava.',
  '## Formation',
  'It cools fast.',
  '- Mid-ocean ridges',
  '- Hot spots',
  '## Uses',
  '> A quotation.',
].join('\n');

test('compact: lines expand into one A2UI surface with the blocks in reading order', () => {
  const { messages, errors } = expandCompact(PAGE);
  assert.deepEqual(errors, []);
  assert.ok(messages[0].createSurface);
  const surface = surfaceFrom(messages);
  const kinds = childrenOf(surface, 'root').map((id) => surface.components[id].component);
  assert.deepEqual(kinds, ['Heading', 'Facts', 'Prose', 'Heading', 'Prose', 'List', 'Heading', 'Quote']);
  const facts = surface.components[childrenOf(surface, 'root')[1]];
  assert.equal(facts.items.length, 2, 'consecutive @ lines are one Facts block');
  assert.deepEqual(facts.items[1], { label: 'Density', value: '2.9 to 3.0 g/cm³' });
  assert.deepEqual(headingsOf(surface).map((h) => h.text), ['Formation', 'Uses']);
});

test('compact: ### is a sub-section, and the contents list reports sections and sub-sections with their level', () => {
  const s = surfaceFrom(expandCompact('# T\ntext\n## Origins\nbody\n### Early years\nmore\n### Later years\nmore\n## Legacy\nend').messages);
  assert.deepEqual(headingsOf(s).map((h) => `${h.level}:${h.text}`), ['2:Origins', '3:Early years', '3:Later years', '2:Legacy']);
  assert.deepEqual(blocksOf('# T\n## S\n### Sub\ntext').map((b) => b.text), ['text'], 'no heading is a block that can carry a link');
  assert.deepEqual(expandCompact('# T\n## S\n### Sub\ntext').errors, []);
});

test('depth: every level names its layout in terms each path can fill, and the prompts carry the substance rules', () => {
  for (const [id, d] of Object.entries(DEPTHS)) {
    assert.ok(d.shape.includes('{h2}'), `${id} layout names its sections`);
    assert.ok(d.words > 0 && d.budget > d.words, `${id} has room to write its words`);
  }
  assert.ok(DEPTHS.short.words < DEPTHS.standard.words && DEPTHS.standard.words < DEPTHS.deep.words);
  const compactPrompt = pageSystem(DEPTHS.standard);
  const htmlPrompt = htmlSystem(DEPTHS.standard);
  assert.ok(compactPrompt.includes('### sub-section') && compactPrompt.includes('four or five ## sections'));
  assert.ok(htmlPrompt.includes('<h3> sub-section') && htmlPrompt.includes('four or five <h2> sections'));
  for (const prompt of [compactPrompt, htmlPrompt]) {
    assert.ok(!prompt.includes('{h2}') && !prompt.includes('{h3}'), 'no placeholder is left unfilled');
    assert.ok(prompt.includes('Substance.') && prompt.includes('disputed, uncertain or commonly misunderstood'));
  }
  assert.ok(pageSystem(DEPTHS.short).includes('no ### sub-sections'));
  assert.ok(pageUser('Rome', ['Caesar']).includes('give that connection real space'));
});

test('compact: a later single # is a section, and bad replies are reported', () => {
  const s = surfaceFrom(expandCompact('# T\n# Section\ntext').messages);
  assert.deepEqual(headingsOf(s).map((h) => h.text), ['Section']);
  assert.ok(expandCompact('{"id":"root"}\ntext').errors.some((e) => e.includes('JSON')));
  assert.ok(expandCompact('Just a paragraph\n## S').errors.some((e) => e.includes('Title')));
  assert.deepEqual(expandCompact('```\n# T\n```').errors, ['no ## sections'], 'code fences around the page are ignored');
});

test('compact: half-written text expands without throwing, so streaming can render it', () => {
  for (let i = 0; i <= PAGE.length; i += 7) {
    const { messages } = expandCompact(PAGE.slice(0, i));
    const surface = surfaceFrom(messages);
    assert.ok(surface.id === 'page');
    assert.ok(Array.isArray(childrenOf(surface, 'root')));
  }
});

test('surface: an update for a surface that was never created is ignored', () => {
  const stray = { version: '1.0', updateComponents: { surfaceId: 'other', components: [{ id: 'root', component: 'Column', children: [] }] } };
  assert.deepEqual(surfaceFrom([stray]).components, {});
});

test('links: every block that can carry a link is numbered, facts with their label', () => {
  assert.deepEqual(
    blocksOf(PAGE).map((b) => `${b.kind}:${b.text}`),
    ['fact:Extrusive rock', 'fact:2.9 to 3.0 g/cm³', 'paragraph:**Basalt** is a volcanic rock formed by lava.', 'paragraph:It cools fast.', 'item:Mid-ocean ridges', 'item:Hot spots', 'quote:A quotation.'],
  );
  assert.equal(blocksOf(PAGE)[0].prefix, '@ Type: ');
  assert.equal(
    linkPassPrompt('# Basalt\n@ Type: rock\nA [[x]] line.\n- An item'),
    'Subject: Basalt\n1 (fact: Type): rock\n2: A [[x]] line.\n3 (item): An item',
  );
  assert.equal(titleOf(PAGE), 'Basalt');
});

test('links: the pass wraps phrases and skips the subject, taken phrases and phrases it cannot find', () => {
  const page = '# Basalt\n**Basalt** is a volcanic rock formed by [[lava]].\n## Formation\nMagma cools at the mid-ocean ridge.';
  const r = applyLinkPhrases(page, '1: volcanic rock | Basalt | lava | nowhere\n2: mid-ocean ridge');
  assert.equal(r.added, 2);
  assert.equal(r.missed, 1);
  assert.equal(r.asked, 5);
  assert.ok(r.text.includes('[[volcanic rock]]') && r.text.includes('[[mid-ocean ridge]]') && r.text.includes('**Basalt**'));
});

test('links: facts, list items and quotes are linked too, and keep their line markers', () => {
  const page = '# X\n@ Origin: Italy and France\n@ Key Figure: Pope Paul IV\nBody.\n- Mid-ocean ridges\n> A quote about Rome.';
  const r = applyLinkPhrases(page, '1 (fact: Origin): Italy | France\n2: Pope Paul IV\n4: Mid-ocean ridges\n5: Rome');
  assert.equal(r.added, 5);
  assert.deepEqual(r.text.split('\n'), [
    '# X',
    '@ Origin: [[Italy]] and [[France]]',
    '@ Key Figure: [[Pope Paul IV]]',
    'Body.',
    '- [[Mid-ocean ridges]]',
    '> A quote about [[Rome]].',
  ]);
  const surface = surfaceFrom(expandCompact(r.text).messages);
  const facts = surface.components[childrenOf(surface, 'root')[1]];
  assert.equal(facts.items[1].value, '[[Pope Paul IV]]', 'the link survives into the Facts component');
});

test('links: the key facts and the text are separate surfaces, so each links a term on its own', () => {
  const page = '# X\n@ Agents: iodine and alcohol\nIodine and alcohol are common. Iodine stains.';
  const r = applyLinkPhrases(page, '1: iodine | alcohol\n2: Iodine | alcohol');
  assert.deepEqual(r.text.split('\n').slice(1), ['@ Agents: [[iodine]] and [[alcohol]]', '[[Iodine]] and [[alcohol]] are common. Iodine stains.']);
  assert.equal(r.added, 4);
});

test('links: a partial reference can open the full page', () => {
  const page = '# Trent\nThe council met in Trent, and Bernini’s work followed.';
  const r = applyLinkPhrases(page, '1: The council > Council of Trent | Bernini’s > Gian Lorenzo Bernini | Trent > Trent');
  assert.ok(r.text.includes('[[The council|Council of Trent]]'));
  assert.ok(r.text.includes('[[Bernini’s|Gian Lorenzo Bernini]]'));
  assert.equal(r.retargeted, 2);
  assert.ok(!r.text.includes('[[Trent'), 'the page subject is never linked, even when named again');
  assert.equal(applyLinkPhrases('# X\nThe council met.', '1: council => Council of Trent').retargeted, 1, 'arrow variants are read');
});

test('links: what the model changes silently still lands, and a thing is linked once however it is spelled', () => {
  const page = '# X\nFine‑grained Lava flows. The mid‑ocean ridge and the Mid-Ocean Ridges.\nMore lavas here.';
  const r = applyLinkPhrases(page, '1: fine-grained | lava | mid-ocean ridge\n2: Lava');
  assert.ok(r.text.includes('[[Fine‑grained]]'), 'a Unicode hyphen matches an ASCII one');
  assert.ok(r.text.includes('[[Lava]]'), 'a changed case matches');
  assert.ok(r.text.includes('[[mid‑ocean ridge]]') && !r.text.includes('[[Mid-Ocean Ridges]]'), 'only the first mention is linked');
  assert.equal(r.text.split('\n')[2], 'More lavas here.', 'Lava is already linked, so lavas is not linked again');
  assert.equal(r.missed, 0);
});

test('links: never inside an existing link or the bold subject, never past the cap, and one row per block', () => {
  assert.equal(applyLinkPhrases('# X\n**Alpha beta** and [[gamma delta]] go.', '1: beta | delta').added, 0);
  const r = applyLinkPhrases('# X\nOne two three four five six.', '1: One | two | three | four | five', { maxPerBlock: 3 });
  assert.equal(r.added, 3);
  assert.equal(applyLinkPhrases('# X\nOne two three.', '1: One\n1: two').added, 1);
  assert.equal(applyLinkPhrases('# X\nOne two three.', '9: One').added, 0, 'a block number that does not exist is ignored');
});

test('links: units, numbers and run-on descriptions are not worth a link', () => {
  for (const no of ['%', 'g/cm³', '1545–1563', '2.9 to 3.0', 'hand powered analog computer that models', 'CO2']) {
    assert.equal(worthLinking(no), false, no);
  }
  for (const yes of ['Pope Paul IV', 'Council of Trent', 'Apollo 11', 'plagioclase feldspar', 'Gian Lorenzo Bernini']) {
    assert.equal(worthLinking(yes), true, yes);
  }
  assert.equal(worthLinking('five words in one phrase', 'paragraph'), true);
  assert.equal(worthLinking('five words in one phrase', 'fact'), false, 'a fact value is shorter than a sentence');
  const r = applyLinkPhrases('# X\n@ Density: 2.9 g/cm³\n@ Origin: Italy\nText.', '1: g/cm³\n2: Italy');
  assert.equal(r.rejected, 1);
  assert.deepEqual(r.text.split('\n').slice(1, 3), ['@ Density: 2.9 g/cm³', '@ Origin: [[Italy]]']);
});

test('links: how many links a page has and which blocks have none', () => {
  assert.deepEqual(linkStats('# X\n@ A: [[b]]\nplain.\n[[c]] and [[d]].'), { links: 3, blocks: 3, bare: 1 });
});

test('html: a reply is well formed when it starts with a title and ends inside the page', () => {
  assert.ok(wellFormed('<h1>Basalt</h1><p>A <a>rock</a>.</p>'));
  assert.ok(wellFormed('<h1>Basalt</h1><p>A last paragraph left open.'), 'an unclosed final <p> is valid HTML');
  assert.ok(!wellFormed('Here is the page:\n<h1>Basalt</h1><p>x</p>'), 'a preamble breaks the contract');
  assert.ok(!wellFormed('<h1>Basalt</h1><p>x</p>\nHope that helps!'), 'a sign-off breaks it');
  assert.ok(!wellFormed('<h1>Basalt</h1><p>A sentence that stops midw'), 'a cut-off sentence is a fault');
  assert.equal(countLinks('<p><a>x</a> and <a href="https://e.com">y</a> <abbr>z</abbr></p>'), 2);
});

test('html: a code fence around the fragment is removed', () => {
  assert.equal(cleanHtmlReply('```html\n<h1>T</h1><p>x</p>\n```'), '<h1>T</h1><p>x</p>');
  assert.equal(cleanHtmlReply('  <h1>T</h1>  '), '<h1>T</h1>');
});

test('inline: links, bold and italic are read, and a link can name the page it opens', () => {
  assert.deepEqual(parseInline('A [[volcanic rock]] with **Basalt** and *sola fide* here.'), [
    { kind: 'text', text: 'A ' },
    { kind: 'link', text: 'volcanic rock', target: 'volcanic rock' },
    { kind: 'text', text: ' with ' },
    { kind: 'bold', text: 'Basalt' },
    { kind: 'text', text: ' and ' },
    { kind: 'italic', text: 'sola fide' },
    { kind: 'text', text: ' here.' },
  ]);
  assert.deepEqual(parseInline('the [[council|Council of Trent]] met')[1], { kind: 'link', text: 'council', target: 'Council of Trent' });
});

test('inline: markup that has not finished streaming is hidden, not shown', () => {
  assert.equal(parseInline('The **Bas')[0].text, 'The Bas');
  assert.equal(parseInline('see [[volc')[0].text, 'see ');
  assert.equal(parseInline('see [')[0].text, 'see ');
  assert.deepEqual(parseInline(''), []);
});

test('inline: code, and links out of the app, which the HTML path can write', () => {
  const t = parseInline('Run `npm test`, see [[the docs|https://example.com/docs?a=1]] or [[Rome]].');
  assert.deepEqual(t.filter((x) => x.kind !== 'text').map((x) => `${x.kind}:${x.text}${x.target ? '>' + x.target : ''}`), [
    'code:npm test',
    'link:the docs>https://example.com/docs?a=1',
    'link:Rome>Rome',
  ]);
  assert.equal(isExternal('https://example.com'), true);
  assert.equal(isExternal('HTTP://EXAMPLE.COM'), true);
  assert.equal(isExternal('Council of Trent'), false);
  assert.equal(isExternal('javascript:alert(1)'), false, 'only web addresses leave the app');
});

test('inline: brackets never reach the screen, even doubled or stray', () => {
  assert.deepEqual(parseInline('[[[[Neo-Gothic]]]]'), [{ kind: 'link', text: 'Neo-Gothic', target: 'Neo-Gothic' }]);
  assert.deepEqual(parseInline('a [[b]] c]] d'), [
    { kind: 'text', text: 'a ' },
    { kind: 'link', text: 'b', target: 'b' },
    { kind: 'text', text: ' c d' },
  ]);
  assert.ok(!JSON.stringify(parseInline('[[[[x]]]] and [[y|[[Z]]]]')).includes('[['));
});

test('inline: text splits into words and the space between them, so each word can be its own element', () => {
  assert.deepEqual(splitWords('a  b c'), ['a', '  ', 'b', ' ', 'c']);
  assert.deepEqual(splitWords(' lead'), [' ', 'lead']);
  assert.deepEqual(splitWords(''), []);
});

test('models: Qwen is the default, an unknown id falls back to it, and cost is per million tokens', () => {
  assert.equal(DEFAULT_MODEL, 'qwen-3.8-27b');
  assert.equal(getModel('retired').id, 'qwen-3.8-27b');
  assert.equal(cost(getModel('gpt-oss-120b'), 1_000_000, 1_000_000), 0.35 + 0.75);
});

test('pipeline: a receipt sums its passes and says when the text was ready', () => {
  const pass = (seconds, cost) => ({ name: 'x', seconds, ttft: 0.1, inTokens: 100, outTokens: 50, cost });
  const m = summarize([pass(0.6, 0.001), pass(0.4, 0.0005)]);
  assert.equal(m.ready, 0.6);
  assert.equal(m.done, 1);
  assert.equal(m.outTokens, 100);
  assert.ok(Math.abs(m.cost - 0.0015) < 1e-12);
});

test('starters: only a clean list of the right length is accepted', () => {
  const six = 'Basalt\nLoom\nAstrolabe\nTundra\nFugue\nSundial';
  assert.equal(parseStarters(six)?.length, 6);
  assert.equal(parseStarters('Here are six:\n' + six), null);
  assert.equal(parseStarters('1. Basalt\n2. Loom\n3. A\n4. B\n5. C\n6. D'), null);
  assert.equal(parseStarters('Basalt\nBasalt\nLoom\nA b\nC d\nE f'), null, 'duplicates are rejected');
  assert.equal(sample([1, 2, 3], 5).length, 3);
});
