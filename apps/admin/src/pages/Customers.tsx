import { useEffect, useState } from 'react';
import { api, money, when } from '../api';

export const SEGMENTS = {
  all: 'All customers',
  repeat: 'Repeat (2+ washes)',
  new: 'Signed up, never washed',
  inactive: 'Inactive 30+ days',
} as const;

export default function Customers() {
  const [segment, setSegment] = useState<keyof typeof SEGMENTS>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const t = setTimeout(() => api<any[]>(`/admin/customers?segment=${segment}&q=${encodeURIComponent(q)}`).then(setRows), 250);
    return () => clearTimeout(t);
  }, [segment, q]);

  return (
    <>
      <h2>Customers</h2>
      <div className="toolbar">
        <select value={segment} onChange={(e) => setSegment(e.target.value as keyof typeof SEGMENTS)}>
          {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted">{rows.length} customers</span>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Washes</th><th>Spend</th><th>Points</th><th>Referrals</th><th>Last booking</th><th>Push</th><th>Joined</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone ?? <span className="muted">–</span>}</td>
                <td>{c.email ?? <span className="muted">–</span>}</td>
                <td>{c.completed_count}</td>
                <td>{money(c.spend_cents)}</td>
                <td>{c.loyalty_points}</td>
                <td>{c.referrals}<div className="muted">{c.referral_code}</div></td>
                <td>{when(c.last_booking_at)}</td>
                <td>{c.has_push ? 'Yes' : <span className="muted">No</span>}</td>
                <td>{when(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
