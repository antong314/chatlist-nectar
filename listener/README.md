# Machu group listener

A read-only WhatsApp companion device for the Machu group digest. It links to
a dedicated WhatsApp account the same way WhatsApp Web does (using
[whatsmeow](https://github.com/tulir/whatsmeow)) and records messages from the
groups an administrator has enabled. It never sends messages, reactions, read
receipts, or presence.

whatsmeow is an unofficial client. Using it breaks WhatsApp's Terms of Service,
so the dedicated number can be banned. If that happens, register a new number,
link it, and add it back to the groups; the directory and wiki are unaffected.

## How it fits

- The listener writes through five narrow Postgres functions as the
  `machu_listener` role. It cannot read stored messages or any other table.
- Its linked-device session lives in the private `whatsmeow` schema, so
  redeploys don't require linking again.
- Group members appear only as an HMAC of their WhatsApp ID (`SENDER_HASH_SECRET`)
  plus their display name.
- Groups start disabled. Nothing is stored until an administrator replies
  `enable N` to Machu.
- The daily digest in `server/group-digest.mjs` reads the messages, and the
  database deletes them after 14 days.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase session-pooler URL for `machu_listener.<project-ref>` |
| `SENDER_HASH_SECRET` | 32+ character secret for pseudonymizing senders |
| `LOG_LEVEL` | `debug`, `info` (default), `warn`, or `error` |

## Linking the account (once)

The account's WhatsApp app must stay installed on a phone that comes online at
least every couple of weeks; otherwise WhatsApp unlinks companion devices.

```sh
cd listener
DATABASE_URL=... SENDER_HASH_SECRET=... go run . login --phone +15551234567
```

On the listener phone, open WhatsApp → Linked devices → Link a device →
"Link with phone number instead", and enter the code shown. Without `--phone`,
the command shows a QR code instead (`--qr-png qr.png` also saves it as an
image). The deployed worker waits for this and takes over once the account is
linked.

## Running

```sh
go test ./...
go run . run
```

In production the `listener` worker on DigitalOcean App Platform builds
`listener/Dockerfile`.
