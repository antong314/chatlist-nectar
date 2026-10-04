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

describe('Machu group reference numbers', () => {
  const compactSql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261003230000_compact_whatsapp_group_refs.sql'),
    'utf8',
  );

  test('refreshing a known group does not consume reference numbers', () => {
    const upsert = compactSql.match(/FUNCTION public\.upsert_whatsapp_group[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(upsert).toMatch(/UPDATE public\.whatsapp_groups[\s\S]*IF FOUND THEN[\s\S]*INSERT INTO public\.whatsapp_groups/);
    expect(upsert).not.toMatch(/ON CONFLICT/);
    expect(compactSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.upsert_whatsapp_group\(TEXT, TEXT\) TO machu_listener, service_role/);
    expect(compactSql).toMatch(/REVOKE ALL ON FUNCTION public\.upsert_whatsapp_group\(TEXT, TEXT\) FROM PUBLIC, anon, authenticated/);
  });
});

describe('Machu group backfill', () => {
  const backfillSql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261004180000_group_digest_backfill.sql'),
    'utf8',
  );

  test('imports only into enabled groups through a listener-callable function', () => {
    expect(backfillSql).toMatch(/JOIN public\.whatsapp_groups AS groups ON groups\.jid = incoming\.group_jid AND groups\.enabled/);
    expect(backfillSql).toMatch(/ON CONFLICT \(group_jid, message_id\) DO NOTHING/);
    expect(backfillSql).toMatch(/REVOKE ALL ON FUNCTION public\.import_group_messages\(JSONB\) FROM PUBLIC, anon, authenticated/);
    expect(backfillSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.import_group_messages\(JSONB\) TO machu_listener, service_role/);
  });

  test('tags imported history so the daily digest can exclude it', () => {
    expect(backfillSql).toMatch(/source TEXT NOT NULL DEFAULT 'live'/);
    expect(backfillSql).toMatch(/quoted_message_id, 'backfill'/);
  });
});

describe('Machu group sender numbers', () => {
  const phoneSql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261004200000_group_message_sender_phone.sql'),
    'utf8',
  );

  test('stores validated sender numbers only through private functions', () => {
    expect(phoneSql).toMatch(/sender_phone TEXT\s+CHECK \(sender_phone IS NULL OR sender_phone ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'\)/);
    expect(phoneSql).toMatch(/REVOKE ALL ON FUNCTION public\.record_group_message\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(phoneSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_group_message\([^)]*\) TO machu_listener, service_role/);
    expect(phoneSql).not.toMatch(/GRANT [^;]* ON TABLE/);
  });
});
