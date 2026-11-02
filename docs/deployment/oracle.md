# Deploying ServeBell to Oracle Cloud — Always Free (cost: 0)

**What goes on Oracle:** the backend API, PostgreSQL database, QR web pages, HTTPS and
nightly backups — all on one free server.
**What does not:** the two mobile apps. They run on phones (Expo Go now; App Store /
Play Store builds later via EAS) and simply point at your server's address.

Result: `https://<ip-with-dashes>.sslip.io` (free HTTPS, no domain to buy).
Time: ~45 minutes the first time.

---

## Step 1 — Create your Oracle account (10 min)

1. Go to <https://signup.cloud.oracle.com>.
2. Home Region: **India South (Hyderabad)** or **India West (Mumbai)** (closest to Sri Lanka; can't be changed later).
3. A card is needed only to verify identity. Always Free resources are not charged.

## Step 2 — Create the server (10 min)

Oracle Console → ☰ → **Compute → Instances → Create instance**

| Setting | Value |
| --- | --- |
| Name | `servebell` |
| Image | **Canonical Ubuntu 24.04** (Image and shape → Edit → Change image) |
| Shape | **Ampere → VM.Standard.A1.Flex**, **2 OCPUs, 12 GB memory** |
| Networking | Create new VCN, **Assign a public IPv4 address: Yes** |
| SSH keys | **Generate a key pair for me → Save private key** (keep it safe) |
| Boot volume | default |

Click **Create**, wait for **Running**, copy the **Public IP address** (e.g. `129.146.1.2`).

> "Out of capacity" for A1 is common in busy regions — retry later or pick another availability domain.

## Step 3 — Open ports 80 and 443 (3 min)

Instance page → **Primary VNIC → Subnet** link → **Security Lists → Default Security List → Add Ingress Rules**:

| Source CIDR | Protocol | Destination port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | UDP | `443` (optional, HTTP/3) |

(SSH port 22 is already open. The server's own firewall is opened by the bootstrap script.)

## Step 4 — Upload the project (5 min, on your Mac)

```bash
mv ~/Downloads/ssh-key-*.key ~/.ssh/servebell.key && chmod 600 ~/.ssh/servebell.key
export IP=129.146.1.2            # ← your server's public IP

cd ~/Developer
rsync -az --include '.env.prod.example' --include '.env.example' --exclude node_modules --exclude .expo --exclude .next --exclude dist \
  --exclude backend/storage --exclude '.env' --exclude '.env.*' --exclude tmp \
  --exclude '*adminsdk*.json' --exclude .firebase-emulator \
  -e "ssh -i ~/.ssh/servebell.key" ServeBell/ ubuntu@$IP:~/servebell/
```

## Step 5 — Upload the Firebase key securely (1 min, on your Mac)

```bash
ssh -i ~/.ssh/servebell.key ubuntu@$IP 'mkdir -p ~/servebell-secrets && chmod 700 ~/servebell-secrets'
scp -i ~/.ssh/servebell.key /path/to/servebell-a7dec-firebase-adminsdk-*.json ubuntu@$IP:~/servebell-secrets/
```

`deploy.sh` imports it into the protected server config and deletes the uploaded file.

## Step 6 — Prepare the server (5 min, on the server)

```bash
ssh -i ~/.ssh/servebell.key ubuntu@$IP
cd ~/servebell
bash infrastructure/oracle/bootstrap.sh
exit
```

This installs Docker, opens ports 80/443 in Oracle's Ubuntu firewall (the classic
Oracle pitfall), adds swap, enables automatic security updates, SSH brute-force
protection (fail2ban) and log rotation. Log out so Docker permissions apply.

## Step 7 — Deploy (10 min, on the server)

```bash
ssh -i ~/.ssh/servebell.key ubuntu@$IP
cd ~/servebell
bash infrastructure/oracle/deploy.sh
```

It asks for:
- an email (for Let's Encrypt certificate notices),
- the Firebase project ID (press Enter for `servebell-a7dec`).

Then it generates strong secrets, imports the Firebase key, builds the images on the
server, runs database migrations, starts everything and waits for HTTPS. At the end:

```
✔ Live:  API https://129-146-1-2.sslip.io/api/v1   ·   Web https://129-146-1-2.sslip.io
```

Check in a browser: `https://<your-site>/api/v1/health` → `{"status":"ok",…}`.

## Step 8 — Firebase: authorise the new domain (1 min)

Firebase console → **Authentication → Settings → Authorized domains → Add domain** →
`129-146-1-2.sslip.io` (your site).

## Step 9 — Point both apps at the server (2 min, on your Mac)

In **both** `apps/customer-app/.env` and `apps/restaurant-app/.env`:

```
EXPO_PUBLIC_API_URL=https://129-146-1-2.sslip.io
```

(Firebase values are already set.) Restart with a clean cache:

```bash
pnpm --filter @servebell/customer-app exec expo start --port 8081 --clear
pnpm --filter @servebell/restaurant-app exec expo start --port 8082 --clear
```

Scan the Expo QR codes — the apps now use the server, from anywhere (Wi-Fi or mobile data).

## Step 10 — Create the first real accounts

1. In the **Restaurant app → Create an account** with your email, then open the verification email.
2. On the server, make yourself platform admin:
   `bash infrastructure/scripts/make-admin.sh you@example.com`
3. Sign out and in again. **Join → I'm an owner** → submit your restaurant.
4. **Review owner applications → Approve.**
5. **Manage**: profile & hours → menu (with photos) → floor plan → **Go live**.
6. **Manage → Table QR codes → Print all** and place them on the tables.
7. **Team → Invite** your waiters (they sign up, verify their email, enter the code).

The production database starts empty — no demo data or demo accounts.

---

## Updating after code changes

```bash
# on your Mac
rsync … (same command as step 4)
# on the server
cd ~/servebell && bash infrastructure/oracle/deploy.sh
```

## Daily operations (on the server, in ~/servebell)

| Task | Command |
| --- | --- |
| Status | `docker compose -f infrastructure/docker/docker-compose.prod.yml ps` |
| Logs | `docker compose -f infrastructure/docker/docker-compose.prod.yml logs -f backend caddy` |
| Make admin | `bash infrastructure/scripts/make-admin.sh email@example.com` |
| Restore backup | `bash infrastructure/scripts/restore.sh infrastructure/backups/<file>.dump` |
| Copy backups to your Mac | `rsync -e "ssh -i ~/.ssh/servebell.key" ubuntu@$IP:~/servebell/infrastructure/backups/ ./servebell-backups/` |
| Back up uploaded photos | `docker run --rm -v servebell-prod_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .` |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `deploy.sh` says "Not reachable" | Step 3 ingress rules missing, or bootstrap not run. `curl -I http://<IP>` from your Mac should answer. |
| Certificate not issued | Port 80 must be open (Let's Encrypt validates over HTTP). See `… logs caddy`. |
| Apps can't sign in on the server | Step 8 (authorized domain) and the Firebase project ID in `infrastructure/docker/.env.prod`. |
| Build killed / very slow | Use 2 OCPU / 12 GB (Step 2); bootstrap adds 4 GB swap. |

## Free-tier notes

- **Idle reclamation:** Oracle may reclaim Always Free instances that are almost idle for 7 days.
  Upgrading to *Pay As You Go* removes this and Always Free stays free — add a $1 budget alert.
- Uses 1 A1 instance (2 OCPU / 12 GB) + 50 GB boot volume: within Always Free limits.
- Custom domain later: add an `A` record → server IP, set `SITE_ADDRESS`, `CORS_ORIGINS`,
  `PUBLIC_WEB_URL` in `infrastructure/docker/.env.prod`, re-run `deploy.sh`, add the domain in Firebase.
