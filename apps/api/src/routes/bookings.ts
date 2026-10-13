import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { announce, bookingDetail, createBooking, listBookings } from '../bookings.js';
import { one, query } from '../db.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { cancelCard, chargeTip } from '../payments.js';
import { quote } from '../pricing.js';

export const bookingsRouter = Router();

const quoteSchema = z.object({
  packageId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).default([]),
  promoCode: z.string().nullish(),
});

bookingsRouter.post('/quote', requireAuth('customer'), async (req, res) => {
  const q = quoteSchema.parse(req.body);
  res.json(await quote(q.packageId, q.addonIds, q.promoCode));
});

const createSchema = quoteSchema.extend({
  vehicleId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  recurrence: z.enum(['none', 'weekly', 'monthly']).default('none'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().default(''),
  notes: z.string().default(''),
  paymentMethod: z.enum(['card', 'cash']),
});

bookingsRouter.post('/', requireAuth('customer'), async (req, res) => {
  const body = createSchema.parse(req.body);
  const vehicle = await one('SELECT id FROM vehicles WHERE id = $1 AND user_id = $2', [body.vehicleId, me(req).id]);
  if (!vehicle) throw badRequest('Unknown vehicle');
  res.status(201).json(await createBooking({ ...body, customerId: me(req).id }));
});

bookingsRouter.get('/', requireAuth('customer'), async (req, res) => {
  res.json(await listBookings('b.customer_id = $1', [me(req).id], me(req)));
});

bookingsRouter.get('/:id', requireAuth(), async (req, res) => {
  const b = await bookingDetail(String(req.params.id), me(req));
  if (!b) throw notFound();
  const u = me(req);
  if (u.role !== 'admin' && b.customer_id !== u.id && b.washer_id !== u.id && !(u.role === 'washer' && b.status === 'pending')) {
    throw forbidden();
  }
  res.json(b);
});

bookingsRouter.post('/:id/cancel', requireAuth('customer', 'admin'), async (req, res) => {
  const u = me(req);
  const b = await one(
    `UPDATE bookings SET status = 'cancelled'
     WHERE id = $1 AND status IN ('pending','accepted') AND ($2::boolean OR customer_id = $3) RETURNING *`,
    [req.params.id, u.role === 'admin', u.id],
  );
  if (!b) throw badRequest('Booking cannot be cancelled now');
  if (b.payment_intent_id) await cancelCard(b.payment_intent_id);
  res.json(await announce(b.id));
});

const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().default('') });

bookingsRouter.post('/:id/review', requireAuth('customer'), async (req, res) => {
  const r = reviewSchema.parse(req.body);
  const b = await one(`SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'completed'`, [req.params.id, me(req).id]);
  if (!b) throw badRequest('You can review a booking once it is completed');
  const review = await one(
    `INSERT INTO reviews (booking_id, customer_id, washer_id, rating, comment) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (booking_id) DO UPDATE SET rating = $4, comment = $5 RETURNING *`,
    [b.id, b.customer_id, b.washer_id, r.rating, r.comment],
  );
  res.status(201).json(review);
});

const tipSchema = z.object({ amountCents: z.number().int().min(100) });

bookingsRouter.post('/:id/tip', requireAuth('customer'), async (req, res) => {
  const { amountCents } = tipSchema.parse(req.body);
  const b = await one(`SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'completed'`, [req.params.id, me(req).id]);
  if (!b) throw badRequest('You can tip once the wash is completed');
  const { clientSecret } = await chargeTip(b.id, amountCents);
  await query('UPDATE bookings SET tip_cents = tip_cents + $2 WHERE id = $1', [b.id, amountCents]);
  res.json({ clientSecret, booking: await bookingDetail(b.id, me(req)) });
});
