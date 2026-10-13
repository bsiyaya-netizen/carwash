import { useEffect, useState } from 'react';
import { api, money, when } from '../api';

const EMPTY = { code: '', name: '', description: '', price: '', washes: '4', covered: 'exterior', addonPct: '0', stripePriceId: '' };

export default function Memberships() {
  const [plans, setPlans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => {
    api<any[]>('/admin/plans').then(setPlans);
    api<any[]>('/admin/memberships').then(setMembers);
  };
  useEffect(load, []);

  const save = async () => {
    setError('');
    try {
      await api('/admin/plans', {
        code: form.code, name: form.name, description: form.description,
        priceCents: Math.round(Number(form.price) * 100), washesPerPeriod: Number(form.washes),
        coveredPackageCodes: form.covered.split(',').map((s) => s.trim()).filter(Boolean),
        addonDiscountPercent: Number(form.addonPct), stripePriceId: form.stripePriceId || null,
      });
      setForm(EMPTY);
      load();
    } catch (e: any) { setError(e.message); }
  };
  const edit = (p: any) => setForm({
    code: p.code, name: p.name, description: p.description, price: String(p.price_cents / 100), washes: String(p.washes_per_period),
    covered: p.covered_package_codes.join(', '), addonPct: String(p.addon_discount_percent), stripePriceId: p.stripe_price_id ?? '',
  });
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h2>Memberships</h2>
      <p className="muted">
        Each plan needs a monthly recurring Price in Stripe (Products → add product → recurring price). Paste its ID (price_…) here.
        Package codes: exterior, interior, full, detail.
      </p>
      <div className="card" style={{ maxWidth: 760, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <input placeholder="Code, e.g. shine" value={form.code} onChange={set('code')} />
        <input placeholder="Name" value={form.name} onChange={set('name')} />
        <input placeholder="Description" value={form.description} onChange={set('description')} style={{ gridColumn: '1 / -1' }} />
        <input placeholder="Price per month (R)" type="number" value={form.price} onChange={set('price')} />
        <input placeholder="Washes per month" type="number" value={form.washes} onChange={set('washes')} />
        <input placeholder="Covered package codes, comma-separated" value={form.covered} onChange={set('covered')} />
        <input placeholder="Add-on discount %" type="number" value={form.addonPct} onChange={set('addonPct')} />
        <input placeholder="Stripe price ID (price_…)" value={form.stripePriceId} onChange={set('stripePriceId')} />
        <button onClick={save} disabled={!form.code || !form.name || !form.price}>Save plan</button>
        {error && <span className="error">{error}</span>}
      </div>
      <div className="card scroll" style={{ marginBottom: 16 }}>
        <h3>Plans</h3>
        <table>
          <thead><tr><th>Plan</th><th>Price</th><th>Washes</th><th>Covers</th><th>Add-on discount</th><th>Stripe price</th><th>Members</th><th></th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}<div className="muted">{p.code}</div></td>
                <td>{money(p.price_cents)}</td><td>{p.washes_per_period}</td><td>{p.covered_package_codes.join(', ')}</td>
                <td>{p.addon_discount_percent}%</td>
                <td>{p.stripe_price_id ?? <span className="error">not set</span>}</td>
                <td>{p.members}</td>
                <td><button className="ghost" onClick={() => edit(p)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card scroll">
        <h3>Members</h3>
        <table>
          <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Period ends</th></tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={4} className="muted">No members yet.</td></tr>}
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.customer_name}<div className="muted">{m.contact}</div></td>
                <td>{m.plan_name}</td>
                <td><span className="pill">{m.status}{m.cancel_at_period_end ? ' · ending' : ''}</span></td>
                <td>{when(m.current_period_end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
