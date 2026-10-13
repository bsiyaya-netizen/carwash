import { Router, type Request } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { signToken, requireAuth, me } from '../auth.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { badRequest, HttpError } from '../errors.js';
import { sendEmail, sendSms } from '../notify.js';
import { cancelSubscription } from '../payments.js';
import { verifyApple, verifyGoogle, type SocialProfile } from '../social.js';

export const authRouter = Router();

const phoneSchema = z.string().transform((s) => s.replace(/[\s-]/g, '')).pipe(
  z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use an international phone number, e.g. +27821234567'),
);
const emailSchema = z.string().email().transform((s) => s.trim().toLowerCase());
const REFERRAL_BONUS_POINTS = 100;
const RESEND_AFTER_SECONDS = 30;

const newReferralCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** In-memory per-IP limiter for code requests. Swap for Redis when running more than one API instance. */
const ipHits = new Map<string, { count: number; resetAt: number }>();
function limitIp(req: Request, max = 20, windowMs = 60 * 60 * 1000) {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || hit.resetAt < now) ipHits.set(ip, { count: 1, resetAt: now + windowMs });
  else if (++hit.count > max) throw new HttpError(429, 'Too many attempts. Try again later.');
}

const targetSchema = z.union([
  z.object({ phone: phoneSchema }).transform((v) => ({ channel: 'sms' as const, target: v.phone })),
  z.object({ email: emailSchema }).transform((v) => ({ channel: 'email' as const, target: v.email })),
]);

const findUser = (channel: 'sms' | 'email', target: string) =>
  one(`SELECT * FROM users WHERE deleted_at IS NULL AND ${channel === 'sms' ? 'phone' : 'email'} = $1`, [target]);

authRouter.post('/request-code', async (req, res) => {
  limitIp(req);
  const { channel, target } = targetSchema.parse(req.body);
  const recent = await one(
    `SELECT 1 FROM otp_codes WHERE channel = $1 AND target = $2 AND last_sent_at > now() - make_interval(secs => $3)`,
    [channel, target, RESEND_AFTER_SECONDS],
  );
  if (recent) throw new HttpError(429, `Please wait ${RESEND_AFTER_SECONDS} seconds before asking for another code`);

  const code = String(randomInt(100000, 1000000));
  await query(
    `INSERT INTO otp_codes (channel, target, code, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')
     ON CONFLICT (channel, target) DO UPDATE SET code = $3, expires_at = now() + interval '10 minutes', attempts = 0, last_sent_at = now()`,
    [channel, target, code],
  );
  const message = `Your Sparkle Wash code is ${code}. It expires in 10 minutes.`;
  if (channel === 'sms') await sendSms(target, message);
  else await sendEmail(target, `${code} is your Sparkle Wash code`, message);

  const existing = await findUser(channel, target);
  res.json({ sent: true, isNewUser: !existing, ...(config.devReturnLoginCode ? { devCode: code } : {}) });
});

const signupFields = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['customer', 'washer']).default('customer'),
  referralCode: z.string().optional(),
});

async function createUser(fields: {
  role: 'customer' | 'washer'; name: string; phone?: string | null; email?: string | null;
  googleSub?: string; appleSub?: string; referralCode?: string;
}) {
  const referrer = fields.referralCode
    ? await one('SELECT id FROM users WHERE referral_code = upper($1) AND deleted_at IS NULL', [fields.referralCode])
    : undefined;
  const user = await one(
    `INSERT INTO users (role, name, phone, email, google_sub, apple_sub, referral_code, referred_by, loyalty_points)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [fields.role, fields.name, fields.phone ?? null, fields.email ?? null, fields.googleSub ?? null, fields.appleSub ?? null,
     newReferralCode(), referrer?.id ?? null, referrer ? REFERRAL_BONUS_POINTS : 0],
  );
  if (referrer) await query('UPDATE users SET loyalty_points = loyalty_points + $2 WHERE id = $1', [referrer.id, REFERRAL_BONUS_POINTS]);
  return user;
}

const session = (user: any) => ({ token: signToken({ id: user.id, role: user.role }), user });

authRouter.post('/verify', async (req, res) => {
  const { channel, target } = targetSchema.parse(req.body);
  const body = signupFields.extend({ code: z.string().length(6), email: emailSchema.optional() }).parse(req.body);
  const lc = await one('SELECT * FROM otp_codes WHERE channel = $1 AND target = $2', [channel, target]);
  if (!lc || new Date(lc.expires_at) < new Date() || lc.attempts >= 5) throw new HttpError(401, 'Code expired, request a new one');
  if (lc.code !== body.code) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE channel = $1 AND target = $2', [channel, target]);
    throw new HttpError(401, 'Wrong code');
  }
  await query('DELETE FROM otp_codes WHERE channel = $1 AND target = $2', [channel, target]);

  let user = await findUser(channel, target);
  if (!user) {
    if (!body.name) throw badRequest('Name is required for new accounts');
    user = await createUser({
      role: body.role, name: body.name, referralCode: body.referralCode,
      phone: channel === 'sms' ? target : null,
      email: channel === 'email' ? target : body.email ?? null,
    });
  }
  res.json(session(user));
});

/** Find by provider id, else link to an existing account with the same verified email, else create a customer. */
async function socialSignIn(provider: 'google' | 'apple', profile: SocialProfile, extra: z.infer<typeof signupFields>) {
  const col = provider === 'google' ? 'google_sub' : 'apple_sub';
  let user = await one(`SELECT * FROM users WHERE ${col} = $1 AND deleted_at IS NULL`, [profile.sub]);
  if (!user && profile.email && profile.emailVerified) {
    user = await one(`UPDATE users SET ${col} = $2 WHERE email = $1 AND deleted_at IS NULL RETURNING *`, [profile.email.toLowerCase(), profile.sub]);
  }
  if (!user) {
    user = await createUser({
      role: 'customer',
      name: extra.name || profile.name || profile.email?.split('@')[0] || 'Customer',
      email: profile.emailVerified ? profile.email?.toLowerCase() : null,
      referralCode: extra.referralCode,
      ...(provider === 'google' ? { googleSub: profile.sub } : { appleSub: profile.sub }),
    });
  }
  return session(user);
}

authRouter.post('/google', async (req, res) => {
  const { idToken, ...extra } = signupFields.extend({ idToken: z.string() }).parse(req.body);
  res.json(await socialSignIn('google', await verifyGoogle(idToken), extra));
});

authRouter.post('/apple', async (req, res) => {
  // Apple only sends the user's name on the very first sign-in, so the app passes it along.
  const { identityToken, ...extra } = signupFields.extend({ identityToken: z.string() }).parse(req.body);
  res.json(await socialSignIn('apple', await verifyApple(identityToken), extra));
});

authRouter.get('/me', requireAuth(), async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [me(req).id]);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json(user);
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  pushToken: z.string().nullable().optional(),
});

authRouter.patch('/me', requireAuth(), async (req, res) => {
  const p = profileSchema.parse(req.body);
  try {
    res.json(await one(
      `UPDATE users SET name = coalesce($2, name),
         email = CASE WHEN $3::boolean THEN $4 ELSE email END,
         phone = CASE WHEN $5::boolean THEN $6 ELSE phone END,
         push_token = CASE WHEN $7::boolean THEN $8 ELSE push_token END
       WHERE id = $1 RETURNING *`,
      [me(req).id, p.name ?? null, p.email !== undefined, p.email ?? null, p.phone !== undefined, p.phone ?? null,
       p.pushToken !== undefined, p.pushToken ?? null],
    ));
  } catch (err: any) {
    if (err?.code === '23505') throw new HttpError(409, 'That email or phone number is already used by another account');
    throw err;
  }
});

/** Account deletion (required by the App Store and Play Store). Keeps booking history, removes personal data. */
authRouter.delete('/me', requireAuth(), async (req, res) => {
  const u = me(req);
  const active = await one(
    `SELECT 1 FROM bookings WHERE (customer_id = $1 OR washer_id = $1) AND status IN ('accepted','en_route','arrived','in_progress')`,
    [u.id],
  );
  if (active) throw badRequest('Finish or cancel your current booking before deleting your account');
  await query(`UPDATE bookings SET status = 'cancelled' WHERE customer_id = $1 AND status = 'pending'`, [u.id]);
  const subs = await query(`SELECT stripe_subscription_id FROM memberships WHERE user_id = $1 AND status <> 'canceled'`, [u.id]);
  for (const s of subs) await cancelSubscription(s.stripe_subscription_id, true);
  await query(`UPDATE memberships SET status = 'canceled' WHERE user_id = $1 AND status <> 'canceled'`, [u.id]);
  await query(
    `UPDATE users SET name = 'Deleted user', phone = NULL, email = NULL, google_sub = NULL, apple_sub = NULL,
       push_token = NULL, is_online = false, deleted_at = now() WHERE id = $1`,
    [u.id],
  );
  res.status(204).end();
});
