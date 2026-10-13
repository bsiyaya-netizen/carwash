import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { listBookings } from '../bookings.js';
import { one, query } from '../db.js';
import { notFound } from '../errors.js';
import { pushToUsers } from '../push.js';

export const adminRouter = Router();
adminRouter.use(requireAuth('admin'));

const PAID = `status = 'completed'`;

adminRouter.get('/stats', async (_req, res) => {
  const [today, month, totals, revenueByDay, revenueByMonth, peakHours, packages, quality, customers, members] = await Promise.all([
    one(`SELECT count(*)::int AS bookings, coalesce(sum(total_cents),0)::int AS revenue_cents
         FROM bookings WHERE ${PAID} AND completed_at >= date_trunc('day', now())`),
    one(`SELECT count(*)::int AS bookings, coalesce(sum(total_cents),0)::int AS revenue_cents
         FROM bookings WHERE ${PAID} AND completed_at >= date_trunc('month', now())`),
    one(`SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
           count(*) FILTER (WHERE status IN ('accepted','en_route','arrived','in_progress'))::int AS active,
           count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
           count(*)::int AS total
         FROM bookings`),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(sum(b.total_cents),0)::int AS revenue_cents, count(b.id)::int AS bookings
           FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
           LEFT JOIN bookings b ON b.${PAID} AND date_trunc('day', b.completed_at) = d
           GROUP BY d ORDER BY d`),
    query(`SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, sum(total_cents)::int AS revenue_cents, count(*)::int AS bookings
           FROM bookings WHERE ${PAID} AND completed_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`),
    query(`SELECT h AS hour, count(b.id)::int AS bookings
           FROM generate_series(0, 23) h
           LEFT JOIN bookings b ON extract(hour FROM b.scheduled_at) = h AND b.status <> 'cancelled'
           GROUP BY h ORDER BY h`),
    query(`SELECT p.name, count(b.id)::int AS bookings, coalesce(sum(b.total_cents),0)::int AS revenue_cents
           FROM packages p LEFT JOIN bookings b ON b.package_id = p.id AND b.${PAID}
           WHERE NOT p.is_addon GROUP BY p.name ORDER BY bookings DESC`),
    one(`SELECT round(avg(rating)::numeric, 2)::float AS avg_rating, count(*)::int AS reviews,
           count(*) FILTER (WHERE rating <= 2)::int AS low_ratings FROM reviews`),
    one(`SELECT count(*)::int AS customers,
           count(*) FILTER (WHERE n >= 2)::int AS repeat_customers
         FROM (SELECT u.id, count(b.id) AS n FROM users u
               LEFT JOIN bookings b ON b.customer_id = u.id AND b.${PAID}
               WHERE u.role = 'customer' AND u.deleted_at IS NULL GROUP BY u.id) t`),
    one(`SELECT count(*)::int AS active, coalesce(sum(p.price_cents), 0)::int AS mrr_cents
         FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
         WHERE m.status = 'active' AND m.current_period_end > now()`),
  ]);
  res.json({ today, month, totals, revenueByDay, revenueByMonth, peakHours, packages, quality, customers, members });
});

adminRouter.get('/bookings', async (req, res) => {
  const status = z.string().optional().parse(req.query.status);
  res.json(status
    ? await listBookings('b.status = $1', [status], me(req), { limit: 200 })
    : await listBookings('true', [], me(req), { limit: 200 }));
});

// Segments used by the CRM list and push campaigns.
const SEGMENTS = {
  all: 'true',
  repeat: 'completed_count >= 2',
  new: 'completed_count = 0',
  inactive: `last_booking_at < now() - interval '30 days'`,
} as const;

const CUSTOMERS_SQL = `
  SELECT * FROM (
    SELECT u.id, u.name, u.phone, u.email, u.loyalty_points, u.referral_code, u.created_at, u.push_token IS NOT NULL AS has_push,
      count(b.id) FILTER (WHERE b.status = 'completed')::int AS completed_count,
      coalesce(sum(b.total_cents) FILTER (WHERE b.status = 'completed'), 0)::int AS spend_cents,
      max(b.scheduled_at) AS last_booking_at,
      (SELECT count(*) FROM users r WHERE r.referred_by = u.id)::int AS referrals
    FROM users u LEFT JOIN bookings b ON b.customer_id = u.id
    WHERE u.role = 'customer' AND u.deleted_at IS NULL GROUP BY u.id
  ) c`;

adminRouter.get('/customers', async (req, res) => {
  const segment = z.enum(['all', 'repeat', 'new', 'inactive']).default('all').parse(req.query.segment);
  const search = z.string().default('').parse(req.query.q);
  res.json(await query(
    `${CUSTOMERS_SQL} WHERE ${SEGMENTS[segment]} AND (name ILIKE $1 OR coalesce(phone,'') ILIKE $1 OR coalesce(email,'') ILIKE $1)
     ORDER BY spend_cents DESC LIMIT 500`,
    [`%${search}%`],
  ));
});

adminRouter.get('/washers', async (_req, res) => {
  res.json(await query(
    `SELECT u.id, u.name, u.phone, u.is_online,
       count(b.id) FILTER (WHERE b.status = 'completed')::int AS jobs,
       (SELECT round(avg(rating)::numeric, 1)::float FROM reviews r WHERE r.washer_id = u.id) AS rating
     FROM users u LEFT JOIN bookings b ON b.washer_id = u.id
     WHERE u.role = 'washer' AND u.deleted_at IS NULL GROUP BY u.id ORDER BY jobs DESC`,
  ));
});

const campaignSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  segment: z.enum(['all', 'repeat', 'new', 'inactive']),
});

adminRouter.post('/campaigns', async (req, res) => {
  const c = campaignSchema.parse(req.body);
  const targets = await query<{ id: string }>(`${CUSTOMERS_SQL} WHERE ${SEGMENTS[c.segment]}`);
  const sent = await pushToUsers(targets.map((t) => t.id), { title: c.title, body: c.body });
  res.status(201).json(await one(
    'INSERT INTO campaigns (title, body, segment, sent_count) VALUES ($1,$2,$3,$4) RETURNING *',
    [c.title, c.body, c.segment, sent],
  ));
});

adminRouter.get('/campaigns', async (_req, res) => {
  res.json(await query('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50'));
});

const promoSchema = z.object({
  code: z.string().min(3).transform((s) => s.toUpperCase()),
  percentOff: z.number().int().min(1).max(100).optional(),
  amountOffCents: z.number().int().min(1).optional(),
  maxUses: z.number().int().min(1).optional(),
});

adminRouter.get('/promos', async (_req, res) => {
  res.json(await query('SELECT * FROM promo_codes ORDER BY code'));
});

adminRouter.post('/promos', async (req, res) => {
  const p = promoSchema.parse(req.body);
  res.status(201).json(await one(
    `INSERT INTO promo_codes (code, percent_off, amount_off_cents, max_uses) VALUES ($1,$2,$3,$4)
     ON CONFLICT (code) DO UPDATE SET percent_off = $2, amount_off_cents = $3, max_uses = $4, active = true RETURNING *`,
    [p.code, p.percentOff ?? null, p.amountOffCents ?? null, p.maxUses ?? null],
  ));
});

// --- Hubs -------------------------------------------------------------------
const hubSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().default(''),
  hours: z.string().default('Mon-Sat 08:00-17:00'),
  active: z.boolean().default(true),
});

adminRouter.get('/hubs', async (_req, res) => {
  res.json(await query(
    `SELECT h.*, (SELECT count(*)::int FROM bookings b WHERE b.hub_id = h.id AND b.status = 'completed') AS completed
     FROM hubs h ORDER BY h.name`,
  ));
});

adminRouter.post('/hubs', async (req, res) => {
  const h = hubSchema.parse(req.body);
  res.status(201).json(await one(
    'INSERT INTO hubs (name, address, lat, lng, phone, hours, active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [h.name, h.address, h.lat, h.lng, h.phone, h.hours, h.active],
  ));
});

adminRouter.put('/hubs/:id', async (req, res) => {
  const h = hubSchema.parse(req.body);
  const row = await one(
    'UPDATE hubs SET name=$2, address=$3, lat=$4, lng=$5, phone=$6, hours=$7, active=$8 WHERE id=$1 RETURNING *',
    [req.params.id, h.name, h.address, h.lat, h.lng, h.phone, h.hours, h.active],
  );
  if (!row) throw notFound();
  res.json(row);
});

// --- Membership plans -------------------------------------------------------
const planSchema = z.object({
  code: z.string().min(2).transform((s) => s.toLowerCase()),
  name: z.string().min(1),
  description: z.string().default(''),
  priceCents: z.number().int().min(0),
  washesPerPeriod: z.number().int().min(1),
  coveredPackageCodes: z.array(z.string()).min(1),
  addonDiscountPercent: z.number().int().min(0).max(100).default(0),
  stripePriceId: z.string().nullish(),
  active: z.boolean().default(true),
});

adminRouter.get('/plans', async (_req, res) => {
  res.json(await query(
    `SELECT p.*, (SELECT count(*)::int FROM memberships m WHERE m.plan_id = p.id AND m.status = 'active') AS members
     FROM membership_plans p ORDER BY p.price_cents`,
  ));
});

adminRouter.post('/plans', async (req, res) => {
  const p = planSchema.parse(req.body);
  res.status(201).json(await one(
    `INSERT INTO membership_plans (code, name, description, price_cents, washes_per_period, covered_package_codes, addon_discount_percent, stripe_price_id, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (code) DO UPDATE SET name=$2, description=$3, price_cents=$4, washes_per_period=$5, covered_package_codes=$6,
       addon_discount_percent=$7, stripe_price_id=$8, active=$9 RETURNING *`,
    [p.code, p.name, p.description, p.priceCents, p.washesPerPeriod, p.coveredPackageCodes, p.addonDiscountPercent, p.stripePriceId ?? null, p.active],
  ));
});

adminRouter.get('/memberships', async (_req, res) => {
  res.json(await query(
    `SELECT m.*, p.name AS plan_name, u.name AS customer_name, coalesce(u.phone, u.email) AS contact
     FROM memberships m JOIN membership_plans p ON p.id = m.plan_id JOIN users u ON u.id = m.user_id
     WHERE m.status <> 'canceled' ORDER BY m.created_at DESC LIMIT 500`,
  ));
});
