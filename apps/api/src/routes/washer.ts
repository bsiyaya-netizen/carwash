import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { ACTIVE_STATUSES, announce, bookingDetail, createBooking, listBookings } from '../bookings.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { badRequest, HttpError } from '../errors.js';
import { captureCard } from '../payments.js';
import { emit } from '../realtime.js';

export const washerRouter = Router();
washerRouter.use(requireAuth('washer'));

washerRouter.post('/online', async (req, res) => {
  const online = z.boolean().parse(req.body.online);
  res.json(await one('UPDATE users SET is_online = $2 WHERE id = $1 RETURNING id, is_online', [me(req).id, online]));
});

/** Open jobs this washer hasn't declined, soonest first. */
washerRouter.get('/jobs/available', async (req, res) => {
  res.json(await listBookings(
    `b.status = 'pending' AND b.washer_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM job_declines d WHERE d.booking_id = b.id AND d.washer_id = $1)`,
    [me(req).id], me(req),
  ));
});

washerRouter.get('/jobs', async (req, res) => {
  res.json(await listBookings('b.washer_id = $1', [me(req).id], me(req)));
});

washerRouter.post('/jobs/:id/accept', async (req, res) => {
  const u = me(req);
  const busy = await one(`SELECT id FROM bookings WHERE washer_id = $1 AND status = ANY($2)`, [u.id, ACTIVE_STATUSES]);
  if (busy) throw badRequest('Finish your current job first');
  // Atomic: only one washer can win the job.
  const b = await one(
    `UPDATE bookings SET washer_id = $2, status = 'accepted', accepted_at = now()
     WHERE id = $1 AND status = 'pending' AND washer_id IS NULL RETURNING id`,
    [req.params.id, u.id],
  );
  if (!b) throw new HttpError(409, 'Job already taken');
  emit('washers', 'job:taken', { bookingId: b.id });
  await announce(b.id);
  res.json(await bookingDetail(b.id, u));
});

washerRouter.post('/jobs/:id/decline', async (req, res) => {
  await query('INSERT INTO job_declines (booking_id, washer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, me(req).id]);
  res.status(204).end();
});

// Allowed transitions the washer drives directly. arrived -> in_progress goes through /start (OTP).
const NEXT: Record<string, string> = { en_route: 'accepted', arrived: 'en_route', completed: 'in_progress' };

washerRouter.post('/jobs/:id/status', async (req, res) => {
  const status = z.enum(['en_route', 'arrived', 'completed']).parse(req.body.status);
  const u = me(req);
  const b = await one(
    `UPDATE bookings SET status = $3, completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END
     WHERE id = $1 AND washer_id = $2 AND status = $4 RETURNING *`,
    [req.params.id, u.id, status, NEXT[status]],
  );
  if (!b) throw badRequest(`Job must be "${NEXT[status]}" to move to "${status}"`);
  if (status === 'completed') await onCompleted(b);
  await announce(b.id);
  res.json(await bookingDetail(b.id, u));
});

washerRouter.post('/jobs/:id/start', async (req, res) => {
  const otp = z.string().length(4).parse(req.body.otp);
  const u = me(req);
  const b = await one(`SELECT * FROM bookings WHERE id = $1 AND washer_id = $2`, [req.params.id, u.id]);
  if (!b || b.status !== 'arrived') throw badRequest('Mark yourself as arrived first');
  if (b.handover_otp !== otp) throw new HttpError(401, 'Handover code does not match. Ask the customer to check their app.');
  await query(`UPDATE bookings SET status = 'in_progress', otp_verified_at = now() WHERE id = $1`, [b.id]);
  await announce(b.id);
  res.json(await bookingDetail(b.id, u));
});

washerRouter.post('/jobs/:id/cash-collected', async (req, res) => {
  const b = await one(
    `UPDATE bookings SET payment_status = 'paid'
     WHERE id = $1 AND washer_id = $2 AND payment_method = 'cash' AND status = 'completed' RETURNING id`,
    [req.params.id, me(req).id],
  );
  if (!b) throw badRequest('Only completed cash jobs can be marked as collected');
  res.json(await announce(b.id));
});

async function onCompleted(b: any) {
  if (b.payment_method === 'card' && b.payment_intent_id) {
    await captureCard(b.payment_intent_id, b.total_cents);
    await query(`UPDATE bookings SET payment_status = 'paid' WHERE id = $1`, [b.id]);
  }
  // 1 loyalty point per whole currency unit spent.
  await query('UPDATE users SET loyalty_points = loyalty_points + $2 WHERE id = $1', [b.customer_id, Math.floor(b.total_cents / 100)]);
  if (b.recurrence !== 'none') {
    const next = new Date(b.scheduled_at);
    if (b.recurrence === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    await createBooking({
      customerId: b.customer_id, vehicleId: b.vehicle_id, packageId: b.package_id, addonIds: b.addon_ids,
      scheduledAt: next.toISOString(), recurrence: b.recurrence, lat: b.lat, lng: b.lng, address: b.address,
      notes: b.notes, promoCode: null, paymentMethod: b.payment_method,
    });
  }
}

const PERIODS = { day: '1 day', week: '7 days', month: '30 days' } as const;

washerRouter.get('/earnings', async (req, res) => {
  const period = z.enum(['day', 'week', 'month']).default('week').parse(req.query.period);
  const u = me(req);
  const summary = await one(
    `SELECT count(*)::int AS jobs,
       coalesce(sum(total_cents), 0)::int AS gross_cents,
       coalesce(sum(tip_cents), 0)::int AS tips_cents,
       coalesce(sum(CASE WHEN payment_method = 'cash' THEN total_cents ELSE 0 END), 0)::int AS cash_collected_cents
     FROM bookings WHERE washer_id = $1 AND status = 'completed' AND completed_at > now() - $2::interval`,
    [u.id, PERIODS[period]],
  );
  const shareCents = Math.round(summary.gross_cents * config.washerShare);
  const daily = await query(
    `SELECT to_char(date_trunc('day', completed_at), 'YYYY-MM-DD') AS day, count(*)::int AS jobs,
       sum(total_cents)::int AS gross_cents, sum(tip_cents)::int AS tips_cents
     FROM bookings WHERE washer_id = $1 AND status = 'completed' AND completed_at > now() - $2::interval
     GROUP BY 1 ORDER BY 1`,
    [u.id, PERIODS[period]],
  );
  const rating = await one('SELECT round(avg(rating)::numeric, 1)::float AS avg, count(*)::int AS count FROM reviews WHERE washer_id = $1', [u.id]);
  res.json({
    period,
    washerShare: config.washerShare,
    ...summary,
    share_cents: shareCents,
    // Payout = share + tips, minus cash the washer already holds.
    payout_cents: shareCents + summary.tips_cents - summary.cash_collected_cents,
    daily,
    rating,
  });
});
