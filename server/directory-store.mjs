import { createClient } from '@supabase/supabase-js';

const firstRow = (data) => Array.isArray(data) ? (data[0] ?? null) : (data ?? null);

const databaseError = (operation, error) => {
  const wrapped = new Error(error?.message || `Unable to ${operation}.`);
  wrapped.code = error?.code;
  return wrapped;
};

export class DirectoryStore {
  constructor({
    url = process.env.VITE_SUPABASE_URL,
    anonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    client,
  } = {}) {
    if (!client && (!url || !anonKey)) throw new Error('Supabase URL and anonymous key are required.');
    this.client = client || createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async findActiveContactByPhone(phone) {
    const { data, error } = await this.client.rpc('find_active_contact_by_phone', { p_phone: phone });
    if (error) throw databaseError('find a contact by phone', error);
    return firstRow(data);
  }

  async getContact(id) {
    const { data, error } = await this.client
      .from('contacts')
      .select('id,title,subtitle,category,phone_number,website_url,map_url,image_url')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error) throw databaseError('load the contact', error);
    return data;
  }

  async createOrGetContact({ name, phone }) {
    const existing = await this.findActiveContactByPhone(phone);
    if (existing) return { contact: existing, created: false };

    const { data, error } = await this.client
      .from('contacts')
      .insert({
        title: String(name || phone).trim().slice(0, 160),
        subtitle: '',
        category: 'Service',
        phone_number: phone,
      })
      .select('id,title,subtitle,category,phone_number,website_url,map_url,image_url')
      .single();

    if (!error) return { contact: data, created: true };
    if (error.code === '23505') {
      const racedContact = await this.findActiveContactByPhone(phone);
      if (racedContact) return { contact: racedContact, created: false };
    }
    throw databaseError('add the contact', error);
  }

  async updateContact(id, values) {
    const allowed = Object.fromEntries(
      Object.entries(values).filter(([key]) => ['title', 'subtitle', 'category'].includes(key)),
    );
    const { data, error } = await this.client
      .from('contacts')
      .update(allowed)
      .eq('id', id)
      .eq('is_deleted', false)
      .select('id,title,subtitle,category,phone_number,website_url,map_url,image_url')
      .single();
    if (error) throw databaseError('update the contact', error);
    return data;
  }

  async findContactsByCategory(category, limit = 20) {
    const { data, error } = await this.client
      .from('contacts')
      .select('id,title,subtitle,category,phone_number,website_url,map_url,image_url')
      .eq('is_deleted', false)
      .eq('category', category)
      .order('title', { ascending: true })
      .limit(limit);
    if (error) throw databaseError('search the directory', error);
    return data ?? [];
  }

  async findSearchCandidates(limit = 200) {
    const { data, error } = await this.client
      .from('contacts')
      .select('id,title,subtitle,category,phone_number,website_url,map_url,image_url')
      .eq('is_deleted', false)
      .order('title', { ascending: true })
      .limit(limit);
    if (error) throw databaseError('load directory search candidates', error);
    return data ?? [];
  }

  async getReviewSummaries(contactIds) {
    const uniqueIds = Array.from(new Set((contactIds ?? []).filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const { data, error } = await this.client.rpc('get_provider_review_summaries', {
      p_contact_ids: uniqueIds,
    });
    if (error) throw databaseError('load review summaries', error);

    return Object.fromEntries((data ?? []).map((summary) => [summary.contact_id, summary]));
  }

  async getConversation(conversationKey) {
    const { data, error } = await this.client.rpc('get_bot_conversation', {
      p_conversation_key: conversationKey,
    });
    if (error) throw databaseError('load the conversation', error);
    return firstRow(data);
  }

  async setConversation({ conversationKey, contactId, phase, context = {}, ttlHours = 72 }) {
    const { error } = await this.client.rpc('set_bot_conversation', {
      p_conversation_key: conversationKey,
      p_contact_id: contactId,
      p_phase: phase,
      p_context: context,
      p_ttl_hours: ttlHours,
    });
    if (error) throw databaseError('save the conversation', error);
  }

  async clearConversation(conversationKey) {
    const { error } = await this.client.rpc('clear_bot_conversation', {
      p_conversation_key: conversationKey,
    });
    if (error) throw databaseError('clear the conversation', error);
  }

  async submitReview({
    contactId,
    rating,
    comment,
    reviewerWhatsapp,
    reviewerName,
    twilioMessageSid = null,
  }) {
    const { data, error } = await this.client.rpc('submit_provider_review', {
      p_contact_id: contactId,
      p_rating: rating,
      p_reviewer_whatsapp: reviewerWhatsapp,
      p_comment: comment || null,
      p_reviewer_name: reviewerName || null,
      p_image_paths: [],
      p_verification_method: 'whatsapp_inbound',
      p_verification_action_id: null,
      p_twilio_verification_sid: twilioMessageSid,
    });
    if (error) throw databaseError('save the review', error);
    return firstRow(data);
  }
}
