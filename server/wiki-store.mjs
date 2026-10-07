import { createClient } from '@supabase/supabase-js';

const firstRow = (data) => Array.isArray(data) ? (data[0] ?? null) : (data ?? null);

const databaseError = (operation, error) => {
  const wrapped = new Error(error?.message || `Unable to ${operation}.`);
  wrapped.code = error?.code;
  return wrapped;
};

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STOP_WORDS = new Set([
  'about', 'all', 'and', 'are', 'can', 'como', 'con', 'cual', 'de', 'del', 'do',
  'does', 'el', 'en', 'for', 'from', 'how', 'i', 'in', 'is', 'la', 'las', 'los',
  'me', 'of', 'on', 'para', 'por', 'que', 'the', 'to', 'what', 'when', 'where',
  'which', 'who', 'with', 'you', 'your',
]);

const parseBlocks = (content) => {
  if (Array.isArray(content)) return structuredClone(content);
  try {
    const parsed = JSON.parse(String(content ?? ''));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.content)) return parsed.content;
  } catch {
    // Legacy plain text is converted to one paragraph below.
  }
  const text = String(content ?? '').trim();
  return text ? [{ type: 'paragraph', content: [textNode(text)] }] : [];
};

const textNode = (text) => ({ type: 'text', text, styles: {} });

// BlockNote throws while loading a text node without `styles`, which leaves the page blank.
const withTextStyles = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) withTextStyles(item);
  } else if (value && typeof value === 'object') {
    if (value.type === 'text' && (!value.styles || typeof value.styles !== 'object')) value.styles = {};
    for (const nested of Object.values(value)) withTextStyles(nested);
  }
  return value;
};

const serializeBlocks = (blocks) => JSON.stringify(withTextStyles(blocks));

const collectText = (value, output) => {
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.type === 'text' && typeof value.text === 'string') output.push(value.text);
  if (value.type === 'link' && typeof value.href === 'string') output.push(value.href);
  if (typeof value.url === 'string') output.push(value.url);
  for (const [key, nested] of Object.entries(value)) {
    if (!['text', 'href', 'url'].includes(key)) collectText(nested, output);
  }
};

export const extractWikiText = (content) => {
  const output = [];
  collectText(parseBlocks(content), output);
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const createWikiContent = (text) => serializeBlocks(
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: 'paragraph',
      content: [textNode(paragraph)],
    })),
);

export const appendWikiParagraph = (content, text) => {
  const blocks = parseBlocks(content);
  const additions = JSON.parse(createWikiContent(text));
  if (additions.length === 0) throw new Error('The wiki addition is empty.');
  blocks.push(...additions);
  return serializeBlocks(blocks);
};

const nodeContainsText = (value, text) => {
  const output = [];
  collectText(value, output);
  return normalizeText(output.join(' ')).includes(normalizeText(text));
};

export const appendWikiFactToAnchoredBlock = (content, anchorText, factText) => {
  const blocks = parseBlocks(content);
  const anchor = String(anchorText ?? '').trim();
  const fact = String(factText ?? '').trim();
  if (!anchor || !fact) throw new Error('The existing wiki entry or new detail is missing.');
  const block = blocks.find((candidate) => nodeContainsText(candidate, anchor));
  if (!block) throw new Error(`I could not find the existing “${anchor}” entry.`);
  if (nodeContainsText(block, fact)) return serializeBlocks(blocks);

  const inlineContent = Array.isArray(block.content) ? block.content : [];
  const trailingText = [...inlineContent].reverse().find((item) => item?.type === 'text');
  if (trailingText) {
    const existing = String(trailingText.text ?? '').trimEnd();
    const separator = !existing || /[.;:!?—-]$/.test(existing) ? ' ' : '; ';
    trailingText.text = `${existing}${separator}${fact}`;
  } else {
    inlineContent.push(textNode(` - ${fact}`));
    block.content = inlineContent;
  }
  return serializeBlocks(blocks);
};

const replaceInNode = (value, findText, replacementText) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (replaceInNode(item, findText, replacementText)) return true;
    }
    return false;
  }
  if (!value || typeof value !== 'object') return false;
  if (value.type === 'text' && typeof value.text === 'string') {
    const exactIndex = value.text.indexOf(findText);
    const foldedIndex = normalizeText(value.text).indexOf(normalizeText(findText));
    if (exactIndex >= 0) {
      value.text = `${value.text.slice(0, exactIndex)}${replacementText}${value.text.slice(exactIndex + findText.length)}`;
      return true;
    }
    if (foldedIndex >= 0 && normalizeText(value.text) === normalizeText(findText)) {
      value.text = replacementText;
      return true;
    }
  }
  for (const nested of Object.values(value)) {
    if (replaceInNode(nested, findText, replacementText)) return true;
  }
  return false;
};

export const replaceWikiText = (content, findText, replacementText, anchorText = '') => {
  const blocks = parseBlocks(content);
  const find = String(findText ?? '').trim();
  if (!find) throw new Error('I could not identify the existing wording to change.');
  const anchor = String(anchorText ?? '').trim();
  const target = anchor ? blocks.find((block) => nodeContainsText(block, anchor)) : blocks;
  if (!target) throw new Error(`I could not find the existing “${anchor}” entry.`);
  if (!replaceInNode(target, find, String(replacementText ?? '').trim())) {
    throw new Error('The page changed before I could find that exact information. Please tell me which wording to replace.');
  }
  return serializeBlocks(blocks);
};

export const slugifyWikiTitle = (title) => normalizeText(title).replace(/\s+/g, '-').slice(0, 120);

const searchTokens = (values) => Array.from(new Set(values
  .flatMap((value) => normalizeText(value).split(' '))
  .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))));

export class WikiStore {
  constructor({
    url = process.env.VITE_SUPABASE_URL,
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    client,
  } = {}) {
    if (!client && (!url || !serviceKey)) throw new Error('Supabase service credentials are required for the wiki bot.');
    this.client = client || createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listPages(limit = 100) {
    const { data, error } = await this.client
      .from('wiki_pages')
      .select('id,slug,title,content,excerpt,category,version,updated_at,is_published')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw databaseError('load the community wiki', error);
    return (data ?? []).map((page) => ({ ...page, plainText: extractWikiText(page.content) }));
  }

  async getPage(slug) {
    const { data, error } = await this.client
      .from('wiki_pages')
      .select('id,slug,title,content,excerpt,category,version,updated_at,is_published')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw databaseError('load the wiki page', error);
    return data ? { ...data, plainText: extractWikiText(data.content) } : null;
  }

  async searchPages(query, extraTerms = [], limit = 4) {
    const pages = await this.listPages();
    const normalizedQuery = normalizeText(query);
    const terms = searchTokens([query, ...(extraTerms ?? [])]);
    return pages.map((page) => {
      const title = normalizeText(page.title);
      const content = normalizeText(page.plainText);
      let score = 0;
      if (normalizedQuery && title.includes(normalizedQuery)) score += 40;
      if (normalizedQuery.length >= 4 && content.includes(normalizedQuery)) score += 18;
      for (const term of terms) {
        if (title.split(' ').includes(term)) score += 12;
        else if (title.includes(term)) score += 8;
        if (content.split(' ').includes(term)) score += 4;
        else if (content.includes(term)) score += 2;
      }
      return { ...page, score };
    })
      .filter((page) => page.score > 0)
      .sort((left, right) => right.score - left.score || String(left.title).localeCompare(String(right.title)))
      .slice(0, limit);
  }

  async getSession(conversationKey) {
    const { data, error } = await this.client.rpc('get_bot_wiki_session', {
      p_conversation_key: conversationKey,
    });
    if (error) throw databaseError('load wiki conversation context', error);
    return firstRow(data);
  }

  async setSession({ conversationKey, context, ttlHours = 24 }) {
    const { error } = await this.client.rpc('set_bot_wiki_session', {
      p_conversation_key: conversationKey,
      p_context: context,
      p_ttl_hours: ttlHours,
    });
    if (error) throw databaseError('remember wiki conversation context', error);
  }

  async clearSession(conversationKey) {
    const { error } = await this.client.rpc('clear_bot_wiki_session', {
      p_conversation_key: conversationKey,
    });
    if (error) throw databaseError('clear wiki conversation context', error);
  }

  async applyChange({
    actionType,
    slug,
    title,
    category,
    content,
    expectedVersion,
    requesterWhatsapp,
    requesterName,
    twilioMessageSid,
    verificationMethod = 'whatsapp_inbound',
    verificationActionId = null,
  }) {
    const { data, error } = await this.client.rpc('apply_audited_wiki_write', {
      p_action_type: actionType,
      p_slug: slug,
      p_title: title,
      p_category: category,
      p_content: content,
      p_expected_version: expectedVersion,
      p_requester_whatsapp: requesterWhatsapp,
      p_requester_name: requesterName || null,
      p_verification_method: verificationMethod,
      p_verification_action_id: verificationActionId,
      p_twilio_message_sid: twilioMessageSid || null,
    });
    if (error) throw databaseError('save the wiki change', error);
    return firstRow(data);
  }

  async undoLastChange({ requesterWhatsapp, requesterName, twilioMessageSid }) {
    const { data, error } = await this.client.rpc('undo_last_inbound_wiki_change', {
      p_requester_whatsapp: requesterWhatsapp,
      p_requester_name: requesterName || null,
      p_twilio_message_sid: twilioMessageSid,
    });
    if (error) throw databaseError('undo the wiki change', error);
    return firstRow(data);
  }
}
