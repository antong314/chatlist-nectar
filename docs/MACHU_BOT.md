# Machu WhatsApp bot

Machu is the WhatsApp entry point for the San Mateo Love directory. The same
Node process serves the existing Vite build and the bot webhook at `POST /bot`.

## User flows

- Forward a WhatsApp contact card: Machu inserts it immediately with `Service`
  as the initial category, deduplicated by normalized phone number.
- Send a description: Machu saves it and classifies the listing. It asks one
  category question only when the description is ambiguous.
- Send `add this number +506...` or `add my number`: Machu inserts the minimal
  listing immediately, then offers the same optional enrichment.
- Send `5 stars — kind and reliable`: Machu saves an account-free review for
  the most recently submitted contact.
- Ask `send me all taxi contacts`: Machu returns the full category as native
  WhatsApp vCards.
- Ask for a specific service, such as `who does massages?` or `find me a chef`:
  Machu expands the intent into English/Spanish professional terms, ranks name
  and description matches across the directory, and does not return unrelated
  providers merely because they share a broad category.
- Every search result sends a visible summary containing the description,
  category, community rating, available website/map links, and the full
  directory listing, followed immediately by its native WhatsApp contact card.
  They are separate messages because WhatsApp ignores captions attached to
  free-form vCard media.
- Every bot response ends with a direct link to the full community directory.
  Text-only replies include it as a footer; responses ending in a vCard receive
  one short final text message so WhatsApp does not discard the link.

There is no publish or confirmation step. Once Machu has a valid name and phone
number, the contact is in the directory.

## Production environment

These are server-only DigitalOcean runtime variables:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_VERIFY_SERVICE_SID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

The server also consumes the existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` values. Optional configuration:

- `OPENAI_MODEL` (defaults to `gpt-5.6-luna`)
- `PUBLIC_BASE_URL` (defaults to `https://www.sanmateo.love`)
- `TWILIO_WEBHOOK_URL` (defaults to `https://www.sanmateo.love/bot`)
- `BOT_SIGNING_SECRET` (defaults to `TWILIO_AUTH_TOKEN`)
- `TWILIO_VALIDATE_SIGNATURE=false` for local-only webhook testing

Never prefix server secrets with `VITE_`; Vite exposes those values to browser
JavaScript during the frontend build.

## Endpoints

- `POST /bot` — Twilio inbound-message webhook; validates `X-Twilio-Signature`
- `POST /bot/verify/start` — starts a WhatsApp OTP bound to a provider create/edit, review, or deletion
- `POST /bot/verify/check` — verifies the OTP and completes actions without photos
- `POST /bot/verify/review/complete` — finishes a verified review after photo upload
- `POST /bot/verify/provider/complete` — atomically finishes a verified provider create/edit, including an optional logo
- `POST /bot/verify/provider/logo` — uploads an action-scoped logo after the provider OTP is approved
- `GET /bot` — lightweight bot status
- `GET /bot/contact/:id.vcf?token=...` — short-lived signed vCard media URL
- `GET /healthz` — service health check

## Database

Migration `20260803223000_machu_whatsapp_bot.sql` adds:

- a normalized active-phone unique index on `contacts`;
- a phone lookup RPC;
- private, expiring bot conversation state keyed by an HMAC rather than a
  submitter phone number.

The bot intentionally uses the same anonymous Supabase access model as the
site. Conversation rows have no direct anonymous policies; only narrow RPCs are
granted, and their keys are unguessable server-generated HMACs.

## Local verification

```sh
npm run test:all
npm run build
npm start
```

Twilio supports inbound media parameters such as `MediaUrl0` and
`MediaContentType0`, and supports `.vcf` files as WhatsApp contact media:

- <https://www.twilio.com/docs/messaging/guides/webhook-request>
- <https://www.twilio.com/docs/whatsapp/guidance-whatsapp-media-messages>
