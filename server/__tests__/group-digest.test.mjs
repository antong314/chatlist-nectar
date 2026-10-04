import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GroupDigest,
  buildWikiWrite,
  chunkMessages,
  enrichmentChanges,
  localDateParts,
  phonesInText,
  splitMessages,
  verifiedWebsite,
} from '../group-digest.mjs';
import { MachuBot } from '../bot.mjs';
import { OpenAIProvider } from '../openai-provider.mjs';
import { DirectoryStore } from '../directory-store.mjs';
import { TwilioNotifier } from '../twilio-notifier.mjs';
import { createWikiContent, extractWikiText } from '../wiki-store.mjs';

const ADMIN = '+15550002222';
const LISTENER = '+15550001111';
const GROUP = '120363000000000001@g.us';
const NOW = new Date('2026-10-04T13:00:00Z'); // 07:00 in Costa Rica

const message = (id, body, extra = {}) => ({
  group_jid: GROUP,
  message_id: id,
  sender_hash: 'a'.repeat(64),
  sender_name: 'Ana',
  sent_at: `2026-10-03T1${id.length % 10}:00:00Z`,
  received_at: `2026-10-03T15:${String(id.length).padStart(2, '0')}:00Z`,
  body,
  contacts: [],
  quoted_message_id: null,
  ...extra,
});

class MemoryDigestStore {
  constructor({ groups = [], messages = [], listener = { status: 'connected', account_phone: LISTENER, last_seen_at: NOW.toISOString() } } = {}) {
    this.groups = groups;
    this.messages = messages;
    this.listener = listener;
    this.runs = [];
    this.items = [];
    this.adminInbound = new Map();
    this.undone = [];
    this.nextRef = 1;
  }
  async listGroups() { return this.groups; }
  async setGroupsEnabled(refs, enabled) {
    const matches = this.groups.filter((group) => refs === 'all' || refs.includes(group.ref));
    for (const group of matches) group.enabled = enabled;
    return matches;
  }
  async getMessages(jid, { after, through }) {
    return this.messages.filter((item) => item.group_jid === jid
      && (!after || item.received_at > after) && item.received_at <= through);
  }
  async getContextMessages(jid, { before }) {
    return this.messages.filter((item) => item.group_jid === jid && item.received_at <= before);
  }
  async markGroupProcessed(jid, through) {
    this.groups.find((group) => group.jid === jid).processed_through = through;
  }
  async purgeMessages() { return 0; }
  async claimRun({ runDate, trigger, mode }) {
    if (this.runs.some((run) => run.status === 'running')) return null;
    if (trigger === 'schedule' && this.runs.some((run) => run.run_date === runDate && run.trigger === 'schedule')) return null;
    const run = { id: `run-${this.runs.length + 1}`, run_date: runDate, trigger, mode, status: 'running', stats: {}, summary_sent_at: null };
    this.runs.push(run);
    return run.id;
  }
  async finishRun(id, { status, stats, error }) { Object.assign(this.runs.find((run) => run.id === id), { status, stats, error }); }
  async markSummarySent(id) { this.runs.find((run) => run.id === id).summary_sent_at = NOW.toISOString(); }
  async getRun(id) { return this.runs.find((run) => run.id === id) ?? null; }
  async getLatestRun({ status = null } = {}) {
    return [...this.runs].reverse().find((run) => !status || run.status === status) ?? null;
  }
  async getUndeliveredRun() {
    return [...this.runs].reverse().find((run) => run.status !== 'running' && !run.summary_sent_at) ?? null;
  }
  async createItem(item) {
    const row = { id: `item-${this.nextRef}`, ref: this.nextRef, action: null, reason: null, contact_id: null, payload: {}, ...item };
    this.nextRef += 1;
    this.items.push(row);
    return { ...row };
  }
  async updateItem(id, patch) {
    const row = this.items.find((item) => item.id === id);
    Object.assign(row, patch);
    return { ...row };
  }
  async getItemByRef(ref) { const row = this.items.find((item) => item.ref === ref); return row ? { ...row } : null; }
  async listItems(runId) { return this.items.filter((item) => item.run_id === runId).map((item) => ({ ...item })); }
  async listPendingItems() {
    return this.items.filter((item) => ['proposed', 'needs_review'].includes(item.status)).map((item) => ({ ...item }));
  }
  async undoItem(id, admin) {
    const row = this.items.find((item) => item.id === id);
    if (row.contact_id === 'locked') {
      const error = new Error('Provider changed after the digest');
      error.code = '40001';
      throw error;
    }
    row.status = 'undone';
    this.undone.push({ id, admin });
    return row;
  }
  async getListenerStatus() { return this.listener; }
  async touchAdmin(phone) { this.adminInbound.set(phone, NOW); }
  async getAdminLastInbound(phone) { return this.adminInbound.get(phone) ?? null; }
}

class MemoryDirectory {
  constructor(contacts = []) {
    this.contacts = contacts;
    this.writes = [];
  }
  async findActiveContactByPhone(phone) { return this.contacts.find((contact) => contact.phone_number === phone) ?? null; }
  async findSearchCandidates() { return this.contacts; }
  async getContact(id) { return this.contacts.find((contact) => contact.id === id) ?? null; }
  async createOrGetContact({ name, phone }, audit) {
    this.writes.push({ type: 'create', name, phone, audit });
    const existing = await this.findActiveContactByPhone(phone);
    if (existing) return { contact: existing, created: false };
    const contact = { id: `contact-${this.contacts.length + 1}`, title: name, subtitle: '', category: 'Service', phone_number: phone };
    this.contacts.push(contact);
    return { contact, created: true };
  }
  async updateContact(id, values, audit) {
    this.writes.push({ type: 'update', id, values, audit });
    const contact = await this.getContact(id);
    Object.assign(contact, values);
    return contact;
  }
}

class MemoryWiki {
  constructor(pages = []) {
    this.pages = pages;
    this.changes = [];
  }
  async searchPages() { return this.pages; }
  async getPage(slug) { return this.pages.find((page) => page.slug === slug) ?? null; }
  async applyChange(change) {
    this.changes.push(change);
    const page = await this.getPage(change.slug);
    if (page) {
      page.content = change.content;
      page.plainText = extractWikiText(change.content);
      page.version += 1;
    }
    return { event_id: `event-${this.changes.length}` };
  }
}

const marketPage = () => ({
  slug: 'markets',
  title: 'Local Markets',
  category: 'Food',
  version: 3,
  content: createWikiContent('The Orotina feria runs on Fridays.'),
  plainText: 'The Orotina feria runs on Fridays.',
});

const fakeAi = (extraction, plan = null) => ({
  enabled: true,
  model: 'gpt-6-luna',
  calls: [],
  async extractGroupKnowledge(input) { this.calls.push(input); return extraction; },
  async planWikiChange() {
    return plan ?? {
      action: 'update', operation: 'append', target_slug: 'markets', title: 'Local Markets', category: 'Food',
      subject_name: '', proposed_fact: '', anchor_text: '', find_text: '', replacement_text: '',
      append_text: 'The Orotina feria also runs on Saturdays.', change_summary: 'Added Saturday market hours',
      needs_clarification: false, clarification_question: '',
    };
  },
});

class RecordingNotifier {
  constructor() { this.sent = []; }
  async send(message) { this.sent.push(message); return { sid: `SM${this.sent.length}` }; }
}

const digestMessages = () => [
  message('Q1', 'Does anyone know a good plumber?'),
  message('A11', 'Call José, 8888-7777, he fixed our pipes fast', { quoted_message_id: 'Q1', sender_name: 'Ben' }),
  message('C111', '', { contacts: [{ name: 'Luis Gardener', vcard: 'BEGIN:VCARD\nFN:Luis Gardener\nTEL:+506 8690 3015\nEND:VCARD' }] }),
  message('W1111', 'FYI the Orotina feria is now also on Saturdays'),
  message('S11111', 'Selling my couch, 50 mil, call 7000-1111'),
];

const extraction = {
  contacts: [
    { name: 'José — Plumbing', phone: '8888-7777', website: '', category: 'Construction', description: 'Plumber recommended for fast pipe repairs.', is_service_provider: true, confidence: 0.9, evidence_message_ids: ['m2'] },
    { name: 'Luis Gardener', phone: '', website: '', category: 'Service', description: 'Gardening and landscaping.', is_service_provider: true, confidence: 0.6, evidence_message_ids: ['m3'] },
    { name: 'Invented Phone Co', phone: '8999-0000', website: 'https://made-up.example', category: 'Service', description: 'Not real.', is_service_provider: true, confidence: 0.95, evidence_message_ids: ['m2'] },
    { name: 'Couch seller', phone: '7000-1111', website: '', category: 'Service', description: 'Selling a couch.', is_service_provider: false, confidence: 0.8, evidence_message_ids: ['m5'] },
    { name: 'Unsupported', phone: '', website: '', category: 'Service', description: '', is_service_provider: true, confidence: 0.9, evidence_message_ids: ['m99'] },
  ],
  wiki_facts: [
    { statement: 'The Orotina feria is also held on Saturdays.', topic: 'Orotina feria', search_terms: ['feria', 'market'], time_sensitive: false, confidence: 0.9, evidence_message_ids: ['m4'] },
    { statement: 'Road to Orotina closed today.', topic: 'Road closure', search_terms: [], time_sensitive: true, confidence: 0.9, evidence_message_ids: ['m4'] },
  ],
};

const createDigest = ({ mode = 'publish', storeOptions = {}, directory = new MemoryDirectory(), wiki = new MemoryWiki([marketPage()]), ai = fakeAi(extraction), templateSid = '' } = {}) => {
  const store = new MemoryDigestStore({
    groups: [{ jid: GROUP, ref: 1, name: 'San Mateo Neighbors', enabled: true, processed_through: null }],
    messages: digestMessages(),
    ...storeOptions,
  });
  const notifier = new RecordingNotifier();
  const digest = new GroupDigest({
    store, directory, wikiStore: wiki, ai, notifier, adminPhones: [ADMIN], mode, templateSid,
    now: () => NOW, log: { error() {}, warn() {} },
  });
  return { digest, store, directory, wiki, ai, notifier };
};

test('chunkMessages marks context, maps replies, and keeps model ids short', () => {
  const context = [message('OLD1', 'Earlier question?')];
  const [chunk] = chunkMessages([message('NEW1', 'Answer', { quoted_message_id: 'OLD1' })], context);
  assert.deepEqual(chunk.prompt.map((item) => [item.id, item.context_only, item.reply_to]), [
    ['m1', true, ''],
    ['m2', false, 'm1'],
  ]);
  assert.equal(chunk.byId.get('m2').message_id, 'NEW1');
});

test('chunkMessages splits long days and carries trailing context forward', () => {
  const messages = Array.from({ length: 650 }, (_, index) => message(`M${index}`, `message ${index}`));
  const chunks = chunkMessages(messages);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[1].prompt.filter((item) => item.context_only).length, 15);
  assert.equal(chunks.reduce((total, chunk) => total + chunk.prompt.filter((item) => !item.context_only).length, 0), 650);
});

test('evidence helpers only accept phones and websites present in messages', () => {
  assert.deepEqual(phonesInText('Call 8888-7777 or +1 (555) 123-4567'), ['+50688887777', '+15551234567']);
  assert.equal(verifiedWebsite('greenpacifico.cr', [{ body: 'see www.greenpacifico.cr/servicios' }]), 'https://greenpacifico.cr');
  assert.equal(verifiedWebsite('https://made-up.example', [{ body: 'no links here' }]), '');
  assert.deepEqual(enrichmentChanges({ subtitle: '', category: 'Service', website_url: 'x' }, {
    description: 'New', category: 'Healer', website: 'https://y',
  }), { subtitle: 'New', category: 'Healer' });
  assert.deepEqual(localDateParts(NOW, 'America/Costa_Rica'), { date: '2026-10-04', hour: 7 });
  assert.ok(splitMessages(`${'a'.repeat(1000)}\n${'b'.repeat(1000)}`).every((part) => part.length <= 1500));
});

test('publish mode applies confident, verified items and records everything else', async () => {
  const { digest, store, directory, wiki, ai, notifier } = createDigest();
  await store.touchAdmin(ADMIN);
  const result = await digest.run({ trigger: 'manual' });

  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].groupName, 'San Mateo Neighbors');
  const byTitle = Object.fromEntries(store.items.map((item) => [item.title, item]));
  assert.equal(byTitle['José — Plumbing'].status, 'applied');
  assert.equal(byTitle['José — Plumbing'].action, 'contact_create');
  assert.equal(byTitle['Luis Gardener'].status, 'needs_review', 'phone recovered from the card, but low confidence');
  assert.equal(byTitle['Luis Gardener'].payload.phone, '+50686903015');
  assert.equal(byTitle['Invented Phone Co'].status, 'skipped');
  assert.equal(byTitle['Invented Phone Co'].reason, 'No phone number in the messages');
  assert.equal(byTitle['Couch seller'].reason, 'Not a service provider');
  assert.equal(byTitle.Unsupported, undefined, 'items without real evidence are dropped');
  assert.equal(byTitle['Local Markets'].status, 'applied');
  assert.equal(byTitle['Road closure'].reason, 'Time-sensitive');

  const create = directory.writes.find((write) => write.type === 'create');
  assert.deepEqual(create.audit, {
    requesterWhatsapp: LISTENER,
    requesterName: 'Machu group digest',
    twilioMessageSid: `digest:${byTitle['José — Plumbing'].id}`,
    verificationMethod: 'group_digest',
  });
  assert.equal(directory.contacts[0].category, 'Construction');
  assert.equal(directory.contacts[0].subtitle, 'Plumber recommended for fast pipe repairs.');
  assert.equal(wiki.changes[0].verificationMethod, 'group_digest');
  assert.match(extractWikiText(wiki.pages[0].content), /also runs on Saturdays/);

  assert.equal(store.runs[0].status, 'completed');
  assert.equal(result.stats.messages, 5);
  assert.equal(result.stats.applied, 2);
  assert.equal(store.groups[0].processed_through, '2026-10-03T15:06:00Z');
  const summary = notifier.sent.map((item) => item.body).join('\n');
  assert.match(summary, /Added to the directory:\n#\d+ José — Plumbing/);
  assert.match(summary, /Needs your OK:\n#\d+ Luis Gardener/);
  assert.match(summary, /Wiki updates:/);
  assert.ok(store.runs[0].summary_sent_at);
});

test('existing listings are only enriched where fields are empty', async () => {
  const directory = new MemoryDirectory([{ id: 'existing', title: 'José Plumbing', subtitle: '', category: 'Service', phone_number: '+50688887777' }]);
  const ai = fakeAi({ contacts: [extraction.contacts[0]], wiki_facts: [] });
  const { digest, store } = createDigest({ directory, ai });
  await digest.run({ trigger: 'manual' });
  const [item] = store.items;
  assert.equal(item.action, 'contact_enrich');
  assert.equal(item.status, 'applied');
  assert.deepEqual(item.payload.before, { subtitle: '', category: 'Service' });
  assert.equal(directory.contacts[0].subtitle, 'Plumber recommended for fast pipe repairs.');
});

test('shadow mode proposes without writing, and approval publishes with the admin as actor', async () => {
  const { digest, store, directory, wiki, notifier } = createDigest({ mode: 'shadow' });
  await digest.run({ trigger: 'manual' });
  assert.equal(directory.writes.length, 0);
  assert.equal(wiki.changes.length, 0);
  const proposed = store.items.filter((item) => item.status === 'proposed');
  assert.deepEqual(proposed.map((item) => item.title).sort(), ['José — Plumbing', 'Local Markets']);

  const reply = await digest.handleAdminMessage({ senderPhone: ADMIN, body: `approve ${proposed[0].ref}` });
  assert.equal(reply.handled, true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(store.items.find((item) => item.id === proposed[0].id).status, 'applied');
  assert.equal(directory.writes[0].audit.requesterWhatsapp, ADMIN);
  assert.match(notifier.sent.at(-1).body, /Published #/);
});

test('outside the 24-hour window the approved template is sent instead', async () => {
  const { digest, store, notifier } = createDigest({ templateSid: 'HX0123456789abcdef0123456789abcdef' });
  await digest.run({ trigger: 'manual' });
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].contentSid, 'HX0123456789abcdef0123456789abcdef');
  assert.deepEqual(notifier.sent[0].contentVariables, { 1: '1', 2: '1', 3: '1' });
  assert.equal(store.runs[0].summary_sent_at, null, 'the full summary waits for the next admin message');
});

test('scheduled runs happen once per day after the digest hour', async () => {
  const { digest, store } = createDigest();
  digest.now = () => new Date('2026-10-04T11:00:00Z'); // 05:00 local
  assert.equal(await digest.runIfDue(), null);
  digest.now = () => NOW;
  await digest.runIfDue();
  await digest.runIfDue();
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].run_date, '2026-10-04');
});

test('a model outage fails the run without advancing the group watermark', async () => {
  const { digest, store, notifier } = createDigest({ ai: { ...fakeAi(null), enabled: true } });
  await store.touchAdmin(ADMIN);
  await digest.run({ trigger: 'manual' });
  assert.equal(store.runs[0].status, 'failed');
  assert.equal(store.groups[0].processed_through, null);
  assert.match(notifier.sent[0].body, /couldn’t finish/);
});

test('admin commands manage groups, undo, and skip; other messages get the pending summary first', async () => {
  const { digest, store } = createDigest({ mode: 'shadow' });
  store.groups.push({ jid: '120363000000000002@g.us', ref: 2, name: 'Buy & Sell', enabled: false });
  await digest.run({ trigger: 'manual' });

  const groups = await digest.handleAdminMessage({ senderPhone: ADMIN, body: 'groups' });
  assert.match(groups.messages[0].body, /1\. ✅ San Mateo Neighbors\n2\. ⏸️ Buy & Sell/);
  await digest.handleAdminMessage({ senderPhone: ADMIN, body: 'enable 2' });
  assert.equal(store.groups[1].enabled, true);

  const proposed = store.items.find((item) => item.status === 'proposed');
  const skipped = await digest.handleAdminMessage({ senderPhone: ADMIN, body: `skip #${proposed.ref}` });
  assert.match(skipped.messages[0].body, /Skipped #/);
  assert.equal(proposed.status, 'skipped');

  store.items.push({ id: 'locked-item', ref: 99, title: 'Locked', status: 'applied', action: 'contact_create', contact_id: 'locked' });
  const undo = await digest.handleAdminMessage({ senderPhone: ADMIN, body: 'undo 99' });
  assert.match(undo.messages[0].body, /changed after the digest/);

  const bot = new MachuBot({
    store: { getConversation: async () => null, getSearchSession: async () => null },
    ai: null,
    signingSecret: 'secret',
    digest,
  });
  const replies = await bot.handle({ Body: 'help', WaId: ADMIN.slice(1), From: `whatsapp:${ADMIN}` });
  assert.match(replies[0].body, /Machu group digest/);
  assert.match(replies.at(-1).body, /I’m Machu/);
  const nonAdmin = await bot.handle({ Body: 'groups', WaId: '15559990000', From: 'whatsapp:+15559990000' });
  assert.doesNotMatch(nonAdmin[0].body, /listener has joined/);
});

test('buildWikiWrite appends, replaces, and refuses to recreate existing pages', async () => {
  const wiki = new MemoryWiki([marketPage()]);
  const append = await buildWikiWrite({
    plan: { action: 'update', operation: 'append', target_slug: 'markets', append_text: 'Saturdays too.', title: '', category: '' },
    pages: wiki.pages,
    wikiStore: wiki,
  });
  assert.equal(append.expectedVersion, 3);
  assert.match(extractWikiText(append.content), /Saturdays too/);
  const replace = await buildWikiWrite({
    plan: { action: 'update', operation: 'replace', target_slug: 'markets', find_text: 'Fridays', replacement_text: 'Fridays and Saturdays', anchor_text: '', title: '', category: '' },
    pages: wiki.pages,
    wikiStore: wiki,
  });
  assert.match(extractWikiText(replace.content), /Fridays and Saturdays/);
  await assert.rejects(buildWikiWrite({
    plan: { action: 'create', title: 'Local Markets', target_slug: 'markets', append_text: 'x', category: '' },
    pages: [],
    wikiStore: wiki,
  }), /already exists/);
});

test('OpenAIProvider honors per-instance model, reasoning effort, and timeout', async () => {
  let body;
  const provider = new OpenAIProvider({
    apiKey: 'key',
    model: 'gpt-6-luna',
    reasoningEffort: 'medium',
    timeoutMs: 60_000,
    fetchImpl: async (_url, request) => {
      body = JSON.parse(request.body);
      return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"contacts":[],"wiki_facts":[]}' }] }] }) };
    },
  });
  assert.deepEqual(await provider.extractGroupKnowledge({ groupName: 'G', messages: [] }), { contacts: [], wiki_facts: [] });
  assert.equal(body.model, 'gpt-6-luna');
  assert.deepEqual(body.reasoning, { effort: 'medium' });
  assert.equal(body.text.format.name, 'group_knowledge');
  assert.equal(body.text.format.strict, true);
});

test('DirectoryStore passes the digest source only when it is provided', async () => {
  const calls = [];
  const client = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: [{ id: 'c1', created: true }], error: null };
    },
  };
  const directory = new DirectoryStore({ client });
  await directory.createOrGetContact({ name: 'A', phone: '+50688887777' }, {
    requesterWhatsapp: LISTENER, twilioMessageSid: 'digest:1', verificationMethod: 'group_digest',
  });
  await directory.createOrGetContact({ name: 'B', phone: '+50688887778' }, {
    requesterWhatsapp: LISTENER, twilioMessageSid: 'SM1',
  });
  assert.equal(calls[0].params.p_verification_method, 'group_digest');
  assert.equal('p_verification_method' in calls[1].params, false);
});

test('TwilioNotifier sends text and template messages through the REST API', async () => {
  const requests = [];
  const notifier = new TwilioNotifier({
    accountSid: 'AC123',
    authToken: 'token',
    from: 'whatsapp:+15550003333',
    fetchImpl: async (url, request) => {
      requests.push({ url, request });
      return { ok: true, text: async () => '{"sid":"SM1","status":"queued"}' };
    },
  });
  await notifier.send({ to: ADMIN, body: 'Hello' });
  await notifier.send({ to: ADMIN, contentSid: 'HX1', contentVariables: { 1: '2' } });
  const first = new URLSearchParams(requests[0].request.body);
  assert.equal(requests[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
  assert.equal(first.get('To'), `whatsapp:${ADMIN}`);
  assert.equal(first.get('Body'), 'Hello');
  const second = new URLSearchParams(requests[1].request.body);
  assert.equal(second.get('ContentSid'), 'HX1');
  assert.equal(second.get('ContentVariables'), '{"1":"2"}');
  assert.equal(requests[0].request.headers.Authorization, `Basic ${Buffer.from('AC123:token').toString('base64')}`);
});

test('a manual run includes messages from moments ago and always replies', async () => {
  const fresh = message('F1', 'Carlos fixed our wiring, 8888-1234', { received_at: new Date(NOW.getTime() - 30_000).toISOString() });
  const { digest, store, notifier, ai } = createDigest({
    ai: fakeAi({ contacts: [], wiki_facts: [] }),
    storeOptions: { messages: [fresh] },
  });
  await store.touchAdmin(ADMIN);
  await digest.run({ trigger: 'manual' });
  assert.equal(ai.calls.length, 1, 'a 30-second-old message is digested');
  assert.match(notifier.sent[0].body, /Read 1 new message/);
  assert.match(notifier.sent[0].body, /Nothing new for the directory or wiki/);
  assert.ok(store.runs[0].summary_sent_at);
});

test('a quiet scheduled run stays silent', async () => {
  const { digest, store, notifier } = createDigest({
    ai: fakeAi({ contacts: [], wiki_facts: [] }),
    storeOptions: { messages: [] },
  });
  await store.touchAdmin(ADMIN);
  await digest.runIfDue();
  assert.equal(notifier.sent.length, 0);
});

test('reply hints use the summary’s own item numbers', async () => {
  const { digest, store, notifier } = createDigest({ mode: 'shadow', ai: fakeAi({ contacts: [extraction.contacts[0]], wiki_facts: [] }) });
  await store.touchAdmin(ADMIN);
  await digest.run({ trigger: 'manual' });
  const ref = store.items[0].ref;
  assert.match(notifier.sent.at(-1).body, new RegExp(`Reply “approve ${ref}” to publish it, or “skip ${ref}” to dismiss it\\.`));
  assert.doesNotMatch(notifier.sent.at(-1).body, /undo 12|approve 16/);
});

test('undecided items carry into later summaries and approve all', async () => {
  const { digest, store, notifier, directory } = createDigest({ mode: 'shadow', ai: fakeAi({ contacts: [extraction.contacts[0]], wiki_facts: [] }) });
  await store.touchAdmin(ADMIN);
  await digest.run({ trigger: 'manual' });
  const [first] = store.items;
  await digest.run({ trigger: 'manual' });
  const second = notifier.sent.at(-1).body;
  assert.match(second, /Read 0 new messages/);
  assert.match(second, new RegExp(`Still waiting for your decision \\(from earlier digests\\):\\n#${first.ref} José — Plumbing`));
  assert.match(second, new RegExp(`Reply “approve ${first.ref}” to publish it`));

  await digest.handleAdminMessage({ senderPhone: ADMIN, body: 'approve all' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(store.items[0].status, 'applied');
  assert.equal(directory.contacts.length, 1);
});

test('a scheduled run that read messages reports even when nothing qualified', async () => {
  const { digest, store, notifier } = createDigest({ ai: fakeAi({ contacts: [], wiki_facts: [] }) });
  await store.touchAdmin(ADMIN);
  await digest.runIfDue();
  assert.equal(notifier.sent.length, 1);
  assert.match(notifier.sent[0].body, /Read 5 new messages/);
  assert.match(notifier.sent[0].body, /Nothing new for the directory or wiki/);
});
