# Testing on iOS simulators and your phone (Expo Go)

Everything runs on your Mac; no Firebase project, VPS or Apple account needed.
Sign-in uses the local **Firebase Auth emulator** (`demo-servebell` project).

## One-time setup

```bash
nvm use                      # Node 22
pnpm install
pnpm db:up && pnpm db:deploy
```

## Every session — 4 terminals

| Terminal | Command | What it runs |
| --- | --- | --- |
| 1 | `pnpm dev:stack` | Auth emulator (:9099, UI :4500) + API (:4000) + QR web (:3000) |
| 2 | `pnpm db:seed` (once per emulator reset) | Demo restaurant + demo Firebase accounts |
| 2 | `pnpm dev:customer` | Customer App Metro on **:8081** |
| 3 | `pnpm dev:restaurant` | Restaurant App Metro on **:8082** |

Fixed ports mean both apps run at the same time.

## iOS simulators (this Mac)

In the Metro terminal press **`i`** (or run `pnpm ios:customer` / `pnpm ios:restaurant`).
Expo installs Expo Go on the simulator automatically.

To run the **two apps side by side on two simulators**:

```bash
xcrun simctl boot "iPhone 17"            # second simulator
open -a Simulator
# In the Simulator menu: File → Open Simulator → iPhone 17, then in Metro (8082) press shift+i and pick it.
```

The simulator has no camera. To "scan" a table:

```bash
pnpm dev:tables      # prints every table link and a ready-made command, e.g.
xcrun simctl openurl booted "exp://127.0.0.1:8081/--/t/<token>"
```

…or in the app: **My Table → Scan table QR → paste any table link**.

## Your phone (same Wi-Fi)

1. Install **Expo Go** (SDK 58) from the App Store / Play Store.
2. Scan the QR code in the Metro terminal (8081 for customer, 8082 for restaurant).
   The app reaches the API and Auth emulator at your Mac's LAN IP automatically.
3. Open `tmp/table-qr-codes.html` (created by `pnpm dev:tables`) on your Mac screen and
   scan a table with **My Table → Scan table QR** in the Customer App.
4. If the phone can't connect: macOS **System Settings → Network → Firewall** must allow
   incoming connections for `node`; phone and Mac must be on the same network (not a
   guest network with client isolation).

## Demo accounts (password `ServeBell#2026`)

The sign-in screen shows one-tap **Development · demo accounts** buttons while using the
emulator. They do not exist in production builds.

| App | Account |
| --- | --- |
| Customer | customer@servebell.dev (Sarah) |
| Restaurant | owner@, manager@, waiter@ (Daniel), waiter2@ (Kasun), admin@ (platform admin) — all `@servebell.dev` |

## A full scenario (≈ 2 minutes)

1. **Restaurant app** (simulator or phone): sign in as *Waiter Daniel*. Allow notifications.
2. **Customer app** (the other device): sign in as *Sarah*, scan table T1 (or `openurl`).
3. Customer: tap **Request Waiter** on Home → "Request Sent!" screen. Try **Menu → +** → **View Order → Place Order**.
4. Waiter: a banner appears instantly; the request is on Home and in **Requests → Pending**.
   Try **Wait** (it moves to *Others*, still pending for Kasun) or **Accept**.
5. Customer sees *Accepted by Daniel* live; chat in both directions.
6. Waiter: **Start → Complete**; in **Orders** tap Accept → Start preparing → Mark ready → Mark served. The customer's *Your Order* tracker moves live.
7. Sign in as *Waiter Kasun* on a third device/simulator and tap Accept at the same time
   as Daniel: one wins, the other gets "Already taken".

Automated version of this flow against the running stack: `pnpm dev:smoke`.

## What Expo Go can and cannot verify

| Feature | Expo Go | Dev build |
| --- | :-: | :-: |
| All screens, navigation, light/dark/system theme | ✅ | ✅ |
| Email/password auth (emulator or real Firebase), session restore | ✅ | ✅ |
| Discovery, QR scan (camera on phone), visits, service requests, chat | ✅ | ✅ |
| Realtime updates (Socket.IO) and in-app/local alerts while the app is open | ✅ | ✅ |
| **Remote push when the app is closed** | ❌ Android; iOS needs `eas init` project id | ✅ |
| Google sign-in | ❌ | ✅ |
| Apple sign-in | ⚠️ test only | ✅ |
| `servebell://` deep links from the QR web page | ❌ (use the "Open in Expo Go" dev button) | ✅ |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Changes in `packages/*` don't show up, or "undefined is not a function" after editing shared code | Keep `pnpm dev:stack` running (it rebuilds shared packages), then restart Metro with a clean cache: `pnpm --filter @servebell/customer-app exec expo start --port 8081 --clear` |
| "System" theme stays dark/light | Expo Go can override the system appearance. Use **Profile/Settings → Appearance**, or in development open `exp://<host>:8081/--/dev/theme?mode=light` |
| iOS asks "Open in Expo Go?" and nothing happens | The alert is waiting for a tap on the simulator |
| Phone can't reach the API | Same Wi-Fi, macOS firewall allows `node`, check `pnpm dev:ip` |

Development-only helpers (removed from production builds): `/--/dev/sign-in?email=…`, `/--/dev/theme?mode=…`, demo-account buttons on sign-in.
