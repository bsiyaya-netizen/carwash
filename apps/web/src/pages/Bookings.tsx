import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { money, STATUS_LABEL, when } from '../lib/format';
import { getSocket } from '../lib/socket';
import type { Booking } from '../lib/types';

export default function Bookings() {
  const [rows, setRows] = useState<Booking[] | null>(null);

  useEffect(() => {
    const load = () => api<Booking[]>('/bookings').then(setRows);
    load();
    const socket = getSocket();
    socket.on('booking:updated', load);
    return () => { socket.off('booking:updated', load); };
  }, []);

  if (!rows) return <div className="container page muted">Loading…</div>;
  const upcoming = rows.filter((b) => !['completed', 'cancelled'].includes(b.status));
  const past = rows.filter((b) => ['completed', 'cancelled'].includes(b.status));

  return (
    <div className="container page narrow">
      <div className="row between wrap">
        <h1 style={{ margin: 0 }}>My bookings</h1>
        <Link to="/book" className="btn">Book a wash</Link>
      </div>
      <h3 style={{ marginTop: 28 }}>Upcoming</h3>
      {upcoming.length === 0 && <p className="muted">Nothing booked. <Link to="/book">Book a wash</Link></p>}
      {upcoming.map((b) => <Row key={b.id} b={b} />)}
      {past.length > 0 && <h3 style={{ marginTop: 28 }}>History</h3>}
      {past.map((b) => <Row key={b.id} b={b} />)}
    </div>
  );
}

function Row({ b }: { b: Booking }) {
  const needsPayment = b.payment_method === 'card' && ['unpaid', 'failed'].includes(b.payment_status) && b.status === 'pending';
  return (
    <Link to={`/bookings/${b.id}`} className="list-item" style={{ display: 'block', marginBottom: 12 }}>
      <div className="card">
        <div className="row between">
          <b>{b.package.name}{b.addons.length ? ` + ${b.addons.length} add-on${b.addons.length > 1 ? 's' : ''}` : ''}</b>
          <b>{money(b.total_cents)}</b>
        </div>
        <div className="muted small">{when(b.scheduled_at)} · {b.vehicle.make} {b.vehicle.model} · {b.hub ? b.hub.name : b.address || 'Pinned location'}</div>
        <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
          <span className="pill">{STATUS_LABEL[b.status]}</span>
          {b.recurrence !== 'none' && <span className="pill">Repeats {b.recurrence}</span>}
          {needsPayment && <span className="pill error">Payment needed</span>}
        </div>
      </div>
    </Link>
  );
}
