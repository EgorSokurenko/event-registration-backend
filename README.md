# Event Registration Backend

Hapi.js backend for **Deep Calls to Deep** (Manuilivskiy Avenue 1, Dnipro — 29–30 May 2026).
Google Sheets is the only data store. Payments via Monobank Acquiring.

## Stack

- Node.js + Hapi.js 21
- Google Sheets via direct API (`googleapis`) with a service account
- Monobank Acquiring (axios)
- nodemailer (Gmail SMTP)
- JWT auth (`hapi-auth-jwt2`) for admin endpoints
- Joi validation, Swagger docs at `/documentation`

## Quick start

```bash
npm install
cp .env.example .env   # then fill in the values (see below)
npm start
```

Server runs on `http://localhost:9090`. Swagger at `http://localhost:9090/documentation`.

## Required env (in build order)

| Var | When needed | How to get |
|-----|-------------|-----------|
| `JWT_SECRET` | Always | `openssl rand -hex 32` |
| `QR_HMAC_SECRET` | M5 (ticket QR) | `openssl rand -hex 32` |
| `GOOGLE_SHEET_ID` | M2 | From the sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | M2 | GCP service-account key (see below) |
| `MONOBANK_TOKEN` | M4 | Monobank merchant cabinet |
| `SMTP_USER` / `SMTP_PASS` | M5 | Gmail App Password (see below) |

## Google Sheets — direct API (M2)

The backend talks to the Google Sheets API directly via a service account. ~10× faster than the Apps Script proxy approach.

### One-time setup (~5–10 min)

1. Open [console.cloud.google.com](https://console.cloud.google.com). Top-left: project dropdown → **New project**. Name it anything (e.g. `dctd-registration`). Click Create.
2. Once selected: search bar → "Google Sheets API" → click into it → **Enable**.
3. Search bar → "Credentials" → **+ Create credentials → Service account**.
   - Service account name: `dctd-backend` (or anything)
   - Skip the optional grant-access step → Done.
4. On the Credentials page, click your new service account → **Keys** tab → **Add key → Create new key → JSON → Create**. A `.json` file downloads — keep it.
5. Note the service account email — looks like `dctd-backend@<project>.iam.gserviceaccount.com`.
6. Open your existing Google Sheet (the one you used for Apps Script). Click **Share** (top right). Paste the service-account email → set role to **Editor** → uncheck "Notify people" → **Share**.
7. In `event-registration-backend/.env`:
   ```
   GOOGLE_SHEET_ID=<the long ID between /d/ and /edit in the sheet URL>
   GOOGLE_SERVICE_ACCOUNT_JSON=<paste the entire JSON from step 4 as a single line>
   ```
   For inline JSON, paste it on one line. Or save the JSON to a file outside the repo and use `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/it.json` instead.

### Initialize / verify

The sheet should already have the three tabs from your Apps Script setup. If it does, no init needed. If you started fresh:

```bash
curl -X POST http://localhost:9090/debug/sheets/init   # creates tabs + headers
curl     http://localhost:9090/debug/sheets/status      # reachability + row counts
curl     http://localhost:9090/debug/settings           # Settings as key/value
```

Debug routes only mount when `NODE_ENV=LOCAL`.

### About the Apps Script

The `apps-script.gs` file and your Apps Script web app deployment are no longer used. You can delete the deployment from the Apps Script editor, or just leave it dormant — either is fine.

## Monobank Acquiring setup (M4)

### Get a token

- **Production:** [web.monobank.ua](https://web.monobank.ua/) → merchant cabinet → API integration → copy the token.
- **Sandbox / test:** [api.monobank.ua](https://api.monobank.ua/) → "тестовий токен" — works against the same endpoints with fake card numbers.

Either way, paste it into `.env`:

```
MONOBANK_TOKEN=...
```

If `MONOBANK_TOKEN` is empty, the registration endpoint falls back to "dev mode" — the row is created and the response has `paymentUrl: null`. The frontend just navigates to the ticket page, no charge.

### Local webhook testing with ngrok

Mono's webhook needs a public URL to POST to. For local dev, expose the backend with ngrok:

```bash
# Install once
brew install ngrok    # or: npm i -g ngrok

# Run alongside the backend
ngrok http 9090
```

ngrok prints something like `https://abcd-1234.ngrok-free.app`. Put that into `.env`:

```
BACKEND_URL=https://abcd-1234.ngrok-free.app
```

Restart the backend so the new URL is used in `webHookUrl` on each invoice. Now when you complete a payment, Mono will POST to your local server and flip the row to `paid`.

The free ngrok URL changes every time you restart it. For a stable URL, sign up for ngrok free and run `ngrok http 9090 --domain=your-stable-name.ngrok-free.app`.

### Skipping ngrok temporarily

If you can't run ngrok (or want to test the email flow without paying), there's a LOCAL-only debug endpoint that simulates a successful webhook:

```bash
curl -X POST http://localhost:9090/debug/payment/simulate-paid/<registration-id>
```

This skips signature verification and flips the row to `paid` directly. Same effect as a real Mono webhook for testing M5.

## Gmail App Password setup (M5)

App Passwords require 2-Step Verification on the Google account.

1. Sign in to `ciuaschool@gmail.com`.
2. Go to [myaccount.google.com/security](https://myaccount.google.com/security).
3. Turn on **2-Step Verification** if it's not already on.
4. Once 2SV is enabled, search for **App passwords** (or visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
5. Create one, name it "Deep Calls to Deep backend". Google gives you a 16-char password.
6. Paste it into `.env` as `SMTP_PASS`. Remove the spaces.

## Folder layout

```
Controllers/   HTTP request handlers
Routes/        Route definitions + Joi validation
Services/      Business logic + Sheets/Mono/email integrations
Other/         Shared helpers (auth, response shape)
server.js      Hapi bootstrap
```

## Production admin creation

Don't use `/debug/admin/create` in production — it's gated to `NODE_ENV=LOCAL` and won't even mount otherwise. Use the CLI script instead:

```bash
# Interactive (prompts for email, hidden password input, optional name)
npm run create-admin

# Non-interactive
node scripts/create-admin.js --email admin@example.com --password "long-secret" --name "Anna"
```

The script reads `.env` itself, so it works against the same Sheet as the running server. No HTTP calls, no auth required.

## Production deployment

### Environment checklist

In production, set these on whichever host runs the backend (Railway / Render / Fly / EC2 / …):

```
NODE_ENV=PROD                      # Anything other than LOCAL hides debug routes
API_HOST=8080                      # Or whatever port the host expects
RAILWAY_PUBLIC_DOMAIN=0.0.0.0      # On Railway: leave default. Other hosts: 0.0.0.0
FRONTEND_URL=https://<your-domain>
BACKEND_URL=https://<api-domain>   # Used for Mono webhook URL — must be public HTTPS

JWT_SECRET=<openssl rand -hex 32>
QR_HMAC_SECRET=<openssl rand -hex 32>
TIMEZONE=Europe/Kiev               # Optional, defaults to Europe/Kiev

GOOGLE_SHEET_ID=<your sheet id>
GOOGLE_SERVICE_ACCOUNT_JSON=<single-line JSON>

MONOBANK_TOKEN=<production merchant token, NOT the sandbox one>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ciuaschool@gmail.com
SMTP_PASS=<Gmail app password>
EMAIL_FROM_NAME=Deep Calls to Deep
```

### Mono webhook is public-HTTPS only

Monobank only POSTs webhooks to public HTTPS URLs. Don't deploy with `BACKEND_URL=http://...` or behind a private network — you'll never see paid statuses flip in the sheet. If `BACKEND_URL` is the same as `FRONTEND_URL` (e.g. you're behind a single Cloudflare domain), make sure the path `/api/payment/webhook` reaches the backend, not the static frontend.

### Recommended hosts

- **Backend**: Railway (the reference project's choice — has a free tier, Node-friendly, public URLs out of the box) or Render. Deploy the `event-registration-backend/` folder, set the env vars above, set start command to `npm run start:prod`.
- **Frontend**: Firebase Hosting (free + great Angular tooling), Vercel, or Cloudflare Pages. Build with `npm run build`, then deploy the `dist/event-registration-frontend/browser/` folder. Configure SPA fallback: serve `index.html` for any path that doesn't match a static file, otherwise `/ticket/abc123` will 404 on refresh.

### Frontend production environment

Edit `src/environments/environment.prod.ts` before building:

```ts
export const environment = {
    production: true,
    apiUrl: 'https://api.your-domain.com',   // The deployed backend URL
    appUrl: 'https://your-domain.com'
};
```

Build:
```bash
npm run build   # outputs dist/event-registration-frontend/browser/
```

## Build progress

- [x] M1 — Skeleton
- [x] M2 — Google Sheets data layer (direct API)
- [x] M3 — Registration endpoint
- [x] M4 — Monobank invoice + webhook
- [x] M5 — Ticket page + email
- [x] M6 — Admin login + dashboard
- [x] M7 — Scanner + check-in
- [x] M8 — Lazy-loaded admin chunks, CLI admin creation, deployment guide
