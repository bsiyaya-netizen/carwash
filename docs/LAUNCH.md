# Launch checklist: what only you can provide

Everything below is an account, key or decision that has to come from the business owner. The code is already wired for each one; you only paste the value into the `.env` file or app config named in each row.

## 1. Accounts and keys

| What | Why | Where to get it | Where it goes |
|---|---|---|---|
| **Stripe account** (live + test keys) | Card, Apple Pay and Google Pay payments, memberships | dashboard.stripe.com → Developers → API keys | `apps/api/.env`: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` |
| **Stripe webhook secret** | Confirms payments, tips and membership renewals | Stripe → Developers → Webhooks → add endpoint `https://<api-domain>/webhooks/stripe` with events `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` | `STRIPE_WEBHOOK_SECRET` |
| **Stripe membership prices** | Monthly billing for each plan | Stripe → Product catalogue → add a product per plan with a *recurring monthly* price | Paste each `price_…` ID into Admin → Memberships |
| **Twilio account** (or another SMS provider) | Sends sign-in codes by SMS | twilio.com → Console: Account SID, Auth Token, and a sender number or Messaging Service | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| **Resend account** + a verified domain | Sends sign-in codes by email | resend.com → API keys, then verify your sending domain | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| **Google Cloud project** | Google sign-in, Google Maps on Android/iOS | console.cloud.google.com → Credentials: OAuth client IDs for Web, iOS (`com.example.carwash.customer`) and Android; Maps SDK for Android and iOS keys | API: `GOOGLE_CLIENT_IDS` (all three, comma-separated). App: `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` in `apps/customer/.env`, Maps keys in `apps/customer/app.json` and `apps/washer/app.json` |
| **Apple Developer account** ($99/year) | App Store, Sign in with Apple, Apple Pay | developer.apple.com: register the bundle IDs, enable *Sign in with Apple*, create Apple Pay merchant ID `merchant.com.example.carwash`, upload the Stripe Apple Pay certificate | `APPLE_AUDIENCES` (bundle ID) |
| **Google Play Console** ($25 once) | Play Store listing | play.google.com/console | — |
| **Expo account** | Cloud builds (EAS), push notifications | expo.dev → create the two projects | Run `npx eas-cli init` in each app; it writes the `projectId` |
| **Domain names** | Website, API | Any registrar | e.g. `sparklewash.co.za` (website) and `api.sparklewash.co.za` |
| **Hosting** | Run the API, database and websites | API + Postgres: Render, Railway, Fly.io or AWS. Websites: Netlify, Vercel or Cloudflare Pages | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`; websites need `VITE_API_URL` |
| **Map tiles for the website** | The website maps use OpenStreetMap's free tiles, which are not meant for production traffic | MapTiler, Stadia Maps or Mapbox | Swap the `TILES` URL in `apps/web/src/components/Maps.tsx` |

## 2. Rename before you publish

- App names, bundle IDs and package names: `com.example.carwash.customer` / `.washer` in both `app.json` files (and `APPLE_AUDIENCES`, the Stripe merchant ID). They cannot be changed after the first store release.
- "Sparkle Wash" is a placeholder brand. Search and replace it, and swap `apps/*/assets` icons and the website logo.

## 3. Business decisions in config

| Setting | Default | Where |
|---|---|---|
| Currency | ZAR (R) | `CURRENCY` in the API; the `money()` helper in each app |
| Washer share of job value | 75% (tips 100% to washer) | `WASHER_SHARE` |
| Loyalty point value | 100 points = R10 | `POINT_VALUE_CENTS` |
| Referral bonus | 100 points each | `REFERRAL_BONUS_POINTS` in `apps/api/src/routes/auth.ts` |
| Packages, add-ons, prices | Seeded examples | `apps/api/src/seed.ts`, then the database |
| Membership plans | Weekly Shine R449, Valet Club R899 | Admin → Memberships |
| Hubs | Three example locations | Admin → Hubs (delete or hide the examples) |
| Booking hours | 08:00–17:00, next 7 days | `/slots` in `apps/api/src/routes/customer.ts` |

## 4. Legal pages

Replace the placeholder Terms and Privacy pages in `apps/web/src/pages/Legal.tsx`. Both app stores require a privacy policy URL and in-app account deletion (already built: Account → Delete account).

## 5. Go-live switches

- `DEV_RETURN_LOGIN_CODE=false` (otherwise sign-in codes are shown in the app).
- A long random `JWT_SECRET`.
- `CORS_ORIGINS=https://sparklewash.co.za,https://admin.sparklewash.co.za`.
- Stripe live keys instead of test keys, and a live-mode webhook.
- Create your real admin: `cd apps/api && npm run create-admin -- +27821234567 "Your Name"`, then remove the seeded demo users (+27000000001 to 3).
