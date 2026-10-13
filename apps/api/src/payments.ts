import Stripe from 'stripe';
import { config } from './config.js';

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const paymentsMode = stripe ? 'stripe' : 'mock';

/**
 * Card bookings are authorized when booked and captured when the wash is completed,
 * so a no-show is never charged. Without a Stripe key we simulate an authorization.
 */
export async function authorizeCard(bookingId: string, amountCents: number) {
  if (!stripe) return { paymentIntentId: `mock_${bookingId}`, clientSecret: null as string | null };
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: config.currency,
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
    metadata: { bookingId },
  });
  return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
}

export async function captureCard(paymentIntentId: string, amountCents: number) {
  if (!stripe || paymentIntentId.startsWith('mock_')) return;
  await stripe.paymentIntents.capture(paymentIntentId, { amount_to_capture: amountCents });
}

export async function cancelCard(paymentIntentId: string) {
  if (!stripe || paymentIntentId.startsWith('mock_')) return;
  await stripe.paymentIntents.cancel(paymentIntentId);
}

export async function chargeTip(customerRef: string, amountCents: number) {
  // Tips on card are a separate PaymentIntent in production (PaymentSheet in the app).
  // In mock mode they are recorded directly.
  if (!stripe) return { clientSecret: null as string | null };
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: config.currency,
    automatic_payment_methods: { enabled: true },
    metadata: { tipFor: customerRef },
  });
  return { clientSecret: intent.client_secret };
}
