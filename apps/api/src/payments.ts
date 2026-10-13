import Stripe from 'stripe';
import { config } from './config.js';
import { one, query } from './db.js';

export const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;
export const paymentsMode = stripe ? 'stripe' : 'mock';

/** What a client needs to show Stripe's PaymentSheet (mobile) or Payment Element (web). Null in mock mode. */
export interface PaymentSheetParams {
  clientSecret: string;
  customerId: string;
  ephemeralKey: string;
  publishableKey: string;
}

async function stripeCustomer(userId: string) {
  const user = await one('SELECT id, name, email, phone, stripe_customer_id FROM users WHERE id = $1', [userId]);
  if (user.stripe_customer_id) return user.stripe_customer_id as string;
  const customer = await stripe!.customers.create({
    name: user.name,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    metadata: { userId },
  });
  await query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [userId, customer.id]);
  return customer.id;
}

async function sheetParams(customerId: string, clientSecret: string): Promise<PaymentSheetParams> {
  const key = await stripe!.ephemeralKeys.create({ customer: customerId }, { apiVersion: Stripe.API_VERSION });
  return { clientSecret, customerId, ephemeralKey: key.secret!, publishableKey: config.stripePublishableKey };
}

/**
 * Card bookings are authorized when booked and captured when the wash is completed,
 * so a no-show is never charged. In mock mode the authorization succeeds immediately.
 */
export async function authorizeBooking(bookingId: string, userId: string, amountCents: number) {
  if (!stripe) {
    await query(`UPDATE bookings SET payment_intent_id = $2, payment_status = 'authorized' WHERE id = $1`, [bookingId, `mock_${bookingId}`]);
    return null;
  }
  const customer = await stripeCustomer(userId);
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: config.currency,
    customer,
    capture_method: 'manual',
    setup_future_usage: 'off_session',
    automatic_payment_methods: { enabled: true },
    metadata: { kind: 'booking', bookingId },
  });
  await query('UPDATE bookings SET payment_intent_id = $2 WHERE id = $1', [bookingId, intent.id]);
  return sheetParams(customer, intent.client_secret!);
}

/** Authorize a repeat booking against the customer's saved card. Returns false if the customer must confirm in the app. */
export async function authorizeOffSession(bookingId: string, userId: string, amountCents: number) {
  if (!stripe) {
    await authorizeBooking(bookingId, userId, amountCents);
    return true;
  }
  const customer = await stripeCustomer(userId);
  const [method] = (await stripe.paymentMethods.list({ customer, limit: 1 })).data;
  if (!method) {
    await authorizeBooking(bookingId, userId, amountCents);
    return false;
  }
  try {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: config.currency,
      customer,
      payment_method: method.id,
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { kind: 'booking', bookingId },
    });
    await query(`UPDATE bookings SET payment_intent_id = $2, payment_status = $3 WHERE id = $1`,
      [bookingId, intent.id, intent.status === 'requires_capture' ? 'authorized' : 'unpaid']);
    return intent.status === 'requires_capture';
  } catch (err: any) {
    // e.g. authentication_required: leave an intent the customer can confirm in the app.
    const intentId = err?.raw?.payment_intent?.id;
    if (intentId) await query('UPDATE bookings SET payment_intent_id = $2 WHERE id = $1', [bookingId, intentId]);
    else await authorizeBooking(bookingId, userId, amountCents);
    return false;
  }
}

/** Re-open the payment sheet for a booking whose card step wasn't finished. */
export async function resumeBookingPayment(paymentIntentId: string, userId: string) {
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return sheetParams(await stripeCustomer(userId), intent.client_secret!);
}

export async function captureCard(paymentIntentId: string, amountCents: number) {
  if (!stripe || paymentIntentId.startsWith('mock_')) return;
  await stripe.paymentIntents.capture(paymentIntentId, { amount_to_capture: amountCents });
}

export async function cancelCard(paymentIntentId: string) {
  if (!stripe || paymentIntentId.startsWith('mock_')) return;
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err: any) {
    // Already canceled or never confirmed: nothing to release.
    if (err?.code !== 'payment_intent_unexpected_state') throw err;
  }
}

/** Tips are a separate, immediately captured payment. Recorded as paid by the webhook (or right away in mock mode). */
export async function createTip(bookingId: string, userId: string, amountCents: number) {
  const tip = await one(`INSERT INTO tips (booking_id, amount_cents, status) VALUES ($1, $2, 'pending') RETURNING id`, [bookingId, amountCents]);
  if (!stripe) {
    await markTipPaid(tip.id);
    return null;
  }
  const customer = await stripeCustomer(userId);
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: config.currency,
    customer,
    automatic_payment_methods: { enabled: true },
    metadata: { kind: 'tip', bookingId, tipId: tip.id },
  });
  await query('UPDATE tips SET payment_intent_id = $2 WHERE id = $1', [tip.id, intent.id]);
  return sheetParams(customer, intent.client_secret!);
}

export async function markTipPaid(tipId: string) {
  const tip = await one(`UPDATE tips SET status = 'paid' WHERE id = $1 AND status = 'pending' RETURNING *`, [tipId]);
  if (tip) await query('UPDATE bookings SET tip_cents = tip_cents + $2 WHERE id = $1', [tip.booking_id, tip.amount_cents]);
  return tip;
}

/** Stripe Billing subscription for a membership plan. Mock mode activates the membership straight away. */
export async function startSubscription(userId: string, membershipId: string, plan: { stripe_price_id: string | null; name: string }) {
  if (!stripe) return null;
  if (!plan.stripe_price_id) throw new Error(`Membership plan "${plan.name}" has no stripe_price_id`);
  const customer = await stripeCustomer(userId);
  const sub = await stripe.subscriptions.create({
    customer,
    items: [{ price: plan.stripe_price_id }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.confirmation_secret'],
    metadata: { membershipId, userId },
  });
  await query('UPDATE memberships SET stripe_subscription_id = $2 WHERE id = $1', [membershipId, sub.id]);
  const invoice = sub.latest_invoice as Stripe.Invoice;
  return sheetParams(customer, invoice.confirmation_secret!.client_secret);
}

export async function cancelSubscription(subscriptionId: string | null, immediately = false) {
  if (!stripe || !subscriptionId) return;
  if (immediately) await stripe.subscriptions.cancel(subscriptionId);
  else await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}
