import express, { Router } from 'express';
import type Stripe from 'stripe';
import { announce, dispatchIfReady } from '../bookings.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { markTipPaid, stripe } from '../payments.js';

export const webhooksRouter = Router();

const toDate = (unix?: number | null) => (unix ? new Date(unix * 1000) : null);

webhooksRouter.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.stripeWebhookSecret) {
    res.status(501).json({ error: 'Stripe webhooks are not configured' });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, String(req.headers['stripe-signature']), config.stripeWebhookSecret);
  } catch {
    res.status(400).json({ error: 'Bad signature' });
    return;
  }
  const fresh = await one('INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [event.id, event.type]);
  if (fresh) await handle(event);
  res.json({ received: true });
});

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case 'payment_intent.amount_capturable_updated': {
      // Card booking authorized: hold is in place, offer the job to washers.
      const pi = event.data.object;
      if (pi.metadata.kind !== 'booking') return;
      const b = await one(`UPDATE bookings SET payment_status = 'authorized' WHERE payment_intent_id = $1 AND payment_status IN ('unpaid','failed') RETURNING id`, [pi.id]);
      if (b) await dispatchIfReady(b.id);
      return;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      if (pi.metadata.kind === 'tip' && pi.metadata.tipId) {
        const tip = await markTipPaid(pi.metadata.tipId);
        if (tip) await announce(tip.booking_id);
      } else if (pi.metadata.kind === 'booking') {
        await query(`UPDATE bookings SET payment_status = 'paid' WHERE payment_intent_id = $1`, [pi.id]);
      }
      return;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      if (pi.metadata.kind === 'tip' && pi.metadata.tipId) await query(`UPDATE tips SET status = 'failed' WHERE id = $1`, [pi.metadata.tipId]);
      if (pi.metadata.kind === 'booking') await query(`UPDATE bookings SET payment_status = 'failed' WHERE payment_intent_id = $1 AND payment_status = 'unpaid'`, [pi.id]);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const item = sub.items.data[0];
      const status =
        sub.status === 'active' || sub.status === 'trialing' ? 'active'
        : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due'
        : sub.status === 'incomplete' ? 'incomplete'
        : 'canceled';
      await query(
        `UPDATE memberships SET status = $2, cancel_at_period_end = $3,
           current_period_start = coalesce($4, current_period_start), current_period_end = coalesce($5, current_period_end)
         WHERE stripe_subscription_id = $1`,
        [sub.id, status, sub.cancel_at_period_end, toDate(item?.current_period_start), toDate(item?.current_period_end)],
      );
      return;
    }
  }
}
