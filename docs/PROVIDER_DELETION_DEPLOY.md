# Provider deletion deployment

Provider deletion is intentionally split between private database RPCs and the
public `provider-deletion` Edge Function. The RPCs execute only for
`service_role`; browsers never receive that key.

## Deploy in this order

1. Link the CLI to the production project if needed:

   ```sh
   supabase link --project-ref wooxzmomwwllkyxdcajk
   ```

2. Apply pending database migrations:

   ```sh
   supabase db push
   ```

3. Generate a random community code with at least 12 characters. Do not reuse a
   personal password. Store it only as a Supabase Edge Function secret:

   ```sh
   supabase secrets set COMMUNITY_DELETE_CODE=<random-12+-character-code>
   ```

4. Deploy the function. JWT verification is disabled in `supabase/config.toml`
   because the community directory has no login; the community code protects
   deletion and undo uses a separate high-entropy single-use token.

   ```sh
   supabase functions deploy provider-deletion
   ```

5. Deploy the frontend only after the migration and function are ready. Verify
   public add/edit still work, deletion returns an undo receipt, undo restores
   the provider before expiry, and anonymous direct updates to `is_deleted`
   fail.

## Code rotation

Rotate the code at any time without a database migration:

```sh
supabase secrets set COMMUNITY_DELETE_CODE=<new-random-12+-character-code>
```

Rotation affects new deletion requests immediately. Existing short-lived undo
tokens remain valid until their database expiry. Distribute the new code only
through the private community channel.

## Operational caveats

- Allowed browser origins are `sanmateo.love`, `www.sanmateo.love`, and the
  local port `8080` development origins. Update the Edge Function allowlist
  before adding another production hostname.
- Invalid community-code attempts receive a fixed delay, but v1 has no durable
  distributed rate limiter. Monitor function traffic and add gateway-level
  throttling if abuse appears.
- Audit rows and private requester WhatsApp values are visible only through
  service-role administration. The foreign key deliberately blocks hard contact
  deletion so audit history is preserved.
