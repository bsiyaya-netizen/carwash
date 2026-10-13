import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPicker, type Pt } from '../components/Maps';
import { PaymentModal } from '../components/PaymentModal';
import { api, getConfig } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, when } from '../lib/format';
import type { Hub, Package, PaymentSheet, Quote, Vehicle } from '../lib/types';
import { VehicleForm } from './Account';

const DEFAULT_PIN = { lat: -26.2041, lng: 28.0473 }; // Johannesburg

export default function Book() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [pointValue, setPointValue] = useState(10);

  const [vehicleId, setVehicleId] = useState<string>();
  const [packageId, setPackageId] = useState<string>();
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [slot, setSlot] = useState<string>();
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [where, setWhere] = useState<'mobile' | 'hub'>(params.get('hub') ? 'hub' : 'mobile');
  const [hubId, setHubId] = useState<string | undefined>(params.get('hub') ?? undefined);
  const [pin, setPin] = useState<Pt>(DEFAULT_PIN);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [promo, setPromo] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ bookingId: string; payment: PaymentSheet } | null>(null);

  const loadVehicles = () => api<Vehicle[]>('/vehicles').then((v) => { setVehicles(v); setVehicleId((id) => id ?? v[0]?.id); });

  useEffect(() => {
    loadVehicles();
    api<Package[]>('/packages').then((p) => {
      setPackages(p);
      const wanted = p.find((x) => x.code === params.get('package') && !x.is_addon);
      if (wanted) setPackageId(wanted.id);
    });
    api<string[]>('/slots').then(setSlots);
    api<Hub[]>('/hubs').then(setHubs);
    getConfig().then((c) => setPointValue(c.pointValueCents));
    navigator.geolocation?.getCurrentPosition((pos) => setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redeemPoints = usePoints ? user?.loyalty_points ?? 0 : 0;

  useEffect(() => {
    if (!packageId) { setQuote(null); return; }
    const t = setTimeout(() => {
      api<Quote>('/bookings/quote', { body: { packageId, addonIds, promoCode: promo || null, redeemPoints } })
        .then((q) => { setQuote(q); setQuoteError(''); })
        .catch((e) => { setQuote(null); setQuoteError(e.message); });
    }, 250);
    return () => clearTimeout(t);
  }, [packageId, addonIds, promo, redeemPoints]);

  const mains = packages.filter((p) => !p.is_addon);
  const addons = packages.filter((p) => p.is_addon);
  const slotsByDay = useMemo(() => {
    const days = new Map<string, string[]>();
    for (const s of slots) {
      const d = new Date(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      days.set(d, [...(days.get(d) ?? []), s]);
    }
    return [...days.entries()];
  }, [slots]);
  const [day, setDay] = useState<string>();
  const activeDay = day ?? slotsByDay[0]?.[0];

  const free = quote?.totalCents === 0;
  const canBook = vehicleId && packageId && slot && quote && (where === 'mobile' || hubId) && !busy;

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const res = await api('/bookings', {
        body: {
          vehicleId, packageId, addonIds, scheduledAt: slot, recurrence, promoCode: promo || null, redeemPoints,
          paymentMethod, notes,
          ...(where === 'hub' ? { hubId } : { lat: pin.lat, lng: pin.lng, address }),
        },
      });
      refresh();
      if (res.payment) setPending({ bookingId: res.booking.id, payment: res.payment });
      else navigate(`/bookings/${res.booking.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <h1>Book a wash</h1>
      <div className="book-layout">
        <div>
          <div className="card">
            <h3>1. Your car</h3>
            {vehicles.length > 0 && (
              <div className="chips" style={{ marginBottom: 12 }}>
                {vehicles.map((v) => (
                  <button key={v.id} className={`chip ${vehicleId === v.id ? 'on' : ''}`} onClick={() => setVehicleId(v.id)}>
                    {v.make} {v.model} · {v.plate}
                  </button>
                ))}
              </div>
            )}
            <details open={vehicles.length === 0}>
              <summary className="muted small" style={{ cursor: 'pointer' }}>{vehicles.length ? 'Add another car' : 'Add your car'}</summary>
              <div style={{ marginTop: 12 }}><VehicleForm onSaved={(v) => { loadVehicles(); setVehicleId(v.id); }} /></div>
            </details>
          </div>

          <div className="card">
            <h3>2. Package</h3>
            <div className="grid" style={{ gap: 10 }}>
              {mains.map((p) => (
                <button key={p.id} className={`tile ${packageId === p.id ? 'on' : ''}`} onClick={() => setPackageId(p.id)}>
                  <div className="row between"><b>{p.name}</b><span className="price">{money(p.price_cents)}</span></div>
                  <div className="muted small">{p.description} · ~{p.duration_min} min</div>
                </button>
              ))}
            </div>
            <h3 style={{ marginTop: 18 }}>Add-ons</h3>
            <div className="chips">
              {addons.map((a) => (
                <button key={a.id} className={`chip ${addonIds.includes(a.id) ? 'on' : ''}`}
                  onClick={() => setAddonIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}>
                  {a.name} +{money(a.price_cents)}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>3. When</h3>
            <div className="slots" style={{ marginBottom: 10 }}>
              {slotsByDay.map(([d]) => (
                <button key={d} className={`chip ${activeDay === d ? 'on' : ''}`} onClick={() => setDay(d)}>{d}</button>
              ))}
            </div>
            <div className="chips">
              {slotsByDay.find(([d]) => d === activeDay)?.[1].map((s) => (
                <button key={s} className={`chip ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
                  {new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 14 }}>
              {(['none', 'weekly', 'monthly'] as const).map((r) => (
                <button key={r} className={`chip ${recurrence === r ? 'on' : ''}`} onClick={() => setRecurrence(r)}>
                  {r === 'none' ? 'One-off' : `Repeat ${r}`}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>4. Where</h3>
            <div className="tabs">
              <button className={where === 'mobile' ? 'on' : ''} onClick={() => setWhere('mobile')}>Come to me</button>
              <button className={where === 'hub' ? 'on' : ''} onClick={() => setWhere('hub')}>I'll visit a hub</button>
            </div>
            {where === 'mobile' ? (
              <>
                <p className="muted small">Click the map to put the pin exactly where the car is parked.</p>
                <MapPicker value={pin} onChange={setPin} />
                <button className="btn ghost small" style={{ marginTop: 8 }}
                  onClick={() => navigator.geolocation?.getCurrentPosition((p) => setPin({ lat: p.coords.latitude, lng: p.coords.longitude }))}>
                  Use my location
                </button>
                <label className="field" style={{ marginTop: 12 }}><span>Address or landmark</span>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Oak Ave, Parkhurst" />
                </label>
                <label className="field"><span>Notes for the washer (optional)</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Basement parking, bay 12" />
                </label>
              </>
            ) : (
              <div className="grid" style={{ gap: 10 }}>
                {hubs.map((h) => (
                  <button key={h.id} className={`tile ${hubId === h.id ? 'on' : ''}`} onClick={() => setHubId(h.id)}>
                    <b>{h.name}</b>
                    <div className="muted small">{h.address} · {h.hours}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="book-summary">
          <div className="card">
            <h3>Payment</h3>
            {!free && (
              <div className="chips" style={{ marginBottom: 12 }}>
                <button className={`chip ${paymentMethod === 'card' ? 'on' : ''}`} onClick={() => setPaymentMethod('card')}>Card / Apple Pay / Google Pay</button>
                <button className={`chip ${paymentMethod === 'cash' ? 'on' : ''}`} onClick={() => setPaymentMethod('cash')}>Cash</button>
              </div>
            )}
            <label className="field"><span>Promo code</span>
              <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="WELCOME20" />
            </label>
            {(user?.loyalty_points ?? 0) > 0 && (
              <label className="row small" style={{ marginBottom: 12 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                Use my {user!.loyalty_points} points (worth up to {money(user!.loyalty_points * pointValue)})
              </label>
            )}
            {quoteError && <p className="error small">{quoteError}</p>}
            {quote ? (
              <>
                <div className="summary-line"><span className="muted">Subtotal</span><span>{money(quote.subtotalCents)}</span></div>
                {quote.membershipDiscountCents > 0 && <div className="summary-line success"><span>Membership</span><span>-{money(quote.membershipDiscountCents)}</span></div>}
                {quote.discountCents > 0 && <div className="summary-line success"><span>Promo</span><span>-{money(quote.discountCents)}</span></div>}
                {quote.pointsDiscountCents > 0 && <div className="summary-line success"><span>{quote.pointsRedeemed} points</span><span>-{money(quote.pointsDiscountCents)}</span></div>}
                <div className="summary-line total"><span>Total</span><span>{money(quote.totalCents)}</span></div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  About {quote.durationMin} minutes.
                  {quote.membershipWashesLeft != null && ` ${quote.membershipWashesLeft} membership washes left after this.`}
                  {!free && paymentMethod === 'card' && ' Your card is only charged when the wash is done.'}
                </p>
              </>
            ) : <p className="muted small">Choose a package to see your price.</p>}
            {slot && <p className="small"><b>{when(slot)}</b>{recurrence !== 'none' ? `, repeats ${recurrence}` : ''}</p>}
            <button className="btn block" onClick={confirm} disabled={!canBook}>{busy ? 'Booking…' : 'Confirm booking'}</button>
            {error && <p className="error small" style={{ marginTop: 10 }}>{error}</p>}
            <p className="muted small" style={{ marginTop: 10 }}>Free cancellation until your washer is on the way. <Link to="/terms">Terms</Link></p>
          </div>
        </div>
      </div>

      {pending && (
        <PaymentModal
          payment={pending.payment}
          title="Add a payment method"
          note="We place a hold now and only charge your card when the wash is complete."
          returnPath={`/bookings/${pending.bookingId}`}
          onDone={() => navigate(`/bookings/${pending.bookingId}`)}
          onClose={() => navigate(`/bookings/${pending.bookingId}`)}
        />
      )}
    </div>
  );
}
