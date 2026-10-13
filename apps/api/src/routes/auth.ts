import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { signToken, requireAuth, me } from '../auth.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { badRequest, HttpError } from '../errors.js';

export const authRouter = Router();

const phoneSchema = z.string().regex(/^\+?[0-9]{8,15}$/, 'Use an international phone number, e.g. +27821234567');
const REFERRAL_BONUS_POINTS = 100;

const newReferralCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

authRouter.post('/request-code', async (req, res) => {
  const phone = phoneSchema.parse(req.body.phone);
  const code = String(randomInt(100000, 1000000));
  await query(
    `INSERT INTO login_codes (phone, code, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
     ON CONFLICT (phone) DO UPDATE SET code = $2, expires_at = now() + interval '10 minutes', attempts = 0`,
    [phone, code],
  );
  // TODO: send via SMS provider (e.g. Twilio Verify). Until then the code is logged.
  console.log(`[auth] login code for ${phone}: ${code}`);
  const existing = await one('SELECT id FROM users WHERE phone = $1', [phone]);
  res.json({ sent: true, isNewUser: !existing, ...(config.devReturnLoginCode ? { devCode: code } : {}) });
});

const verifySchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6),
  // Only used when creating a new account:
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['customer', 'washer']).default('customer'),
  referralCode: z.string().optional(),
});

authRouter.post('/verify', async (req, res) => {
  const body = verifySchema.parse(req.body);
  const lc = await one('SELECT * FROM login_codes WHERE phone = $1', [body.phone]);
  if (!lc || new Date(lc.expires_at) < new Date() || lc.attempts >= 5) throw new HttpError(401, 'Code expired, request a new one');
  if (lc.code !== body.code) {
    await query('UPDATE login_codes SET attempts = attempts + 1 WHERE phone = $1', [body.phone]);
    throw new HttpError(401, 'Wrong code');
  }
  await query('DELETE FROM login_codes WHERE phone = $1', [body.phone]);

  let user = await one('SELECT * FROM users WHERE phone = $1', [body.phone]);
  if (!user) {
    if (!body.name) throw badRequest('Name is required for new accounts');
    const referrer = body.referralCode
      ? await one('SELECT id FROM users WHERE referral_code = upper($1)', [body.referralCode])
      : undefined;
    user = await one(
      `INSERT INTO users (role, name, phone, email, referral_code, referred_by, loyalty_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [body.role, body.name, body.phone, body.email ?? null, newReferralCode(), referrer?.id ?? null, referrer ? REFERRAL_BONUS_POINTS : 0],
    );
    if (referrer) await query('UPDATE users SET loyalty_points = loyalty_points + $2 WHERE id = $1', [referrer.id, REFERRAL_BONUS_POINTS]);
  }
  res.json({ token: signToken({ id: user.id, role: user.role }), user });
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  res.json(await one('SELECT * FROM users WHERE id = $1', [me(req).id]));
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  pushToken: z.string().nullable().optional(),
});

authRouter.patch('/me', requireAuth(), async (req, res) => {
  const p = profileSchema.parse(req.body);
  const user = await one(
    `UPDATE users SET name = coalesce($2, name),
       email = CASE WHEN $3::boolean THEN $4 ELSE email END,
       push_token = CASE WHEN $5::boolean THEN $6 ELSE push_token END
     WHERE id = $1 RETURNING *`,
    [me(req).id, p.name ?? null, p.email !== undefined, p.email ?? null, p.pushToken !== undefined, p.pushToken ?? null],
  );
  res.json(user);
});
