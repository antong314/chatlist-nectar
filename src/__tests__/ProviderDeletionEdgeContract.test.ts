import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edgeFunction = readFileSync(
  resolve(process.cwd(), 'supabase/functions/provider-deletion/index.ts'),
  'utf8',
);
const functionConfig = readFileSync(
  resolve(process.cwd(), 'supabase/config.toml'),
  'utf8',
);

describe('provider deletion Edge Function security contract', () => {
  test('is account-free without exposing service credentials to the browser', () => {
    expect(functionConfig).toMatch(/\[functions\.provider-deletion\][\s\S]*verify_jwt\s*=\s*false/i);
    expect(edgeFunction).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    expect(edgeFunction).toMatch(/createClient\(supabaseUrl, serviceRoleKey/);
  });

  test('cannot bypass WhatsApp verification through the legacy delete action', () => {
    expect(edgeFunction).not.toMatch(/COMMUNITY_DELETE_CODE/);
    expect(edgeFunction).toMatch(/action === 'delete'[\s\S]*return json\(410/);
    expect(edgeFunction).not.toMatch(/perform_provider_soft_delete/);
    expect(edgeFunction).toMatch(/requires an individual WhatsApp confirmation code/);
  });

  test('uses strict request, byte-size, cache, and origin controls', () => {
    expect(edgeFunction).toMatch(/request\.method !== 'POST'/);
    expect(edgeFunction).toMatch(/Content-Type must be application\/json/);
    expect(edgeFunction).toMatch(/textEncoder\.encode\(requestText\)\.byteLength > 16_384/);
    expect(edgeFunction).toContain("'Cache-Control': 'no-store'");
    expect(edgeFunction).toContain("'Vary': 'Origin'");
    expect(edgeFunction).not.toContain("'Access-Control-Allow-Origin': '*'");
    expect(edgeFunction).toContain('https://www.sanmateo.love');
    expect(edgeFunction).toContain('http://localhost:8080');
  });

  test('accepts only an existing random undo token and sends only its SHA-256 hash to SQL', () => {
    expect(edgeFunction).toMatch(/crypto\.subtle\.digest\('SHA-256'/);
    expect(edgeFunction).toMatch(/p_undo_token_hash: await sha256Hex\(undoToken\)/);
    expect(edgeFunction).not.toMatch(/undoTokenHash/);
    expect(edgeFunction).not.toMatch(/console\.(log|error|warn)/);
  });
});
