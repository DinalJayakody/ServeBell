# Firebase setup (free Spark plan)

## Status for project `servebell-a7dec` (configured 2026-10-31)

| Item | State |
| --- | --- |
| Email/Password sign-in | ✅ enabled |
| Email enumeration protection | ✅ on |
| Anonymous / phone sign-in | ✅ off (no unnecessary entry points) |
| **Server-side password policy** | ✅ enforced: min 8 chars, must contain a number (set via Admin API) |
| Web config in both apps' `.env` | ✅ (emulator disabled) |
| Service account in `backend/.env` (base64) | ✅ revoked-session checks active |
| Email verification | ✅ sent on sign-up; **required** to redeem staff invitations and apply as owner |
| Live end-to-end test | ✅ token verification, forged-token rejection, verification gating, revocation, weak-password rejection |
| Key file | ✅ git-ignored (`*firebase-adminsdk*.json`) and excluded from server copies |

Still recommended (Google Cloud console → APIs & Services → Credentials → *Browser key*):
restrict the web API key to **Identity Toolkit API** and **Token Service API**.
When you deploy, add your server host (e.g. `129-146-1-2.sslip.io`) under
Authentication → Settings → **Authorized domains**.

Local development now uses the real project. To go back to the offline emulator, clear the
`EXPO_PUBLIC_FIREBASE_*` values in both app `.env` files, set `FIREBASE_PROJECT_ID=demo-servebell`
and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `backend/.env`, and run `pnpm dev:auth`.


ServeBell uses **Firebase Authentication only** (email/password now; Google/Apple later).
Roles, restaurants and all data stay in your own PostgreSQL. Cost on the Spark plan: free.

Local development does **not** need any of this: it uses the Auth emulator.

## 1. Create the project

1. <https://console.firebase.google.com> → **Create a project** → name `servebell` →
   Google Analytics: optional (off is fine) → **Create**.
2. Note the **Project ID** (Project settings → General), e.g. `servebell-4f2a1`.

## 2. Enable sign-in

**Build → Authentication → Get started → Sign-in method** →
**Email/Password** → Enable → Save.

Recommended hardening (Authentication → Settings):
- **User account management → Email enumeration protection: ON** (prevents probing which emails exist).
- **Authorized domains**: add your server host, e.g. `129-146-1-2.sslip.io` (needed later for web sign-in flows).
- Optional: **Templates → Password reset** — set the sender name to "ServeBell".

## 3. Register the app config (used by both mobile apps)

Project settings → General → **Your apps → Add app → Web (`</>`)** → nickname `servebell-mobile`
→ Register. Copy these four values into **both** `apps/customer-app/.env` and
`apps/restaurant-app/.env`:

| Firebase config key | .env variable |
| --- | --- |
| `apiKey` | `EXPO_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` |
| `appId` | `EXPO_PUBLIC_FIREBASE_APP_ID` |

Also clear `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=` so the apps use the real project.
(The web `apiKey` is not a secret — Firebase security comes from the token checks on our API.)

## 4. Service account for the server (recommended)

Project settings → **Service accounts** → **Generate new private key** → downloads a JSON file.
**Never commit it.** On your Mac:

```bash
base64 -i ~/Downloads/servebell-*-firebase-adminsdk-*.json | tr -d '\n'
```

Paste the output as `FIREBASE_SERVICE_ACCOUNT_BASE64=` in `infrastructure/docker/.env.prod`
on the server and re-run `bash infrastructure/oracle/deploy.sh`. This enables checking for
revoked sessions (e.g. after a password reset or disabling a user). Then delete the JSON from Downloads.

`FIREBASE_PROJECT_ID` in `.env.prod` must match the project ID (deploy.sh asks for it).

## 5. Later (needs development builds, not Expo Go)

- **Google sign-in**: enable the Google provider; create OAuth client IDs (iOS, Android, Web) and add
  them as `EXPO_PUBLIC_GOOGLE_*`.
- **Apple sign-in**: enable the Apple provider with your Apple Developer team, Service ID and key.
- **App Check**: optional extra protection against abuse of the auth API.

## Checklist

- [ ] Email/Password enabled, email enumeration protection on
- [ ] Web app config in both app `.env` files, emulator host cleared
- [ ] `FIREBASE_PROJECT_ID` (+ service account) in the server `.env.prod`
- [ ] Your account created in the app and promoted with `make-admin.sh`
