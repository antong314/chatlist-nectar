# Provider deletion deployment

Provider deletion uses a user-initiated WhatsApp approval through Machu in the
DigitalOcean Node service. The legacy public `provider-deletion` Edge Function
handles Undo only. All deletion and verification tables and mutation RPCs are
private to `service_role`.

## Deploy in this order

1. Apply pending migrations:

   ```sh
   supabase link --project-ref wooxzmomwwllkyxdcajk
   supabase db push
   ```

2. Deploy the Undo function:

   ```sh
   supabase functions deploy provider-deletion
   ```

3. Configure these server-only DigitalOcean variables:

   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM`

   Twilio receives and authenticates Machu's WhatsApp webhook; Twilio Verify is
   not used. Never expose any of these values through a `VITE_` variable.

4. Deploy the Node service/frontend. Test the WhatsApp deep link, approval from
   the matching number, rejection from a different number, expired actions,
   verified deletion, Undo, verified reviews with and without photos, and
   repeat reviews from the same WhatsApp number.

## Operational notes

- Approval actions expire after ten minutes and are single-use.
- The service durably rate-limits requests by canonical phone number and hashed
  IP.
- A valid approval requires both a signed action token and a matching WhatsApp
  sender on a webhook whose Twilio signature has been validated.
- Audit rows and requester WhatsApp values remain private.
- The old Edge Function `delete` action returns HTTP 410, preventing the former
  shared code from bypassing WhatsApp verification.
