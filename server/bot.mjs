import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CATEGORY_LABELS,
  DIRECTORY_CATEGORIES,
  detectAddRequest,
  detectSearchCategory,
  extractPhoneFromText,
  inferCategoryHeuristically,
  normalizePhone,
  parseCategoryReply,
  parseReview,
  parseVcards,
} from './domain.mjs';

const DESCRIPTION_MAX_LENGTH = 1000;
const HELP_MESSAGE = [
  '🌿 I’m Machu, the San Mateo community directory helper.',
  '',
  '• Forward me a contact card and I’ll add it right away.',
  '• Or say “add this number +506…” / “add my number”.',
  '• Ask “send me all taxi contacts” to search the directory.',
  '• After adding someone, you can send “5 stars — great service” to leave a review.',
].join('\n');

const stripWhatsappPrefix = (value) => String(value ?? '').replace(/^whatsapp:/i, '');

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
const isHelp = (value) => /^(?:help|menu|start|hola|hello|hi|hey|ayuda|what can you do)[?!. ]*$/i.test(String(value ?? '').trim());

export class MachuBot {
  constructor({
    store,
    ai,
    fetchMedia,
    publicBaseUrl = 'https://www.sanmateo.love',
    signingSecret,
  }) {
    this.store = store;
    this.ai = ai;
    this.fetchMedia = fetchMedia;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.signingSecret = signingSecret;
  }

  mediaUrl(contactId) {
    const token = signContactMedia(contactId, this.signingSecret);
    return `${this.publicBaseUrl}/bot/contact/${encodeURIComponent(contactId)}.vcf?token=${token}`;
  }

  async addContacts(cards, conversationKey) {
    const results = [];
    for (const card of cards.slice(0, 10)) {
      results.push(await this.store.createOrGetContact(card));
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

  async search(category) {
    const contacts = await this.store.findContactsByCategory(category, 20);
    if (contacts.length === 0) {
      return [{ body: `I couldn’t find any ${CATEGORY_LABELS[category] || category} contacts yet.` }];
    }

    const messages = [{
      body: `🌿 I found ${contacts.length} ${CATEGORY_LABELS[category] || category} contact${contacts.length === 1 ? '' : 's'} in sanmateo.love:`,
    }];
    for (const contact of contacts) messages.push({ mediaUrl: this.mediaUrl(contact.id) });
    return messages;
  }

  async saveReview({ conversation, review, senderPhone, profileName, conversationKey }) {
    await this.store.submitReview({
      contactId: conversation.contact_id,
      rating: review.rating,
      comment: review.comment,
      reviewerWhatsapp: senderPhone,
      reviewerName: profileName || null,
    });
    await this.store.clearConversation(conversationKey);
    return [{ body: `Thank you 🌿 Your ${review.rating}-star review is now in the directory.` }];
  }

  async saveDescription({ conversation, body, conversationKey }) {
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
    });

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
    const body = String(params.Body ?? '').trim();
    const senderPhone = normalizePhone(params.WaId || stripWhatsappPrefix(params.From), '');
    const profileName = String(params.ProfileName ?? '').trim().slice(0, 80);
    const conversationKey = createConversationKey(senderPhone || params.From, this.signingSecret);
    const conversation = await this.store.getConversation(conversationKey);

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
      return this.addContacts(cards, conversationKey);
    }

    const explicitSearch = detectSearchCategory(body);
    if (explicitSearch) return this.search(explicitSearch);

    const explicitAdd = detectAddRequest(body, senderPhone, profileName);
    if (explicitAdd) return this.addContacts([explicitAdd], conversationKey);

    const review = parseReview(body);
    if (review && conversation?.contact_id) {
      return this.saveReview({ conversation, review, senderPhone, profileName, conversationKey });
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
      if (body) return this.saveDescription({ conversation, body, conversationKey });
    }

    if (conversation?.phase === 'awaiting_category') {
      if (isSkip(body)) {
        const contact = await this.store.updateContact(conversation.contact_id, { category: 'Service' });
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
        const contact = await this.store.updateContact(conversation.contact_id, { category });
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

    if (isHelp(body) || !body) return [{ body: HELP_MESSAGE }];

    const classified = await this.ai?.classifyMessage?.(body);
    if (classified?.intent === 'search_directory' && DIRECTORY_CATEGORIES.includes(classified.category)) {
      return this.search(classified.category);
    }
    if (classified?.intent === 'add_contact') {
      const phone = normalizePhone(classified.phone) || extractPhoneFromText(body)?.normalized;
      if (phone) {
        return this.addContacts([{
          phone,
          name: String(classified.name || profileName || phone).trim(),
        }], conversationKey);
      }
    }
    if (classified?.intent === 'help') return [{ body: HELP_MESSAGE }];

    return [{ body: `I’m still learning 🌱\n\n${HELP_MESSAGE}` }];
  }
}
