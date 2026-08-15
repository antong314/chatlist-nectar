import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260804123000_whatsapp_step_up_verification.sql'),
  'utf8',
);
const inboundApprovalSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814133000_whatsapp_inbound_approval.sql'),
  'utf8',
);
const trustedSessionSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815003000_trusted_whatsapp_sessions_and_audit.sql'),
  'utf8',
);

describe('WhatsApp step-up verification SQL contract', () => {
  test('keeps pending actions and private numbers inaccessible to public roles', () => {
    expect(sql).toMatch(/community_verification_actions[\s\S]*ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.community_verification_actions FROM PUBLIC, anon, authenticated/i);
  });

  test('enforces one active review per provider and verified number', () => {
    expect(sql).toMatch(/UNIQUE INDEX provider_reviews_one_active_per_whatsapp_uidx[\s\S]*contact_id, reviewer_whatsapp/i);
    expect(sql).toMatch(/p_verification_method NOT IN \('whatsapp_otp', 'whatsapp_inbound'\)/i);
  });

  test('removes the anonymous review write path', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.submit_provider_review[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_provider_review[\s\S]*TO service_role/i);
  });

  test('completes verified actions atomically through service-only RPCs', () => {
    expect(sql).toMatch(/complete_verified_provider_deletion[\s\S]*status = 'completed', consumed_at = now\(\)/i);
    expect(sql).toMatch(/complete_verified_provider_review[\s\S]*status = 'completed', consumed_at = now\(\)/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_provider_deletion[\s\S]*TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_provider_review[\s\S]*TO service_role/i);
  });

  test('records inbound Machu approvals through the atomic completion functions', () => {
    expect(inboundApprovalSql).toMatch(/verification_method[\s\S]*whatsapp_inbound/i);
    expect(inboundApprovalSql).toMatch(/complete_verified_provider_deletion[\s\S]*verification_method = v_action\.verification_method/i);
    expect(inboundApprovalSql).toMatch(/complete_verified_provider_review[\s\S]*v_action\.verification_method/i);
    expect(inboundApprovalSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_provider_deletion[\s\S]*TO service_role/i);
  });

  test('keeps remembered identities private and audits provider changes by phone', () => {
    expect(trustedSessionSql).toMatch(/CREATE TABLE public\.community_verified_sessions/i);
    expect(trustedSessionSql).toMatch(/token_hash TEXT NOT NULL UNIQUE/i);
    expect(trustedSessionSql).toMatch(/REVOKE ALL ON TABLE public\.community_verified_sessions FROM PUBLIC, anon, authenticated/i);
    expect(trustedSessionSql).toMatch(/CREATE TABLE public\.provider_change_events[\s\S]*requester_whatsapp TEXT NOT NULL/i);
    expect(trustedSessionSql).toMatch(/before_snapshot JSONB[\s\S]*after_snapshot JSONB NOT NULL/i);
    expect(trustedSessionSql).toMatch(/REVOKE ALL ON TABLE public\.provider_change_events FROM PUBLIC, anon, authenticated/i);
    expect(trustedSessionSql).toMatch(/INSERT INTO public\.provider_change_events[\s\S]*v_action\.requester_whatsapp[\s\S]*v_action\.verification_method/i);
    expect(trustedSessionSql).toMatch(/trusted_session/i);
  });
});
