import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CATEGORY_LABELS,
  DIRECTORY_CATEGORIES,
  detectAddRequest,
  extractPhoneFromText,
  inferCategoryHeuristically,
  looksLikeDirectorySearch,
  normalizePhone,
  parseCategoryReply,
  parseReview,
  parseVcards,
  planSearchHeuristically,
  rankContactsForSearchTiers,
} from './domain.mjs';
import {
  appendWikiFactToAnchoredBlock,
  appendWikiParagraph,
  createWikiContent,
  replaceWikiText,
  slugifyWikiTitle,
} from './wiki-store.mjs';

const DESCRIPTION_MAX_LENGTH = 1000;
const SEARCH_SUMMARY_DESCRIPTION_MAX_LENGTH = 900;
const SPECIFIC_SEARCH_RESULT_LIMIT = 3;
const HELP_MESSAGE_BODY = [
  '🌿 I’m Machu, the San Mateo community directory and local-knowledge helper.',
  '',
  '• Forward me a contact card and I’ll add it right away.',
  '• Or say “add this number +506…” / “add my number”.',
  '• Ask “send me all taxi contacts” to search the directory.',
  '• Ask a local question like “When is the San Mateo farmers market?”',
  '• Tell me when wiki information has changed and I’ll update it.',
  '• After adding someone, you can send “5 stars — great service” to leave a review.',
].join('\n');

const stripWhatsappPrefix = (value) => String(value ?? '').replace(/^whatsapp:/i, '');

const ensureAbsoluteUrl = (value) => {
  const url = String(value ?? '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const truncateDescription = (value) => {
  const description = String(value ?? '').trim();
  if (description.length <= SEARCH_SUMMARY_DESCRIPTION_MAX_LENGTH) return description;
  return `${description.slice(0, SEARCH_SUMMARY_DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
};

const standaloneCategoryLabel = (category) => {
  const label = String(CATEGORY_LABELS[category] || category || 'General services');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

export const createConversationKey = (sender, secret) => createHmac('sha256', secret)
  .update(normalizePhone(stripWhatsappPrefix(sender), '') || stripWhatsappPrefix(sender))
  .digest('hex');

export const signContactMedia = (contactId, secret) => createHmac('sha256', secret)
  .update(`vcard:${contactId}`)
  .digest('hex');

export const verifyContactMediaSignature = (contactId, provided, secret) => {
  const expected = signContactMedia(contactId, secret);
  const actual = String(provided ?? '');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

const categoryQuestion = [
  'I saved the description, but I’m not sure about the category. Which fits best?',
  'Home & repairs, mechanics, taxi, towing, food & groceries, wellness, creative, retreats & stays, or general services?',
  'You can also say “skip”.',
].join('\n');

const reviewInvitation = (contactName) =>
  `Optional: send “5 stars — your review” if you’d like to leave a review for ${contactName}.`;

const contactAddedReply = (contact, created) => {
  const firstLine = created
    ? `🌿 Added ${contact.title} to sanmateo.love.`
    : `🌿 ${contact.title} is already in sanmateo.love, so I didn’t create a duplicate.`;
  return [
    firstLine,
    'Send me a short description of what they offer if you’d like to improve the listing. You can also walk away—they’re already there.',
    reviewInvitation(contact.title),
  ].join('\n\n');
};

const isSkip = (value) => /^(?:skip|done|no thanks|no|later|omitir|listo|nada)$/i.test(String(value ?? '').trim());
const asksForReview = (value) => /\b(?:leave|write|add|dejar|escribir)\b.*\b(?:review|reseña)\b/i.test(String(value ?? ''));
const isHelp = (value) => /^(?:help|menu|start|hola|hello|hi|hey|ayuda|what can you do)(?:\s+machu)?[?!. ]*$/i.test(String(value ?? '').trim());
const asksForMoreResults = (value) => /^(?:(?:yes|sure|please|ok(?:ay)?)[,!. ]*)?(?:(?:show|send|see|give)(?:\s+me)?\s+)?(?:the\s+)?more\b/i.test(String(value ?? '').trim())
  || /^(?:yes|sure|please|ok(?:ay)?)[?!. ]*$/i.test(String(value ?? '').trim());
const explicitlyRequestsWholeCategory = (value) =>
  /\b(all|every|whole|entire|full|everyone|todos?|todas?)\b/i.test(String(value ?? ''));
const requestsWikiChange = (value) => /\b(?:wiki|guide|page)\b.*\b(?:add|change|correct|delete|remove|update)\b|\b(?:add|change|correct|delete|remove|update)\b.*\b(?:wiki|guide|page)\b/i.test(String(value ?? ''));
const requestsUndo = (value) => /^(?:undo|undo that|revert|revert that|deshacer|deshaz eso)[?!. ]*$/i.test(String(value ?? '').trim());
const confirms = (value) => /^(?:yes|yes delete it|confirm|si|sí)[?!. ]*$/i.test(String(value ?? '').trim());
const affirmsFact = (value) => /^(?:yes|yeah|yep|correct|that’s right|that's right|si|sí)\b[?!. ]*/i.test(String(value ?? '').trim());
const declinesFact = (value) => /^(?:no|nope|not really|cancel)\b[?!. ]*/i.test(String(value ?? '').trim());
const requiresDirectoryContactResult = (value) => /\b(?:contact|phone number|someone|anyone|provider|professional|doctor|physician|plumber|electrician|mechanic|taxi|driver|therapist|masseu(?:r|se)|chef|photographer|dentist|who does|who can)\b/i.test(String(value ?? ''));

class WikiClarificationError extends Error {}

const normalizeWikiLookup = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const extractListAdditionSubject = (value) => {
  const match = String(value ?? '').match(/\badd\s+(.+?)\s+to\s+(?:that|the|this)\s+list\b/i);
  return String(match?.[1] ?? '').replace(/^(?:a|an|the)\s+/i, '').trim().slice(0, 160);
};

const recommendationFactFromQuestion = (question, proposedFact = '') => {
  const proposed = String(proposedFact ?? '')
    .trim()
    .replace(/[.?!]+$/, '')
    .replace(/^(?:has|serves|offers|is known for)\s+/i, '');
  if (proposed) {
    const pizza = /\bpizza\b/i.test(proposed);
    return {
      fact: proposed,
      question: pizza ? 'Do they have good pizza?' : `Should I add “${proposed}” to their existing description?`,
    };
  }
  const normalized = String(question ?? '');
  const knownTopics = [
    { pattern: /\bpizza\b/i, fact: 'great pizza', question: 'Do they have good pizza?' },
    { pattern: /\bsushi\b/i, fact: 'great sushi', question: 'Do they have good sushi?' },
    { pattern: /\bcoffee\b/i, fact: 'great coffee', question: 'Do they have good coffee?' },
    { pattern: /\bceviche\b/i, fact: 'great ceviche', question: 'Do they have good ceviche?' },
    { pattern: /\bbreakfast\b/i, fact: 'great breakfast', question: 'Do they serve a good breakfast?' },
  ];
  return knownTopics.find((topic) => topic.pattern.test(normalized)) ?? null;
};

const findExistingWikiSubject = (pages, subject) => {
  const needle = normalizeWikiLookup(subject);
  if (!needle) return null;
  for (const page of pages) {
    const lines = String(page?.plainText ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    const anchorText = lines.find((line) => {
      const normalized = normalizeWikiLookup(line);
      return normalized.includes(needle) && normalized.length <= needle.length + 20;
    });
    if (anchorText) return { page, anchorText };
  }
  return null;
};

const formatWikiDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const mergeTermGroups = (...collections) => {
  const groups = new Map();
  for (const group of collections.flat()) {
    const label = String(group?.label ?? '').trim();
    const terms = Array.isArray(group?.terms) ? group.terms.map(String).filter(Boolean) : [];
    if (!label || terms.length === 0) continue;
    const key = label.toLocaleLowerCase();
    const existing = groups.get(key) ?? { label, terms: [] };
    existing.terms = Array.from(new Set([...existing.terms, ...terms]));
    groups.set(key, existing);
  }
  return [...groups.values()];
};

const naturalList = (values) => {
  const items = [...new Set((values ?? []).filter(Boolean))];
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
};

export class MachuBot {
  constructor({
    store,
    wikiStore = null,
    ai,
    fetchMedia,
    publicBaseUrl = 'https://www.sanmateo.love',
    signingSecret,
    digest = null,
  }) {
    this.store = store;
    this.digest = digest;
    this.wikiStore = wikiStore;
    this.ai = ai;
    this.fetchMedia = fetchMedia;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.signingSecret = signingSecret;
  }

  mediaUrl(contactId) {
    const token = signContactMedia(contactId, this.signingSecret);
    return `${this.publicBaseUrl}/bot/contact/${encodeURIComponent(contactId)}.vcf?token=${token}`;
  }

  helpMessage() {
    return [
      HELP_MESSAGE_BODY,
      `Directory: ${this.publicBaseUrl}/`,
      `Community wiki: ${this.publicBaseUrl}/wiki`,
    ].join('\n\n');
  }

  asWikiResponse(messages) {
    return (messages ?? []).map((message) => ({ ...message, responseContext: 'wiki' }));
  }

  cleanMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .map(({ responseContext: _responseContext, ...message }) => message);
  }

  providerSummary(contact, reviewSummary) {
    const description = truncateDescription(contact.subtitle) || 'No description has been added yet.';
    const reviewCount = Math.max(0, Number(reviewSummary?.review_count ?? 0) || 0);
    const averageRating = Number(reviewSummary?.average_rating ?? 0) || 0;
    const ratingLine = reviewCount > 0
      ? `⭐ ${averageRating.toFixed(1)}/5 · ${reviewCount} community review${reviewCount === 1 ? '' : 's'}`
      : '⭐ No community reviews yet';
    const lines = [
      `*${contact.title}*`,
      description,
      `🌿 ${standaloneCategoryLabel(contact.category)}`,
      ratingLine,
    ];

    const website = ensureAbsoluteUrl(contact.website_url);
    const map = ensureAbsoluteUrl(contact.map_url);
    if (website) lines.push(`Website: ${website}`);
    if (map) lines.push(`Map: ${map}`);
    lines.push(`Directory: ${this.publicBaseUrl}/provider/${encodeURIComponent(contact.id)}`);
    return lines.join('\n');
  }

  async contactResultMessages(contacts, intro) {
    const reviewSummaries = await this.store.getReviewSummaries?.(
      contacts.map((contact) => contact.id),
    ) ?? {};
    const messages = [{ body: intro }];
    for (const contact of contacts) {
      messages.push({
        body: this.providerSummary(contact, reviewSummaries[contact.id]),
      });
      // WhatsApp ignores a text body attached to free-form vCard media, so the
      // directory details and native contact card must be separate messages.
      messages.push({ mediaUrl: this.mediaUrl(contact.id) });
    }
    return messages;
  }

  auditFromMessage({ senderPhone, profileName, messageSid }) {
    return senderPhone && messageSid ? {
      requesterWhatsapp: senderPhone,
      requesterName: profileName || null,
      twilioMessageSid: messageSid,
    } : null;
  }

  wikiUrl(slug) {
    return `${this.publicBaseUrl}/wiki/${encodeURIComponent(slug)}`;
  }

  async answerWikiQuestion(body, searchTerms, conversationKey, { returnNullWhenMissing = false } = {}) {
    if (!this.wikiStore) return null;
    const pages = await this.wikiStore.searchPages(body, searchTerms, 4);
    if (pages.length === 0) {
      if (returnNullWhenMissing) return null;
      return [{
        body: `I couldn’t find that in the community wiki yet. If you know the answer, tell me and I can help add it.\n\nBrowse the community wiki: ${this.publicBaseUrl}/wiki`,
      }];
    }
    const modelAnswer = await this.ai?.answerWikiQuestion?.({ question: body, pages });
    if (!modelAnswer?.answered || !String(modelAnswer.answer ?? '').trim()) {
      const best = pages[0];
      await this.wikiStore.setSession({
        conversationKey,
        context: { mode: 'reading', pageSlugs: [best.slug], lastQuestion: body },
      });
      return [{
        body: `I found a likely answer on *${best.title}*, but I couldn’t summarize it confidently. Read it here: ${this.wikiUrl(best.slug)}`,
      }];
    }
    const bySlug = new Map(pages.map((page) => [page.slug, page]));
    const sources = (modelAnswer.source_slugs ?? []).map((slug) => bySlug.get(slug)).filter(Boolean);
    const cited = sources.length > 0 ? sources : [pages[0]];
    await this.wikiStore.setSession({
      conversationKey,
      context: {
        mode: 'reading',
        pageSlugs: cited.map((page) => page.slug),
        lastQuestion: body,
        lastAnswer: String(modelAnswer.answer).trim().slice(0, 1800),
      },
    });
    const sourceLines = cited.map((page) => {
      const updated = formatWikiDate(page.updated_at);
      return `• ${page.title}${updated ? ` · updated ${updated}` : ''}: ${this.wikiUrl(page.slug)}`;
    });
    const safety = modelAnswer.high_stakes
      ? 'If this is urgent or affects your health, safety, legal rights, or finances, use appropriate professional or emergency help—the wiki is community-maintained.'
      : '';
    return [{ body: [String(modelAnswer.answer).trim(), safety, 'Community wiki:', ...sourceLines].filter(Boolean).join('\n\n') }];
  }

  async applyWikiPlan({
    plan,
    pages,
    senderPhone,
    profileName,
    messageSid,
    conversationKey,
    includeLink = true,
  }) {
    const actionType = `wiki_${plan.action}`;
    let page = pages.find((candidate) => candidate.slug === plan.target_slug) ?? null;
    let slug = plan.target_slug;
    let title = plan.title;
    let category = plan.category || 'Uncategorized';
    let content = null;
    let expectedVersion = null;

    if (plan.action === 'create') {
      title = String(title || '').trim();
      slug = slugifyWikiTitle(slug || title);
      content = createWikiContent(plan.append_text || plan.replacement_text);
      if (!title || !slug) {
        throw new WikiClarificationError('What should the new wiki page be called, and what information should it include?');
      }
      if (content === '[]') {
        throw new WikiClarificationError(`What information should the new *${title}* page include?`);
      }
    } else {
      if (!page && slug) page = await this.wikiStore.getPage(slug);
      if (!page) throw new WikiClarificationError('I couldn’t identify which wiki page to change. What is the page called?');
      slug = page.slug;
      title = String(plan.title || page.title).trim();
      category = plan.category || page.category || 'Uncategorized';
      expectedVersion = page.version;
      if (plan.action === 'delete') {
        content = null;
      } else if (plan.operation === 'replace') {
        try {
          content = replaceWikiText(page.content, plan.find_text, plan.replacement_text, plan.anchor_text);
        } catch (error) {
          throw new WikiClarificationError(error.message);
        }
      } else if (plan.operation === 'append') {
        if (!String(plan.append_text || '').trim()) {
          throw new WikiClarificationError(`What information should I add to *${title}*?`);
        }
        content = appendWikiParagraph(page.content, plan.append_text);
      } else {
        throw new WikiClarificationError('Tell me whether to add new information or which existing wording to correct.');
      }
    }

    const result = await this.wikiStore.applyChange({
      actionType,
      slug,
      title,
      category,
      content,
      expectedVersion,
      requesterWhatsapp: senderPhone,
      requesterName: profileName,
      twilioMessageSid: messageSid,
    });
    await this.wikiStore.setSession({
      conversationKey,
      context: { mode: 'changed', pageSlugs: [slug], lastEventId: result?.event_id },
    });
    const verb = plan.action === 'create' ? 'created' : plan.action === 'delete' ? 'deleted' : 'updated';
    const link = includeLink
      ? (plan.action === 'delete' ? `${this.publicBaseUrl}/wiki` : this.wikiUrl(slug))
      : '';
    return [{
      body: [
        `Done 🌿 I ${verb} *${title}*${plan.change_summary ? `: ${plan.change_summary}` : '.'}`,
        link,
        'If I misunderstood, reply “undo”.',
      ].filter(Boolean).join('\n\n'),
    }];
  }

  async handleWikiChange({ body, classified, wikiSession, senderPhone, profileName, messageSid, conversationKey }) {
    if (!this.wikiStore) return null;
    const context = wikiSession?.context ?? {};
    const contextualSlugs = Array.isArray(context.pageSlugs) ? context.pageSlugs : [];
    let pages = [];
    for (const slug of contextualSlugs.slice(0, 4)) {
      const page = await this.wikiStore.getPage(slug);
      if (page) pages.push(page);
    }
    if (pages.length === 0) pages = await this.wikiStore.searchPages(body, classified?.wiki_search_terms, 4);
    const combinedMessage = context.mode === 'awaiting_change_details' && context.originalMessage
      ? `${context.originalMessage}\nAdditional detail from the user: ${body}`
      : body;
    const plan = await this.ai?.planWikiChange?.({ message: combinedMessage, pages, context });
    const requestedSubject = String(extractListAdditionSubject(body) || plan?.subject_name).trim();
    const existingSubject = requestedSubject ? findExistingWikiSubject(pages, requestedSubject) : null;
    const recommendationFact = recommendationFactFromQuestion(context.lastQuestion, plan?.proposed_fact);
    if (existingSubject && recommendationFact && /\bto\s+(?:that|the|this)\s+list\b/i.test(body)) {
      const pageLabel = String(existingSubject.page.title || 'wiki page').toLocaleLowerCase();
      const question = `Actually ${requestedSubject} is already in my list of ${pageLabel}. ${recommendationFact.question}`;
      await this.wikiStore.setSession({
        conversationKey,
        context: {
          ...context,
          mode: 'confirm_existing_wiki_fact',
          pageSlugs: [existingSubject.page.slug],
          pendingFact: {
            slug: existingSubject.page.slug,
            title: existingSubject.page.title,
            subjectName: requestedSubject,
            anchorText: existingSubject.anchorText,
            factText: recommendationFact.fact,
          },
          originalMessage: combinedMessage,
        },
      });
      return [{ body: question }];
    }
    if (!plan || plan.needs_clarification || plan.action === 'none') {
      const question = String(plan?.clarification_question || 'Which wiki page should I change, and what should it say?').trim();
      await this.wikiStore.setSession({
        conversationKey,
        context: {
          ...context,
          mode: 'awaiting_change_details',
          originalMessage: combinedMessage,
          pageSlugs: pages.map((page) => page.slug),
        },
      });
      return [{ body: question }];
    }
    if (plan.action === 'delete' && context.mode !== 'confirm_delete') {
      await this.wikiStore.setSession({
        conversationKey,
        context: { mode: 'confirm_delete', plan, pageSlugs: pages.map((page) => page.slug) },
      });
      return [{ body: `Do you mean delete the entire *${plan.title || plan.target_slug}* wiki page? Reply “yes” to delete it.` }];
    }
    try {
      return await this.applyWikiPlan({
        plan,
        pages,
        senderPhone,
        profileName,
        messageSid,
        conversationKey,
        includeLink: !contextualSlugs.includes(plan.target_slug),
      });
    } catch (error) {
      if (!(error instanceof WikiClarificationError)) throw error;
      await this.wikiStore.setSession({
        conversationKey,
        context: {
          ...context,
          mode: 'awaiting_change_details',
          originalMessage: combinedMessage,
          pageSlugs: pages.map((page) => page.slug),
        },
      });
      return [{ body: error.message }];
    }
  }

  async confirmExistingWikiFact({ wikiSession, senderPhone, profileName, messageSid, conversationKey }) {
    const pending = wikiSession?.context?.pendingFact ?? {};
    const page = pending.slug ? await this.wikiStore.getPage(pending.slug) : null;
    if (!page) {
      await this.wikiStore.clearSession(conversationKey);
      return [{ body: 'I can’t find that wiki entry anymore. Tell me the page and place name and I’ll take another look.' }];
    }
    const content = appendWikiFactToAnchoredBlock(page.content, pending.anchorText, pending.factText);
    const result = await this.wikiStore.applyChange({
      actionType: 'wiki_update',
      slug: page.slug,
      title: page.title,
      category: page.category || 'Uncategorized',
      content,
      expectedVersion: page.version,
      requesterWhatsapp: senderPhone,
      requesterName: profileName,
      twilioMessageSid: messageSid,
    });
    await this.wikiStore.setSession({
      conversationKey,
      context: { mode: 'changed', pageSlugs: [page.slug], lastEventId: result?.event_id },
    });
    return [{
      body: `Done 🌿 I updated *${page.title}* to note that ${pending.subjectName} has ${pending.factText}.\n\nIf I misunderstood, reply “undo”.`,
    }];
  }

  async addContacts(cards, conversationKey, audit = null) {
    const results = [];
    for (const card of cards.slice(0, 10)) {
      results.push(await this.store.createOrGetContact(card, audit));
    }
    if (results.length === 0) {
      return [{ body: 'I received a contact file but couldn’t find a valid phone number in it. Try sending the number as text.' }];
    }

    const latest = results.at(-1);
    await this.store.setConversation({
      conversationKey,
      contactId: latest.contact.id,
      phase: 'awaiting_description',
      context: {},
    });

    if (results.length === 1) return [{ body: contactAddedReply(latest.contact, latest.created) }];
    const createdCount = results.filter((result) => result.created).length;
    return [{
      body: `🌿 Processed ${results.length} contacts: ${createdCount} added and ${results.length - createdCount} already listed. Send a description for ${latest.contact.title} if you want to enrich the last one.`,
    }];
  }

  async searchBroadCategory(category) {
    const contacts = await this.store.findContactsByCategory(category, 20);
    if (contacts.length === 0) {
      return [{
        body: `I couldn’t find any ${CATEGORY_LABELS[category] || category} contacts yet.\n\nBrowse the community directory: ${this.publicBaseUrl}/`,
      }];
    }

    return this.contactResultMessages(
      contacts,
      `🌿 I found ${contacts.length} ${CATEGORY_LABELS[category] || category} contact${contacts.length === 1 ? '' : 's'} in sanmateo.love:`,
    );
  }

  async saveSearchSession(conversationKey, context) {
    if (!this.store.setSearchSession) return;
    const hasRemaining = (context.remainingPrimaryIds?.length ?? 0) > 0
      || (context.secondaryIds?.length ?? 0) > 0;
    if (!hasRemaining) {
      await this.store.clearSearchSession?.(conversationKey);
      return;
    }
    await this.store.setSearchSession({ conversationKey, context, ttlHours: 24 });
  }

  moreResultsMessage({ serviceLabel, qualifierLabels, primaryCount, secondaryCount }) {
    if (primaryCount > 0) {
      return `I found ${primaryCount} more relevant match${primaryCount === 1 ? '' : 'es'} for ${serviceLabel}. Reply “more ${serviceLabel}” to see them.`;
    }
    if (secondaryCount > 0) {
      const qualifier = naturalList(qualifierLabels);
      const subject = secondaryCount === 1 ? 'its listing doesn’t' : 'their listings don’t';
      const limitation = qualifier ? `, but ${subject} mention ${qualifier}` : '';
      return `I found ${secondaryCount} more possible match${secondaryCount === 1 ? '' : 'es'} for ${serviceLabel}${limitation}. Reply “more ${serviceLabel}” to see them.`;
    }
    return '';
  }

  async searchSpecific(plan, conversationKey) {
    await this.store.clearSearchSession?.(conversationKey);
    const candidates = await this.store.findSearchCandidates(200);
    const ranked = rankContactsForSearchTiers(candidates, plan);
    const serviceLabel = String(plan.serviceLabel || 'provider').trim();
    if (ranked.primary.length === 0) {
      if (ranked.secondary.length > 0) {
        await this.saveSearchSession(conversationKey, {
          serviceLabel,
          qualifierLabels: ranked.qualifierLabels,
          preferenceLabels: ranked.preferenceLabels,
          remainingPrimaryIds: [],
          secondaryIds: ranked.secondary.map((result) => result.contact.id),
        });
        const qualifier = naturalList(ranked.qualifierLabels);
        const subject = ranked.secondary.length === 1 ? 'its listing doesn’t' : 'their listings don’t';
        const limitation = qualifier ? `, but ${subject} mention ${qualifier}` : '';
        return [{
          body: `I found ${ranked.secondary.length} possible match${ranked.secondary.length === 1 ? '' : 'es'} for ${serviceLabel}${limitation}. Reply “more ${serviceLabel}” to see them.`,
        }];
      }
      const categoryNote = plan.category
        ? ` I didn’t send the whole ${CATEGORY_LABELS[plan.category] || plan.category} category because it would include unrelated providers.`
        : '';
      return [{
        body: `I couldn’t find an exact match for ${serviceLabel} in the directory yet.${categoryNote}\n\nBrowse the community directory: ${this.publicBaseUrl}/`,
        responseContext: 'directory_no_match',
      }];
    }

    const selected = ranked.primary.slice(0, SPECIFIC_SEARCH_RESULT_LIMIT);
    const missingPreferences = ranked.preferenceLabels.filter((label) =>
      !selected.some((result) => result.matchedPreferenceLabels.includes(label)));
    const qualifier = naturalList(ranked.qualifierLabels);
    const qualifierNote = qualifier ? ` whose listing${selected.length === 1 ? '' : 's'} mention${selected.length === 1 ? 's' : ''} ${qualifier}` : '';
    const preference = naturalList(missingPreferences);
    const preferenceNote = preference
      ? ` The listing${selected.length === 1 ? '' : 's'} do${selected.length === 1 ? 'es' : ''} not specifically mention ${preference}.`
      : '';
    const messages = await this.contactResultMessages(
      selected.map((result) => result.contact),
      `🌿 I found ${selected.length} relevant match${selected.length === 1 ? '' : 'es'} for ${serviceLabel}${qualifierNote}.${preferenceNote}`,
    );

    const session = {
      serviceLabel,
      qualifierLabels: ranked.qualifierLabels,
      preferenceLabels: ranked.preferenceLabels,
      remainingPrimaryIds: ranked.primary.slice(SPECIFIC_SEARCH_RESULT_LIMIT).map((result) => result.contact.id),
      secondaryIds: ranked.secondary.map((result) => result.contact.id),
    };
    await this.saveSearchSession(conversationKey, session);
    const moreMessage = this.moreResultsMessage({
      serviceLabel,
      qualifierLabels: ranked.qualifierLabels,
      primaryCount: session.remainingPrimaryIds.length,
      secondaryCount: session.secondaryIds.length,
    });
    if (moreMessage) messages.push({ body: moreMessage });
    return messages;
  }

  async sendMoreSearchResults(searchSession, conversationKey) {
    const context = searchSession?.context ?? searchSession ?? {};
    const candidates = await this.store.findSearchCandidates(200);
    const byId = new Map(candidates.map((contact) => [contact.id, contact]));
    const primaryIds = (context.remainingPrimaryIds ?? []).filter((id) => byId.has(id));
    const secondaryIds = (context.secondaryIds ?? []).filter((id) => byId.has(id));
    const usePrimary = primaryIds.length > 0;
    const sourceIds = usePrimary ? primaryIds : secondaryIds;
    const selectedIds = sourceIds.slice(0, SPECIFIC_SEARCH_RESULT_LIMIT);
    if (selectedIds.length === 0) {
      await this.store.clearSearchSession?.(conversationKey);
      return [{ body: 'I don’t have any more matching contacts to send.' }];
    }

    const serviceLabel = String(context.serviceLabel || 'provider').trim();
    const qualifier = naturalList(context.qualifierLabels);
    const listingSubject = selectedIds.length === 1 ? 'Its listing doesn’t' : 'Their listings don’t';
    const intro = usePrimary
      ? `🌿 Here are ${selectedIds.length} more relevant match${selectedIds.length === 1 ? '' : 'es'} for ${serviceLabel}:`
      : `🌿 Here are ${selectedIds.length} more possible match${selectedIds.length === 1 ? '' : 'es'} for ${serviceLabel}. ${listingSubject} mention ${qualifier || 'the additional details you requested'}:`;
    const messages = await this.contactResultMessages(
      selectedIds.map((id) => byId.get(id)),
      intro,
    );

    const nextContext = {
      ...context,
      remainingPrimaryIds: usePrimary ? primaryIds.slice(SPECIFIC_SEARCH_RESULT_LIMIT) : primaryIds,
      secondaryIds: usePrimary ? secondaryIds : secondaryIds.slice(SPECIFIC_SEARCH_RESULT_LIMIT),
    };
    await this.saveSearchSession(conversationKey, nextContext);
    const moreMessage = this.moreResultsMessage({
      serviceLabel,
      qualifierLabels: context.qualifierLabels,
      primaryCount: nextContext.remainingPrimaryIds.length,
      secondaryCount: nextContext.secondaryIds.length,
    });
    if (moreMessage) messages.push({ body: moreMessage });
    return messages;
  }

  async planAndRunSearch(body, heuristicPlan = null, conversationKey = '') {
    const modelPlan = await this.ai?.planDirectorySearch?.(body);
    const modelIsUsable = modelPlan?.is_search
      && (modelPlan.broad_category || (modelPlan.service_terms?.length > 0));

    if (heuristicPlan?.broadCategory) {
      return this.searchBroadCategory(heuristicPlan.category);
    }

    const plan = modelIsUsable ? {
      broadCategory: Boolean(modelPlan.broad_category && explicitlyRequestsWholeCategory(body)),
      category: heuristicPlan?.category
        || (DIRECTORY_CATEGORIES.includes(modelPlan.category) ? modelPlan.category : ''),
      serviceLabel: String(heuristicPlan?.serviceLabel || modelPlan.service_label || 'provider').trim(),
      serviceTerms: Array.from(new Set([
        ...((heuristicPlan && !heuristicPlan.broadCategory)
          ? (heuristicPlan.serviceTerms ?? heuristicPlan.searchTerms ?? [])
          : (modelPlan.service_terms ?? [])),
      ])),
      qualifierGroups: heuristicPlan?.qualifierGroups?.length
        ? mergeTermGroups(heuristicPlan.qualifierGroups)
        : mergeTermGroups(modelPlan.qualifier_groups ?? []),
      preferenceGroups: heuristicPlan?.preferenceGroups?.length
        ? mergeTermGroups(heuristicPlan.preferenceGroups)
        : mergeTermGroups(modelPlan.preference_groups ?? []),
    } : heuristicPlan;

    // Known specific intents are a guardrail against an overly broad model plan.
    if (heuristicPlan && !heuristicPlan.broadCategory && plan) plan.broadCategory = false;
    if (!plan) return null;
    if (plan.broadCategory && plan.category) return this.searchBroadCategory(plan.category);
    if ((plan.serviceTerms ?? plan.searchTerms)?.length > 0) return this.searchSpecific(plan, conversationKey);
    return null;
  }

  async searchDirectoryThenWiki({ body, heuristicPlan, conversationKey, wikiSearchTerms = [] }) {
    const directoryMessages = await this.planAndRunSearch(body, heuristicPlan, conversationKey);
    if (!directoryMessages) return null;
    const hasExactDirectoryMatch = !directoryMessages.some(
      (message) => message?.responseContext === 'directory_no_match',
    );
    if (hasExactDirectoryMatch || !this.wikiStore || requiresDirectoryContactResult(body)) {
      return directoryMessages;
    }

    const wikiMessages = await this.answerWikiQuestion(
      body,
      wikiSearchTerms,
      conversationKey,
      { returnNullWhenMissing: true },
    );
    return wikiMessages ? this.asWikiResponse(wikiMessages) : directoryMessages;
  }

  async saveReview({ conversation, review, senderPhone, profileName, conversationKey, messageSid }) {
    await this.store.submitReview({
      contactId: conversation.contact_id,
      rating: review.rating,
      comment: review.comment,
      reviewerWhatsapp: senderPhone,
      reviewerName: profileName || null,
      twilioMessageSid: messageSid || null,
    });
    await this.store.clearConversation(conversationKey);
    return [{ body: `Thank you 🌿 Your ${review.rating}-star review is now in the directory.` }];
  }

  async saveDescription({ conversation, body, conversationKey, audit }) {
    const description = String(body ?? '').trim().slice(0, DESCRIPTION_MAX_LENGTH);
    const contact = await this.store.getContact(conversation.contact_id);
    if (!contact) {
      await this.store.clearConversation(conversationKey);
      return [{ body: 'That contact is no longer available. Forward the contact card again and I’ll take another look.' }];
    }

    const heuristic = inferCategoryHeuristically(`${contact.title} ${description}`);
    const modelResult = await this.ai?.inferCategory?.({ name: contact.title, description });
    const inference = modelResult && DIRECTORY_CATEGORIES.includes(modelResult.category)
      ? {
          category: modelResult.category,
          confidence: Number(modelResult.confidence) || 0,
          needsClarification: Boolean(modelResult.needs_clarification),
        }
      : heuristic;

    const confident = !inference.needsClarification && inference.confidence >= 0.7;
    const updated = await this.store.updateContact(contact.id, {
      subtitle: description,
      ...(confident ? { category: inference.category } : {}),
    }, audit);

    if (!confident) {
      await this.store.setConversation({
        conversationKey,
        contactId: contact.id,
        phase: 'awaiting_category',
        context: { suggestedCategory: inference.category },
      });
      return [{ body: categoryQuestion }];
    }

    await this.store.setConversation({
      conversationKey,
      contactId: contact.id,
      phase: 'review_optional',
      context: {},
      ttlHours: 24,
    });
    return [{
      body: `Saved 🌿 I placed ${updated.title} in ${CATEGORY_LABELS[updated.category] || updated.category}.\n\n${reviewInvitation(updated.title)}`,
    }];
  }

  async handle(params) {
    const adminReply = await this.handleAdminMessage(params);
    if (adminReply?.handled) return adminReply.messages;
    const messages = this.cleanMessages(await this.handleMessage(params));
    return [...(adminReply?.messages ?? []), ...messages];
  }

  // Group digest administrators can manage the digest by chatting with Machu.
  // Their other messages are handled normally, after any pending summary.
  async handleAdminMessage(params) {
    if (!this.digest) return null;
    const senderPhone = normalizePhone(params.WaId || stripWhatsappPrefix(params.From), '');
    if (!this.digest.isAdmin(senderPhone)) return null;
    try {
      return await this.digest.handleAdminMessage({ senderPhone, body: params.Body });
    } catch (error) {
      console.error('Group digest administrator message failed:', error);
      return null;
    }
  }

  async handleMessage(params) {
    const body = String(params.Body ?? '').trim();
    const senderPhone = normalizePhone(params.WaId || stripWhatsappPrefix(params.From), '');
    const profileName = String(params.ProfileName ?? '').trim().slice(0, 80);
    const conversationKey = createConversationKey(senderPhone || params.From, this.signingSecret);
    const conversation = await this.store.getConversation(conversationKey);
    const searchSession = await this.store.getSearchSession?.(conversationKey);
    const wikiSession = await this.wikiStore?.getSession?.(conversationKey);
    const messageSid = String(params.MessageSid ?? '').trim();
    const audit = this.auditFromMessage({ senderPhone, profileName, messageSid });

    const mediaCount = Math.min(Number(params.NumMedia || 0), 10);
    const vcardIndexes = Array.from({ length: mediaCount }, (_, index) => index).filter((index) =>
      /(?:vcard|x-vcard|directory)/i.test(String(params[`MediaContentType${index}`] ?? '')),
    );
    if (vcardIndexes.length > 0) {
      const cards = [];
      for (const index of vcardIndexes) {
        const vcard = await this.fetchMedia(params[`MediaUrl${index}`]);
        cards.push(...parseVcards(vcard));
      }
      return this.addContacts(cards, conversationKey, audit);
    }

    if (requestsUndo(body) && this.wikiStore) {
      try {
        const undone = await this.wikiStore.undoLastChange({
          requesterWhatsapp: senderPhone,
          requesterName: profileName,
          twilioMessageSid: messageSid,
        });
        await this.wikiStore.setSession({
          conversationKey,
          context: { mode: 'reading', pageSlugs: undone?.version >= 0 && undone?.slug ? [undone.slug] : [] },
        });
        const removedNewPage = Number(undone?.version) < 0;
        return this.asWikiResponse([{ body: removedNewPage
          ? `Undone 🌿 I removed the new *${undone?.title || 'wiki'}* page.`
          : `Undone 🌿 I restored *${undone?.title || 'the wiki page'}*.` }]);
      } catch (error) {
        return this.asWikiResponse([{ body: error?.code === 'P0002'
          ? 'I couldn’t find a recent wiki change from you to undo.'
          : 'I couldn’t undo that because the page has changed since your edit. Its history is still available on the website.' }]);
      }
    }

    if (wikiSession?.context?.mode === 'confirm_existing_wiki_fact') {
      if (affirmsFact(body)) {
        return this.asWikiResponse(await this.confirmExistingWikiFact({
          wikiSession,
          senderPhone,
          profileName,
          messageSid,
          conversationKey,
        }));
      }
      if (declinesFact(body)) {
        await this.wikiStore.setSession({
          conversationKey,
          context: {
            mode: 'reading',
            pageSlugs: wikiSession.context.pageSlugs ?? [],
            lastQuestion: wikiSession.context.lastQuestion,
            lastAnswer: wikiSession.context.lastAnswer,
          },
        });
        return this.asWikiResponse([{ body: 'Got it—I left the existing wiki entry unchanged.' }]);
      }
      return this.asWikiResponse([{ body: 'Just to confirm: should I add that detail to the existing entry? Reply “yes” or “no”.' }]);
    }

    if (wikiSession?.context?.mode === 'confirm_delete' && confirms(body)) {
      const pages = [];
      for (const slug of wikiSession.context.pageSlugs ?? []) {
        const page = await this.wikiStore.getPage(slug);
        if (page) pages.push(page);
      }
      return this.asWikiResponse(await this.applyWikiPlan({
        plan: wikiSession.context.plan,
        pages,
        senderPhone,
        profileName,
        messageSid,
        conversationKey,
      }));
    }

    if (searchSession && asksForMoreResults(body)) {
      return this.sendMoreSearchResults(searchSession, conversationKey);
    }

    const heuristicSearchPlan = planSearchHeuristically(body);
    if (heuristicSearchPlan?.broadCategory) {
      await this.store.clearSearchSession?.(conversationKey);
      return this.searchBroadCategory(heuristicSearchPlan.category);
    }
    if (looksLikeDirectorySearch(body)) {
      const searchResult = await this.searchDirectoryThenWiki({
        body,
        heuristicPlan: heuristicSearchPlan,
        conversationKey,
      });
      if (searchResult) return searchResult;
    }

    const explicitAdd = detectAddRequest(body, senderPhone, profileName);
    if (explicitAdd) return this.addContacts([explicitAdd], conversationKey, audit);

    const review = parseReview(body);
    if (review && conversation?.contact_id) {
      return this.saveReview({
        conversation,
        review,
        senderPhone,
        profileName,
        conversationKey,
        messageSid,
      });
    }

    if (asksForReview(body) && conversation?.contact_id) {
      await this.store.setConversation({
        conversationKey,
        contactId: conversation.contact_id,
        phase: 'awaiting_review',
        context: {},
        ttlHours: 24,
      });
      return [{ body: 'Sure 🌿 Send 1 to 5 stars and an optional note—for example: “5 stars — wonderfully helpful”.' }];
    }

    if (conversation?.phase === 'awaiting_review') {
      return [{ body: 'Send a rating from 1 to 5, optionally followed by a short note—for example: “5 stars — wonderfully helpful”.' }];
    }

    if (conversation?.phase === 'awaiting_description') {
      if (isSkip(body)) {
        await this.store.clearConversation(conversationKey);
        return [{ body: 'All good 🌿 The contact is already in the directory.' }];
      }
      if (body) return this.saveDescription({ conversation, body, conversationKey, audit });
    }

    if (conversation?.phase === 'awaiting_category') {
      if (isSkip(body)) {
        const contact = await this.store.updateContact(conversation.contact_id, { category: 'Service' }, audit);
        await this.store.setConversation({
          conversationKey,
          contactId: contact.id,
          phase: 'review_optional',
          context: {},
          ttlHours: 24,
        });
        return [{ body: `No problem—I left ${contact.title} in general services.\n\n${reviewInvitation(contact.title)}` }];
      }
      const category = parseCategoryReply(body);
      if (category) {
        const contact = await this.store.updateContact(conversation.contact_id, { category }, audit);
        await this.store.setConversation({
          conversationKey,
          contactId: contact.id,
          phase: 'review_optional',
          context: {},
          ttlHours: 24,
        });
        return [{ body: `Perfect 🌿 ${contact.title} is now in ${CATEGORY_LABELS[category] || category}.\n\n${reviewInvitation(contact.title)}` }];
      }
      return [{ body: categoryQuestion }];
    }

    if (isHelp(body) || !body) return [{ body: this.helpMessage() }];

    const classified = await this.ai?.classifyMessage?.(body);
    if (classified?.intent === 'search_directory') {
      const searchResult = await this.searchDirectoryThenWiki({
        body,
        heuristicPlan: heuristicSearchPlan,
        conversationKey,
        wikiSearchTerms: classified.wiki_search_terms,
      });
      if (searchResult) return searchResult;
      return [{
        body: 'Tell me the specific kind of provider or service you need. I won’t send a whole category unless you explicitly ask for it.',
      }];
    }
    if (classified?.intent === 'add_contact') {
      const phone = normalizePhone(classified.phone) || extractPhoneFromText(body)?.normalized;
      if (phone) {
        return this.addContacts([{
          phone,
          name: String(classified.name || profileName || phone).trim(),
        }], conversationKey, audit);
      }
    }
    if (classified?.intent === 'wiki_question') {
      if (requiresDirectoryContactResult(body)) {
        return [{ body: 'Are you looking for a person or service you can contact, or for general information from the community wiki?' }];
      }
      return this.asWikiResponse(await this.answerWikiQuestion(
        body,
        classified.wiki_search_terms,
        conversationKey,
      ));
    }
    if (classified?.intent === 'wiki_change' || requestsWikiChange(body)
      || wikiSession?.context?.mode === 'awaiting_change_details') {
      return this.asWikiResponse(await this.handleWikiChange({
        body,
        classified,
        wikiSession,
        senderPhone,
        profileName,
        messageSid,
        conversationKey,
      }));
    }
    if (classified?.intent === 'help') return [{ body: this.helpMessage() }];

    return [{ body: `I’m still learning 🌱\n\n${this.helpMessage()}` }];
  }
}
