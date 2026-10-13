/**
 * Checks the Stripe webhook handler offline: signs events with a test secret and posts them
 * to an in-process app. Needs only Postgres with at least one booking (run the smoke test first).
 *   npm run test:webhooks
 */
process.env.STRIPE_SECRET_KEY ||= 'sk_test_offline';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_offline';

const { createServer } = await import('node:http');
const { createApp } = await import('../src/app.js');
const { pool, one, query } = await import('../src/db.js');
const { stripe } = await import('../src/payments.js');

const server = createServer(createApp()).listen(0);
const port = (server.address() as any).port;

async function send(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: 'event', type, data: { object } });
  const header = stripe!.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  const res = await fetch(`http://localhost:${port}/webhooks/stripe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header }, body: payload,
  });
  return res.status;
}

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const b = await one(`SELECT id, customer_id FROM bookings ORDER BY created_at DESC LIMIT 1`);
const piId = `pi_test_${Date.now()}`;
await query(`UPDATE bookings SET payment_method = 'card', payment_status = 'unpaid', payment_intent_id = $2, status = 'pending' WHERE id = $1`, [b.id, piId]);

const bad = await fetch(`http://localhost:${port}/webhooks/stripe`, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=x' }, body: '{}' });
ok(bad.status === 400, 'rejects a bad signature');

ok(await send('payment_intent.amount_capturable_updated', { id: piId, metadata: { kind: 'booking', bookingId: b.id } }) === 200, 'accepts a signed event');
ok((await one('SELECT payment_status FROM bookings WHERE id = $1', [b.id])).payment_status === 'authorized', 'card hold marks booking authorized');

const tip = await one(`INSERT INTO tips (booking_id, amount_cents, status, payment_intent_id) VALUES ($1, 2500, 'pending', $2) RETURNING id`, [b.id, `pi_tip_${Date.now()}`]);
const before = (await one('SELECT tip_cents FROM bookings WHERE id = $1', [b.id])).tip_cents;
await send('payment_intent.succeeded', { id: 'pi_tip', metadata: { kind: 'tip', bookingId: b.id, tipId: tip.id } });
ok((await one('SELECT tip_cents FROM bookings WHERE id = $1', [b.id])).tip_cents === before + 2500, 'paid tip is added to the booking');

const plan = await one(`SELECT id FROM membership_plans LIMIT 1`);
const subId = `sub_test_${Date.now()}`;
const m = await one(`INSERT INTO memberships (user_id, plan_id, status, stripe_subscription_id) VALUES ($1, $2, 'incomplete', $3) RETURNING id`, [b.customer_id, plan.id, subId]);
const end = Math.floor(Date.now() / 1000) + 30 * 86400;
await send('customer.subscription.updated', {
  id: subId, status: 'active', cancel_at_period_end: false,
  items: { data: [{ current_period_start: Math.floor(Date.now() / 1000), current_period_end: end }] },
});
const synced = await one('SELECT status, current_period_end FROM memberships WHERE id = $1', [m.id]);
ok(synced.status === 'active' && Math.abs(new Date(synced.current_period_end).getTime() / 1000 - end) < 2, 'subscription webhook activates membership');
await query(`UPDATE memberships SET status = 'canceled' WHERE id = $1`, [m.id]);
await query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [b.id]);

server.close();
await pool.end();
console.log('\nWebhook test passed');
process.exit(0);
