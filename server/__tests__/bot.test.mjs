import test from 'node:test';
import assert from 'node:assert/strict';
import { MachuBot } from '../bot.mjs';

class MemoryStore {
  constructor() {
    this.contacts = [];
    this.conversations = new Map();
    this.reviews = [];
  }

  async getConversation(key) { return this.conversations.get(key) ?? null; }
  async setConversation({ conversationKey, contactId, phase, context }) {
    this.conversations.set(conversationKey, {
      contact_id: contactId,
      phase,
      context,
    });
  }
  async clearConversation(key) { this.conversations.delete(key); }
  async createOrGetContact({ name, phone }) {
    const existing = this.contacts.find((contact) => contact.phone_number === phone);
    if (existing) return { contact: existing, created: false };
    const contact = {
      id: `contact-${this.contacts.length + 1}`,
      title: name,
      subtitle: '',
      category: 'Service',
      phone_number: phone,
    };
    this.contacts.push(contact);
    return { contact, created: true };
  }
  async getContact(id) { return this.contacts.find((contact) => contact.id === id) ?? null; }
  async updateContact(id, values) {
    const contact = await this.getContact(id);
    Object.assign(contact, values);
    return contact;
  }
  async findContactsByCategory(category) {
    return this.contacts.filter((contact) => contact.category === category);
  }
  async submitReview(review) { this.reviews.push(review); return review; }
}

const createBot = (store = new MemoryStore()) => ({
  store,
  bot: new MachuBot({
    store,
    ai: {
      inferCategory: async () => null,
      classifyMessage: async () => null,
    },
    fetchMedia: async () => [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Diana Villalobos',
      'TEL;TYPE=CELL:+506 7189 2404',
      'END:VCARD',
    ].join('\r\n'),
    publicBaseUrl: 'https://www.sanmateo.love',
    signingSecret: 'test-secret',
  }),
});

const inbound = (overrides = {}) => ({
  From: 'whatsapp:+15555550123',
  WaId: '15555550123',
  ProfileName: 'Community Member',
  Body: '',
  NumMedia: '0',
  ...overrides,
});

test('adds a forwarded contact immediately and enriches it on the next message', async () => {
  const { bot, store } = createBot();
  const added = await bot.handle(inbound({
    NumMedia: '1',
    MediaContentType0: 'text/x-vcard',
    MediaUrl0: 'https://api.twilio.test/contact',
  }));

  assert.equal(store.contacts.length, 1);
  assert.match(added[0].body, /Added Diana Villalobos/);

  const enriched = await bot.handle(inbound({ Body: 'Fisioterapia, Pilates and wellness services' }));
  assert.equal(store.contacts[0].category, 'Healer');
  assert.equal(store.contacts[0].subtitle, 'Fisioterapia, Pilates and wellness services');
  assert.match(enriched[0].body, /wellness/);
});

test('does not duplicate a phone number', async () => {
  const { bot, store } = createBot();
  const card = inbound({
    NumMedia: '1',
    MediaContentType0: 'text/vcard',
    MediaUrl0: 'https://api.twilio.test/contact',
  });
  await bot.handle(card);
  const duplicate = await bot.handle(card);
  assert.equal(store.contacts.length, 1);
  assert.match(duplicate[0].body, /already in sanmateo\.love/);
});

test('adds the submitter phone with one minimal text request', async () => {
  const { bot, store } = createBot();
  const response = await bot.handle(inbound({ Body: 'add my number', ProfileName: 'María' }));
  assert.equal(store.contacts[0].phone_number, '+15555550123');
  assert.equal(store.contacts[0].title, 'María');
  assert.match(response[0].body, /Added María/);
});

test('returns native contact-card media for category searches', async () => {
  const { bot, store } = createBot();
  store.contacts.push({
    id: 'taxi-1',
    title: 'Taxi Ana',
    subtitle: 'Airport rides',
    category: 'Taxi',
    phone_number: '+50670001111',
  });

  const messages = await bot.handle(inbound({ Body: 'Can you send me all taxi contacts?' }));
  assert.match(messages[0].body, /1 taxis & drivers contact/);
  assert.match(messages[1].mediaUrl, /\/bot\/contact\/taxi-1\.vcf\?token=/);
});

test('accepts an optional review after contact submission', async () => {
  const { bot, store } = createBot();
  await bot.handle(inbound({ Body: 'add my number', ProfileName: 'María' }));
  const response = await bot.handle(inbound({ Body: '5 stars — kind and reliable' }));
  assert.equal(store.reviews.length, 1);
  assert.equal(store.reviews[0].rating, 5);
  assert.equal(store.reviews[0].comment, 'kind and reliable');
  assert.match(response[0].body, /5-star review/);
});
