import { createClient } from '@supabase/supabase-js';

const firstRow = (data) => Array.isArray(data) ? (data[0] ?? null) : (data ?? null);

const databaseError = (operation, error) => {
  const wrapped = new Error(error?.message || `Unable to ${operation}.`);
  wrapped.code = error?.code;
  return wrapped;
};

const MESSAGE_COLUMNS = 'group_jid,message_id,sender_hash,sender_name,sender_phone,sent_at,body,contacts,quoted_message_id,received_at';
const ITEM_COLUMNS = 'id,ref,run_id,kind,action,status,reason,confidence,title,detail,payload,evidence,contact_id,wiki_page_slug,wiki_event_id,created_at,decided_at';
const RUN_COLUMNS = 'id,run_date,trigger,mode,status,stats,error,summary_sent_at,started_at,finished_at,window_start,window_end';

// Server-side access to the private group digest tables. Every method uses the
// service role; none of these tables are reachable with the public anon key.
export class GroupDigestStore {
  constructor({
    url = process.env.VITE_SUPABASE_URL,
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    client,
  } = {}) {
    if (!client && (!url || !serviceKey)) throw new Error('Supabase service credentials are required for the group digest.');
    this.client = client || createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listGroups() {
    const { data, error } = await this.client
      .from('whatsapp_groups')
      .select('jid,ref,name,enabled,processed_through,first_seen_at')
      .order('ref', { ascending: true });
    if (error) throw databaseError('load WhatsApp groups', error);
    return data ?? [];
  }

  async setGroupsEnabled(refs, enabled) {
    let query = this.client
      .from('whatsapp_groups')
      .update({ enabled, enabled_at: enabled ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
    query = refs === 'all' ? query.not('jid', 'is', null) : query.in('ref', refs);
    const { data, error } = await query.select('ref,name,enabled');
    if (error) throw databaseError('update WhatsApp groups', error);
    return data ?? [];
  }

  async getMessages(groupJid, { after = null, through, limit = 3000 }) {
    let query = this.client
      .from('group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_jid', groupJid)
      .eq('source', 'live')
      .lte('received_at', through)
      .order('sent_at', { ascending: true })
      .limit(limit);
    if (after) query = query.gt('received_at', after);
    const { data, error } = await query;
    if (error) throw databaseError('load group messages', error);
    return data ?? [];
  }

  async getContextMessages(groupJid, { before, limit = 15 }) {
    const { data, error } = await this.client
      .from('group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_jid', groupJid)
      .lte('received_at', before)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw databaseError('load earlier group messages', error);
    return (data ?? []).reverse();
  }

  // Backfill: every stored message (live or imported) sent in [start, end).
  async getMessagesSentBetween(groupJid, { start, end, limit = 5000 }) {
    const { data, error } = await this.client
      .from('group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_jid', groupJid)
      .gte('sent_at', start)
      .lt('sent_at', end)
      .order('sent_at', { ascending: true })
      .limit(limit);
    if (error) throw databaseError('load group messages for the backfill window', error);
    return data ?? [];
  }

  async getMessagesSentBefore(groupJid, { before, limit = 15 }) {
    const { data, error } = await this.client
      .from('group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_jid', groupJid)
      .lt('sent_at', before)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw databaseError('load earlier group messages', error);
    return (data ?? []).reverse();
  }

  // Marks undecided items from earlier backfill runs of the same window as
  // superseded, so a rerun replaces them.
  async supersedeBackfillItems({ start, end, exceptRunId }) {
    const { data: runs, error: runError } = await this.client
      .from('group_digest_runs')
      .select('id')
      .eq('trigger', 'backfill')
      .eq('window_start', start)
      .eq('window_end', end)
      .neq('id', exceptRunId);
    if (runError) throw databaseError('find earlier backfill runs', runError);
    const runIds = (runs ?? []).map((run) => run.id);
    if (runIds.length === 0) return 0;
    const { data, error } = await this.client
      .from('group_digest_items')
      .update({ status: 'superseded', reason: 'Replaced by a rerun of the same dates', decided_at: new Date().toISOString() })
      .in('run_id', runIds)
      .in('status', ['proposed', 'needs_review'])
      .select('id');
    if (error) throw databaseError('supersede earlier backfill items', error);
    return (data ?? []).length;
  }

  async markGroupProcessed(groupJid, through) {
    const { error } = await this.client
      .from('whatsapp_groups')
      .update({ processed_through: through })
      .eq('jid', groupJid);
    if (error) throw databaseError('mark the group processed', error);
  }

  async purgeMessages(retentionDays) {
    const { data, error } = await this.client.rpc('purge_group_messages', { p_retention_days: retentionDays });
    if (error) throw databaseError('purge old group messages', error);
    return Number(data ?? 0);
  }

  async claimRun({ runDate, trigger, mode, windowStart = null, windowEnd = null }) {
    const { data, error } = await this.client.rpc('claim_group_digest_run', {
      p_run_date: runDate,
      p_trigger: trigger,
      p_mode: mode,
      p_window_start: windowStart,
      p_window_end: windowEnd,
    });
    if (error) throw databaseError('start the digest run', error);
    return data || null;
  }

  async finishRun(runId, { status, stats = {}, error: failure = null }) {
    const { error } = await this.client
      .from('group_digest_runs')
      .update({ status, stats, error: failure, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throw databaseError('finish the digest run', error);
  }

  async markSummarySent(runId) {
    const { error } = await this.client
      .from('group_digest_runs')
      .update({ summary_sent_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throw databaseError('mark the digest summary sent', error);
  }

  // Older undelivered summaries are stale once a newer one goes out.
  async markEarlierSummariesSent(startedAt) {
    const { error } = await this.client
      .from('group_digest_runs')
      .update({ summary_sent_at: new Date().toISOString() })
      .in('status', ['completed', 'failed'])
      .is('summary_sent_at', null)
      .lte('started_at', startedAt);
    if (error) throw databaseError('mark earlier digest summaries sent', error);
  }

  async getRun(runId) {
    const { data, error } = await this.client
      .from('group_digest_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle();
    if (error) throw databaseError('load the digest run', error);
    return data;
  }

  async getLatestRun({ status = null } = {}) {
    let query = this.client.from('group_digest_runs').select(RUN_COLUMNS)
      .order('started_at', { ascending: false }).limit(1);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw databaseError('load the latest digest run', error);
    return firstRow(data);
  }

  async getUndeliveredRun({ since }) {
    const { data, error } = await this.client
      .from('group_digest_runs')
      .select(RUN_COLUMNS)
      .in('status', ['completed', 'failed'])
      .is('summary_sent_at', null)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw databaseError('load the pending digest summary', error);
    return firstRow(data);
  }

  async createItem(item) {
    const { data, error } = await this.client
      .from('group_digest_items')
      .insert(item)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw databaseError('record the digest item', error);
    return data;
  }

  async updateItem(id, patch) {
    const { data, error } = await this.client
      .from('group_digest_items')
      .update(patch)
      .eq('id', id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw databaseError('update the digest item', error);
    return data;
  }

  async getItemByRef(ref) {
    const { data, error } = await this.client
      .from('group_digest_items').select(ITEM_COLUMNS).eq('ref', ref).maybeSingle();
    if (error) throw databaseError('load the digest item', error);
    return data;
  }

  async listItems(runId) {
    const { data, error } = await this.client
      .from('group_digest_items')
      .select(ITEM_COLUMNS)
      .eq('run_id', runId)
      .order('ref', { ascending: true });
    if (error) throw databaseError('load the digest items', error);
    return data ?? [];
  }

  async listPendingItems({ since }) {
    const { data, error } = await this.client
      .from('group_digest_items')
      .select(ITEM_COLUMNS)
      .in('status', ['proposed', 'needs_review'])
      .gte('created_at', since)
      .order('ref', { ascending: true })
      .limit(100);
    if (error) throw databaseError('load items waiting for review', error);
    return data ?? [];
  }

  // Items an administrator dismissed or reversed, so later runs don't
  // propose them again.
  async listAdminRejections() {
    const { data, error } = await this.client
      .from('group_digest_items')
      .select(ITEM_COLUMNS)
      .or('status.eq.undone,and(status.eq.skipped,decided_by.not.is.null)')
      .order('ref', { ascending: false })
      .limit(2000);
    if (error) throw databaseError('load dismissed digest items', error);
    return data ?? [];
  }

  async undoItem(itemId, requesterWhatsapp) {
    const { data, error } = await this.client.rpc('undo_group_digest_item', {
      p_item_id: itemId,
      p_requester_whatsapp: requesterWhatsapp,
    });
    if (error) throw databaseError('undo the digest item', error);
    return firstRow(data);
  }

  async getListenerStatus() {
    const { data, error } = await this.client
      .from('whatsapp_listener_status')
      .select('status,account_phone,last_seen_at,last_message_at,updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw databaseError('load the listener status', error);
    return data;
  }

  async touchAdmin(adminWhatsapp) {
    const { error } = await this.client
      .from('group_digest_admin_state')
      .upsert({ admin_whatsapp: adminWhatsapp, last_inbound_at: new Date().toISOString() });
    if (error) throw databaseError('record administrator activity', error);
  }

  async getAdminLastInbound(adminWhatsapp) {
    const { data, error } = await this.client
      .from('group_digest_admin_state')
      .select('last_inbound_at')
      .eq('admin_whatsapp', adminWhatsapp)
      .maybeSingle();
    if (error) throw databaseError('load administrator activity', error);
    return data?.last_inbound_at ? new Date(data.last_inbound_at) : null;
  }
}
