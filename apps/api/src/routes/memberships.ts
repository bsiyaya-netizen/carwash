import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { one, query } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { cancelSubscription, paymentsMode, startSubscription } from '../payments.js';
import { activeMembership } from '../pricing.js';

export const plansRouter = Router();

plansRouter.get('/', async (_req, res) => {
  res.json(await query('SELECT * FROM membership_plans WHERE active ORDER BY price_cents'));
});

export const membershipsRouter = Router();
membershipsRouter.use(requireAuth('customer'));

membershipsRouter.get('/me', async (req, res) => {
  res.json(await activeMembership(me(req).id));
});

membershipsRouter.post('/', async (req, res) => {
  const planId = z.string().uuid().parse(req.body.planId);
  const u = me(req);
  if (await activeMembership(u.id)) throw badRequest('You already have an active membership. Cancel it first to switch plans.');
  const plan = await one('SELECT * FROM membership_plans WHERE id = $1 AND active', [planId]);
  if (!plan) throw notFound('Unknown plan');

  // Drop any earlier unfinished sign-up so it can't be activated later.
  await query(`UPDATE memberships SET status = 'canceled' WHERE user_id = $1 AND status = 'incomplete'`, [u.id]);
  const m = await one(
    `INSERT INTO memberships (user_id, plan_id, status) VALUES ($1, $2, $3) RETURNING *`,
    [u.id, plan.id, paymentsMode === 'mock' ? 'active' : 'incomplete'],
  );
  // With Stripe, the webhook activates it once the first invoice is paid.
  const payment = await startSubscription(u.id, m.id, plan);
  res.status(201).json({ membership: m, payment });
});

membershipsRouter.post('/cancel', async (req, res) => {
  const m = await activeMembership(me(req).id);
  if (!m) throw badRequest('No active membership');
  // Keeps the remaining washes until the period ends.
  await cancelSubscription(m.stripe_subscription_id);
  res.json(await one(`UPDATE memberships SET cancel_at_period_end = true WHERE id = $1 RETURNING *`, [m.id]));
});
