/** Usage: npm run create-admin -- +27821234567 "Your Name"   (promotes the account if it already exists) */
import { pool, one } from '../src/db.js';

const [phone, name = 'Admin'] = process.argv.slice(2);
if (!/^\+[1-9][0-9]{7,14}$/.test(phone ?? '')) {
  console.error('Give an international phone number, e.g. npm run create-admin -- +27821234567 "Thandi"');
  process.exit(1);
}
const user = await one(
  `INSERT INTO users (role, name, phone, referral_code) VALUES ('admin', $2, $1, upper(substr(md5(random()::text), 1, 6)))
   ON CONFLICT (phone) DO UPDATE SET role = 'admin' RETURNING id, name, phone, role`,
  [phone, name],
);
console.log('Admin ready:', user);
await pool.end();
