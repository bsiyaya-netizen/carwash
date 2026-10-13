import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { bookingDetail, cancelBooking, createBooking, listBookings } from '../bookings.js';
import { one, query } from '../db.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { createTip, resumeBookingPayment } from '../payments.js';
import { quote } from '../pricing.js';

export const bookingsRouter = Router();

const quoteSchema = z.object({
  packageId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).default([]),
  promoCode: z.string().nullish(),
  redeemPoints: z.number().int().min(0).default(0),
});

bookingsRouter.post('/quote', requireAuth('customer'), async (req, res) => {
  const q = quoteSchema.parse(req.body);
  res.json(await quote({ ...q, userId: me(req).id }));
});

const createSchema = quoteSchema.extend({
  vehicleId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  recurrence: z.enum(['none', 'weekly', 'monthly']).default('none'),
  hubId: z.string().uuid().nullish(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().default(''),
  notes: z.string().default(''),
  paymentMethod: z.enum(['card', 'cash']),
});

bookingsRouter.post('/', requireAuth('customer'), async (req, res) => {
  const body = createSchema.parse(req.body);
  if (new Date(body.scheduledAt).getTime() < Date.now() - 5 * 60 * 1000) throw badRequest('That time slot has passed');
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

/** Card step not finished (app closed, card declined, or a repeat booking needing confirmation): get a fresh payment sheet. */
bookingsRouter.post('/:id/pay', requireAuth('customer'), async (req, res) => {
  const b = await one(
    `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND payment_method = 'card' AND payment_status IN ('unpaid','failed') AND status = 'pending'`,
    [req.params.id, me(req).id],
  );
  if (!b?.payment_intent_id) throw badRequest('This booking does not need payment');
  res.json({ payment: await resumeBookingPayment(b.payment_intent_id, me(req).id) });
});

bookingsRouter.post('/:id/cancel', requireAuth('customer', 'admin'), async (req, res) => {
  res.json(await cancelBooking(String(req.params.id), me(req)));
});

const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(2000).default('') });

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

const tipSchema = z.object({ amountCents: z.number().int().min(100).max(100000) });

bookingsRouter.post('/:id/tip', requireAuth('customer'), async (req, res) => {
  const { amountCents } = tipSchema.parse(req.body);
  const b = await one(`SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'completed'`, [req.params.id, me(req).id]);
  if (!b) throw badRequest('You can tip once the wash is completed');
  const payment = await createTip(b.id, me(req).id, amountCents);
  res.json({ payment, booking: await bookingDetail(b.id, me(req)) });
});

/** Saved locations from past bookings, for one-tap rebooking. */
bookingsRouter.get('/meta/places', requireAuth('customer'), async (req, res) => {
  res.json(await query(
    `SELECT DISTINCT ON (address) address, lat, lng FROM bookings
     WHERE customer_id = $1 AND hub_id IS NULL AND address <> '' ORDER BY address, created_at DESC LIMIT 10`,
    [me(req).id],
  ));
});
