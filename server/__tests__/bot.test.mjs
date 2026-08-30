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

class MemoryWikiStore {
  constructor() {
    this.pages = [];
    this.sessions = new Map();
    this.changes = [];
  }
  async getSession(key) { return this.sessions.get(key) ?? null; }
  async setSession({ conversationKey, context }) { this.sessions.set(conversationKey, { context }); }
  async clearSession(key) { this.sessions.delete(key); }
  async getPage(slug) { return this.pages.find((page) => page.slug === slug && page.is_published !== false) ?? null; }
  async searchPages(_query, terms = [], limit = 4) {
    const needles = terms.map((term) => String(term).toLowerCase());
    return this.pages.filter((page) => needles.length === 0
      || needles.some((term) => `${page.title} ${page.plainText}`.toLowerCase().includes(term))).slice(0, limit);
  }
  async applyChange(change) {
    let page = await this.getPage(change.slug);
    const before = page ? { ...page } : null;
    if (change.actionType === 'wiki_create') {
      page = {
        id: `wiki-${this.pages.length + 1}`,
        slug: change.slug,
        title: change.title,
        category: change.category,
        content: change.content,
        plainText: change.content,
        version: 0,
        updated_at: '2026-08-30T00:00:00Z',
        is_published: true,
      };
      this.pages.push(page);
    } else if (change.actionType === 'wiki_delete') {
      page.is_published = false;
    } else {
      Object.assign(page, {
        title: change.title,
        category: change.category,
        content: change.content,
        plainText: change.content,
        version: page.version + 1,
      });
    }
    const event = { ...change, before, after: page ? { ...page } : null, event_id: `event-${this.changes.length + 1}` };
    this.changes.push(event);
    return { ...page, event_id: event.event_id };
  }
  async undoLastChange({ requesterWhatsapp }) {
    const event = [...this.changes].reverse().find((change) => change.requesterWhatsapp === requesterWhatsapp && !change.undone);
    if (!event) { const error = new Error('none'); error.code = 'P0002'; throw error; }
    event.undone = true;
    const page = this.pages.find((candidate) => candidate.slug === event.slug);
    if (event.before) Object.assign(page, event.before, { is_published: true });
    else page.is_published = false;
    return { slug: event.slug, title: event.before?.title || event.title, version: event.before?.version ?? -1 };
  }
}

const defaultAi = {
  inferCategory: async () => null,
  classifyMessage: async () => null,
  planDirectorySearch: async () => null,
  answerWikiQuestion: async () => null,
  planWikiChange: async () => null,
};

const createBot = (store = new MemoryStore(), ai = defaultAi, wikiStore = null) => ({
  store,
  wikiStore,
  bot: new MachuBot({
    store,
    wikiStore,
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
  MessageSid: `SM${'1'.repeat(32)}`,
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

test('never substitutes wiki prose for a directory provider request', async () => {
  const wikiStore = new MemoryWikiStore();
  wikiStore.pages.push({
    id: 'health', slug: 'health-wellness', title: 'Health & Wellness',
    plainText: 'General health information', content: '[]', category: 'Local Know-How',
    version: 1, updated_at: '2026-08-30T00:00:00Z', is_published: true,
  });
  let wikiAnswerCalled = false;
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'wiki_question', category: '', phone: '', name: '', wiki_search_terms: ['health'],
    }),
    answerWikiQuestion: async () => { wikiAnswerCalled = true; return null; },
    planDirectorySearch: async () => ({
      is_search: true,
      broad_category: false,
      category: 'Healer',
      service_label: 'doctors',
      service_terms: ['doctor', 'physician'],
      qualifier_groups: [],
      preference_groups: [],
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);
  const messages = await bot.handle(inbound({ Body: 'Can you recommend a doctor?' }));
  assert.match(messages[0].body, /directory/i);
  assert.equal(wikiAnswerCalled, false);
  assert.ok(!messages.some((message) => /Health & Wellness/.test(message.body ?? '')));
});

test('falls back to relevant wiki guidance when the directory has no place match', async () => {
  const wikiStore = new MemoryWikiStore();
  wikiStore.pages.push({
    id: 'restaurants', slug: 'restaurants', title: 'Restaurants',
    plainText: 'Mae Culpa Restaurante y Pizzería a la Leña — amazing views, good pizza and Italian dishes.',
    content: '[]', category: 'Shopping', version: 2,
    updated_at: '2026-08-30T00:00:00Z', is_published: true,
  });
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'search_directory', category: '', phone: '', name: '', wiki_search_terms: ['pizza', 'restaurant'],
    }),
    planDirectorySearch: async () => ({
      is_search: true,
      broad_category: false,
      category: 'Service',
      service_label: 'pizza places',
      service_terms: ['pizza', 'pizzeria'],
      qualifier_groups: [],
      preference_groups: [],
    }),
    answerWikiQuestion: async () => ({
      answered: true,
      answer: 'The community wiki recommends Mae Culpa Restaurante y Pizzería a la Leña for pizza.',
      source_slugs: ['restaurants'],
      high_stakes: false,
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);

  const messages = await bot.handle(inbound({
    Body: "I'm in the mood for some pizza. Where is the good place to get that?",
  }));

  assert.match(messages[0].body, /Mae Culpa Restaurante/);
  assert.match(messages[0].body, /\/wiki\/restaurants/);
  assert.match(messages.at(-1).body, /full community wiki at https:\/\/www\.sanmateo\.love\/wiki/);
  assert.ok(!messages.some((message) => /couldn’t find an exact match/.test(message.body ?? '')));
});

test('answers a general local question only from cited wiki pages', async () => {
  const wikiStore = new MemoryWikiStore();
  wikiStore.pages.push({
    id: 'markets', slug: 'food-stores', title: 'Food Stores & Farmers Markets',
    plainText: 'Feria del Agricultor San Mateo — Thursdays from 2pm to 8pm.',
    content: '[]', category: 'Shopping', version: 3,
    updated_at: '2025-03-27T00:00:00Z', is_published: true,
  });
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'wiki_question', category: '', phone: '', name: '', wiki_search_terms: ['feria', 'market'],
    }),
    answerWikiQuestion: async () => ({
      answered: true,
      answer: 'The San Mateo farmers market is Thursday from 2 PM to 8 PM.',
      source_slugs: ['food-stores'],
      high_stakes: false,
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);
  const messages = await bot.handle(inbound({ Body: 'When is the San Mateo farmers market?' }));
  assert.match(messages[0].body, /Thursday from 2 PM to 8 PM/);
  assert.match(messages[0].body, /\/wiki\/food-stores/);
  assert.match(messages[0].body, /updated Mar 27, 2025/);
});

test('recognizes an existing restaurant in a conversational list suggestion and confirms the missing fact', async () => {
  const wikiStore = new MemoryWikiStore();
  const content = JSON.stringify([
    {
      type: 'bulletListItem',
      content: [
        { type: 'link', href: 'https://example.com/poza', content: [{ type: 'text', text: 'La Poza Blanca' }] },
        { type: 'text', text: ' - local favorite' },
      ],
    },
  ]);
  wikiStore.pages.push({
    id: 'restaurants', slug: 'restaurants', title: 'Restaurants',
    plainText: 'La Poza Blanca\n - local favorite', content, category: 'Shopping', version: 21,
    updated_at: '2025-11-07T00:00:00Z', is_published: true,
  });
  let classificationCount = 0;
  const ai = {
    ...defaultAi,
    classifyMessage: async () => {
      classificationCount += 1;
      return classificationCount === 1
        ? { intent: 'wiki_question', category: '', phone: '', name: '', wiki_search_terms: ['pizza', 'restaurants'] }
        : { intent: 'wiki_change', category: '', phone: '', name: '', wiki_search_terms: ['Poza Blanca', 'restaurants'] };
    },
    answerWikiQuestion: async () => ({
      answered: true,
      answer: 'The wiki recommends Monsoon and Mae Culpa for pizza.',
      source_slugs: ['restaurants'],
      high_stakes: false,
    }),
    planWikiChange: async () => ({
      action: 'none', operation: 'none', target_slug: 'restaurants',
      title: 'Restaurants', category: 'Shopping', subject_name: 'La Poza Blanca',
      proposed_fact: '', anchor_text: 'La Poza Blanca', find_text: '', replacement_text: '',
      append_text: '', change_summary: 'Poza Blanca is already listed.',
      needs_clarification: false, clarification_question: '',
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);

  await bot.handle(inbound({
    Body: "I'm in the mood for some pizza. Where is the good place to get that?",
  }));
  const suggestion = await bot.handle(inbound({
    Body: 'we should add Poza Blanca to that list',
    MessageSid: `SM${'2'.repeat(32)}`,
  }));

  assert.match(suggestion[0].body, /Actually Poza Blanca is already in my list of restaurants\. Do they have good pizza\?/);
  assert.equal(wikiStore.changes.length, 0);

  const confirmed = await bot.handle(inbound({
    Body: 'yes',
    MessageSid: `SM${'3'.repeat(32)}`,
  }));
  assert.match(confirmed[0].body, /updated \*Restaurants\* to note that Poza Blanca has great pizza/);
  assert.match(wikiStore.pages[0].content, /local favorite; great pizza/);
  assert.equal((wikiStore.pages[0].content.match(/La Poza Blanca/g) ?? []).length, 1);
  assert.equal(wikiStore.changes.length, 1);
  assert.equal(wikiStore.changes[0].requesterWhatsapp, '+15555550123');
  assert.match(confirmed.at(-1).body, /full community wiki/);
});

test('publishes an attributable wiki correction immediately and supports undo', async () => {
  const wikiStore = new MemoryWikiStore();
  wikiStore.pages.push({
    id: 'markets', slug: 'food-stores', title: 'Food Stores & Farmers Markets',
    plainText: 'San Mateo market is Thursday from 2 PM to 8 PM.',
    content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'San Mateo market is Thursday from 2 PM to 8 PM.' }] }]),
    category: 'Shopping', version: 3, updated_at: '2025-03-27T00:00:00Z', is_published: true,
  });
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'wiki_change', category: '', phone: '', name: '', wiki_search_terms: ['market'],
    }),
    planWikiChange: async () => ({
      action: 'update', operation: 'replace', target_slug: 'food-stores',
      title: 'Food Stores & Farmers Markets', category: 'Shopping',
      find_text: 'San Mateo market is Thursday from 2 PM to 8 PM.',
      replacement_text: 'San Mateo market is Thursday from 3 PM to 8 PM.',
      append_text: '', change_summary: 'changed the Thursday start time to 3 PM',
      needs_clarification: false, clarification_question: '',
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);
  const changed = await bot.handle(inbound({ Body: 'The market starts at 3 now. Update the wiki.' }));
  assert.match(changed[0].body, /updated/);
  assert.match(wikiStore.pages[0].content, /3 PM/);
  assert.equal(wikiStore.changes[0].requesterWhatsapp, '+15555550123');
  assert.equal(wikiStore.changes[0].requesterName, 'Community Member');
  assert.equal(wikiStore.changes[0].twilioMessageSid, `SM${'1'.repeat(32)}`);

  const undone = await bot.handle(inbound({ Body: 'undo', MessageSid: `SM${'2'.repeat(32)}` }));
  assert.match(undone[0].body, /Undone/);
  assert.match(wikiStore.pages[0].content, /2 PM/);
});

test('undoing a newly created wiki page reports that it was removed', async () => {
  const wikiStore = new MemoryWikiStore();
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'wiki_change', category: '', phone: '', name: '', wiki_search_terms: ['recycling'],
    }),
    planWikiChange: async () => ({
      action: 'create', operation: 'create', target_slug: 'recycling',
      title: 'Recycling', category: 'Local Know-How', find_text: '', replacement_text: '',
      append_text: 'Recycling is collected on Tuesdays.', change_summary: 'added recycling information',
      needs_clarification: false, clarification_question: '',
    }),
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);
  await bot.handle(inbound({ Body: 'Create a recycling wiki page.' }));

  const undone = await bot.handle(inbound({ Body: 'undo', MessageSid: `SM${'3'.repeat(32)}` }));
  assert.match(undone[0].body, /removed the new \*Recycling\* page/);
  assert.doesNotMatch(undone[0].body, /\/wiki\/recycling/);
});

test('asks for missing page content instead of failing an incomplete wiki create', async () => {
  const wikiStore = new MemoryWikiStore();
  const plannedMessages = [];
  const ai = {
    ...defaultAi,
    classifyMessage: async () => ({
      intent: 'wiki_change', category: '', phone: '', name: '', wiki_search_terms: ['recycling'],
    }),
    planWikiChange: async ({ message }) => {
      plannedMessages.push(message);
      if (plannedMessages.length === 1) {
        return {
          action: 'create', operation: 'create', target_slug: 'recycling',
          title: 'Recycling', category: 'Local Know-How', find_text: '', replacement_text: '',
          append_text: '', change_summary: '', needs_clarification: false,
          clarification_question: '',
        };
      }
      return {
        action: 'create', operation: 'create', target_slug: 'recycling',
        title: 'Recycling', category: 'Local Know-How', find_text: '', replacement_text: '',
        append_text: 'Recycling is collected on Tuesdays.',
        change_summary: 'added recycling collection information',
        needs_clarification: false, clarification_question: '',
      };
    },
  };
  const { bot } = createBot(new MemoryStore(), ai, wikiStore);

  const clarification = await bot.handle(inbound({ Body: 'Add a new wiki page about recycling' }));
  assert.match(clarification[0].body, /What information should the new \*Recycling\* page include\?/);
  assert.match(clarification[0].body, /full community wiki at https:\/\/www\.sanmateo\.love\/wiki/);
  assert.doesNotMatch(clarification[0].body, /full community directory/);
  assert.equal(wikiStore.pages.length, 0);
  assert.equal([...wikiStore.sessions.values()][0].context.mode, 'awaiting_change_details');

  const created = await bot.handle(inbound({
    Body: 'Recycling is collected on Tuesdays.',
    MessageSid: `SM${'2'.repeat(32)}`,
  }));
  assert.match(created[0].body, /created \*Recycling\*/);
  assert.equal(wikiStore.pages.length, 1);
  assert.match(wikiStore.pages[0].content, /collected on Tuesdays/);
  assert.match(plannedMessages[1], /Add a new wiki page about recycling/);
  assert.match(plannedMessages[1], /Additional detail from the user: Recycling is collected on Tuesdays/);
});
