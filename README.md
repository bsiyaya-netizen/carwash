# Sparkle Wash: mobile car wash platform (MVP)

Three apps on one API:

| Folder | What | Stack |
|---|---|---|
| `apps/api` | REST + real-time API | Node 22, TypeScript, Express 5, Postgres 16, Socket.IO, Stripe |
| `apps/customer` | Customer app (book, pin location, track, pay, rate) | Expo SDK 57 / React Native, Expo Router |
| `apps/washer` | Washer app (job queue, navigation, OTP handover, earnings) | Expo SDK 57 / React Native, Expo Router |
| `apps/admin` | Admin dashboard (analytics, bookings, CRM, push campaigns, promos) | React 19, Vite, Recharts |

Architecture, feature scope and roadmap: [`docs/PLAN.md`](docs/PLAN.md).

## Run it locally

Requirements: Node 22+, Docker (or any Postgres 16), and the **Expo Go** app on your phone.

```bash
# 1. Database
docker compose up -d

# 2. API
cd apps/api
cp .env.example .env
npm install
npm run db:migrate && npm run db:seed
npm run dev                      # http://localhost:4000

# 3. Admin dashboard (new terminal)
cd apps/admin
cp .env.example .env
npm install && npm run dev       # http://localhost:5173, sign in with +27000000001

# 4. Mobile apps (new terminal each)
cd apps/customer                 # or apps/washer
cp .env.example .env             # set EXPO_PUBLIC_API_URL to http://<your-computer-LAN-IP>:4000
npm install && npx expo start    # scan the QR code with Expo Go
```

Demo accounts from the seed (login codes are shown in the app and API log while `DEV_RETURN_LOGIN_CODE=true`):

| Role | Phone |
|---|---|
| Admin | `+27000000001` |
| Washer | `+27000000002` |
| Customer | `+27000000003` (or sign up with any number) |

Promo code `WELCOME20` gives 20% off.

## End-to-end test

With the API running and seeded:

```bash
cd apps/api && npm run smoke
```

It signs up a customer with a referral code, adds a vehicle, books a weekly Full Valet with a promo, checks the washer gets a live job alert, accepts it, streams the washer's location to the customer, rejects a wrong handover OTP, starts with the right one, completes (captures payment, awards loyalty points, creates next week's booking), reviews and tips, then checks washer earnings and the admin stats, CRM and campaigns.

## How the core flows work

- **Login**: phone number + 6-digit SMS code, JWT afterwards. SMS sending is a TODO in `apps/api/src/routes/auth.ts` (plug in Twilio Verify or similar), until then the code is returned to the app in dev.
- **Booking status**: `pending → accepted → en_route → arrived → in_progress → completed` (or `cancelled`). The first washer to accept wins; it's an atomic update.
- **Handover OTP**: every booking gets a 4-digit code that only the customer's app can see. The washer has to type it in to move from `arrived` to `in_progress`.
- **Live tracking**: the washer app sends GPS over Socket.IO every ~10 s / 25 m; the API relays it to the `booking:<id>` room the customer app is watching. Status changes also go out as Expo push notifications.
- **Payments**: card bookings create a Stripe PaymentIntent with manual capture when booked and capture it on completion, so no-shows are never charged. Without `STRIPE_SECRET_KEY` the API runs in mock mode. Cash bookings are marked collected by the washer.
- **Loyalty**: 1 point per R1 spent, 100 bonus points each for referrer and new user. Weekly/monthly bookings re-create themselves when completed.
- **Earnings**: washer share (default 75%, `WASHER_SHARE`) + 100% of tips, minus cash they already hold.

## Before going live

1. **Stripe in the app**: add `@stripe/stripe-react-native` to the customer app and confirm the `clientSecret` returned by `POST /bookings` with PaymentSheet (gives cards, Apple Pay, Google Pay). Add a webhook for `payment_intent.*`. Tips in Stripe mode should be recorded on webhook success rather than straight away.
2. **SMS** for login codes, and rate limiting on `/auth/request-code`.
3. **Google Maps API key** in each app's `app.json` (`android.config.googleMaps.apiKey`, `ios.config.googleMapsApiKey`) for production Android builds.
4. **Development builds** via EAS (`npx eas-cli build --profile development`) for push notifications and background location; Expo Go works for everything else.
5. **Push**: set an EAS `projectId` so `getExpoPushTokenAsync` returns tokens.
6. Set a strong `JWT_SECRET`, restrict CORS, put the API behind HTTPS.

## Not in the MVP yet

Email / Google / Apple sign-in, physical hub finder, paid memberships (Stripe Billing), points redemption, auto-dispatch by distance, embedded turn-by-turn, Stripe Connect payouts, before/after photos, CSV export. See `docs/PLAN.md` section 4.
