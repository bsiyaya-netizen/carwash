import { randomInt } from 'node:crypto';
import { one, query } from './db.js';
import { badRequest } from './errors.js';
import { authorizeBooking, authorizeOffSession, cancelCard, captureCard, type PaymentSheetParams } from './payments.js';
import { quote } from './pricing.js';
import { emit } from './realtime.js';
import { pushToUsers } from './push.js';
import type { AuthUser } from './auth.js';

export const ACTIVE_STATUSES = ['accepted', 'en_route', 'arrived', 'in_progress'];

/** A booking can be offered to washers once payment is secured (or it is cash). */
export const DISPATCHABLE_SQL = `(b.payment_method = 'cash' OR b.payment_status IN ('authorized','paid'))`;

const DETAIL_SQL = `
  SELECT b.*,
    json_build_object('id', p.id, 'name', p.name, 'duration_min', p.duration_min) AS package,
    (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name)), '[]')
       FROM packages a WHERE a.id = ANY(b.addon_ids)) AS addons,
    json_build_object('make', v.make, 'model', v.model, 'color', v.color, 'plate', v.plate) AS vehicle,
    json_build_object('id', c.id, 'name', c.name, 'phone', c.phone) AS customer,
    CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object(
      'id', w.id, 'name', w.name, 'phone', w.phone, 'lat', w.last_lat, 'lng', w.last_lng,
      'rating', (SELECT round(avg(rating)::numeric, 1) FROM reviews r WHERE r.washer_id = w.id)) END AS washer,
    CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('id', h.id, 'name', h.name, 'address', h.address, 'phone', h.phone) END AS hub,
    (SELECT row_to_json(r) FROM reviews r WHERE r.booking_id = b.id) AS review
  FROM bookings b
  JOIN packages p ON p.id = b.package_id
  JOIN vehicles v ON v.id = b.vehicle_id
  JOIN users c ON c.id = b.customer_id
  LEFT JOIN users w ON w.id = b.washer_id
  LEFT JOIN hubs h ON h.id = b.hub_id`;

/** Full booking for display. The handover OTP is only ever shown to the customer. */
export async function bookingDetail(id: string, viewer?: AuthUser) {
  const b = await one(`${DETAIL_SQL} WHERE b.id = $1`, [id]);
  if (b && viewer?.role !== 'customer') delete b.handover_otp;
  return b;
}

export async function listBookings(where: string, params: unknown[], viewer: AuthUser, opts: { limit?: number; orderBy?: string; select?: string } = {}) {
  const sql = `SELECT * FROM (${DETAIL_SQL.replace('SELECT b.*,', `SELECT b.*, ${opts.select ? `${opts.select},` : ''}`)} WHERE ${where}) x
    ORDER BY ${opts.orderBy ?? 'scheduled_at DESC'} LIMIT ${opts.limit ?? 100}`;
  const rows = await query(sql, params);
  if (viewer.role !== 'customer') rows.forEach((r) => delete r.handover_otp);
  return rows;
}

export const newOtp = () => String(randomInt(0, 10000)).padStart(4, '0');

export interface CreateBookingInput {
  customerId: string;
  vehicleId: string;
  packageId: string;
  addonIds: string[];
  scheduledAt: string;
  recurrence: 'none' | 'weekly' | 'monthly';
  hubId?: string | null;
  lat?: number;
  lng?: number;
  address: string;
  notes: string;
  promoCode?: string | null;
  redeemPoints?: number;
  paymentMethod: 'card' | 'cash';
  /** Recurring follow-ups charge the saved card without the customer present. */
  offSession?: boolean;
}

export async function createBooking(input: CreateBookingInput): Promise<{ booking: any; payment: PaymentSheetParams | null }> {
  let { lat, lng, address } = input;
  if (input.hubId) {
    const hub = await one('SELECT * FROM hubs WHERE id = $1 AND active', [input.hubId]);
    if (!hub) throw badRequest('Unknown hub');
    ({ lat, lng } = hub);
    address = `${hub.name}, ${hub.address}`;
  }
  if (lat == null || lng == null) throw badRequest('Pin a location or choose a hub');

  const q = await quote({ userId: input.customerId, packageId: input.packageId, addonIds: input.addonIds, promoCode: input.promoCode, redeemPoints: input.redeemPoints });
  if (q.pointsRedeemed) {
    const ok = await one('UPDATE users SET loyalty_points = loyalty_points - $2 WHERE id = $1 AND loyalty_points >= $2 RETURNING id', [input.customerId, q.pointsRedeemed]);
    if (!ok) throw badRequest('Not enough loyalty points');
  }
  const free = q.totalCents === 0;
  const paymentMethod = free && q.membershipId ? 'membership' : input.paymentMethod;

  const row = await one(
    `INSERT INTO bookings (customer_id, vehicle_id, package_id, addon_ids, scheduled_at, recurrence, hub_id, lat, lng, address, notes,
       subtotal_cents, membership_id, membership_discount_cents, discount_cents, promo_code, points_redeemed, points_discount_cents,
       total_cents, payment_method, payment_status, handover_otp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
    [input.customerId, input.vehicleId, input.packageId, input.addonIds, input.scheduledAt, input.recurrence, input.hubId ?? null,
     lat, lng, address, input.notes, q.subtotalCents, q.membershipId, q.membershipDiscountCents, q.discountCents, q.promoCode,
     q.pointsRedeemed, q.pointsDiscountCents, q.totalCents, paymentMethod, free ? 'paid' : 'unpaid', newOtp()],
  );
  if (q.promoCode) await query('UPDATE promo_codes SET uses = uses + 1 WHERE code = $1', [q.promoCode]);

  let payment: PaymentSheetParams | null = null;
  if (!free && paymentMethod === 'card') {
    if (input.offSession) {
      const ok = await authorizeOffSession(row.id, input.customerId, q.totalCents);
      if (!ok) {
        await pushToUsers([input.customerId], {
          title: 'Confirm your next wash',
          body: 'We could not charge your saved card for your repeat booking. Open the app to confirm payment.',
          data: { bookingId: row.id },
        });
      }
    } else {
      payment = await authorizeBooking(row.id, input.customerId, q.totalCents);
    }
  }
  await dispatchIfReady(row.id);
  return { booking: await bookingDetail(row.id, { id: input.customerId, role: 'customer' }), payment };
}

/** Offer the job to online washers once it is payable. Called again by the Stripe webhook after card authorization. */
export async function dispatchIfReady(bookingId: string) {
  const ready = await one(`SELECT b.id FROM bookings b WHERE b.id = $1 AND b.status = 'pending' AND ${DISPATCHABLE_SQL}`, [bookingId]);
  const booking = await bookingDetail(bookingId);
  emit('admins', 'booking:updated', booking);
  if (!ready) return;
  emit('washers', 'job:new', booking);
  const washers = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'washer' AND is_online AND deleted_at IS NULL`);
  await pushToUsers(washers.map((w) => w.id), {
    title: 'New wash request',
    body: `${booking.package.name} at ${booking.address || 'pinned location'}`,
    data: { bookingId },
  });
}

export async function cancelBooking(bookingId: string, actor: AuthUser) {
  const b = await one(
    `UPDATE bookings SET status = 'cancelled'
     WHERE id = $1 AND status IN ('pending','accepted') AND ($2::boolean OR customer_id = $3) RETURNING *`,
    [bookingId, actor.role === 'admin', actor.id],
  );
  if (!b) throw badRequest('Booking cannot be cancelled now');
  if (b.payment_intent_id) await cancelCard(b.payment_intent_id);
  if (b.points_redeemed) await query('UPDATE users SET loyalty_points = loyalty_points + $2 WHERE id = $1', [b.customer_id, b.points_redeemed]);
  if (b.payment_method === 'card' && b.payment_status === 'authorized') {
    await query(`UPDATE bookings SET payment_status = 'unpaid' WHERE id = $1`, [b.id]);
  }
  return announce(b.id);
}

export async function completeBooking(b: any) {
  if (b.payment_method === 'card' && b.payment_intent_id && b.payment_status === 'authorized') {
    await captureCard(b.payment_intent_id, b.total_cents);
    await query(`UPDATE bookings SET payment_status = 'paid' WHERE id = $1`, [b.id]);
  }
  // 1 loyalty point per whole currency unit paid.
  const award = await one('UPDATE bookings SET points_awarded = true WHERE id = $1 AND NOT points_awarded RETURNING total_cents', [b.id]);
  if (award) await query('UPDATE users SET loyalty_points = loyalty_points + $2 WHERE id = $1', [b.customer_id, Math.floor(award.total_cents / 100)]);

  if (b.recurrence !== 'none') {
    const next = new Date(b.scheduled_at);
    if (b.recurrence === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    const vehicle = await one('SELECT id FROM vehicles WHERE id = $1', [b.vehicle_id]);
    const customer = await one('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [b.customer_id]);
    if (vehicle && customer) {
      await createBooking({
        customerId: b.customer_id, vehicleId: b.vehicle_id, packageId: b.package_id, addonIds: b.addon_ids,
        scheduledAt: next.toISOString(), recurrence: b.recurrence, hubId: b.hub_id, lat: b.lat, lng: b.lng, address: b.address,
        notes: b.notes, paymentMethod: b.payment_method === 'cash' ? 'cash' : 'card', offSession: true,
      });
    }
  }
}

const STATUS_COPY: Record<string, string> = {
  accepted: 'A washer accepted your booking',
  en_route: 'Your washer is on the way',
  arrived: 'Your washer has arrived. Share your handover code to start.',
  in_progress: 'Your wash has started',
  completed: 'All done! Rate your wash.',
  cancelled: 'Your booking was cancelled',
};

/** Broadcast a booking change to everyone watching it and notify the customer. */
export async function announce(bookingId: string) {
  const b = await bookingDetail(bookingId);
  emit(`booking:${bookingId}`, 'booking:updated', b);
  emit(`user:${b.customer_id}`, 'booking:updated', b);
  emit('admins', 'booking:updated', b);
  if (STATUS_COPY[b.status]) {
    await pushToUsers([b.customer_id], { title: 'Car wash update', body: STATUS_COPY[b.status], data: { bookingId } });
  }
  return b;
}
