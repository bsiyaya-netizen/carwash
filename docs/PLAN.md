# Mobile Car Wash Platform: Architecture and MVP Plan

## 1. Products

| App | Users | Tech |
|---|---|---|
| Customer app | Car owners | Expo (React Native), iOS + Android |
| Washer app | Service providers | Expo (React Native), iOS + Android |
| Admin dashboard | Operations team | React + Vite (web) |
| Customer website | Car owners on the web | React + Vite, Leaflet maps |
| API | All of the above | Node.js 22 + TypeScript + Express, Postgres 16, Socket.IO |

Third parties: **Stripe** (cards, Apple Pay, Google Pay via PaymentSheet), **Google Maps** (map tiles, geocoding, directions deep-links), **Expo Push** (notifications), an SMS provider such as **Twilio Verify** for login codes (stubbed in dev).

```
 Customer app ─┐                       ┌─ Stripe (payments + webhooks)
               ├── REST + Socket.IO ── API ── Postgres
 Washer app ───┤                       ├─ Expo Push (notifications)
 Admin web ────┘                       └─ SMS provider (login codes)
```

## 2. Core domain

- **User**: role `customer | washer | admin`, phone (primary login), optional email, loyalty points, referral code.
- **Vehicle**: make, model, color, license plate; many per customer.
- **Package**: exterior, interior, full detail; add-ons (wax, engine bay, etc.). Prices stored in cents.
- **Booking**: customer, vehicle, package + add-ons, time slot, location pin (lat/lng + address), recurrence (`none | weekly | monthly`), price breakdown (subtotal, discount, tip, total), payment method (`card | cash`), payment status, **handover OTP**, assigned washer.
- **Booking status machine**:
  `pending → accepted → en_route → arrived → in_progress → completed`
  (`cancelled` from pending/accepted). `arrived → in_progress` requires the washer to enter the customer's 4-digit OTP.
- **Review**: one per booking, 1 to 5 stars + comment, feeds washer rating.
- **Promo code**: percent or fixed amount off, optional max uses.
- **Campaign**: admin push notification to a customer segment (all, repeat, inactive).

## 3. Key flows

1. **Sign up / sign in**: phone number → 6-digit SMS code → JWT. New users give a name and optional referral code. (Email and Google/Apple sign-in are phase 2.)
2. **Booking**: pick vehicle → package + add-ons → time slot (or "repeat weekly/monthly") → drop a pin on the map → apply promo → choose card or cash → confirm. API computes price server-side.
3. **Dispatch**: new booking is broadcast to online washers (socket + push). First washer to accept wins (atomic `UPDATE ... WHERE washer_id IS NULL`). Declines hide the job for that washer.
4. **Tracking**: washer app streams GPS every ~10 s while `en_route`; customer app subscribes to the booking room and moves the washer marker live. Each status change pushes a notification.
5. **Handover OTP**: customer app shows a 4-digit code; washer enters it on arrival to start the wash. Prevents a washer starting (and later charging for) a job without the owner present.
6. **Payment**: card → Stripe PaymentIntent created at booking, captured on completion; cash → washer marks collected. Tips added after completion.
7. **Completion**: customer rates the washer, earns loyalty points (1 point per R1 / $1 spent), recurring bookings auto-create the next occurrence.
8. **Earnings**: washer sees day/week/month totals: jobs, gross, their share (default 75%), tips (100% to washer).
9. **Admin**: revenue by day and month, bookings by hour of day (peak hours), average rating, repeat-customer rate, customer list with booking counts and spend, push campaigns.

## 4. Scope: built vs. still to do

| Feature from brief | Built | Still to do |
|---|---|---|
| Registration & profile, saved vehicles | Phone and email codes, Google, Apple, profile, vehicles, account deletion | |
| Booking & scheduling | Packages, add-ons, time slots, weekly/monthly repeat (auto-charged) | Slot capacity per area |
| GPS & location | Map pin (app + website), hub finder sorted by distance | |
| Real-time tracking | Socket.IO status + live washer location, push notifications | ETA from a directions API; background location |
| Payments | Stripe PaymentSheet (app) and Payment Element (web): card, Apple Pay, Google Pay; cash; webhooks | Refund tooling in admin |
| Subscriptions & loyalty | Memberships on Stripe Billing, promo codes, referrals, points earn + redeem | |
| Reviews & ratings | Stars + comment, tips | Photos, dispute flow |
| Washer job queue | Live alerts, nearest first, accept/decline | Auto-assignment |
| In-app navigation | Navigate hand-off to Google/Apple Maps | Embedded turn-by-turn |
| OTP handover | Required to start the wash | Before/after photos |
| Earnings | Day/week/month: share, tips, cash held, payout | Stripe Connect payouts |
| Admin analytics | Revenue, MRR, peak hours, packages, rating, repeat rate | CSV export |
| Admin CRM | Customers, segments, push campaigns, promos, memberships, hubs | Email/SMS campaigns |
| Website | Landing page, pricing, memberships, hubs, FAQ, web booking, tracking, account | Blog / SEO pages |

## 5. Launch

Everything that needs an account or key from the business owner is listed in [`LAUNCH.md`](LAUNCH.md).

## 6. Things to decide

- Launch market and currency (scaffold uses `ZAR` by default, set `CURRENCY` in `.env`).
- Washer commission split (scaffold default 75%).
- SMS provider for login codes.
- Whether washers are employees (fixed dispatch) or marketplace contractors (accept/decline, as built).
