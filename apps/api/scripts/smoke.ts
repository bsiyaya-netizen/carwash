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

async function login(phone: string, extra: Record<string, unknown> = {}) {
  const { devCode } = await call('POST', '/auth/request-code', { phone });
  const { token, user } = await call('POST', '/auth/verify', { phone, code: devCode, ...extra });
  return { token, user };
}

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const phone = `+2782${Math.floor(1000000 + Math.random() * 8999999)}`;
const customer = await login(phone, { name: 'Smoke Tester', referralCode: 'CUST01' });
ok(customer.user.loyalty_points === 100, 'new customer signs up with referral bonus');

const washer = await login('+27000000002');
const admin = await login('+27000000001');
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

wSock.close(); cSock.close();
console.log('\nSmoke test passed');
