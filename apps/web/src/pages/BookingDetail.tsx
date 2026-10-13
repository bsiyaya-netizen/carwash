import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PointsMap, type Marker } from '../components/Maps';
import { PaymentModal } from '../components/PaymentModal';
import { api } from '../lib/api';
import { money, STATUS_LABEL, STATUS_STEPS, when } from '../lib/format';
import { getSocket } from '../lib/socket';
import type { Booking, PaymentSheet } from '../lib/types';

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Booking | null>(null);
  const [washerPos, setWasherPos] = useState<{ lat: number; lng: number } | null>(null);
  const [payment, setPayment] = useState<{ sheet: PaymentSheet; kind: 'booking' | 'tip' } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api<Booking>(`/bookings/${id}`).then((bk) => {
    setB(bk);
    if (bk.washer?.lat != null && bk.washer.lng != null) setWasherPos({ lat: bk.washer.lat, lng: bk.washer.lng });
  }), [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const socket = getSocket();
    const watch = () => socket.emit('booking:watch', id);
    watch();
    socket.on('connect', watch);
    // Socket payloads omit the handover code, so refetch instead of using them directly.
    const onUpdate = (u: Booking) => { if (u.id === id) load(); };
    const onLocation = (p: { bookingId: string; lat: number; lng: number }) => { if (p.bookingId === id) setWasherPos({ lat: p.lat, lng: p.lng }); };
    socket.on('booking:updated', onUpdate);
    socket.on('washer:location', onLocation);
    return () => {
      socket.off('connect', watch);
      socket.off('booking:updated', onUpdate);
      socket.off('washer:location', onLocation);
    };
  }, [id, load]);

  if (error) return <div className="container page"><p className="error">{error}</p></div>;
  if (!b) return <div className="container page muted">Loading…</div>;

  const step = STATUS_STEPS.indexOf(b.status);
  const needsPayment = b.payment_method === 'card' && ['unpaid', 'failed'].includes(b.payment_status) && b.status === 'pending';
  const markers: Marker[] = [{ lat: b.lat, lng: b.lng, label: b.hub ? b.hub.name : 'Your car', kind: b.hub ? 'hub' : 'car' }];
  if (washerPos && ['accepted', 'en_route', 'arrived', 'in_progress'].includes(b.status)) {
    markers.push({ ...washerPos, label: b.washer?.name ?? 'Washer', kind: 'washer' });
  }

  const pay = async () => {
    try {
      const res = await api(`/bookings/${b.id}/pay`, { method: 'POST' });
      if (res.payment) setPayment({ sheet: res.payment, kind: 'booking' });
    } catch (e: any) { setError(e.message); }
  };
  const cancel = async () => {
    if (!confirm('Cancel this booking? Any card hold is released straight away.')) return;
    try { setB(await api(`/bookings/${b.id}/cancel`, { method: 'POST' })); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="container page narrow">
      <p className="muted small" style={{ margin: 0 }}>{b.package.name} · {when(b.scheduled_at)}</p>
      <h1 style={{ color: b.status === 'cancelled' ? 'var(--danger)' : undefined }}>{STATUS_LABEL[b.status]}</h1>
      {b.status !== 'cancelled' && (
        <div className="progress" aria-label={`Step ${step + 1} of ${STATUS_STEPS.length}`}>
          {STATUS_STEPS.map((s, i) => <div key={s} className={i <= step ? 'on' : ''} />)}
        </div>
      )}

      {needsPayment && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <b>Add a payment method to confirm this booking.</b>
          <p className="muted small">We will start looking for a washer as soon as your card is confirmed.</p>
          <button className="btn" onClick={pay}>Add payment</button>
        </div>
      )}

      {b.handover_otp && ['accepted', 'en_route', 'arrived'].includes(b.status) && (
        <div className="card otp-box">
          <div className="muted small">Your handover code. Give it to your washer when they arrive.</div>
          <div className="code">{b.handover_otp}</div>
        </div>
      )}

      <div className="card"><PointsMap markers={markers} center={washerPos ?? { lat: b.lat, lng: b.lng }} zoom={14} /></div>

      {b.washer && (
        <div className="card row between">
          <div>
            <b>{b.washer.name}</b>
            <div className="muted small">{b.washer.rating ? `★ ${b.washer.rating}` : 'New washer'}</div>
          </div>
          {b.washer.phone && <a className="btn ghost small" href={`tel:${b.washer.phone}`}>Call</a>}
        </div>
      )}

      <div className="card">
        <div className="muted small">{b.vehicle.color} {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}</div>
        <div className="muted small">{b.hub ? `${b.hub.name}, ${b.hub.address}` : b.address}</div>
        {b.addons.length > 0 && <div className="muted small">Add-ons: {b.addons.map((a) => a.name).join(', ')}</div>}
        <div style={{ marginTop: 10 }}>
          <div className="summary-line"><span className="muted">Subtotal</span><span>{money(b.subtotal_cents)}</span></div>
          {b.membership_discount_cents > 0 && <div className="summary-line success"><span>Membership</span><span>-{money(b.membership_discount_cents)}</span></div>}
          {b.discount_cents > 0 && <div className="summary-line success"><span>Promo</span><span>-{money(b.discount_cents)}</span></div>}
          {b.points_discount_cents > 0 && <div className="summary-line success"><span>Points</span><span>-{money(b.points_discount_cents)}</span></div>}
          <div className="summary-line total"><span>Total ({b.payment_method})</span><span>{money(b.total_cents)}</span></div>
          {b.tip_cents > 0 && <div className="summary-line"><span className="muted">Tip</span><span>{money(b.tip_cents)}</span></div>}
        </div>
      </div>

      {['pending', 'accepted'].includes(b.status) && <button className="btn danger" onClick={cancel}>Cancel booking</button>}
      {b.status === 'completed' && <AfterWash b={b} onTipSheet={(sheet) => setPayment({ sheet, kind: 'tip' })} onChange={load} />}

      {payment && (
        <PaymentModal
          payment={payment.sheet}
          title={payment.kind === 'tip' ? 'Send a tip' : 'Add a payment method'}
          note={payment.kind === 'tip' ? `100% goes to ${b.washer?.name ?? 'your washer'}.` : 'We only charge your card when the wash is complete.'}
          returnPath={`/bookings/${b.id}`}
          onDone={() => { setPayment(null); setTimeout(load, 1500); }}
          onClose={() => setPayment(null)}
        />
      )}
    </div>
  );
}

function AfterWash({ b, onTipSheet, onChange }: { b: Booking; onTipSheet: (s: PaymentSheet) => void; onChange: () => void }) {
  const [rating, setRating] = useState(b.review?.rating ?? 0);
  const [comment, setComment] = useState(b.review?.comment ?? '');
  const [saved, setSaved] = useState(!!b.review);
  const [thanks, setThanks] = useState('');

  const submit = async () => {
    await api(`/bookings/${b.id}/review`, { body: { rating, comment } });
    setSaved(true);
  };
  const tip = async (cents: number) => {
    const res = await api(`/bookings/${b.id}/tip`, { body: { amountCents: cents } });
    if (res.payment) onTipSheet(res.payment);
    else { setThanks(`Thanks! Your ${money(cents)} tip goes straight to ${b.washer?.name ?? 'your washer'}.`); onChange(); }
  };

  return (
    <>
      <div className="card">
        <h3>Rate your wash</h3>
        <div className="stars" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-label={`${n} stars`} className={n <= rating ? 'on' : ''} onClick={() => { setRating(n); setSaved(false); }}>★</button>
          ))}
        </div>
        <textarea rows={3} placeholder="Tell us how it went (optional)" value={comment} onChange={(e) => { setComment(e.target.value); setSaved(false); }} style={{ margin: '10px 0' }} />
        <button className="btn" onClick={submit} disabled={!rating || saved}>{saved ? 'Review saved' : 'Submit review'}</button>
      </div>
      <div className="card">
        <h3>Add a tip</h3>
        <div className="chips">
          {[2000, 5000, 10000].map((c) => <button key={c} className="chip" onClick={() => tip(c)}>{money(c)}</button>)}
        </div>
        {thanks && <p className="success small" style={{ marginTop: 10 }}>{thanks}</p>}
      </div>
    </>
  );
}
