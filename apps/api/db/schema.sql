-- Mobile car wash schema. Idempotent: safe to re-run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            text NOT NULL CHECK (role IN ('customer','washer','admin')),
  name            text NOT NULL,
  phone           text NOT NULL UNIQUE,
  email           text UNIQUE,
  push_token      text,
  loyalty_points  integer NOT NULL DEFAULT 0,
  referral_code   text NOT NULL UNIQUE,
  referred_by     uuid REFERENCES users(id),
  is_online       boolean NOT NULL DEFAULT false,
  last_lat        double precision,
  last_lng        double precision,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_codes (
  phone       text PRIMARY KEY,
  code        text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make        text NOT NULL,
  model       text NOT NULL,
  color       text NOT NULL,
  plate       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text NOT NULL,
  price_cents   integer NOT NULL,
  duration_min  integer NOT NULL,
  is_addon      boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS promo_codes (
  code            text PRIMARY KEY,
  percent_off     integer CHECK (percent_off BETWEEN 1 AND 100),
  amount_off_cents integer,
  max_uses        integer,
  uses            integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES users(id),
  washer_id        uuid REFERENCES users(id),
  vehicle_id       uuid NOT NULL REFERENCES vehicles(id),
  package_id       uuid NOT NULL REFERENCES packages(id),
  addon_ids        uuid[] NOT NULL DEFAULT '{}',
  scheduled_at     timestamptz NOT NULL,
  recurrence       text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly')),
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  address          text NOT NULL DEFAULT '',
  notes            text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','en_route','arrived','in_progress','completed','cancelled')),
  subtotal_cents   integer NOT NULL,
  discount_cents   integer NOT NULL DEFAULT 0,
  tip_cents        integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL,
  promo_code       text REFERENCES promo_codes(code),
  payment_method   text NOT NULL CHECK (payment_method IN ('card','cash')),
  payment_status   text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','authorized','paid','refunded')),
  payment_intent_id text,
  handover_otp     text NOT NULL,
  otp_verified_at  timestamptz,
  accepted_at      timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_washer_idx ON bookings(washer_id);

CREATE TABLE IF NOT EXISTS job_declines (
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  washer_id   uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (booking_id, washer_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  booking_id  uuid PRIMARY KEY REFERENCES bookings(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  washer_id   uuid NOT NULL REFERENCES users(id),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  segment     text NOT NULL,
  sent_count  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
