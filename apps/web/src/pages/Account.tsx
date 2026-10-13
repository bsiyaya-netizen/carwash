import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentModal } from '../components/PaymentModal';
import { api, getConfig } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import type { Membership, PaymentSheet, Plan, Vehicle } from '../lib/types';

export function VehicleForm({ onSaved }: { onSaved: (v: Vehicle) => void }) {
  const empty = { make: '', model: '', color: '', plate: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const v = await api<Vehicle>('/vehicles', { body: form });
      setForm(empty);
      onSaved(v);
    } catch (err: any) { setError(err.message); }
  };

  return (
    <form onSubmit={save}>
      <div className="grid cols-2" style={{ gap: 0, columnGap: 12 }}>
        <label className="field"><span>Make</span><input value={form.make} onChange={set('make')} placeholder="Toyota" required /></label>
        <label className="field"><span>Model</span><input value={form.model} onChange={set('model')} placeholder="Corolla" required /></label>
        <label className="field"><span>Colour</span><input value={form.color} onChange={set('color')} placeholder="White" required /></label>
        <label className="field"><span>Licence plate</span><input value={form.plate} onChange={set('plate')} placeholder="CA 123-456" required /></label>
      </div>
      <button className="btn small">Save car</button>
      {error && <span className="error small" style={{ marginLeft: 10 }}>{error}</span>}
    </form>
  );
}

export default function Account() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [profile, setProfile] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<PaymentSheet | null>(null);
  const [pointValue, setPointValue] = useState(10);

  const loadVehicles = () => api<Vehicle[]>('/vehicles').then(setVehicles);
  const loadMembership = () => api<Membership | null>('/memberships/me').then(setMembership);

  useEffect(() => {
    loadVehicles();
    loadMembership();
    api<Plan[]>('/plans').then(setPlans);
    getConfig().then((c) => setPointValue(c.pointValueCents));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await api('/auth/me', { method: 'PATCH', body: { name: profile.name, email: profile.email || null, phone: profile.phone || null } });
      await refresh();
      setMsg('Saved');
    } catch (err: any) { setError(err.message); }
  };

  const join = async (plan: Plan) => {
    setError('');
    try {
      const res = await api('/memberships', { body: { planId: plan.id } });
      if (res.payment) setSheet(res.payment);
      else loadMembership();
    } catch (err: any) { setError(err.message); }
  };

  const cancelMembership = async () => {
    if (!confirm('Cancel your membership? You keep your remaining washes until the end of this period.')) return;
    await api('/memberships/cancel', { method: 'POST' });
    loadMembership();
  };

  const removeVehicle = async (v: Vehicle) => {
    if (!confirm(`Remove ${v.make} ${v.model}?`)) return;
    try { await api(`/vehicles/${v.id}`, { method: 'DELETE' }); loadVehicles(); } catch (err: any) { setError(err.message); }
  };

  const deleteAccount = async () => {
    if (!confirm('Delete your account? This removes your personal details and cancels any membership. It cannot be undone.')) return;
    try {
      await api('/auth/me', { method: 'DELETE' });
      signOut();
      navigate('/');
    } catch (err: any) { setError(err.message); }
  };

  if (!user) return null;
  const shareLink = `${window.location.origin}/login?ref=${user.referral_code}`;

  return (
    <div className="container page narrow">
      <h1>Account</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="row between wrap">
          <div>
            <div className="muted small">Loyalty points</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{user.loyalty_points}</div>
            <div className="muted small">Worth {money(user.loyalty_points * pointValue)} off your next booking</div>
          </div>
          <div>
            <div className="muted small">Your referral code</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{user.referral_code}</div>
            <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(shareLink).then(() => setMsg('Referral link copied'))}>
              Copy invite link
            </button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>You and each friend you refer get 100 points.</p>
      </div>

      <div className="card" id="membership">
        <h3>Membership</h3>
        {membership ? (
          <>
            <p><b>{membership.plan_name}</b>: {membership.remaining} of {membership.washes_per_period} washes left this period.</p>
            <p className="muted small">
              {membership.cancel_at_period_end ? 'Ends' : 'Renews'} on {new Date(membership.current_period_end).toLocaleDateString()}.
            </p>
            {!membership.cancel_at_period_end && <button className="btn ghost small" onClick={cancelMembership}>Cancel membership</button>}
          </>
        ) : (
          <div className="grid cols-2">
            {plans.map((p) => (
              <div key={p.id} className="card" style={{ margin: 0 }}>
                <b>{p.name}</b>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{money(p.price_cents)}<span className="muted small"> / month</span></div>
                <p className="muted small">{p.description}</p>
                <button className="btn small" onClick={() => join(p)}>Join</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>My cars</h3>
        {vehicles.map((v) => (
          <div key={v.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span><b>{v.make} {v.model}</b> <span className="muted small">{v.color} · {v.plate}</span></span>
            <button className="btn ghost small" onClick={() => removeVehicle(v)}>Remove</button>
          </div>
        ))}
        <div style={{ marginTop: 14 }}><VehicleForm onSaved={loadVehicles} /></div>
      </div>

      <div className="card">
        <h3>Profile</h3>
        <form onSubmit={saveProfile}>
          <label className="field"><span>Name</span><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label>
          <label className="field"><span>Email</span><input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
          <label className="field"><span>Mobile number</span><input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+27…" /></label>
          <div className="row">
            <button className="btn small">Save</button>
            {msg && <span className="success small">{msg}</span>}
          </div>
        </form>
      </div>

      <div className="row wrap" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => { signOut(); navigate('/'); }}>Sign out</button>
        <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={deleteAccount}>Delete account</button>
      </div>

      {sheet && (
        <PaymentModal
          payment={sheet}
          title="Start your membership"
          note="Billed monthly. Cancel any time."
          returnPath="/account#membership"
          onDone={() => { setSheet(null); setTimeout(loadMembership, 2000); }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
