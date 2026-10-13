import { pool, query } from './db.js';

const packages = [
  ['exterior', 'Exterior Wash', 'Hand wash, rinse, wheels and tyre shine', 15000, 30, false],
  ['interior', 'Interior Clean', 'Vacuum, dashboard, windows and mats', 18000, 40, false],
  ['full', 'Full Valet', 'Exterior wash plus interior clean', 30000, 70, false],
  ['detail', 'Full Detailing', 'Clay bar, polish, deep interior shampoo', 85000, 180, false],
  ['wax', 'Wax', 'Hand-applied carnauba wax', 12000, 20, true],
  ['engine', 'Engine Bay', 'Degrease and dress engine bay', 10000, 20, true],
  ['seats', 'Seat Shampoo', 'Deep clean fabric seats', 15000, 30, true],
] as const;

for (const [code, name, description, price, duration, isAddon] of packages) {
  await query(
    `INSERT INTO packages (code, name, description, price_cents, duration_min, is_addon) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (code) DO UPDATE SET name = $2, description = $3, price_cents = $4, duration_min = $5, is_addon = $6`,
    [code, name, description, price, duration, isAddon],
  );
}

await query(`INSERT INTO promo_codes (code, percent_off) VALUES ('WELCOME20', 20) ON CONFLICT DO NOTHING`);

const plans = [
  ['shine', 'Weekly Shine', 'Four exterior washes a month, 10% off add-ons', 44900, 4, ['exterior'], 10],
  ['valet', 'Valet Club', 'Four washes a month of any kind up to a Full Valet, 15% off add-ons', 89900, 4, ['exterior', 'interior', 'full'], 15],
] as const;
for (const [code, name, description, price, washes, covered, addonPct] of plans) {
  await query(
    `INSERT INTO membership_plans (code, name, description, price_cents, washes_per_period, covered_package_codes, addon_discount_percent)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
    [code, name, description, price, washes, covered, addonPct],
  );
}

const hubs = [
  ['Sparkle Hub Sandton', '12 Rivonia Rd, Sandton, Johannesburg', -26.1076, 28.0567],
  ['Sparkle Hub Rosebank', '50 Bath Ave, Rosebank, Johannesburg', -26.1452, 28.0436],
  ['Sparkle Hub Cape Town CBD', '1 Long St, Cape Town', -33.9188, 18.4233],
] as const;
for (const [name, address, lat, lng] of hubs) {
  await query(
    `INSERT INTO hubs (name, address, lat, lng) SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM hubs WHERE name = $1)`,
    [name, address, lat, lng],
  );
}

const users = [
  ['admin', 'Admin', '+27000000001', 'ADMIN1'],
  ['washer', 'Demo Washer', '+27000000002', 'WASH01'],
  ['customer', 'Demo Customer', '+27000000003', 'CUST01'],
];
for (const [role, name, phone, ref] of users) {
  await query(
    `INSERT INTO users (role, name, phone, referral_code) VALUES ($1,$2,$3,$4) ON CONFLICT (phone) DO NOTHING`,
    [role, name, phone, ref],
  );
}

console.log('Seeded packages, membership plans, hubs, promo WELCOME20, and demo users:');
console.log('  admin    +27000000001');
console.log('  washer   +27000000002');
console.log('  customer +27000000003');
await pool.end();
