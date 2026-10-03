import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261003150000_machu_group_digest.sql'),
  'utf8',
);

const privateTables = [
  'whatsapp_groups',
  'group_messages',
  'whatsapp_listener_status',
  'group_digest_runs',
  'group_digest_items',
  'group_digest_admin_state',
];

const listenerFunctions = [
  'upsert_whatsapp_group',
  'record_group_message',
  'edit_group_message',
  'revoke_group_message',
  'record_listener_status',
];

describe('Machu group digest SQL contract', () => {
  test.each(privateTables)('keeps %s private to the server', (table) => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`));
    expect(sql).not.toMatch(new RegExp(`GRANT [^;]* ON TABLE public\\.${table} TO [^;]*(anon|authenticated|machu_listener)`));
  });

  test('gives the listener role only its narrow write functions', () => {
    for (const fn of listenerFunctions) {
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO machu_listener, service_role`));
    }
    const listenerGrants = sql.match(/GRANT [^;]*machu_listener[^;]*;/g) ?? [];
    expect(listenerGrants).toHaveLength(listenerFunctions.length + 2);
    expect(sql).toMatch(/GRANT USAGE, CREATE ON SCHEMA whatsmeow TO machu_listener/);
    expect(sql).toMatch(/REVOKE ALL ON SCHEMA whatsmeow FROM PUBLIC/);
  });

  test('never embeds a role password', () => {
    expect(sql).toMatch(/CREATE ROLE machu_listener LOGIN NOINHERIT;/);
    expect(sql).not.toMatch(/PASSWORD\s+'/i);
    expect(sql).not.toMatch(/ENCRYPTED\s+PASSWORD/i);
  });

  test('revokes public execution of every new function', () => {
    const created = Array.from(sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(/g), (match) => match[1]);
    for (const fn of new Set(created)) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  test('records only enabled groups and attributes digest writes distinctly', () => {
    expect(sql).toMatch(/IF NOT v_enabled THEN\s+RETURN FALSE;/);
    expect(sql).toMatch(/'whatsapp_otp', 'whatsapp_inbound', 'trusted_session', 'group_digest'/);
    expect(sql).toMatch(/p_verification_method NOT IN \('whatsapp_inbound', 'trusted_session', 'group_digest'\)/);
    expect(sql).toMatch(/NOT IN \('whatsapp_inbound', 'group_digest'\)/);
  });
});
