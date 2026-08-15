# Provider deletion Undo Edge Function

New provider removals are approved by sending a signed message to Machu from
the submitted WhatsApp number, then completed by the DigitalOcean service. This
legacy Edge Function now accepts only the short-lived Undo token returned by a
successful verified deletion.

```sh
supabase functions deploy provider-deletion --no-verify-jwt
```

`--no-verify-jwt` is required because the directory intentionally has no user
login. The old `delete` action returns HTTP 410 so a shared community code can
never bypass individual WhatsApp verification. Undo hashes its single-use token
before calling a service-role-only database RPC.
