# Development status

_Last updated: 2026-10-31_

## Phases

| Phase | Status |
| --- | --- |
| 1. Architecture & foundation | ✅ Complete |
| 2. Authentication & core database | ✅ Complete (Firebase Auth; local emulator in development) |
| 3. Customer App | ✅ Complete for Expo Go scope: welcome, discovery (location/city/category/search), restaurant details, **favourites**, menu + cart + ordering, **2D/3D table layout**, **table details + reservations**, QR table session (+ guest count), Request Waiter + Request Service grid, request tracking, Table Assistant view, chat, Messages, profile + **avatar upload**, light/dark/system |
| 4. Restaurant admin | ✅ Dashboard analytics (date/employee/service filters), employee cards + profiles (history, metrics, suspend/role/remove), invitations, service monitoring, **restaurant profile + hours + go live**, **menu management with photos**, **floor-plan editor (2D/3D, reference photo overlay)**, **QR codes (preview/print/PDF/regenerate/deactivate)**, services/utensils/amenities, reservations dashboard |
| 5. Waiter interface | ✅ Dashboard, queue (Pending/Mine/Others/Done), Accept/Wait, Start/Complete/Cancel, chat, live alerts, orders handling, reservations view |
| 6. Realtime & notifications | ✅ Socket.IO (origin-restricted), escalation job, in-app notifications, push outbox + receipts, local alerts. Remote push to closed apps needs an EAS build |
| 7. QR web | ✅ Landing, table page, restaurant page |
| 8. 3D floor plan | ✅ Coordinate model → 2D SVG blueprint + three.js/expo-gl 3D from the same rows; editor with versioned saves and publishing |
| 9. Testing & optimisation | 🟡 77 backend integration tests + unit tests; simulator verification; Android device verification pending |
| 10. Deployment | ✅ Live on Oracle Always Free (E2.1.Micro, Oracle Linux 9): https://140-245-242-243.sslip.io — Caddy auto-HTTPS, Postgres, migrations, API, QR web, nightly backups, low-memory profile |

## Latest iteration (2026-11-02): full-screen editor, drafts, realistic 3D

- **Editor is full screen**: the plan fills the screen; pinch to zoom, drag empty space to pan, +/−/fit buttons, focus mode hides all panels; tools in a bottom sheet (Tables · Items · Smart · Room) and a compact inspector for the selected item.
- **Never lose work**: Save draft (server, private) and Save/Save & go live always visible; every change is autosaved on the phone (also when the app is backgrounded) and restored on reopen; swipe-back is disabled on the editor and leaving asks Save draft / Discard / Keep editing.
- **New items**: Big screen and TV (2D + 3D).
- **3D**: procedural, animated models — seated guests at occupied tables (or every seat with "Guests" in full-screen preview) eating and chatting, cook stirring pots with steam in a tiled kitchen, bartender shaking cocktails with a lit bottle rack and pouring bottle, wooden entrance doors that open as a guest walks in, cricket match on big screens, stage lights, swaying plants; names float above items like the 2D plan; full-screen 3D preview in both apps.
- **Performance**: static parts merged into a few draw calls (~90 for a 44-seat room), instanced bottles, shared geometry/material caches, no shadow maps (soft baked blob shadows), self-pacing frame loop (≤30 fps, waits for the GPU so slow devices never build a backlog), paused in background, static when "Reduce Motion" is on.

## Iteration (2026-10-31): flexible tables, floor-plan editor, guides

- **Floor-plan editor rebuilt**: dragging fixed (single, stable touch handler; canvas outside the scroll view; live drag committed on release), table size presets, landmarks with recognisable icons (entrance, bar with stools, tiled kitchen, restroom, window, door, stage, plant, pillar, wall), nudge arrows, rotate, duplicate, auto-arrange, free-spot placement, legend.
- **Detect from photo** (optional): camera or library photo → Claude vision suggests tables and landmarks → owner reviews and saves. Needs `ANTHROPIC_API_KEY` on the server; otherwise the app explains it is not set up.
- **No floor plan required**: simple table list (with QR codes), any-table reservations that staff confirm and assign to a table, unplaced tables can be placed on a plan later.
- **Guides**: ⓘ info tips on options and screens in both apps.
- **Owner approval flow**: admins notified of new applications; applicants notified on approval/rejection; review entry in Settings.
- **Demo data script**: `backend/scripts/demo-scenario.ts` creates a full scenario and keeps the data.

## Previous iteration

- **Admin backend**: restaurant profile/hours/go-live rules, menu CRUD (soft delete, photos), utensils, amenities, service types (single primary action), floor plans (atomic versioned layout save, bounds + unique-label validation, stable table ids, auto QR for new tables, QR revoked for removed tables, publish), table details/photos, reference photo, QR list/regenerate/deactivate/print sheet, reservations (timezone-correct slots, lead time, capacity, **exclusion-constraint double-booking protection with deadlock retry**), favourites, analytics + employee metrics from SQL aggregates, employee management rules (owner/admin), audit logging.
- **Apps**: all screens above; shared `FloorPlan2D` (SVG, drag-edit with 5 cm snap, seats, status colours) and `FloorPlan3D` (three.js on expo-gl, on-demand rendering, orbit, tap-to-select).
- **Motion design**: Reanimated press-scale on every pressable, staggered entrances, ringing service bell with pulse, confetti burst + spring check on success, pulsing current step and overdue indicators; all respect “Reduce Motion”.
- **Production**: Caddy with automatic Let's Encrypt (works with free `<ip>.sslip.io`), persistent uploads volume, Postgres not exposed, origin-restricted WebSockets, `make-admin.sh`, Oracle `bootstrap.sh` (Docker, iptables fix, swap, unattended upgrades, fail2ban, log rotation) and `deploy.sh` (secrets generation, build, health wait).

### Bugs found and fixed this iteration (by tests or on the simulator)
- Concurrent reservations surfaced as a 500 (Postgres deadlock / P2039 error shape) → retry + clean 409.
- three.js CJS build crashed React Native → Metro resolves the ESM build.
- three ≥ r163 rejected expo-gl's WebGL2 context as “WebGL 1” → context acquired via canvas.
- React Three Fiber never presented frames → replaced with direct three.js + `endFrameEXP`.
- Watchman wasn't watching the repo, causing stale bundles → `.watchmanconfig`.
- Relative media URLs broke avatars → central media resolver in the design system.
- Docker build missed a workspace package; uploads were not persisted → fixed.

## Tests (2026-10-30)

| Suite | Result |
| --- | --- |
| Backend integration (real Postgres) | **77/77**: auth, authorization/isolation, invitations, onboarding, DB constraints, discovery, QR, devices, visits + service lifecycle (concurrent accept, escalation, sockets), menu/orders/uploads, **admin/floor-plan versioning/QR regenerate/availability + concurrent double booking/favourites/analytics/employee rules** |
| Shared + API client unit | 9 + 4 |
| Typecheck (8 workspaces), expo-doctor (both apps) | pass |
| iOS simulator (iPhone 17 Pro + iPhone 17) | Screens and flows above verified with live data, including 2D and 3D layout, dashboard, QR codes, animations |
| Production stack on arm64 (Docker) | see final report of this iteration |

**Not verified yet:** Android device/emulator run (no Android SDK on this Mac; all APIs used are cross-platform and Expo Go-supported), remote push delivery (needs EAS build), Google/Apple sign-in (needs dev builds + credentials).

## Known limitations / next steps

1. Run the apps on an Android phone with Expo Go (same steps as iOS) and report any issue.
2. Configure SMTP (`SMTP_URL` in `.env.prod`) so staff invitation codes are also emailed.
3. `eas init` + development builds → verify remote push, Google/Apple sign-in.
4. Payments module once a provider is chosen; ratings/reviews; Cloudflare R2 for media at scale.
5. Optional web admin dashboard for large screens.
