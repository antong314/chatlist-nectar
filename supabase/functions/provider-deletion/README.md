# Provider deletion Edge Function

The function requires the default `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` environment variables plus one project secret:

```sh
supabase secrets set COMMUNITY_DELETE_CODE=<random-12+-character-community-code>
supabase functions deploy provider-deletion --no-verify-jwt
```

`--no-verify-jwt` is required because the directory intentionally has no user
login. The function authenticates deletion requests with `COMMUNITY_DELETE_CODE`
and calls database RPCs that only `service_role` may execute.

Rotate the community code with `supabase secrets set`; no database migration is
needed. Use a random code of at least 12 characters, distribute it through the private community channel,
and do not use a personal password. Existing undo tokens remain valid until
their database expiry because they are independent of the community code.
