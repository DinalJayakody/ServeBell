# ServeBell authentication (Supabase Auth)

Supabase Auth owns credentials (sign-up, sign-in, email confirmation, password reset, token refresh).
The ServeBell API owns profiles, roles and every authorisation decision. The apps never read or write
application data through Supabase directly.

```
App ──signInWithPassword──► Supabase Auth ──► access token (ES256 JWT, 1 h) + refresh token (Keychain)
App ──Bearer <access token>──► ServeBell API ── verifies offline with the project JWKS ──► users.authUserId
```

## Backend

| Piece | File |
| --- | --- |
| Token verification (jose, remote JWKS `…/auth/v1/.well-known/jwks.json`, issuer `…/auth/v1`, audience `authenticated`, ES256/RS256 only, `role` must be `authenticated`) | `backend/src/auth/token-verifier.ts` |
| Global guard: verify → load `users` by `authUserId` → `req.user = { id, platformRole, emailVerified }` | `backend/src/common/guards/auth.guard.ts` |
| `POST /auth/sync`: reads the account from Supabase (`GET /auth/v1/user`, authoritative `email_confirmed_at`, also proves the session still exists), creates/updates the profile | `backend/src/auth/auth.service.ts` |
| Realtime handshake uses the same verifier | `backend/src/realtime/realtime.gateway.ts` |

Rules:
* Email verification is read from Supabase Auth on every sync and mirrored to `users.emailVerifiedAt`. Owner applications
  and invitation redemption require it. Token metadata (editable by users) is never trusted for it.
* `user_metadata.full_name` / `phone` (set at sign-up) only fill blanks in a new profile.
* **Linking profiles that predate Supabase** (created under Firebase): the first sync of a Supabase user whose email matches an
  unlinked profile links it — only if Supabase has confirmed the address. A profile already linked to another Supabase user
  is never taken over (409). Audited as `auth.account_linked`.
* Environment: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server only; production requires `https://` and an `sb_secret_` key).

## Apps (`packages/mobile-core`)

| Piece | File |
| --- | --- |
| Supabase client: publishable key only, session in iOS Keychain / Android Keystore via `expo-secure-store` (chunked, `AFTER_FIRST_UNLOCK`), auto-refresh only in foreground, implicit flow | `src/supabase.ts` |
| Session store, sign-in/up, resend, reset, `completeAuthLink`, `updatePassword`, sign-out (this device) | `src/session.ts` |
| "Check your email" (sign-up and unconfirmed sign-in), new-password form | `src/AuthForms.tsx` |
| Route `auth/callback` in both apps: completes links from emails (confirm → signed in; reset → choose a new password) | `src/AuthCallback.tsx`, `apps/*/src/app/auth/callback.tsx` |

Redirect targets: `servebell://auth/callback` (customer), `servebell-restaurant://auth/callback` (restaurant),
`exp://…/--/auth/callback` in Expo Go (from `Linking.createURL`).

App environment (`apps/*/.env`, EAS env for builds): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Empty in development = local stack on the dev machine (`http://<LAN IP>:54321`).

## Dashboard settings (cloud project)

* Email provider on, **Confirm email** on.
* Site URL `servebell://auth/callback`; redirect URLs `servebell://**`, `servebell-restaurant://**`, `exp://**`.
* Custom SMTP (Gmail app password) so emails reach any address.
* Recommended: Authentication → Policies → minimum password length 8, letters + digits (matches the app form and the local stack).

Known limitation (development only): Supabase does not accept `exp://<IP>:<port>/…` redirect targets even with an exact
allow-list entry (verified locally), so links opened from email do not jump back into **Expo Go**; the confirmation itself
still succeeds and the user can sign in. Builds (TestFlight/App Store) use the custom schemes, which are accepted.

## Local development

```bash
pnpm dev:supabase                       # supabase start (Auth + Postgres + Mailpit on :54324)
SEED_DEMO_ACCOUNTS=true pnpm db:seed    # demo accounts in the LOCAL Auth only (password in seed.ts)
pnpm dev:backend
```
`backend/.env`: `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SECRET_KEY=` from `supabase status -o env`.
Confirmation and reset emails are captured by Mailpit at http://127.0.0.1:54324.

## Tests (2026-11-02)

| Check | Result |
| --- | --- |
| Backend suite (fake verifier) incl. new profile-linking test (unconfirmed → 403, confirmed → linked, second user → 409) | 81/81 |
| Real verifier vs local Supabase: valid token 200; tampered payload, garbage, token signed with another ES256 key, token from the cloud project (wrong issuer) | all 401 |
| Smoke flow with real Supabase tokens (sign-in, realtime alert, accept, chat, complete) | passed |
| iOS simulator (Expo Go): password-reset link → "Choose a new password", session + profile sync | passed |
| iOS simulator: sign-up confirmation link (cold start) → "Email confirmed", profile created verified with sign-up name | passed |
