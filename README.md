# Sparkle Wash: mobile car wash platform

Five apps on one API:

| Folder | What | Stack |
|---|---|---|
| `apps/api` | REST + real-time API, payments, notifications | Node 22, TypeScript, Express 5, Postgres 16, Socket.IO, Stripe |
| `apps/web` | Customer website: landing page, online booking, live tracking, account, memberships | React 19, Vite, React Router, Leaflet, Stripe Payment Element |
| `apps/customer` | Customer app for iOS and Android | Expo SDK 57 / React Native, Expo Router, Stripe PaymentSheet |
| `apps/washer` | Washer app: job queue, navigation, handover code, earnings | Expo SDK 57 / React Native, Expo Router |
| `apps/admin` | Admin dashboard: analytics, bookings, CRM, memberships, hubs, push campaigns, promos | React 19, Vite, Recharts |

- Architecture and scope: [`docs/PLAN.md`](docs/PLAN.md)
- **What you need to provide before launch** (keys, accounts, store listings): [`docs/LAUNCH.md`](docs/LAUNCH.md)

## Features

**Customers (app and website)**
- Sign in with phone (SMS code), email (emailed code), Google, or Apple (iOS)
- Saved vehicles; packages and add-ons; time slots; one-off, weekly or monthly bookings
- Car wash comes to a map pin, or book a slot at the nearest hub
- Card, Apple Pay, Google Pay (Stripe) or cash. Cards are authorized at booking and charged on completion
- Live washer tracking, status notifications, 4-digit handover code
- Memberships (monthly subscription with included washes and add-on discount), promo codes, referral codes, loyalty points (earn and redeem)
- Ratings, reviews and tips; account deletion

**Washers**
- Online/offline, live job alerts, nearest jobs first, accept/decline
- Navigate (Google Maps / Apple Maps), call customer, live GPS sharing
- Handover code check before starting, cash collection
- Earnings by day/week/month: share of job value, tips, cash held, payout

**Admin**
- Revenue (daily, monthly, membership MRR), peak hours, package mix, ratings, repeat-customer rate
- Live bookings table with cancel; customer CRM with segments; washers
- Membership plans and members; hubs; push campaigns by segment; promo codes

## Run it locally

Requirements: Node 22+, Docker (or any Postgres 16), and **Expo Go** on your phone (or a development build, see below).

```bash
# 1. Database
docker compose up -d db

# 2. API (http://localhost:4000)
cd apps/api
cp .env.example .env
npm install
npm run db:migrate && npm run db:seed
npm run dev

# 3. Customer website (http://localhost:5173)
cd apps/web && cp .env.example .env && npm install && npm run dev

# 4. Admin dashboard (http://localhost:5174), sign in with +27000000001
cd apps/admin && cp .env.example .env && npm install && npm run dev -- --port 5174

# 5. Mobile apps
cd apps/customer                 # or apps/washer
cp .env.example .env             # set EXPO_PUBLIC_API_URL to http://<your-computer-LAN-IP>:4000
npm install && npx expo start
```

With no keys in `.env`, everything runs in **dev mode**: payments are simulated, and sign-in codes are printed in the API log and shown in the app.

Demo accounts from the seed:

| Role | Phone |
|---|---|
| Admin | `+27000000001` |
| Washer | `+27000000002` |
| Customer | `+27000000003` (or sign up with any number or email) |

Promo code `WELCOME20` gives 20% off. Create a real admin with `cd apps/api && npm run create-admin -- +27821234567 "Your Name"`.

### Real payments locally

1. Put Stripe **test** keys in `apps/api/.env`.
2. `stripe listen --forward-to localhost:4000/webhooks/stripe` and paste the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Card bookings, tips and memberships now go through Stripe. Test card: `4242 4242 4242 4242`.

The mobile PaymentSheet and Apple sign-in need a **development build** rather than Expo Go: `npx eas-cli build --profile development` (or `npx expo run:ios` / `run:android` with Xcode / Android Studio).

## Tests

With Postgres running and the database seeded:

```bash
cd apps/api
npm run dev &           # in another terminal
npm run smoke           # 31 end-to-end checks: sign-up, booking, dispatch, tracking, OTP, payments, memberships, hubs, points, deletion
npm run test:webhooks   # Stripe webhook handling, offline with signed test events
```

CI (`.github/workflows/ci.yml`) runs both, plus builds of the website and admin, and typechecks and bundles both mobile apps on every pull request.

## How the core flows work

- **Sign-in**: phone or email → 6-digit code (Twilio / Resend, or logged in dev) → JWT. Codes expire after 10 minutes, 5 wrong tries, 30 s resend cooldown, per-IP limit. Google and Apple ID tokens are verified against their public keys; a matching verified email links to the existing account.
- **Booking status**: `pending → accepted → en_route → arrived → in_progress → completed` (or `cancelled`). Card jobs only reach washers once the card hold is confirmed. The first washer to accept wins (atomic update).
- **Pricing** (server-side): package + add-ons → membership coverage → promo code → loyalty points.
- **Handover code**: a 4-digit code only the customer sees; the washer must enter it to move from `arrived` to `in_progress`.
- **Live tracking**: the washer app sends GPS over Socket.IO every ~10 s / 25 m; the API relays it to the customer's booking room. Each status change sends an Expo push notification.
- **Payments**: PaymentIntent with manual capture at booking (saved for repeat bookings), captured when completed, released on cancel. Tips are separate payments recorded by webhook. Memberships are Stripe Billing subscriptions kept in sync by webhook.
- **Repeat bookings**: when a weekly/monthly wash completes, the next one is created and charged to the saved card off-session; if the bank asks for authentication, the customer gets a push to confirm in the app.
- **Earnings**: washer share (default 75%) of the job's full value, plus 100% of tips, minus cash they already hold.

## Deploying

- **API**: `apps/api/Dockerfile` runs the migration and starts the server. Any container host with Postgres works (Render, Railway, Fly.io, AWS). Set the variables from `apps/api/.env.example`.
- **Website and admin**: static builds (`npm run build` → `dist/`). Host on Netlify, Vercel or Cloudflare Pages with `VITE_API_URL` set, and a fallback to `index.html` for client-side routes.
- **Mobile apps**: `npx eas-cli build --platform all` then `npx eas-cli submit`.

## Not built yet

Washer background location (needs `expo-task-manager` in a dev build), automatic washer assignment by distance (washers currently pick from a nearest-first list), Stripe Connect payouts to washers, before/after photos, CSV exports, and multi-language support.
