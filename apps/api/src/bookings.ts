import { randomInt } from 'node:crypto';
import { one, query } from './db.js';
import { authorizeCard } from './payments.js';
import { quote } from './pricing.js';
import { emit } from './realtime.js';
import { pushToUsers } from './push.js';
import type { AuthUser } from './auth.js';

export const ACTIVE_STATUSES = ['accepted', 'en_route', 'arrived', 'in_progress'];

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
    (SELECT row_to_json(r) FROM reviews r WHERE r.booking_id = b.id) AS review
  FROM bookings b
  JOIN packages p ON p.id = b.package_id
  JOIN vehicles v ON v.id = b.vehicle_id
  JOIN users c ON c.id = b.customer_id
  LEFT JOIN users w ON w.id = b.washer_id`;

/** Full booking for display. The handover OTP is only ever shown to the customer. */
export async function bookingDetail(id: string, viewer?: AuthUser) {
  const b = await one(`${DETAIL_SQL} WHERE b.id = $1`, [id]);
  if (b && viewer?.role !== 'customer') delete b.handover_otp;
  return b;
}

export async function listBookings(where: string, params: unknown[], viewer: AuthUser, limit = 100) {
  const rows = await query(`${DETAIL_SQL} WHERE ${where} ORDER BY b.scheduled_at DESC LIMIT ${limit}`, params);
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
  lat: number;
  lng: number;
  address: string;
  notes: string;
  promoCode?: string | null;
  paymentMethod: 'card' | 'cash';
}

export async function createBooking(input: CreateBookingInput) {
  const q = await quote(input.packageId, input.addonIds, input.promoCode);
  const row = await one(
    `INSERT INTO bookings (customer_id, vehicle_id, package_id, addon_ids, scheduled_at, recurrence, lat, lng, address, notes,
       subtotal_cents, discount_cents, total_cents, promo_code, payment_method, handover_otp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [input.customerId, input.vehicleId, input.packageId, input.addonIds, input.scheduledAt, input.recurrence,
     input.lat, input.lng, input.address, input.notes, q.subtotalCents, q.discountCents, q.totalCents,
     q.promoCode, input.paymentMethod, newOtp()],
  );
  if (q.promoCode) await query('UPDATE promo_codes SET uses = uses + 1 WHERE code = $1', [q.promoCode]);

  let clientSecret: string | null = null;
  if (input.paymentMethod === 'card') {
    const auth = await authorizeCard(row.id, q.totalCents);
    clientSecret = auth.clientSecret;
    // In mock mode there is no client confirmation step, so treat it as authorized right away.
    await query('UPDATE bookings SET payment_intent_id = $2, payment_status = $3 WHERE id = $1',
      [row.id, auth.paymentIntentId, auth.clientSecret ? 'unpaid' : 'authorized']);
  }

  const booking = await bookingDetail(row.id);
  emit('washers', 'job:new', booking);
  emit('admins', 'booking:updated', booking);
  const washers = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'washer' AND is_online`);
  await pushToUsers(washers.map((w) => w.id), {
    title: 'New wash request',
    body: `${booking.package.name} at ${booking.address || 'pinned location'}`,
    data: { bookingId: row.id },
  });
  return { booking: await bookingDetail(row.id, { id: input.customerId, role: 'customer' }), clientSecret };
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
  emit(`user:${b.customer_id}`, 'booking:updated', { ...b, handover_otp: undefined });
  emit('admins', 'booking:updated', b);
  if (STATUS_COPY[b.status]) {
    await pushToUsers([b.customer_id], { title: 'Car wash update', body: STATUS_COPY[b.status], data: { bookingId } });
  }
  return b;
}
