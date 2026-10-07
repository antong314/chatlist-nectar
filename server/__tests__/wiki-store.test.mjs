import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendWikiFactToAnchoredBlock,
  appendWikiParagraph,
  applyWikiBlockEdits,
  createWikiContent,
  extractWikiText,
  replaceWikiText,
  slugifyWikiTitle,
  wikiBlocksForPlanning,
} from '../wiki-store.mjs';

const content = JSON.stringify([
  { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Markets' }] },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'San Mateo market is Thursday from 2 PM to 8 PM. ' },
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'Map' }] },
    ],
  },
]);

test('extracts readable text and links from BlockNote content', () => {
  const text = extractWikiText(content);
  assert.match(text, /Markets/);
  assert.match(text, /Thursday from 2 PM/);
  assert.match(text, /https:\/\/example\.com/);
});

test('applies minimal replacements and additions without discarding other blocks', () => {
  const replaced = replaceWikiText(content, 'San Mateo market is Thursday from 2 PM to 8 PM. ', 'San Mateo market is Thursday from 3 PM to 8 PM. ');
  assert.match(extractWikiText(replaced), /Thursday from 3 PM/);
  assert.match(extractWikiText(replaced), /Markets/);
  assert.match(extractWikiText(appendWikiParagraph(replaced, 'Confirmed August 2026.')), /Confirmed August 2026/);
});

test('creates valid simple pages and safe slugs from conversational input', () => {
  assert.deepEqual(JSON.parse(createWikiContent('First paragraph.\n\nSecond paragraph.')).length, 2);
  assert.equal(slugifyWikiTitle('Recycling & Re-use in San Matéo'), 'recycling-re-use-in-san-mateo');
});

test('writes text nodes BlockNote can load', () => {
  const textNodes = (serialized) => {
    const found = [];
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        if (value.type === 'text') found.push(value);
        Object.values(value).forEach(walk);
      }
    };
    walk(JSON.parse(serialized));
    return found;
  };
  const writes = [
    createWikiContent('First paragraph.\n\nSecond paragraph.'),
    appendWikiParagraph(content, 'A neighbor shared this protocol.'),
    appendWikiParagraph('Legacy plain text page.', 'Another detail.'),
    replaceWikiText(content, 'Markets', 'Farmers markets'),
  ];
  for (const serialized of writes) {
    for (const node of textNodes(serialized)) assert.deepEqual(typeof node.styles, 'object', JSON.stringify(node));
  }
});

test('adds a fact to an existing linked list item without duplicating the entry', () => {
  const restaurants = JSON.stringify([
    {
      type: 'bulletListItem',
      content: [
        { type: 'link', href: 'https://example.com/poza', content: [{ type: 'text', text: 'La Poza Blanca' }] },
        { type: 'text', text: ' - local favorite' },
      ],
    },
    {
      type: 'bulletListItem',
      content: [
        { type: 'link', href: 'https://example.com/other', content: [{ type: 'text', text: 'Other Place' }] },
        { type: 'text', text: ' - local favorite' },
      ],
    },
  ]);

  const updated = appendWikiFactToAnchoredBlock(restaurants, 'La Poza Blanca', 'great pizza');
  const blocks = JSON.parse(updated);
  assert.match(JSON.stringify(blocks[0]), /local favorite; great pizza/);
  assert.doesNotMatch(JSON.stringify(blocks[1]), /great pizza/);
  assert.equal((extractWikiText(updated).match(/La Poza Blanca/g) ?? []).length, 1);
});

const snakeBites = JSON.stringify([
  { id: 'b0', type: 'paragraph', props: { textColor: 'default' }, content: [{ type: 'text', text: 'IMMEDIATE FIRST AID', styles: { bold: true } }], children: [] },
  { id: 'b1', type: 'numberedListItem', props: { textColor: 'default' }, content: [{ type: 'text', text: 'Keep the victim calm.', styles: {} }], children: [] },
  { id: 'b2', type: 'numberedListItem', props: { textColor: 'default' }, content: [{ type: 'text', text: 'Apply the Sawyer Pump extractor over the bite.', styles: {} }], children: [] },
  { id: 'b3', type: 'paragraph', props: { textColor: 'default' }, content: [{ type: 'text', text: 'DO NOT apply ice.', styles: { textColor: 'red' } }], children: [] },
  {
    id: 'b4', type: 'paragraph', props: { textColor: 'default' }, children: [],
    content: [
      { type: 'text', text: 'Go to the Hospital in Orotina: ', styles: { bold: true } },
      { type: 'link', href: 'https://maps.app.goo.gl/abc', content: [{ type: 'text', text: 'map', styles: {} }] },
    ],
  },
]);

test('numbers page blocks with bold and links marked for a planner', () => {
  const blocks = wikiBlocksForPlanning(snakeBites);
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks[1], { index: 1, type: 'numberedListItem', text: 'Keep the victim calm.' });
  assert.equal(blocks[4].text, '**Go to the Hospital in Orotina: **[map](https://maps.app.goo.gl/abc)');
});

test('applies several block edits against the original numbering', () => {
  const edited = JSON.parse(applyWikiBlockEdits(snakeBites, [
    { action: 'insert_after', index: -1, type: 'heading', text: 'Snake Bite: What To Do' },
    { action: 'delete', index: 2, type: 'numberedListItem', text: '' },
    { action: 'insert_after', index: 1, type: 'numberedListItem', text: 'Do not cut, suck, or apply a tourniquet.' },
    { action: 'replace', index: 4, type: 'paragraph', text: '**Go to Puntarenas Hospital (Monseñor Sanabria):** [map](https://maps.app.goo.gl/xyz) · 2630-8000' },
    { action: 'replace', index: 3, type: 'paragraph', text: 'DO NOT apply ice.' },
  ]));
  assert.deepEqual(edited.map((block) => block.type), ['heading', 'paragraph', 'numberedListItem', 'numberedListItem', 'paragraph', 'paragraph']);
  assert.equal(edited[0].props.level, 3);
  assert.equal(edited[2].id, 'b1', 'untouched blocks keep their identity');
  assert.equal(edited[3].content[0].text, 'Do not cut, suck, or apply a tourniquet.');
  assert.deepEqual(edited[4].content[0].styles, { textColor: 'red' }, 'a replace with unchanged text keeps the original block');
  const hospital = edited[5];
  assert.deepEqual(hospital.content[0], { type: 'text', text: 'Go to Puntarenas Hospital (Monseñor Sanabria):', styles: { bold: true } });
  assert.equal(hospital.content[2].type, 'link');
  assert.equal(hospital.content[2].href, 'https://maps.app.goo.gl/xyz');
  assert.equal(hospital.content[3].text, ' · 2630-8000');
  assert.doesNotMatch(extractWikiText(JSON.stringify(edited)), /Sawyer|Orotina/);
});

test('rejects block edits that point outside the page', () => {
  assert.throws(() => applyWikiBlockEdits(snakeBites, [{ action: 'replace', index: 9, type: 'paragraph', text: 'x' }]), /outside the page/);
});
