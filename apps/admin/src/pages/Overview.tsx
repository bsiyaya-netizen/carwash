import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getSocket, money } from '../api';

interface Stats {
  today: { bookings: number; revenue_cents: number };
  month: { bookings: number; revenue_cents: number };
  totals: { pending: number; active: number; cancelled: number; total: number };
  revenueByDay: { day: string; revenue_cents: number; bookings: number }[];
  revenueByMonth: { month: string; revenue_cents: number; bookings: number }[];
  peakHours: { hour: number; bookings: number }[];
  packages: { name: string; bookings: number; revenue_cents: number }[];
  quality: { avg_rating: number | null; reviews: number; low_ratings: number };
  customers: { customers: number; repeat_customers: number };
}

const axis = { stroke: 'var(--text-2)', fontSize: 12, tickLine: false, axisLine: { stroke: 'var(--border)' } };

export default function Overview() {
  const [s, setS] = useState<Stats | null>(null);
  const load = useCallback(() => api<Stats>('/admin/stats').then(setS), []);

  useEffect(() => {
    load();
    // Real-time: refresh whenever any booking changes.
    const socket = getSocket();
    socket.on('booking:updated', load);
    return () => { socket.off('booking:updated', load); };
  }, [load]);

  if (!s) return <p className="muted">Loading…</p>;
  const repeatRate = s.customers.customers ? Math.round((s.customers.repeat_customers / s.customers.customers) * 100) : 0;

  return (
    <>
      <h2>Overview</h2>
      <div className="grid">
        <Stat label="Revenue today" value={money(s.today.revenue_cents)} sub={plural(s.today.bookings, "wash", "washes")} />
        <Stat label="Revenue this month" value={money(s.month.revenue_cents)} sub={plural(s.month.bookings, "wash", "washes")} />
        <Stat label="Live jobs" value={String(s.totals.active)} sub={`${s.totals.pending} waiting for a washer`} />
        <Stat label="Average rating" value={s.quality.avg_rating ? `★ ${s.quality.avg_rating}` : '–'} sub={`${plural(s.quality.reviews, "review", "reviews")} · ${s.quality.low_ratings} at 1–2★`} />
        <Stat label="Repeat customers" value={`${repeatRate}%`} sub={`${s.customers.repeat_customers} of ${s.customers.customers}`} />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Daily revenue, last 30 days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.revenueByDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis {...axis} width={64} tickFormatter={(c: number) => money(c).replace(/\.00$/, '')} />
              <Tooltip cursor={{ fill: 'var(--grid)' }} content={({ active, payload }) => active && payload?.length ? (
                <div className="tooltip"><b>{payload[0].payload.day}</b><br />{money(payload[0].payload.revenue_cents)} · {payload[0].payload.bookings} washes</div>
              ) : null} />
              <Bar dataKey="revenue_cents" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Peak booking hours</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.peakHours} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="hour" {...axis} tickFormatter={(h: number) => `${h}h`} interval={2} />
              <YAxis {...axis} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--grid)' }} content={({ active, payload }) => active && payload?.length ? (
                <div className="tooltip"><b>{payload[0].payload.hour}:00–{payload[0].payload.hour + 1}:00</b><br />{payload[0].payload.bookings} bookings</div>
              ) : null} />
              <Bar dataKey="bookings" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid2">
        <div className="card scroll">
          <h3>Packages</h3>
          <table>
            <thead><tr><th>Package</th><th>Completed</th><th>Revenue</th></tr></thead>
            <tbody>{s.packages.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.bookings}</td><td>{money(p.revenue_cents)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card scroll">
          <h3>Monthly revenue</h3>
          <table>
            <thead><tr><th>Month</th><th>Washes</th><th>Revenue</th></tr></thead>
            <tbody>
              {s.revenueByMonth.length === 0 && <tr><td colSpan={3} className="muted">No completed washes yet.</td></tr>}
              {s.revenueByMonth.map((m) => <tr key={m.month}><td>{m.month}</td><td>{m.bookings}</td><td>{money(m.revenue_cents)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
