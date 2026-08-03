import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260802233000_provider_deletion_protection.sql'),
  'utf8',
);
const canonical = readFileSync(
  resolve(process.cwd(), 'database/provider_deletion_setup.sql'),
  'utf8',
);

const writableContactColumns = [
  'title',
  'category',
  'subtitle',
  'phone_number',
  'website_url',
  'image_url',
  'map_url',
];

describe.each([
  ['migration', migration],
  ['canonical setup', canonical],
])('provider deletion SQL security contract: %s', (_label, sql) => {
  test('replaces legacy policies and removes public broad/delete access', () => {
    expect(sql).toMatch(/pg_policies[\s\S]*tablename\s*=\s*'contacts'/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.contacts FROM PUBLIC, anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+DELETE[\s\S]*ON\s+(TABLE\s+)?public\.contacts/i);
    expect(sql).not.toMatch(/FOR\s+DELETE[\s\S]*ON\s+public\.contacts/i);
  });

  test('allows only active reads/inserts/edits and grants every current payload field', () => {
    expect(sql).toMatch(/FOR SELECT[\s\S]*USING\s*\(is_deleted\s*=\s*FALSE\)/i);
    expect(sql).toMatch(/FOR INSERT[\s\S]*WITH CHECK\s*\(is_deleted\s*=\s*FALSE\)/i);
    expect(sql).toMatch(/FOR UPDATE[\s\S]*USING\s*\(is_deleted\s*=\s*FALSE\)[\s\S]*WITH CHECK\s*\(is_deleted\s*=\s*FALSE\)/i);

    const insertColumns = sql.match(/GRANT INSERT\s*\(([\s\S]*?)\)\s*ON public\.contacts/i)?.[1] ?? '';
    const updateColumns = sql.match(/GRANT UPDATE\s*\(([\s\S]*?)\)\s*ON public\.contacts/i)?.[1] ?? '';
    writableContactColumns.forEach((column) => {
      expect(insertColumns).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
      expect(updateColumns).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    });
    ['id', 'is_deleted', 'created_at', 'updated_at'].forEach((protectedColumn) => {
      expect(insertColumns).not.toMatch(new RegExp(`\\b${protectedColumn}\\b`, 'i'));
      expect(updateColumns).not.toMatch(new RegExp(`\\b${protectedColumn}\\b`, 'i'));
    });
  });

  test('keeps deletion audit data private, durable, unique, and single-use', () => {
    expect(sql).toMatch(/provider_deletion_events[\s\S]*ON DELETE RESTRICT/i);
    expect(sql).toMatch(/undo_token_hash TEXT NOT NULL UNIQUE/i);
    expect(sql).toMatch(/ALTER TABLE public\.provider_deletion_events ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.provider_deletion_events FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/undone_at IS NOT NULL[\s\S]*undo_token_hash <>[\s\S]*now\(\) >= .*undo_expires_at/i);
  });

  test('restricts atomic deletion and undo RPCs to service_role', () => {
    expect(sql).toMatch(/contacts\.is_deleted = FALSE[\s\S]*FOR UPDATE/i);
    expect(sql).toMatch(/INTERVAL '2 minutes'/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.perform_provider_soft_delete[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.undo_provider_soft_delete[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.perform_provider_soft_delete[\s\S]*TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.undo_provider_soft_delete[\s\S]*TO service_role/i);
  });
});
