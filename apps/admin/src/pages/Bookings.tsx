import { useCallback, useEffect, useState } from 'react';
import { api, getSocket, money, when } from '../api';

const STATUSES = ['', 'pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'];

export default function Bookings() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(() => api<any[]>(`/admin/bookings${status ? `?status=${status}` : ''}`).then(setRows), [status]);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('booking:updated', load);
    return () => { socket.off('booking:updated', load); };
  }, [load]);

  const cancel = async (id: string) => {
    if (!confirm('Cancel this booking? The customer will be notified and any card hold released.')) return;
    await api(`/bookings/${id}/cancel`, {}, 'POST');
    load();
  };

  return (
    <>
      <h2>Bookings</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace('_', ' ') : 'All statuses'}</option>)}
        </select>
        <span className="muted">{rows.length} bookings · updates live</span>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>When</th><th>Customer</th><th>Vehicle</th><th>Package</th><th>Washer</th><th>Status</th><th>Total</th><th>Payment</th><th>Rating</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{when(b.scheduled_at)}{b.recurrence !== 'none' && <div className="muted">repeats {b.recurrence}</div>}</td>
                <td>{b.customer.name}<div className="muted">{b.customer.phone}</div></td>
                <td>{b.vehicle.make} {b.vehicle.model}<div className="muted">{b.vehicle.plate}</div></td>
                <td>{b.package.name}{b.addons.length > 0 && <div className="muted">+ {b.addons.map((a: any) => a.name).join(', ')}</div>}</td>
                <td>{b.washer?.name ?? <span className="muted">–</span>}</td>
                <td><span className="pill">{b.status.replace('_', ' ')}</span></td>
                <td>{money(b.total_cents)}{b.tip_cents > 0 && <div className="muted">+{money(b.tip_cents)} tip</div>}</td>
                <td>{b.payment_method}<div className="muted">{b.payment_status}</div></td>
                <td>{b.review ? `★ ${b.review.rating}` : ''}</td>
                <td>{['pending', 'accepted'].includes(b.status) && <button className="ghost" onClick={() => cancel(b.id)}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
