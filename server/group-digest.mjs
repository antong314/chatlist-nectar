import {
  CATEGORY_LABELS,
  DIRECTORY_CATEGORIES,
  normalizePhone,
  parseVcards,
} from './domain.mjs';
import {
  appendWikiParagraph,
  createWikiContent,
  replaceWikiText,
  slugifyWikiTitle,
} from './wiki-store.mjs';

export const DIGEST_ACTOR_NAME = 'Machu group digest';

const CONTACT_CONFIDENCE = 0.75;
const WIKI_CONFIDENCE = 0.8;
const RETENTION_DAYS = 14;
const CHUNK_MAX_MESSAGES = 300;
const CHUNK_MAX_CHARS = 60_000;
const CONTEXT_MESSAGES = 15;
// Leaves in-flight listener writes for the next run.
const CUTOFF_DELAY_MS = 15 * 1000;
const ADMIN_WINDOW_MS = 23 * 60 * 60 * 1000;
const PENDING_SUMMARY_MS = 3 * 24 * 60 * 60 * 1000;
const LISTENER_STALE_MS = 15 * 60 * 1000;
const PENDING_REVIEW_MS = 14 * 24 * 60 * 60 * 1000;
const SUMMARY_MESSAGE_LIMIT = 1500;
const EVIDENCE_TEXT_LIMIT = 280;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{6,}\d/g;

const ADMIN_HELP = [
  'Group digest commands:',
  '• digest — the latest summary',
  '• digest run — run the digest now',
  '• backfill 2026-09-27 2026-10-03 — digest imported history for those dates (rerun to redo them)',
  '• undo N — reverse published item #N',
  '• approve N / approve all — publish items waiting for review',
  '• approve all but N N — publish everything except those numbers',
  '• skip N / skip all / skip all but N — dismiss items waiting for review',
  '• groups — list the groups the listener has joined',
  '• enable N / disable N / enable all — choose which groups are recorded (use the group numbers from “groups”)',
  '',
  'N is the # number shown next to each item in the summary.',
].join('\n');

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const cleanText = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

const normalizeName = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const clampConfidence = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(Math.max(number, 0), 1) * 100) / 100;
};

export const phonesInText = (value) => (String(value ?? '').match(PHONE_PATTERN) ?? [])
  .map((candidate) => normalizePhone(candidate))
  .filter(Boolean);

export const cardsFromMessage = (message) => (Array.isArray(message?.contacts) ? message.contacts : [])
  .flatMap((card) => {
    const quoted = Boolean(card?.quoted);
    const parsed = parseVcards(card?.vcard);
    if (parsed.length > 0) return parsed.map((entry) => ({ name: card?.name || entry.name, phone: entry.phone, quoted }));
    return card?.name ? [{ name: card.name, phone: null, quoted }] : [];
  });

export const localDateParts = (date, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

const zoneOffsetMs = (instant, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - instant.getTime();
};

// The instant a local calendar day starts in timeZone.
export const localMidnight = (isoDate, timeZone) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
};

const MAX_BACKFILL_DAYS = 62;

// [start of from, start of the day after to) as ISO strings.
export const backfillWindow = (from, to, timeZone) => {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(String(from)) || !pattern.test(String(to))) {
    throw new Error('Use dates like 2026-09-27');
  }
  const start = localMidnight(from, timeZone);
  const next = new Date(`${to}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = localMidnight(next.toISOString().slice(0, 10), timeZone);
  if (!(end > start)) throw new Error('The end date must not be before the start date');
  if (end - start > MAX_BACKFILL_DAYS * 24 * 60 * 60 * 1000) throw new Error(`Backfill at most ${MAX_BACKFILL_DAYS} days at a time`);
  return { start: start.toISOString(), end: end.toISOString(), from, to };
};

const formatTime = (value, timeZone) => new Intl.DateTimeFormat('en-US', {
  timeZone,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

const formatDay = (isoDate) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
}).format(new Date(`${isoDate}T12:00:00Z`));

// Splits newline-separated text into WhatsApp-sized messages.
export const splitMessages = (text, limit = SUMMARY_MESSAGE_LIMIT) => {
  const messages = [];
  let current = '';
  for (const line of String(text).split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current) {
      messages.push(current.trimEnd());
      current = line.slice(0, limit);
    } else {
      current = candidate.slice(0, limit);
    }
  }
  if (current.trim()) messages.push(current.trimEnd());
  return messages;
};

const promptMessage = (message, shortId, idMap, context) => ({
  id: shortId,
  time: String(message.sent_at ?? '').slice(0, 16).replace('T', ' '),
  sender: cleanText(message.sender_name, 60) || `Member ${String(message.sender_hash ?? '').slice(0, 6)}`,
  reply_to: message.quoted_message_id ? (idMap.get(message.quoted_message_id) || 'an earlier message') : '',
  text: String(message.body ?? '').slice(0, 4000),
  contacts: cardsFromMessage(message).map((card) => ({
    name: card.name,
    phone: card.phone || '',
    ...(card.quoted ? { from_quoted_message: true } : {}),
  })),
  context_only: context,
});

// Groups new messages into model-sized chunks. Each chunk starts with a few
// earlier messages, marked context_only, so replies can be understood.
export const chunkMessages = (messages, context = []) => {
  const chunks = [];
  let start = 0;
  let previous = context.slice(-CONTEXT_MESSAGES);
  while (start < messages.length) {
    let end = start;
    let characters = 0;
    while (end < messages.length && end - start < CHUNK_MAX_MESSAGES) {
      characters += String(messages[end].body ?? '').length + 120;
      if (characters > CHUNK_MAX_CHARS && end > start) break;
      end += 1;
    }
    const fresh = messages.slice(start, end);
    const all = [...previous, ...fresh];
    const idMap = new Map(all.map((message, index) => [message.message_id, `m${index + 1}`]));
    const byId = new Map();
    const prompt = all.map((message, index) => {
      const shortId = `m${index + 1}`;
      const isContext = index < previous.length;
      byId.set(shortId, { ...message, context: isContext });
      return promptMessage(message, shortId, idMap, isContext);
    });
    chunks.push({ prompt, byId });
    previous = fresh.slice(-CONTEXT_MESSAGES);
    start = end;
  }
  return chunks;
};

const evidenceText = (evidence) => evidence.map((message) => String(message.body ?? '')).join('\n');

const summarizeEvidence = (evidence, group) => evidence.slice(0, 5).map((message) => ({
  group: group?.name || null,
  sender: message.sender_name || null,
  sent_at: message.sent_at,
  text: cleanText(message.body, EVIDENCE_TEXT_LIMIT),
  contacts: cardsFromMessage(message).map((card) => card.name).filter(Boolean),
}));

// Accepts a website only when the messages actually contain it.
export const verifiedWebsite = (candidate, evidence) => {
  const raw = String(candidate ?? '').trim();
  if (!raw || /\s/.test(raw) || raw.length > 300) return '';
  const bare = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
  if (bare.length < 4 || !bare.includes('.')) return '';
  if (!evidenceText(evidence).toLowerCase().includes(bare)) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

export const enrichmentChanges = (existing, { description, category, website }) => {
  const changes = {};
  if (!String(existing?.subtitle ?? '').trim() && description) changes.subtitle = description;
  if ((existing?.category || 'Service') === 'Service' && category && category !== 'Service') changes.category = category;
  if (!String(existing?.website_url ?? '').trim() && website) changes.website_url = website;
  return changes;
};

const describeChanges = (changes) => {
  const labels = [];
  if (changes.subtitle) labels.push('description');
  if (changes.category) labels.push(`category (${CATEGORY_LABELS[changes.category] || changes.category})`);
  if (changes.website_url) labels.push('website');
  return `Added ${labels.join(', ')}`;
};

// Snapshot of the fields an enrichment changes, so undo can restore them.
const previousValues = (contact, keys) => Object.fromEntries(keys.map((key) => {
  if (key === 'website_url') return [key, contact?.website_url ?? null];
  if (key === 'category') return [key, contact?.category || 'Service'];
  return [key, contact?.[key] ?? ''];
}));

const baseName = (title) => normalizeName(String(title ?? '').split(/\s[—–-]\s/)[0]);

// Turns a wiki change plan into a concrete audited write, mirroring Machu's
// conversational wiki edits. The digest never deletes pages.
export const buildWikiWrite = async ({ plan, pages, wikiStore }) => {
  if (plan.action === 'create') {
    const title = cleanText(plan.title, 160);
    const slug = slugifyWikiTitle(plan.target_slug || title);
    const content = createWikiContent(plan.append_text || plan.replacement_text);
    if (!title || !slug || content === '[]') throw new Error('The proposed new page has no title or content');
    if (await wikiStore.getPage(slug)) throw new Error(`A page called ${title} already exists`);
    return {
      actionType: 'wiki_create', slug, title, category: plan.category || 'Uncategorized', content, expectedVersion: null,
    };
  }
  if (plan.action !== 'update') throw new Error('Unsupported wiki change');
  let page = pages.find((candidate) => candidate.slug === plan.target_slug) ?? null;
  if (!page && plan.target_slug) page = await wikiStore.getPage(plan.target_slug);
  if (!page) throw new Error('No matching wiki page');
  let content;
  if (plan.operation === 'replace') {
    content = replaceWikiText(page.content, plan.find_text, plan.replacement_text, plan.anchor_text);
  } else if (plan.operation === 'append' && String(plan.append_text ?? '').trim()) {
    content = appendWikiParagraph(page.content, plan.append_text);
  } else {
    throw new Error('The wiki change was incomplete');
  }
  return {
    actionType: 'wiki_update',
    slug: page.slug,
    title: cleanText(plan.title || page.title, 160) || page.title,
    category: plan.category || page.category || 'Uncategorized',
    content,
    expectedVersion: page.version,
  };
};

const parseRefs = (value) => String(value ?? '')
  .split(/[\s,]+/)
  .map((token) => Number(token.replace(/^#/, '')))
  .filter((number) => Number.isInteger(number) && number > 0);

// ---------------------------------------------------------------------------
// Digest service
// ---------------------------------------------------------------------------

export class GroupDigest {
  constructor({
    store,
    directory,
    wikiStore,
    ai,
    notifier = null,
    adminPhones = [],
    mode = 'shadow',
    timeZone = 'America/Costa_Rica',
    digestHour = 6,
    templateSid = '',
    now = () => new Date(),
    log = console,
  }) {
    this.store = store;
    this.directory = directory;
    this.wikiStore = wikiStore;
    this.ai = ai;
    this.notifier = notifier;
    this.adminPhones = adminPhones.map((phone) => normalizePhone(phone, '')).filter(Boolean);
    this.mode = mode === 'publish' ? 'publish' : 'shadow';
    this.timeZone = timeZone;
    this.digestHour = digestHour;
    this.templateSid = templateSid;
    this.now = now;
    this.log = log;
    this.activeRun = null;
  }

  get enabled() {
    return this.adminPhones.length > 0 && Boolean(this.ai?.enabled);
  }

  isAdmin(phone) {
    const normalized = normalizePhone(phone, '');
    return Boolean(normalized) && this.adminPhones.includes(normalized);
  }

  // Called by the scheduler; runs at most once per local day after digestHour.
  async runIfDue() {
    if (!this.enabled) return null;
    const { date, hour } = localDateParts(this.now(), this.timeZone);
    if (hour < this.digestHour) return null;
    return this.run({ trigger: 'schedule', runDate: date });
  }

  async run({ trigger = 'manual', runDate, window = null } = {}) {
    if (this.activeRun) return { skipped: 'already running' };
    const date = runDate || localDateParts(this.now(), this.timeZone).date;
    this.activeRun = this.execute({ trigger, runDate: date, window }).finally(() => {
      this.activeRun = null;
    });
    return this.activeRun;
  }

  // Digests every stored message sent between two local dates (inclusive).
  // Rerunning the same dates replaces the earlier run's undecided items.
  async backfill({ from, to }) {
    return this.run({ trigger: 'backfill', window: backfillWindow(from, to, this.timeZone) });
  }

  async execute({ trigger, runDate, window }) {
    const runId = await this.store.claimRun({
      runDate,
      trigger,
      mode: this.mode,
      windowStart: window?.start ?? null,
      windowEnd: window?.end ?? null,
    });
    if (!runId) return { skipped: 'not due' };
    const stats = {
      messages: 0, groups: 0, enabledGroups: 0, applied: 0, proposed: 0,
      needs_review: 0, skipped: 0, failed: 0, purged: 0, superseded: 0,
    };
    try {
      stats.purged = await this.store.purgeMessages(RETENTION_DAYS);
      if (window) {
        stats.superseded = await this.store.supersedeBackfillItems({ ...window, exceptRunId: runId });
      }
      const listener = await this.store.getListenerStatus();
      const actorPhone = normalizePhone(listener?.account_phone, '') || this.adminPhones[0];
      if (!actorPhone) throw new Error('No WhatsApp number is available to attribute digest changes');
      const groups = (await this.store.listGroups()).filter((group) => group.enabled);
      stats.enabledGroups = groups.length;
      const cutoff = new Date(this.now().getTime() - CUTOFF_DELAY_MS).toISOString();
      const context = { runId, actorPhone, seenPhones: new Set(), stats, directoryIndex: null };
      for (const group of groups) {
        if (window) await this.processBackfillGroup(group, window, context);
        else await this.processGroup(group, cutoff, context);
      }
      await this.store.finishRun(runId, { status: 'completed', stats });
    } catch (error) {
      this.log.error('Group digest failed:', error);
      await this.store.finishRun(runId, {
        status: 'failed',
        stats,
        error: cleanText(error?.message || error, 500),
      }).catch((finishError) => this.log.error('Unable to record digest failure:', finishError));
    }
    // A run an administrator started always reports back, even when quiet.
    await this.deliverSummary(runId, { always: trigger !== 'schedule' })
      .catch((error) => this.log.error('Unable to send digest summary:', error));
    return { runId, stats };
  }

  async digestMessages(group, messages, earlier, context) {
    context.stats.groups += 1;
    context.stats.messages += messages.length;
    for (const chunk of chunkMessages(messages, earlier)) {
      const extraction = await this.ai.extractGroupKnowledge({ groupName: group.name, messages: chunk.prompt });
      if (!extraction) throw new Error('The language model was unavailable');
      for (const candidate of extraction.contacts ?? []) {
        await this.handleCandidate('contact', candidate, chunk, group, context);
      }
      for (const fact of extraction.wiki_facts ?? []) {
        await this.handleCandidate('wiki', fact, chunk, group, context);
      }
    }
  }

  // Daily runs read live messages received since the group's watermark.
  async processGroup(group, cutoff, context) {
    const messages = await this.store.getMessages(group.jid, { after: group.processed_through, through: cutoff });
    if (messages.length === 0) return;
    const earlier = group.processed_through
      ? await this.store.getContextMessages(group.jid, { before: group.processed_through, limit: CONTEXT_MESSAGES })
      : [];
    await this.digestMessages(group, messages, earlier, context);
    const watermark = messages.reduce(
      (latest, message) => (message.received_at > latest ? message.received_at : latest),
      messages[0].received_at,
    );
    await this.store.markGroupProcessed(group.jid, watermark);
  }

  // Backfill runs read every message sent in the window and leave the daily
  // watermark untouched, so the same window can be rerun.
  async processBackfillGroup(group, window, context) {
    const messages = await this.store.getMessagesSentBetween(group.jid, window);
    if (messages.length === 0) return;
    const earlier = await this.store.getMessagesSentBefore(group.jid, { before: window.start, limit: CONTEXT_MESSAGES });
    await this.digestMessages(group, messages, earlier, context);
  }

  async handleCandidate(kind, candidate, chunk, group, context) {
    const evidence = (candidate?.evidence_message_ids ?? [])
      .map((id) => chunk.byId.get(id))
      .filter(Boolean);
    if (!evidence.some((message) => !message.context)) return null;
    const decision = kind === 'contact'
      ? await this.decideContact(candidate, evidence, context)
      : await this.decideWikiFact(candidate);
    if (!decision) return null;
    const { apply = false, write = null, ...fields } = decision;
    let item = await this.store.createItem({
      run_id: context.runId,
      ...fields,
      status: apply ? 'proposed' : fields.status,
      evidence: summarizeEvidence(evidence, group),
    });
    if (apply) item = await this.applyItem(item, { actorPhone: context.actorPhone, write });
    context.stats[item.status] = (context.stats[item.status] ?? 0) + 1;
    return item;
  }

  statusFor(confidence, threshold) {
    if (confidence < threshold) return { status: 'needs_review', reason: 'Low confidence' };
    return this.mode === 'publish' ? { status: 'proposed', apply: true } : { status: 'proposed' };
  }

  async directoryIndex(context) {
    if (!context.directoryIndex) {
      const contacts = await this.directory.findSearchCandidates(5000);
      context.directoryIndex = new Map();
      for (const contact of contacts) {
        const key = baseName(contact.title);
        if (key.length >= 8 && !context.directoryIndex.has(key)) context.directoryIndex.set(key, contact);
      }
    }
    return context.directoryIndex;
  }

  async decideContact(candidate, evidence, context) {
    const name = cleanText(candidate.name, 160);
    if (!name) return null;
    const confidence = clampConfidence(candidate.confidence);
    const category = DIRECTORY_CATEGORIES.includes(candidate.category) ? candidate.category : 'Service';
    const description = cleanText(candidate.description, 1000);
    const website = verifiedWebsite(candidate.website, evidence);
    const cardPhones = evidence.flatMap((message) => cardsFromMessage(message).map((card) => card.phone)).filter(Boolean);
    const evidencePhones = new Set([...evidence.flatMap((message) => phonesInText(message.body)), ...cardPhones]);
    let phone = normalizePhone(candidate.phone);
    if (phone && !evidencePhones.has(phone)) phone = null;
    let phoneSource = phone ? 'message' : null;
    if (!phone && new Set(cardPhones).size === 1) [phone, phoneSource] = [cardPhones[0], 'contact card'];
    // A member advertising their own service is reachable on their own
    // WhatsApp number, but only when exactly one person wrote the evidence.
    if (!phone && candidate.offered_by_poster) {
      const posters = new Set(evidence.filter((message) => !message.context).map((message) => message.sender_phone || null));
      if (posters.size === 1 && !posters.has(null)) [phone, phoneSource] = [[...posters][0], 'poster'];
    }

    const label = CATEGORY_LABELS[category] || category;
    const base = {
      kind: 'contact',
      confidence,
      title: name,
      detail: cleanText(`${label}${phone ? ` · ${phone}${phoneSource === 'poster' ? ' (poster’s WhatsApp)' : ''}` : ''}`, 500),
      payload: { name, phone, phoneSource, category, description, website },
    };
    if (!candidate.is_service_provider) return { ...base, status: 'skipped', reason: 'Not a service provider' };
    if (!phone) return { ...base, status: 'skipped', reason: 'No phone number in the messages' };
    if (context.seenPhones.has(phone)) return null;
    context.seenPhones.add(phone);

    const existing = await this.directory.findActiveContactByPhone(phone);
    if (existing) {
      const changes = enrichmentChanges(existing, { description, category, website });
      if (Object.keys(changes).length === 0) {
        return { ...base, title: existing.title || name, status: 'skipped', reason: 'Already in the directory', contact_id: existing.id };
      }
      return {
        ...base,
        action: 'contact_enrich',
        title: existing.title || name,
        detail: describeChanges(changes),
        contact_id: existing.id,
        ...this.statusFor(confidence, CONTACT_CONFIDENCE),
      };
    }
    const index = await this.directoryIndex(context);
    const sameName = index.get(baseName(name));
    if (sameName) {
      return { ...base, status: 'skipped', reason: `Possibly already listed as ${sameName.title}`, contact_id: sameName.id };
    }
    return { ...base, action: 'contact_create', ...this.statusFor(confidence, CONTACT_CONFIDENCE) };
  }

  async planWikiFact({ statement, topic, searchTerms }) {
    const pages = await this.wikiStore.searchPages(statement, [topic, ...searchTerms].filter(Boolean), 4);
    const plan = await this.ai.planWikiChange({
      message: `Add this local knowledge, shared in a community WhatsApp group, to the wiki only if the wiki does not already contain it: ${statement}`,
      pages,
      context: { source: 'community WhatsApp group digest', topic },
    });
    if (!plan) return { failed: 'The language model was unavailable' };
    if (plan.action === 'delete') return { skip: 'The digest never deletes wiki pages' };
    if (plan.action === 'none' || plan.operation === 'none') return { skip: 'Already in the wiki' };
    if (plan.needs_clarification) {
      return { skip: cleanText(`Unclear: ${plan.clarification_question || 'needs more detail'}`, 300) };
    }
    try {
      return { plan, write: await buildWikiWrite({ plan, pages, wikiStore: this.wikiStore }) };
    } catch (error) {
      return { skip: cleanText(error.message, 300) };
    }
  }

  async decideWikiFact(fact) {
    const statement = cleanText(fact.statement, 800);
    if (!statement) return null;
    const confidence = clampConfidence(fact.confidence);
    const topic = cleanText(fact.topic, 120);
    const searchTerms = (fact.search_terms ?? []).map((term) => cleanText(term, 60)).filter(Boolean).slice(0, 6);
    const base = {
      kind: 'wiki',
      confidence,
      title: topic || cleanText(statement, 80),
      detail: cleanText(statement, 500),
      payload: { statement, topic, searchTerms },
    };
    if (fact.time_sensitive) return { ...base, status: 'skipped', reason: 'Time-sensitive' };
    const planned = await this.planWikiFact(base.payload);
    if (planned.failed) return { ...base, status: 'failed', reason: planned.failed };
    if (planned.skip) return { ...base, status: 'skipped', reason: planned.skip };
    const action = planned.write.actionType;
    const decision = {
      ...base,
      action,
      title: cleanText(planned.write.title, 200) || base.title,
      detail: cleanText(planned.plan.change_summary || statement, 500),
      wiki_page_slug: planned.write.slug,
      payload: { ...base.payload, plan: planned.plan },
      write: planned.write,
    };
    if (action === 'wiki_create') return { ...decision, status: 'needs_review', reason: 'Would create a new wiki page' };
    return { ...decision, ...this.statusFor(confidence, WIKI_CONFIDENCE) };
  }

  audit(item, actorPhone) {
    return {
      requesterWhatsapp: actorPhone,
      requesterName: DIGEST_ACTOR_NAME,
      twilioMessageSid: `digest:${item.id}`,
      verificationMethod: 'group_digest',
    };
  }

  // Publishes one item. decidedBy is set when an administrator approved it.
  async applyItem(item, { actorPhone, write = null, decidedBy = null }) {
    try {
      if (item.kind === 'contact') return await this.applyContact(item, { actorPhone, decidedBy });
      return await this.applyWiki(item, { actorPhone, write, decidedBy });
    } catch (error) {
      this.log.error(`Unable to apply digest item #${item.ref}:`, error);
      const reason = error?.code === '40001'
        ? 'Changed by someone else before it could be applied'
        : cleanText(error?.message || 'Unable to apply', 300);
      return this.store.updateItem(item.id, { status: 'failed', reason });
    }
  }

  async applyContact(item, { actorPhone, decidedBy }) {
    const { name, phone, category, description, website } = item.payload ?? {};
    const audit = this.audit(item, actorPhone);
    let contact;
    let action = item.action;
    if (action === 'contact_create') {
      const result = await this.directory.createOrGetContact({ name, phone }, audit);
      contact = result.contact;
      if (!result.created) action = 'contact_enrich';
    } else {
      contact = await this.directory.getContact(item.contact_id);
      if (!contact) throw new Error('The listing no longer exists');
    }
    const changes = action === 'contact_create'
      ? {
          ...(description ? { subtitle: description } : {}),
          ...(category && category !== 'Service' ? { category } : {}),
          ...(website ? { website_url: website } : {}),
        }
      : enrichmentChanges(contact, { description, category, website });
    if (action === 'contact_enrich' && Object.keys(changes).length === 0) {
      return this.store.updateItem(item.id, {
        status: 'skipped', reason: 'Already in the directory', contact_id: contact.id, action,
      });
    }
    const before = action === 'contact_enrich' ? previousValues(contact, Object.keys(changes)) : null;
    if (Object.keys(changes).length > 0) await this.directory.updateContact(contact.id, changes, audit);
    return this.store.updateItem(item.id, {
      status: 'applied',
      action,
      contact_id: contact.id,
      title: action === 'contact_enrich' ? (contact.title || item.title) : item.title,
      detail: action === 'contact_enrich' ? describeChanges(changes) : item.detail,
      payload: { ...item.payload, changes, ...(before ? { before } : {}) },
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    });
  }

  async applyWiki(item, { actorPhone, write, decidedBy }) {
    let change = write;
    let plan = item.payload?.plan;
    if (!change) {
      const planned = await this.planWikiFact(item.payload ?? {});
      if (planned.failed) throw new Error(planned.failed);
      if (planned.skip) return this.store.updateItem(item.id, { status: 'skipped', reason: planned.skip });
      change = planned.write;
      plan = planned.plan;
    }
    const result = await this.wikiStore.applyChange({
      ...change,
      ...this.audit(item, actorPhone),
    });
    return this.store.updateItem(item.id, {
      status: 'applied',
      action: change.actionType,
      title: cleanText(change.title, 200) || item.title,
      detail: cleanText(plan?.change_summary || item.detail, 500),
      wiki_page_slug: change.slug,
      wiki_event_id: result?.event_id ?? null,
      payload: { ...item.payload, plan },
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    });
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  listenerWarning(listener) {
    if (!listener) return '⚠️ The group listener has never connected. Link its WhatsApp account with `listener login`.';
    if (listener.status === 'awaiting_login') return '⚠️ The group listener is waiting to be linked to its WhatsApp account.';
    if (listener.status === 'logged_out') return '⚠️ The group listener was logged out of WhatsApp. Link it again with `listener login`.';
    const lastSeen = new Date(listener.last_seen_at).getTime();
    if (listener.status !== 'connected' || this.now().getTime() - lastSeen > LISTENER_STALE_MS) {
      return `⚠️ The group listener has been offline since ${formatTime(listener.last_seen_at, this.timeZone)}. Check the listener phone and worker.`;
    }
    return '';
  }

  buildSummary({ run, items, listener, groups, earlierPending = [] }) {
    const stats = run.stats ?? {};
    const backfillDays = run.trigger === 'backfill' && run.window_start
      ? `${formatDay(localDateParts(new Date(run.window_start), this.timeZone).date)} – ${formatDay(localDateParts(new Date(new Date(run.window_end).getTime() - 1), this.timeZone).date)}`
      : '';
    const lines = [backfillDays
      ? `🌿 Machu backfill · ${backfillDays}`
      : `🌿 Machu group digest · ${formatDay(run.run_date)}`];
    if (Number(stats.superseded) > 0) {
      lines.push('', `This rerun replaced ${stats.superseded} undecided item${stats.superseded === 1 ? '' : 's'} from the previous run of these dates.`);
    }
    if (run.status === 'failed') lines.push('', `The digest couldn’t finish: ${run.error || 'unknown error'}. It will try again.`);
    const enabledGroups = groups.filter((group) => group.enabled).length;
    if (enabledGroups === 0) {
      lines.push('', groups.length > 0
        ? 'No groups are enabled yet. Reply “groups” to see the groups I’ve joined, then “enable 1 2” to start.'
        : 'The listener hasn’t joined any groups yet. Add its number to your WhatsApp groups.');
    } else {
      lines.push('', `Read ${stats.messages ?? 0} new message${stats.messages === 1 ? '' : 's'} from ${stats.groups ?? 0} of ${enabledGroups} enabled group${enabledGroups === 1 ? '' : 's'}.`);
    }
    if (run.mode === 'shadow') lines.push('Trial mode: nothing was published automatically. Reply “approve N” to publish an item.');
    if (enabledGroups > 0 && items.length === 0 && run.status !== 'failed') lines.push('', 'Nothing new for the directory or wiki.');

    const line = (item) => `#${item.ref} ${item.title}${item.detail ? ` — ${item.detail}` : ''}`;
    const section = (title, list, format = line) => {
      if (list.length === 0) return;
      lines.push('', title, ...list.map(format));
    };
    const by = (predicate) => items.filter(predicate);
    section('Added to the directory:', by((item) => item.status === 'applied' && item.action === 'contact_create'));
    section('Improved listings:', by((item) => item.status === 'applied' && item.action === 'contact_enrich'));
    section('Wiki updates:', by((item) => item.status === 'applied' && item.kind === 'wiki'));
    section('Ready to publish:', by((item) => item.status === 'proposed'));
    section('Needs your OK:', by((item) => item.status === 'needs_review'),
      (item) => `${line(item)}${item.reason ? ` (${item.reason.toLowerCase()})` : ''}`);
    section('Couldn’t apply:', by((item) => item.status === 'failed'),
      (item) => `#${item.ref} ${item.title}${item.reason ? ` — ${item.reason}` : ''}`);
    section('Still waiting for your decision (from earlier digests):', earlierPending.slice(0, 15));
    if (earlierPending.length > 15) lines.push(`…and ${earlierPending.length - 15} more. “approve all” or “skip all” covers them too.`);
    const noPhone = by((item) => item.status === 'skipped' && item.reason === 'No phone number in the messages');
    if (noPhone.length > 0) {
      lines.push('', `Mentioned without a phone number: ${noPhone.slice(0, 10).map((item) => item.title).join('; ')}${noPhone.length > 10 ? '; …' : ''}`);
    }
    const otherSkipped = by((item) => item.status === 'skipped').length - noPhone.length;
    if (otherSkipped > 0) lines.push('', `Skipped ${otherSkipped} other item${otherSkipped === 1 ? '' : 's'} (already listed, not services, already in the wiki, or time-sensitive).`);
    const hint = this.commandHint([...items, ...earlierPending]);
    if (hint) lines.push('', hint);
    const warning = this.listenerWarning(listener);
    if (warning) lines.push('', warning);
    return splitMessages(lines.join('\n'));
  }

  // Suggests replies using this summary's own reference numbers.
  commandHint(items) {
    const pending = items.filter((item) => ['proposed', 'needs_review'].includes(item.status));
    const applied = items.filter((item) => item.status === 'applied');
    const parts = [];
    if (pending.length === 1) {
      parts.push(`“approve ${pending[0].ref}” to publish it, or “skip ${pending[0].ref}” to dismiss it`);
    } else if (pending.length > 1) {
      parts.push(`“approve all” to publish everything, “approve all but ${pending[0].ref} ${pending[1].ref}” to hold some back, or “skip ${pending[0].ref}” to dismiss one`);
    }
    if (applied.length > 0) parts.push(`“undo ${applied[0].ref}” to reverse a published item`);
    return parts.length > 0 ? `Reply ${parts.join('; ')}.` : '';
  }

  async summaryFor(runId) {
    const [run, items, listener, groups] = await Promise.all([
      this.store.getRun(runId),
      this.store.listItems(runId),
      this.store.getListenerStatus(),
      this.store.listGroups(),
    ]);
    if (!run) return null;
    const earlierPending = (await this.pendingItems()).filter((item) => item.run_id !== runId);
    // Silent only when there was nothing to read and nothing awaits a decision.
    const noteworthy = run.status === 'failed'
      || Number(run.stats?.messages ?? 0) > 0
      || items.some((item) => item.status !== 'skipped')
      || earlierPending.length > 0
      || Boolean(this.listenerWarning(listener))
      || !groups.some((group) => group.enabled);
    return {
      run,
      items,
      listener,
      groups,
      earlierPending,
      noteworthy,
      messages: this.buildSummary({ run, items, listener, groups, earlierPending }),
    };
  }

  templateVariables(items, earlierPending = []) {
    const applied = items.filter((item) => item.status === 'applied');
    const pending = items.filter((item) => ['proposed', 'needs_review'].includes(item.status));
    return {
      1: String(applied.filter((item) => item.kind === 'contact').length),
      2: String(applied.filter((item) => item.kind === 'wiki').length),
      3: String(pending.length + earlierPending.length),
    };
  }

  // Undecided items from recent digests, oldest first.
  async pendingItems() {
    const since = new Date(this.now().getTime() - PENDING_REVIEW_MS).toISOString();
    return this.store.listPendingItems({ since });
  }

  // Sends the full summary inside WhatsApp's customer-service window, or the
  // approved template outside it. The full summary is otherwise delivered
  // with the administrator's next message to Machu.
  async deliverSummary(runId, { always = false } = {}) {
    const summary = await this.summaryFor(runId);
    if (!summary) return;
    if (!summary.noteworthy && !always) {
      await this.store.markSummarySent(runId);
      return;
    }
    if (!this.notifier) return;
    let delivered = false;
    for (const admin of this.adminPhones) {
      const lastInbound = await this.store.getAdminLastInbound(admin);
      if (lastInbound && this.now().getTime() - lastInbound.getTime() < ADMIN_WINDOW_MS) {
        for (const body of summary.messages) await this.notifier.send({ to: admin, body });
        delivered = true;
      } else if (this.templateSid) {
        await this.notifier.send({
          to: admin,
          contentSid: this.templateSid,
          contentVariables: this.templateVariables(summary.items, summary.earlierPending),
        });
      }
    }
    if (delivered) await this.store.markSummarySent(runId);
  }

  async takePendingSummary() {
    const since = new Date(this.now().getTime() - PENDING_SUMMARY_MS).toISOString();
    const run = await this.store.getUndeliveredRun({ since });
    if (!run) return [];
    const summary = await this.summaryFor(run.id);
    await this.store.markSummarySent(run.id);
    return summary?.noteworthy ? summary.messages : [];
  }

  // -------------------------------------------------------------------------
  // Administrator commands over WhatsApp
  // -------------------------------------------------------------------------

  // Returns { handled, messages }. When handled is false, messages holds a
  // pending summary to prepend to Machu's normal reply.
  async handleAdminMessage({ senderPhone, body }) {
    const admin = normalizePhone(senderPhone, '');
    await this.store.touchAdmin(admin);
    const text = String(body ?? '').trim();
    const command = text.toLowerCase();

    if (command === 'digest help') return { handled: true, messages: [{ body: ADMIN_HELP }] };
    if (command === 'digest') {
      const latest = await this.store.getLatestRun();
      if (!latest || latest.status === 'running') {
        return { handled: true, messages: [{ body: latest ? 'The digest is running now; I’ll send the summary when it finishes.' : 'No digest has run yet. Reply “digest run” to run one now.' }] };
      }
      const summary = await this.summaryFor(latest.id);
      await this.store.markSummarySent(latest.id);
      return { handled: true, messages: summary.messages.map((message) => ({ body: message })) };
    }
    if (command === 'digest run' || command === 'run digest') {
      this.run({ trigger: 'manual' }).catch((error) => this.log.error('Manual digest failed:', error));
      return { handled: true, messages: [{ body: 'Running the group digest now 🌿 I’ll send the summary when it’s done.' }] };
    }
    if (command === 'groups') return { handled: true, messages: await this.groupsReply() };

    const backfillMatch = command.match(/^backfill\s+(\d{4}-\d{2}-\d{2})(?:\s+(?:to\s+)?(\d{4}-\d{2}-\d{2}))?$/);
    if (backfillMatch) {
      const [, from, to = backfillMatch[1]] = backfillMatch;
      try {
        backfillWindow(from, to, this.timeZone);
      } catch (error) {
        return { handled: true, messages: [{ body: error.message }] };
      }
      if (this.activeRun) return { handled: true, messages: [{ body: 'A digest is already running. Try again when its summary arrives.' }] };
      this.backfill({ from, to }).catch((error) => this.log.error('Backfill failed:', error));
      return { handled: true, messages: [{ body: `Backfilling ${from} to ${to} 🌿 I’ll send the summary when it’s done. Run the same command again later to redo these dates with the latest logic.` }] };
    }

    const allBut = text.match(/^(approve|skip)\s+all\s+(?:but|except)\s+(#?\d+(?:[\s,]+(?:and\s+)?#?\d+)*)\s*$/i);
    if (allBut) {
      const verb = allBut[1].toLowerCase();
      const except = parseRefs(allBut[2].replace(/\band\b/gi, ' '));
      if (verb === 'skip') return { handled: true, messages: await this.skipItems('all', admin, except) };
      this.approveItems('all', admin, except).catch((error) => this.log.error('Digest approval failed:', error));
      return { handled: true, messages: [{ body: `Publishing everything waiting except ${except.map((ref) => `#${ref}`).join(', ')} 🌿 I’ll confirm in a moment.` }] };
    }

    const match = text.match(/^(undo|approve|skip|enable|disable)\s+(all|#?\d+(?:[\s,]+#?\d+)*)\s*$/i);
    if (match) {
      const verb = match[1].toLowerCase();
      const target = match[2].toLowerCase() === 'all' ? 'all' : parseRefs(match[2]);
      if (verb === 'enable' || verb === 'disable') {
        return { handled: true, messages: await this.setGroups(target, verb === 'enable') };
      }
      if (verb === 'undo') {
        if (target === 'all') return { handled: true, messages: [{ body: 'Undo items one at a time, for example “undo 3”.' }] };
        return { handled: true, messages: await this.undoItems(target, admin) };
      }
      if (verb === 'skip') return { handled: true, messages: await this.skipItems(target, admin) };
      this.approveItems(target, admin).catch((error) => this.log.error('Digest approval failed:', error));
      return { handled: true, messages: [{ body: 'Publishing now 🌿 I’ll confirm in a moment.' }] };
    }

    const pending = await this.takePendingSummary();
    return { handled: false, messages: pending.map((message) => ({ body: message })) };
  }

  async groupsReply() {
    const groups = await this.store.listGroups();
    if (groups.length === 0) {
      return [{ body: 'The listener hasn’t joined any groups yet. Add its WhatsApp number to your groups.' }];
    }
    const lines = ['WhatsApp groups the listener has joined:'];
    for (const group of groups) lines.push(`${group.ref}. ${group.enabled ? '✅' : '⏸️'} ${group.name || 'Unnamed group'}`);
    lines.push('', 'Only ✅ groups are recorded. Reply “enable 2 3”, “disable 1”, or “enable all”.');
    return splitMessages(lines.join('\n')).map((message) => ({ body: message }));
  }

  async setGroups(target, enabled) {
    const updated = await this.store.setGroupsEnabled(target, enabled);
    if (updated.length === 0) return [{ body: 'I couldn’t find those groups. Reply “groups” to see the list.' }];
    const names = updated.map((group) => `${group.ref}. ${group.name || 'Unnamed group'}`).join('\n');
    return [{
      body: enabled
        ? `Recording these groups from now on 🌿\n${names}\n\nMessages sent before a group was enabled aren’t recorded.`
        : `Stopped recording these groups:\n${names}`,
    }];
  }

  async itemsForTarget(target, except = []) {
    if (target !== 'all') {
      const items = [];
      for (const ref of target.slice(0, 20)) items.push((await this.store.getItemByRef(ref)) ?? { ref, missing: true });
      return items;
    }
    return (await this.pendingItems()).filter((item) => !except.includes(Number(item.ref)));
  }

  // Tells the administrator which excluded items are still waiting.
  async keptLine(except) {
    if (except.length === 0) return '';
    const pending = new Set((await this.pendingItems()).map((item) => Number(item.ref)));
    const kept = except.filter((ref) => pending.has(ref));
    if (kept.length === 0) return '';
    return `Still waiting: ${kept.map((ref) => `#${ref}`).join(', ')}. Reply “skip all” to dismiss ${kept.length === 1 ? 'it' : 'them'}.`;
  }

  async undoItems(refs, admin) {
    const lines = [];
    for (const item of await this.itemsForTarget(refs)) {
      if (item.missing) {
        lines.push(`#${item.ref}: not found.`);
      } else if (item.status !== 'applied') {
        lines.push(`#${item.ref} ${item.title}: nothing to undo (${item.status.replace('_', ' ')}).`);
      } else {
        try {
          await this.store.undoItem(item.id, admin);
          lines.push(item.action === 'contact_create'
            ? `Undone #${item.ref}: removed ${item.title} from the directory.`
            : `Undone #${item.ref}: restored ${item.title}.`);
        } catch (error) {
          lines.push(error?.code === '40001'
            ? `#${item.ref} ${item.title} changed after the digest, so I left it. Edit it on the website.`
            : `#${item.ref} ${item.title}: couldn’t undo (${cleanText(error.message, 120)}).`);
        }
      }
    }
    return [{ body: lines.join('\n') || 'Nothing to undo.' }];
  }

  async skipItems(target, admin, except = []) {
    const lines = [];
    for (const item of await this.itemsForTarget(target, except)) {
      if (item.missing) {
        lines.push(`#${item.ref}: not found.`);
      } else if (!['needs_review', 'proposed'].includes(item.status)) {
        lines.push(`#${item.ref} ${item.title}: not waiting for review.`);
      } else {
        await this.store.updateItem(item.id, {
          status: 'skipped', reason: 'Skipped by administrator', decided_at: new Date().toISOString(), decided_by: admin,
        });
        lines.push(`Skipped #${item.ref} ${item.title}.`);
      }
    }
    const kept = await this.keptLine(except);
    if (kept) lines.push('', kept.replace('“skip all” to dismiss', '“approve all” to publish'));
    return [{ body: lines.join('\n') || 'Nothing is waiting for review.' }];
  }

  async approveItems(target, admin, except = []) {
    const lines = [];
    for (const item of await this.itemsForTarget(target, except)) {
      if (item.missing) {
        lines.push(`#${item.ref}: not found.`);
      } else if (!['needs_review', 'proposed'].includes(item.status) || !item.action) {
        lines.push(`#${item.ref} ${item.title}: can’t be published (${item.status.replace('_', ' ')}).`);
      } else {
        const result = await this.applyItem(item, { actorPhone: admin, decidedBy: admin });
        lines.push(result.status === 'applied'
          ? `Published #${result.ref} ${result.title}${result.detail ? ` — ${result.detail}` : ''}.`
          : `#${result.ref} ${result.title}: ${result.reason || result.status}.`);
      }
    }
    const kept = await this.keptLine(except);
    if (kept) lines.push('', kept);
    if (this.notifier) {
      for (const body of splitMessages(lines.join('\n') || 'Nothing is waiting for review.')) {
        await this.notifier.send({ to: admin, body });
      }
    }
    return lines;
  }
}
