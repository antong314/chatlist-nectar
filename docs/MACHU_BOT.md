# Machu WhatsApp bot

Machu is the WhatsApp entry point for both the San Mateo Love directory and
community wiki. The same Node process serves the existing Vite build and the
bot webhook at `POST /bot`.

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
- Ask a general local question: Machu searches published wiki pages, asks the
  language model to answer only from those pages, and includes page links and
  update dates. If the supplied pages do not support an answer, Machu says so.
- Correct or add local knowledge in ordinary language: Machu identifies one
  small page-level change, asks one short clarification when necessary, and
  publishes immediately. Whole-page deletion receives a simple confirmation;
  other changes do not require a proposal or moderator approval.
- Reply `undo` after a Machu wiki contribution to reverse the contributor's
  most recent change, provided nobody has edited that page afterward.
- Submit a provider change, review, or deletion on the website: the first action
  button creates the secure challenge and immediately opens WhatsApp with a
  signed approval message addressed to Machu. The waiting view keeps an explicit
  retry link only in case the automatic launch is blocked. After the user
  sends it, Machu records the authenticated webhook sender as the private actor,
  approves the pending action, and
  introduces its other capabilities in the reply.
- After that first approval, the browser receives a secure, HttpOnly trusted-
  device session lasting 30 days. Later website actions skip WhatsApp while the
  server still binds each action to the previously verified phone number.
- Creating, editing, restoring, or deleting a wiki page on the website uses
  the same WhatsApp/trusted-device identity flow. Anonymous database writes are
  disabled, so every new wiki mutation has an actor and before/after snapshot.
- Every search result sends a visible summary containing the description,
  category, community rating, available website/map links, and the full
  directory listing, followed immediately by its native WhatsApp contact card.
  They are separate messages because WhatsApp ignores captions attached to
  free-form vCard media.
- Links are conversational rather than automatic: wiki answers cite the page
  they used, provider results link to the matching listing, and help or genuine
  no-result replies link to the relevant directory/wiki landing page. Follow-up
  questions, confirmations, verification replies, errors, and vCard result sets
  do not receive a generic footer, avoiding repetitive WhatsApp link previews.

There is no publish or confirmation step. Once Machu has a valid name and phone
number, the contact is in the directory. Wiki additions and corrections are
also published immediately; only deletion of an entire page is confirmed.

## Group digest

Machu also learns from the community's WhatsApp groups. A separate read-only
listener ([listener/README.md](../listener/README.md)) is a member of those
groups through a dedicated WhatsApp number and records messages from groups an
administrator has enabled. Once a day the server reads the new messages and
publishes useful provider recommendations and local knowledge.

1. **Record.** The listener stores text, captions, shared contact cards, and
   reply links in `group_messages`. Senders are stored as an HMAC and their
   display name. Raw messages are deleted after 14 days, and deleting a message
   in WhatsApp deletes it here too.
2. **Extract.** After `DIGEST_HOUR` (default 6:00 in `DIGEST_TIMEZONE`), the
   server groups each enabled group's new messages into chunks with earlier
   context and asks `DIGEST_OPENAI_MODEL` (default `gpt-6-luna`, medium
   reasoning) for provider contacts and durable wiki facts with confidence
   scores and the supporting message IDs.
3. **Verify and decide (code, not the model).**
   - Phone numbers and websites must appear in the supporting messages.
   - Contacts deduplicate by normalized phone number, then by name.
   - Existing listings are only enriched where description, category, or
     website are empty.
   - Wiki facts go through the same planning and versioned writes as
     conversational wiki edits; facts already on a page are skipped.
   - Time-sensitive facts, non-providers, and contacts without a number are
     skipped. New wiki pages and low-confidence items wait for review.
4. **Publish.** In `DIGEST_MODE=publish`, confident items are applied through
   the audited functions with `verification_method = 'group_digest'` and the
   listener's number as actor. In `shadow` mode (the default), nothing is
   written until an administrator approves it.
5. **Summarize.** Machu messages each `ADMIN_WHATSAPP` number a summary with a
   reference number per item. Outside WhatsApp's 24-hour window it sends the
   `DIGEST_TEMPLATE_SID` template instead, and the full summary arrives with
   the administrator's next message. Undecided items from the last 14 days
   are repeated in each summary until they are approved or skipped. A warning is added when the listener is
   offline or logged out.

Administrators manage the digest by chatting with Machu:

- `digest`: the latest summary
- `digest run`: run the digest now
- `undo N`: reverse published item #N (refused if someone has changed it since)
- `approve N`, `approve all`: publish items waiting for review (all undecided items from the last 14 days)
- `skip N`, `skip all`: dismiss items waiting for review
- `groups`, `enable 2 3`, `disable 1`, `enable all`: choose which groups are recorded
- `digest help`: the command list

Any other message from an administrator is handled normally.

Every decision, including skipped items and their evidence, is kept in
`group_digest_items`. Runs are claimed atomically, once per local day, in
`group_digest_runs`, with up to three retries after a failure.

## Routing and language-model boundary

Deterministic routing always handles vCards, directory search patterns,
follow-up enrichment, reviews, pagination, and explicit add-number requests
before the general classifier runs. Provider intent has strict priority: a
request for a doctor, plumber, business, recommendation, phone number, or other
contact can never be answered with wiki prose.

OpenAI structured outputs are used for natural-language intent classification,
multilingual directory search expansion, grounded wiki summaries, and planning
small wiki edits. Database lookup, ranking, validation, version checks,
publication, audit recording, and undo are deterministic application/SQL code.
If the model is unavailable, existing deterministic directory behavior remains
available and Machu does not invent a wiki answer.

## Production environment

These are server-only DigitalOcean runtime variables:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

The server also consumes the existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` values. Optional configuration:

- `OPENAI_MODEL` (defaults to `gpt-5.6-luna`)
- `PUBLIC_BASE_URL` (defaults to `https://www.sanmateo.love`)
- `TWILIO_WEBHOOK_URL` (defaults to `https://www.sanmateo.love/bot`)
- `BOT_SIGNING_SECRET` (defaults to `TWILIO_AUTH_TOKEN`)
- `TWILIO_VALIDATE_SIGNATURE=false` for local-only webhook testing

Group digest configuration (the digest is off unless `ADMIN_WHATSAPP` is set):

- `ADMIN_WHATSAPP`: comma-separated E.164 numbers that receive summaries and
  can use the administrator commands
- `DIGEST_MODE`: `shadow` (default; propose only) or `publish`
- `DIGEST_OPENAI_MODEL` (default `gpt-6-luna`), `DIGEST_REASONING_EFFORT`
  (default `medium`)
- `DIGEST_HOUR` (default `6`) and `DIGEST_TIMEZONE` (default `America/Costa_Rica`)
- `DIGEST_TEMPLATE_SID`: approved WhatsApp template for summaries sent outside
  the 24-hour window
- `DIGEST_SECRET`: 32+ characters; enables the `/internal/group-digest/*` endpoints

The `listener` worker uses `DATABASE_URL` (the `machu_listener` role) and
`SENDER_HASH_SECRET`.

Never prefix server secrets with `VITE_`; Vite exposes those values to browser
JavaScript during the frontend build.

## Endpoints

- `POST /bot` — Twilio inbound-message webhook; validates `X-Twilio-Signature`
- `POST /bot/verify/start` — creates an expiring action and a signed WhatsApp approval link
- `GET /bot/verify/session` — reports whether this browser has a current trusted-device session, exposing only the phone's last four digits
- `POST /bot/verify/session/forget` — revokes the current trusted-device session and clears its cookie
- `POST /bot/verify/status` — reports whether Machu has received the approval message
- `POST /bot/verify/check` — completes an approved action without photos
- `POST /bot/verify/review/complete` — finishes a verified review after photo upload
- `POST /bot/verify/provider/complete` — atomically finishes a verified provider create/edit, including an optional logo
- `POST /bot/verify/provider/logo` — uploads an action-scoped logo after the provider action is approved
- `POST /bot/verify/wiki/complete` — atomically publishes a verified website wiki change and its audit event
- `GET /bot` — lightweight bot status
- `GET /bot/contact/:id.vcf?token=...` — short-lived signed vCard media URL
- `GET /healthz` — service health check
- `POST /internal/group-digest/run`, `GET /internal/group-digest/status`,
  `POST /internal/group-digest/template`, `GET /internal/group-digest/template/:sid`:
  digest maintenance, available only with the `x-digest-secret` header

## Database

Migration `20260803223000_machu_whatsapp_bot.sql` adds:

- a normalized active-phone unique index on `contacts`;
- a phone lookup RPC;
- private, expiring bot conversation state keyed by an HMAC rather than a
  submitter phone number.

The bot uses the server-only Supabase service role. Conversation rows have no
direct anonymous policies; only narrow service RPCs are granted, and their keys
are unguessable server-generated HMACs.

Migration `20260814133000_whatsapp_inbound_approval.sql` records inbound Machu
approval as a distinct verification method and carries it into deletion audit
events. Approval messages contain a short-lived HMAC-bound action identifier;
the server accepts one only through the Twilio-signed webhook.

Migration `20260815013000_inbound_sender_identity.sql` removes the redundant
verification-number prompt. A new inbound action starts without an actor; the
first valid sender atomically claims it, and verified/completed actions remain
database-constrained to have a canonical WhatsApp actor.

Migration `20260815003000_trusted_whatsapp_sessions_and_audit.sql` adds private,
hashed trusted-device sessions and a private `provider_change_events` ledger.
Every trusted-session action still creates a short-lived, payload-bound
`community_verification_actions` row containing the verified phone. Reviews
store it in `reviewer_whatsapp`, deletions store it in `requester_whatsapp`, and
provider additions/edits store it with before/after snapshots in the new
ledger. None of those phone fields are available through public RPCs or RLS.

Migration `20260830193000_machu_wiki_and_inbound_audit.sql` adds private wiki
conversation context, `wiki_change_events`, atomic versioned wiki create/update/
delete/undo functions, and audit-aware inbound contact functions. It also
removes anonymous wiki mutation privileges. Both Machu and verified website
edits record the actor's canonical WhatsApp number; Machu additionally records
the Twilio message SID and available profile name. All mutation RPCs are
service-role-only and retry-safe.

Migration `20261003150000_machu_group_digest.sql` adds:
- the group, message, run, item, and listener-status tables (all service-only);
- the `machu_listener` login role, which can only execute the five
  listener functions and use the private `whatsmeow` session schema;
- the `group_digest` audit source;
- `undo_wiki_change_event` and `undo_group_digest_item`, which undo one
  specific change atomically and refuse if anyone has edited it since.

## Private administrator audit

Administrators can identify the verified actor in Supabase using service-role
or dashboard access:

- `provider_change_events` for provider additions and edits;
- `provider_deletion_events` for removals and Undo state;
- `provider_reviews` for the current review and its private reviewer number;
- `community_verification_actions` for the complete per-action source trail,
  including `whatsapp_inbound` versus `trusted_session`.
- `wiki_change_events` for wiki creates, updates, deletions, and undo events,
  including private actor identity and before/after snapshots.
- `group_digest_items` for every group-digest decision, its evidence, and the
  resulting contact or wiki event (`verification_method = 'group_digest'`).

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
