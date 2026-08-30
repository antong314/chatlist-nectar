import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
