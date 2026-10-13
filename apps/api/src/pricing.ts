import { query, one } from './db.js';
import { badRequest } from './errors.js';

export interface Quote {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  promoCode: string | null;
  durationMin: number;
}

export async function quote(packageId: string, addonIds: string[], promoCode?: string | null): Promise<Quote> {
  const pkg = await one('SELECT * FROM packages WHERE id = $1 AND active AND NOT is_addon', [packageId]);
  if (!pkg) throw badRequest('Unknown package');
  const addons = addonIds.length
    ? await query('SELECT * FROM packages WHERE id = ANY($1::uuid[]) AND active AND is_addon', [addonIds])
    : [];
  if (addons.length !== addonIds.length) throw badRequest('Unknown add-on');

  const subtotalCents = pkg.price_cents + addons.reduce((s, a) => s + a.price_cents, 0);
  const durationMin = pkg.duration_min + addons.reduce((s, a) => s + a.duration_min, 0);

  let discountCents = 0;
  let code: string | null = null;
  if (promoCode) {
    const promo = await one(
      `SELECT * FROM promo_codes WHERE upper(code) = upper($1) AND active AND (max_uses IS NULL OR uses < max_uses)`,
      [promoCode],
    );
    if (!promo) throw badRequest('Promo code is not valid');
    code = promo.code;
    discountCents = promo.percent_off
      ? Math.round((subtotalCents * promo.percent_off) / 100)
      : Math.min(promo.amount_off_cents ?? 0, subtotalCents);
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, promoCode: code, durationMin };
}
