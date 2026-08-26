import test from 'node:test';
import assert from 'node:assert/strict';
import { MachuBot } from '../bot.mjs';

class MemoryStore {
  constructor() {
    this.contacts = [];
    this.conversations = new Map();
    this.searchSessions = new Map();
    this.reviews = [];
    this.reviewSummaries = new Map();
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
  async getSearchSession(key) { return this.searchSessions.get(key) ?? null; }
  async setSearchSession({ conversationKey, context }) {
    this.searchSessions.set(conversationKey, { context });
  }
  async clearSearchSession(key) { this.searchSessions.delete(key); }
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
  async findSearchCandidates() { return this.contacts; }
  async getReviewSummaries(contactIds) {
    return Object.fromEntries(
      contactIds
        .filter((contactId) => this.reviewSummaries.has(contactId))
        .map((contactId) => [contactId, this.reviewSummaries.get(contactId)]),
    );
  }
  async submitReview(review) { this.reviews.push(review); return review; }
}

const defaultAi = {
  inferCategory: async () => null,
  classifyMessage: async () => null,
  planDirectorySearch: async () => null,
};

const createBot = (store = new MemoryStore(), ai = defaultAi) => ({
  store,
  bot: new MachuBot({
    store,
    ai,
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

test('greets website visitors who open a prefilled Machu chat', async () => {
  const { bot } = createBot();
  const response = await bot.handle(inbound({ Body: 'Hi Machu!' }));
  assert.match(response[0].body, /I’m Machu/);
  assert.match(response[0].body, /Forward me a contact card/);
  assert.match(response[0].body, /browse the full community directory at https:\/\/www\.sanmateo\.love\//);
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
  assert.match(messages[1].body, /Airport rides/);
  assert.match(messages[1].body, /Taxis & drivers/);
  assert.match(messages[1].body, /No community reviews yet/);
  assert.match(messages[1].body, /\/provider\/taxi-1/);
  assert.equal(messages[1].mediaUrl, undefined);
  assert.equal(messages[2].body, undefined);
  assert.match(messages[2].mediaUrl, /\/bot\/contact\/taxi-1\.vcf\?token=/);
  assert.match(messages[3].body, /browse the full community directory/);
  assert.match(messages[3].body, /https:\/\/www\.sanmateo\.love\//);
});

test('returns only massage-related providers instead of the whole wellness category', async () => {
  const { bot, store } = createBot();
  store.contacts.push(
    {
      id: 'massage-1',
      title: 'Jocsan',
      subtitle: 'Physiotherapist offering dry needling and massage',
      category: 'Healer',
      phone_number: '+50670001111',
      website_url: 'example.com/jocsan',
    },
    {
      id: 'physio-1',
      title: 'Diana',
      subtitle: 'Physio therapy',
      category: 'Healer',
      phone_number: '+50670002222',
    },
    {
      id: 'astrology-1',
      title: 'Astrology Studio',
      subtitle: 'Astrology, meditation and spiritual coaching',
      category: 'Healer',
      phone_number: '+50670003333',
    },
  );
  store.reviewSummaries.set('massage-1', {
    average_rating: 4.75,
    review_count: 4,
  });

  const messages = await bot.handle(inbound({ Body: 'Do you know anyone who does massages?' }));
  assert.match(messages[0].body, /2 relevant matches for massage and bodywork/);
  assert.equal(messages.length, 6);
  assert.ok(messages.some((message) => message.mediaUrl?.includes('massage-1')));
  assert.ok(messages.some((message) => message.mediaUrl?.includes('physio-1')));
  assert.ok(!messages.some((message) => message.mediaUrl?.includes('astrology-1')));
  assert.ok(!messages.some((message) => message.body && message.mediaUrl));
  const jocsanMessage = messages.find((message) => message.body?.includes('*Jocsan*'));
  assert.match(jocsanMessage.body, /Physiotherapist offering dry needling and massage/);
  assert.match(jocsanMessage.body, /4\.8\/5 · 4 community reviews/);
  assert.match(jocsanMessage.body, /Website: https:\/\/example\.com\/jocsan/);
  assert.match(messages.at(-1).body, /browse the full community directory/);
});

test('searches descriptions for chefs without returning every food listing', async () => {
  const { bot, store } = createBot();
  store.contacts.push(
    {
      id: 'chef-1',
      title: 'Irene',
      subtitle: 'Pastry chef making gluten-free and vegan products',
      category: 'Groceries',
      phone_number: '+50670001111',
    },
    {
      id: 'market-1',
      title: 'Organic Market',
      subtitle: 'Organic produce and household goods',
      category: 'Groceries',
      phone_number: '+50670002222',
    },
  );

  const messages = await bot.handle(inbound({ Body: 'Can you recommend a chef?' }));
  assert.match(messages[0].body, /1 relevant match for chefs and cooks/);
  assert.equal(messages.length, 4);
  assert.match(messages[1].body, /Pastry chef/);
  assert.match(messages[2].mediaUrl, /chef-1/);
  assert.match(messages[3].body, /https:\/\/www\.sanmateo\.love\//);
});

test('sends the relevant child doctor immediately and holds back less specific doctors', async () => {
  const { bot, store } = createBot();
  store.contacts.push(
    {
      id: 'doctor-child',
      title: 'Dr. Edgar Leguizamón',
      subtitle: 'Doctor in Orotina, english-speaking, both adults and children',
      category: 'Healer',
      phone_number: '+50670001111',
    },
    {
      id: 'doctor-adults',
      title: 'Adult Medical Clinic',
      subtitle: 'Doctor providing primary care for adults',
      category: 'Healer',
      phone_number: '+50670002222',
    },
    {
      id: 'ayurveda',
      title: 'Bosque Ayurveda',
      subtitle: 'Ayurvedic lifestyle consultation and wellness plans',
      category: 'Healer',
      phone_number: '+50670003333',
    },
  );

  const messages = await bot.handle(inbound({
    Body: 'Hi Machu! What are doctor options around? I want to check my kids pimples',
  }));

  assert.match(messages[0].body, /1 relevant match for doctors/);
  assert.match(messages[0].body, /treating children/);
  assert.match(messages[0].body, /does not specifically mention skin conditions/);
  assert.ok(messages.some((message) => message.mediaUrl?.includes('doctor-child')));
  assert.ok(!messages.some((message) => message.mediaUrl?.includes('doctor-adults')));
  assert.ok(!messages.some((message) => message.body?.includes('Bosque Ayurveda')));
  assert.ok(messages.some((message) => /1 more possible match for doctors, but its listing doesn’t mention treating children/.test(message.body ?? '')));

  const more = await bot.handle(inbound({ Body: 'more doctors' }));
  assert.ok(more.some((message) => message.mediaUrl?.includes('doctor-adults')));
  assert.ok(!more.some((message) => message.mediaUrl?.includes('doctor-child')));
});

test('caps specific searches at three contacts and paginates only after an explicit request', async () => {
  const { bot, store } = createBot();
  for (let index = 1; index <= 6; index += 1) {
    store.contacts.push({
      id: `massage-${index}`,
      title: `Massage Provider ${index}`,
      subtitle: 'Therapeutic massage and bodywork',
      category: 'Healer',
      phone_number: `+5067000111${index}`,
    });
  }

  const firstPage = await bot.handle(inbound({ Body: 'Can you recommend a massage therapist?' }));
  assert.equal(firstPage.filter((message) => message.mediaUrl).length, 3);
  assert.ok(firstPage.some((message) => /3 more relevant matches for massage and bodywork/.test(message.body ?? '')));

  const secondPage = await bot.handle(inbound({ Body: 'show me more' }));
  assert.equal(secondPage.filter((message) => message.mediaUrl).length, 3);
  assert.ok(!secondPage.some((message) => /Reply “more massage and bodywork”/.test(message.body ?? '')));
});

test('does not let a model interpret any category contacts as the whole category', async () => {
  const store = new MemoryStore();
  const ai = {
    ...defaultAi,
    planDirectorySearch: async () => ({
      is_search: true,
      broad_category: true,
      category: 'Healer',
      service_label: 'wellness providers',
      service_terms: ['wellness'],
      qualifier_groups: [],
      preference_groups: [],
    }),
  };
  const { bot } = createBot(store, ai);
  for (let index = 1; index <= 6; index += 1) {
    store.contacts.push({
      id: `wellness-${index}`,
      title: `Wellness Provider ${index}`,
      subtitle: 'Wellness services',
      category: 'Healer',
      phone_number: `+5067000333${index}`,
    });
  }

  const messages = await bot.handle(inbound({ Body: 'Do you know any wellness contacts?' }));
  assert.equal(messages.filter((message) => message.mediaUrl).length, 3);
});

test('still supports intentionally broad category searches', async () => {
  const { bot, store } = createBot();
  for (let index = 1; index <= 6; index += 1) {
    store.contacts.push({
      id: `healer-${index}`,
      title: `Wellness Provider ${index}`,
      subtitle: index === 1 ? 'Massage' : 'Wellness service',
      category: 'Healer',
      phone_number: `+5067000222${index}`,
    });
  }

  const messages = await bot.handle(inbound({ Body: 'Send me all wellness contacts' }));
  assert.match(messages[0].body, /6 wellness contacts/);
  assert.equal(messages.filter((message) => message.mediaUrl).length, 6);
  assert.match(messages.at(-1).body, /browse the full community directory/);
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
