import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVcard,
  detectAddRequest,
  detectSearchCategory,
  inferCategoryHeuristically,
  messagesToTwiml,
  normalizePhone,
  parseReview,
  parseVcards,
} from '../domain.mjs';

test('normalizes Costa Rican local and WhatsApp phone numbers', () => {
  assert.equal(normalizePhone('7189 2404'), '+50671892404');
  assert.equal(normalizePhone('whatsapp:+1 (520) 447-3525'), '+15204473525');
  assert.equal(normalizePhone('123'), null);
});

test('parses a forwarded WhatsApp vCard', () => {
  const [contact] = parseVcards([
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Villalobos;Diana;;;',
    'FN:Diana Villalobos',
    'TEL;TYPE=CELL:+506 7189 2404',
    'END:VCARD',
  ].join('\r\n'));

  assert.deepEqual(contact, { name: 'Diana Villalobos', phone: '+50671892404' });
});

test('detects minimal add-number requests', () => {
  assert.deepEqual(
    detectAddRequest('please add Mario +506 8888 7777', '+15555555555', 'Anton'),
    { name: 'Mario', phone: '+50688887777' },
  );
  assert.deepEqual(
    detectAddRequest('add my number', '+506 7000 1111', 'Tania'),
    { name: 'Tania', phone: '+50670001111' },
  );
});

test('routes directory searches and category descriptions', () => {
  assert.equal(detectSearchCategory('Can you send me all taxi contacts?'), 'Taxi');
  assert.equal(detectSearchCategory('I am a taxi driver'), null);
  assert.equal(inferCategoryHeuristically('Airport taxi and local driver').category, 'Taxi');
  assert.equal(inferCategoryHeuristically('Fisioterapia, Pilates and wellness').category, 'Healer');
});

test('parses reviews without mistaking a bare number for one', () => {
  assert.deepEqual(parseReview('5 stars — wonderfully helpful'), {
    rating: 5,
    comment: 'wonderfully helpful',
  });
  assert.deepEqual(parseReview('⭐⭐⭐⭐ Great service'), { rating: 4, comment: 'Great service' });
  assert.equal(parseReview('5'), null);
});

test('creates WhatsApp-compatible vCards and escaped TwiML', () => {
  const vcard = createVcard({
    title: 'A & B; Taxi',
    phone_number: '+50670001111',
    subtitle: 'Airport, beach & town',
  });
  assert.match(vcard, /FN:A & B\\; Taxi/);
  assert.match(vcard, /TEL;TYPE=CELL:\+50670001111/);

  const twiml = messagesToTwiml([{ body: 'A & B', mediaUrl: 'https://example.com/a?x=1&y=2' }]);
  assert.match(twiml, /A &amp; B/);
  assert.match(twiml, /x=1&amp;y=2/);
});
