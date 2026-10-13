import { config } from './config.js';
import { query, one } from './db.js';
import { badRequest } from './errors.js';

export interface Quote {
  subtotalCents: number;
  membershipDiscountCents: number;
  membershipId: string | null;
  /** Covered washes left this period, after this booking. Null without a membership. */
  membershipWashesLeft: number | null;
  discountCents: number;
  promoCode: string | null;
  pointsRedeemed: number;
  pointsDiscountCents: number;
  totalCents: number;
  durationMin: number;
}

export interface QuoteInput {
  userId: string;
  packageId: string;
  addonIds: string[];
  promoCode?: string | null;
  redeemPoints?: number;
}

/** The customer's active membership and how many covered washes it has left this period. */
export async function activeMembership(userId: string) {
  const m = await one(
    `SELECT m.*, p.name AS plan_name, p.washes_per_period, p.covered_package_codes, p.addon_discount_percent,
       (SELECT count(*)::int FROM bookings b WHERE b.membership_id = m.id AND b.status <> 'cancelled'
          AND b.created_at >= m.current_period_start) AS used
     FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.user_id = $1 AND m.status = 'active' AND m.current_period_end > now()
     ORDER BY m.created_at DESC LIMIT 1`,
    [userId],
  );
  return m ? { ...m, remaining: Math.max(0, m.washes_per_period - m.used) } : null;
}

/**
 * Server-side price calculation, in this order:
 * membership (covers the package and discounts add-ons) -> promo code -> loyalty points.
 */
export async function quote(input: QuoteInput): Promise<Quote> {
  const pkg = await one('SELECT * FROM packages WHERE id = $1 AND active AND NOT is_addon', [input.packageId]);
  if (!pkg) throw badRequest('Unknown package');
  const addons = input.addonIds.length
    ? await query('SELECT * FROM packages WHERE id = ANY($1::uuid[]) AND active AND is_addon', [input.addonIds])
    : [];
  if (addons.length !== input.addonIds.length) throw badRequest('Unknown add-on');

  const addonCents = addons.reduce((s, a) => s + a.price_cents, 0);
  const subtotalCents = pkg.price_cents + addonCents;
  const durationMin = pkg.duration_min + addons.reduce((s, a) => s + a.duration_min, 0);

  let membershipDiscountCents = 0;
  let membershipId: string | null = null;
  let membershipWashesLeft: number | null = null;
  const m = await activeMembership(input.userId);
  if (m) {
    membershipWashesLeft = m.remaining;
    if (m.remaining > 0 && m.covered_package_codes.includes(pkg.code)) {
      membershipId = m.id;
      membershipWashesLeft = m.remaining - 1;
      membershipDiscountCents = pkg.price_cents + Math.round((addonCents * m.addon_discount_percent) / 100);
    }
  }
  let remaining = subtotalCents - membershipDiscountCents;

  let discountCents = 0;
  let promoCode: string | null = null;
  if (input.promoCode) {
    const promo = await one(
      `SELECT * FROM promo_codes WHERE upper(code) = upper($1) AND active AND (max_uses IS NULL OR uses < max_uses)`,
      [input.promoCode],
    );
    if (!promo) throw badRequest('Promo code is not valid');
    promoCode = promo.code;
    discountCents = promo.percent_off
      ? Math.round((remaining * promo.percent_off) / 100)
      : Math.min(promo.amount_off_cents ?? 0, remaining);
    remaining -= discountCents;
  }

  let pointsRedeemed = 0;
  let pointsDiscountCents = 0;
  if (input.redeemPoints && input.redeemPoints > 0) {
    const user = await one('SELECT loyalty_points FROM users WHERE id = $1', [input.userId]);
    const maxByBalance = Math.min(input.redeemPoints, user?.loyalty_points ?? 0);
    const maxByPrice = Math.floor(remaining / config.pointValueCents);
    pointsRedeemed = Math.max(0, Math.min(maxByBalance, maxByPrice));
    pointsDiscountCents = pointsRedeemed * config.pointValueCents;
    remaining -= pointsDiscountCents;
  }

  return {
    subtotalCents, membershipDiscountCents, membershipId, membershipWashesLeft,
    discountCents, promoCode, pointsRedeemed, pointsDiscountCents,
    totalCents: remaining, durationMin,
  };
}
