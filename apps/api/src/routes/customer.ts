import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, me } from '../auth.js';
import { one, query } from '../db.js';
import { notFound } from '../errors.js';
import { paymentsMode } from '../payments.js';

export const catalogRouter = Router();

catalogRouter.get('/packages', async (_req, res) => {
  res.json(await query('SELECT * FROM packages WHERE active ORDER BY is_addon, price_cents'));
});

catalogRouter.get('/config', (_req, res) => {
  res.json({ paymentsMode });
});

/** Next 7 days, hourly slots 08:00 to 17:00 local server time. Capacity rules come later. */
catalogRouter.get('/slots', (_req, res) => {
  const slots: string[] = [];
  const now = new Date();
  for (let d = 0; d < 7; d++) {
    for (let h = 8; h <= 17; h++) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h);
      if (t.getTime() > now.getTime() + 60 * 60 * 1000) slots.push(t.toISOString());
    }
  }
  res.json(slots);
});

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth('customer'));

const vehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  color: z.string().min(1),
  plate: z.string().min(1),
});

vehiclesRouter.get('/', async (req, res) => {
  res.json(await query('SELECT * FROM vehicles WHERE user_id = $1 ORDER BY created_at', [me(req).id]));
});

vehiclesRouter.post('/', async (req, res) => {
  const v = vehicleSchema.parse(req.body);
  res.status(201).json(
    await one(
      'INSERT INTO vehicles (user_id, make, model, color, plate) VALUES ($1, $2, $3, $4, upper($5)) RETURNING *',
      [me(req).id, v.make, v.model, v.color, v.plate],
    ),
  );
});

vehiclesRouter.delete('/:id', async (req, res) => {
  const row = await one('DELETE FROM vehicles WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, me(req).id]);
  if (!row) throw notFound();
  res.status(204).end();
});
