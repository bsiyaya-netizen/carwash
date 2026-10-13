/**
 * End-to-end smoke test against a running API (npm run dev) with seeded data.
 * Walks the whole flow: sign-up, vehicle, booking, live job alert, accept, tracking,
 * OTP handover, completion, review, washer earnings, admin stats and CRM.
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4000';

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function login(target: { phone: string } | { email: string }, extra: Record<string, unknown> = {}) {
  let res;
  try {
    res = await call('POST', '/auth/request-code', target);
  } catch (e: any) {
    if (!String(e.message).includes('429')) throw e;
    console.log('  … waiting out the resend cooldown');
    await new Promise((r) => setTimeout(r, 31_000));
    res = await call('POST', '/auth/request-code', target);
  }
  const { token, user } = await call('POST', '/auth/verify', { ...target, code: res.devCode, ...extra });
  return { token, user };
}

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const phone = `+2782${Math.floor(1000000 + Math.random() * 8999999)}`;
const customer = await login({ phone }, { name: 'Smoke Tester', referralCode: 'CUST01' });
ok(customer.user.loyalty_points === 100, 'new customer signs up with referral bonus');

const washer = await login({ phone: '+27000000002' });
const admin = await login({ phone: '+27000000001' });
await call('POST', '/washer/online', { online: true }, washer.token);

const vehicle = await call('POST', '/vehicles', { make: 'Toyota', model: 'Corolla', color: 'White', plate: 'ca 123-456' }, customer.token);
ok(vehicle.plate === 'CA 123-456', 'vehicle saved');

const pkgs = await call('GET', '/packages');
const full = pkgs.find((p: any) => p.code === 'full');
const wax = pkgs.find((p: any) => p.code === 'wax');
const q = await call('POST', '/bookings/quote', { packageId: full.id, addonIds: [wax.id], promoCode: 'welcome20' }, customer.token);
ok(q.totalCents === Math.round((30000 + 12000) * 0.8), `quote applies promo (${q.totalCents / 100})`);

// Washer listens for new jobs; customer for status + location.
const wSock = io(API, { auth: { token: washer.token } });
const cSock = io(API, { auth: { token: customer.token } });
await Promise.all([wSock, cSock].map((s) => new Promise<void>((r) => s.on('connect', () => r()))));
const jobAlert = new Promise<any>((r) => wSock.on('job:new', r));

const [slot] = await call('GET', '/slots');
const { booking } = await call('POST', '/bookings', {
  packageId: full.id, addonIds: [wax.id], promoCode: 'WELCOME20', vehicleId: vehicle.id, scheduledAt: slot,
  recurrence: 'weekly', lat: -33.9249, lng: 18.4241, address: '1 Long St, Cape Town', paymentMethod: 'card',
}, customer.token);
ok(booking.status === 'pending' && /^\d{4}$/.test(booking.handover_otp), 'booking created with handover OTP');
ok(booking.payment_status === 'authorized', 'card authorized (mock mode)');
ok((await jobAlert).id === booking.id, 'washer got live job alert');

const avail = await call('GET', '/washer/jobs/available', undefined, washer.token);
const seen = avail.find((j: any) => j.id === booking.id);
ok(seen && seen.handover_otp === undefined, 'job in washer queue without the OTP');

cSock.emit('booking:watch', booking.id);
const accepted = await call('POST', `/washer/jobs/${booking.id}/accept`, undefined, washer.token);
ok(accepted.status === 'accepted', 'washer accepted');
wSock.emit('booking:watch', booking.id);
await new Promise((r) => setTimeout(r, 200));

const located = new Promise<any>((r) => cSock.on('washer:location', r));
await call('POST', `/washer/jobs/${booking.id}/status`, { status: 'en_route' }, washer.token);
wSock.emit('washer:location', { lat: -33.93, lng: 18.42 });
ok((await located).lat === -33.93, 'customer receives live washer location');

await call('POST', `/washer/jobs/${booking.id}/status`, { status: 'arrived' }, washer.token);
const bad = await fetch(`${API}/washer/jobs/${booking.id}/start`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${washer.token}` },
  body: JSON.stringify({ otp: booking.handover_otp === '0000' ? '1111' : '0000' }),
});
ok(bad.status === 401, 'wrong OTP is rejected');
const started = await call('POST', `/washer/jobs/${booking.id}/start`, { otp: booking.handover_otp }, washer.token);
ok(started.status === 'in_progress', 'correct OTP starts the wash');

const done = await call('POST', `/washer/jobs/${booking.id}/status`, { status: 'completed' }, washer.token);
ok(done.status === 'completed' && done.payment_status === 'paid', 'completed and card captured');

const mine = await call('GET', '/bookings', undefined, customer.token);
ok(mine.some((b: any) => b.status === 'pending' && b.recurrence === 'weekly' && b.id !== booking.id), 'next weekly booking auto-created');

await call('POST', `/bookings/${booking.id}/review`, { rating: 5, comment: 'Spotless' }, customer.token);
await call('POST', `/bookings/${booking.id}/tip`, { amountCents: 5000 }, customer.token);
const me = await call('GET', '/auth/me', undefined, customer.token);
ok(me.loyalty_points === 100 + Math.floor(q.totalCents / 100), `loyalty points awarded (${me.loyalty_points})`);

const earn = await call('GET', '/washer/earnings?period=day', undefined, washer.token);
ok(earn.jobs >= 1 && earn.tips_cents >= 5000, `washer earnings: ${earn.jobs} jobs, payout ${earn.payout_cents / 100}`);

const stats = await call('GET', '/admin/stats', undefined, admin.token);
ok(stats.today.revenue_cents >= q.totalCents && stats.quality.avg_rating, 'admin stats show revenue and rating');
const crm = await call('GET', `/admin/customers?q=Smoke`, undefined, admin.token);
ok(crm.length >= 1, 'admin CRM lists customer');
const camp = await call('POST', '/admin/campaigns', { title: 'Hi', body: 'Weekend special', segment: 'all' }, admin.token);
ok(camp.id, 'admin campaign recorded');

// --- v2: hubs, memberships, points, email sign-in, account deletion -------------
const nextBooking = mine.find((b: any) => b.status === 'pending' && b.id !== booking.id);
const pointsBefore = (await call('GET', '/auth/me', undefined, customer.token)).loyalty_points;
const exterior = pkgs.find((p: any) => p.code === 'exterior');
const pq = await call('POST', '/bookings/quote', { packageId: exterior.id, redeemPoints: 100 }, customer.token);
ok(pq.pointsRedeemed === 100 && pq.totalCents === exterior.price_cents - 1000, 'quote redeems 100 points for R10');
const hubs = await call('GET', '/hubs?lat=-26.2&lng=28.04');
ok(hubs.length >= 2 && hubs[0].distance_km <= hubs[1].distance_km, `hubs sorted by distance (nearest ${hubs[0].name})`);
const slots2 = await call('GET', '/slots');
const hubBooking = await call('POST', '/bookings', {
  packageId: exterior.id, vehicleId: vehicle.id, scheduledAt: slots2[3], hubId: hubs[0].id, redeemPoints: 100, paymentMethod: 'cash',
}, customer.token);
ok(hubBooking.booking.hub?.id === hubs[0].id && hubBooking.booking.lat === hubs[0].lat, 'hub booking uses the hub location');
ok((await call('GET', '/auth/me', undefined, customer.token)).loyalty_points === pointsBefore - 100, 'points deducted at booking');
await call('POST', `/bookings/${hubBooking.booking.id}/cancel`, {}, customer.token);
ok((await call('GET', '/auth/me', undefined, customer.token)).loyalty_points === pointsBefore, 'points refunded on cancel');
if (nextBooking) await call('POST', `/bookings/${nextBooking.id}/cancel`, {}, customer.token);

const plans = await call('GET', '/plans');
const valet = plans.find((p: any) => p.code === 'valet');
const sub = await call('POST', '/memberships', { planId: valet.id }, customer.token);
ok(sub.membership.status === 'active', 'membership activated (mock billing)');
const mq = await call('POST', '/bookings/quote', { packageId: full.id, addonIds: [wax.id] }, customer.token);
ok(mq.membershipDiscountCents === 30000 + 1800 && mq.totalCents === 12000 - 1800, `membership covers the valet and 15% off wax (pay ${mq.totalCents / 100})`);
const freeQ = await call('POST', '/bookings/quote', { packageId: full.id }, customer.token);
ok(freeQ.totalCents === 0 && freeQ.membershipWashesLeft === 3, 'covered wash is free, 3 left after it');
const freeB = await call('POST', '/bookings', {
  packageId: full.id, vehicleId: vehicle.id, scheduledAt: slots2[4], lat: -33.92, lng: 18.42, paymentMethod: 'card',
}, customer.token);
ok(freeB.booking.payment_method === 'membership' && freeB.booking.payment_status === 'paid' && freeB.payment === null, 'membership booking needs no payment');
const avail2 = await call('GET', '/washer/jobs/available', undefined, washer.token);
ok(avail2.some((j: any) => j.id === freeB.booking.id && typeof j.distance_km === 'number'), 'washer sees job with distance');
await call('POST', `/bookings/${freeB.booking.id}/cancel`, {}, customer.token);
await call('POST', '/memberships/cancel', {}, customer.token);
ok((await call('GET', '/memberships/me', undefined, customer.token)).cancel_at_period_end === true, 'membership set to cancel at period end');

const emailUser = await login({ email: `smoke${Date.now()}@example.com` }, { name: 'Email Tester' });
ok(emailUser.user.email && emailUser.user.phone === null, 'email sign-up works without a phone');
await call('DELETE', '/auth/me', undefined, emailUser.token);
const gone = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${emailUser.token}` } });
ok(gone.status === 401, 'deleted account can no longer sign in');

wSock.close(); cSock.close();
console.log('\nSmoke test passed');
