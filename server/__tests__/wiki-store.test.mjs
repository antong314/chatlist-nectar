import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendWikiFactToAnchoredBlock,
  appendWikiParagraph,
  createWikiContent,
  extractWikiText,
  replaceWikiText,
  slugifyWikiTitle,
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
