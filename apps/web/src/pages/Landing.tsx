import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PointsMap } from '../components/Maps';
import { api } from '../lib/api';
import { money } from '../lib/format';
import type { Hub, Package, Plan } from '../lib/types';

const FEATURES = [
  { icon: '📍', title: 'We come to you', body: 'Drop a pin at home, the office or the gym parking lot. Or drive into one of our hubs.' },
  { icon: '🛰️', title: 'Track your washer live', body: 'See your washer on the map as they drive over, with updates at every step.' },
  { icon: '🔐', title: 'Handover code', body: 'Your washer can only start once you share the 4-digit code from your app. No surprises.' },
  { icon: '💳', title: 'Pay when it is done', body: 'Card, Apple Pay, Google Pay or cash. Cards are only charged once the wash is finished.' },
  { icon: '🔁', title: 'Set and forget', body: 'Repeat weekly or monthly, or join a membership and stop thinking about it.' },
  { icon: '⭐', title: 'Rated washers', body: 'Every wash is rated, so only the best stay on the team. Tips go 100% to your washer.' },
];

const FAQ = [
  ['Do I need to be home?', 'Only at the start, to give your washer the handover code and the keys if you booked an interior clean. After that, carry on with your day; we notify you when it is done.'],
  ['Do you need water or power from me?', 'No. Our washers bring everything, including water-saving equipment.'],
  ['When is my card charged?', 'We place a hold when you book and only charge it once the wash is completed. If you cancel before the washer starts, the hold is released.'],
  ['Can I cancel?', 'Yes, any time before the washer is on the way, at no cost.'],
  ['How do loyalty points work?', 'You earn 1 point for every R1 you spend, plus 100 points for every friend you refer. 100 points take R10 off a booking.'],
];

export default function Landing() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);

  useEffect(() => {
    api<Package[]>('/packages').then(setPackages).catch(() => {});
    api<Plan[]>('/plans').then(setPlans).catch(() => {});
    api<Hub[]>('/hubs').then(setHubs).catch(() => {});
  }, []);

  const mains = packages.filter((p) => !p.is_addon);
  const addons = packages.filter((p) => p.is_addon);
  const packageName = (code: string) => packages.find((p) => p.code === code)?.name ?? code;

  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <span className="badge" style={{ background: 'rgba(19,196,196,.2)', color: '#7fe9e9' }}>Mobile car wash</span>
            <h1 style={{ marginTop: 14 }}>Your car, washed wherever it's parked.</h1>
            <p className="lead">Book a hand wash in under a minute. A vetted washer comes to your home or office, and you only pay once the job is done.</p>
            <div className="cta">
              <Link to="/book" className="btn teal">Book a wash</Link>
              <a href="#pricing" className="btn ghost">See prices</a>
            </div>
            <div className="hero-stats">
              <div><b>{mains[0] ? `from ${money(mains[0].price_cents)}` : 'From R150'}</b><span>exterior wash</span></div>
              <div><b>~30 min</b><span>typical wash</span></div>
              <div><b>7 days</b><span>a week</span></div>
            </div>
          </div>
          <div className="hero-card" aria-hidden="true">
            <div className="step"><span className="dot">1</span>Pick a package and a time</div>
            <div className="step"><span className="dot">2</span>Pin where your car is parked</div>
            <div className="step"><span className="dot">3</span>Track your washer on the map</div>
            <div className="step"><span className="dot">4</span>Share your handover code</div>
            <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 14, background: 'rgba(0,0,0,.2)' }}>
              <div style={{ color: '#a9bfd8', fontSize: 13 }}>Your handover code</div>
              <div className="otp">4821</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <h2>Why people switch to Sparkle Wash</h2>
          <p className="lead">No queues, no driving across town, no waiting around. We built every step around your time and your car's safety.</p>
          <div className="grid cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card feature">
                <div className="icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="container">
          <h2>Simple, upfront pricing</h2>
          <p className="lead">Pick a package, add extras if you like. The price you see is the price you pay.</p>
          <div className="grid cols-4">
            {mains.map((p) => (
              <div key={p.id} className={`card price-card ${p.code === 'full' ? 'featured' : ''}`}>
                {p.code === 'full' && <span className="badge">Most popular</span>}
                <h3 style={{ marginTop: 8 }}>{p.name}</h3>
                <div className="amount">{money(p.price_cents)}</div>
                <p className="muted small">{p.description}</p>
                <p className="small muted">About {p.duration_min} minutes</p>
                <Link to={`/book?package=${p.code}`} className="btn block">Book</Link>
              </div>
            ))}
          </div>
          {addons.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Add-ons</h3>
              <div className="grid cols-3">
                {addons.map((a) => (
                  <div key={a.id} className="row between">
                    <div><b>{a.name}</b><div className="muted small">{a.description}</div></div>
                    <b>+{money(a.price_cents)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {plans.length > 0 && (
        <section className="section" id="memberships">
          <div className="container">
            <h2>Memberships</h2>
            <p className="lead">A clean car all month for one monthly price. Cancel any time; your washes last until the end of the period.</p>
            <div className="grid cols-2">
              {plans.map((p, i) => (
                <div key={p.id} className={`card price-card ${i === plans.length - 1 ? 'featured' : ''}`}>
                  <h3>{p.name}</h3>
                  <div className="amount">{money(p.price_cents)}<span className="muted small"> / month</span></div>
                  <ul>
                    <li>{p.washes_per_period} washes a month</li>
                    <li>Covers: {p.covered_package_codes.map(packageName).join(', ')}</li>
                    {p.addon_discount_percent > 0 && <li>{p.addon_discount_percent}% off every add-on</li>}
                    <li>Earn loyalty points on add-ons</li>
                  </ul>
                  <Link to="/account#membership" className="btn block">Join {p.name}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hubs.length > 0 && (
        <section className="section alt" id="hubs">
          <div className="container">
            <h2>Prefer to drive in? Visit a hub</h2>
            <p className="lead">Same washers, same prices. Book a slot and drop in.</p>
            <div className="grid cols-2" style={{ alignItems: 'start' }}>
              <PointsMap
                tall
                zoom={5}
                center={{ lat: hubs.reduce((s, h) => s + h.lat, 0) / hubs.length, lng: hubs.reduce((s, h) => s + h.lng, 0) / hubs.length }}
                markers={hubs.map((h) => ({ lat: h.lat, lng: h.lng, label: h.name, kind: 'hub' as const }))}
              />
              <div>
                {hubs.map((h) => (
                  <div key={h.id} className="card">
                    <h3 style={{ marginBottom: 4 }}>{h.name}</h3>
                    <div className="muted small">{h.address}</div>
                    <div className="muted small">{h.hours}{h.phone ? ` · ${h.phone}` : ''}</div>
                    <Link to={`/book?hub=${h.id}`} className="btn small" style={{ marginTop: 10 }}>Book at this hub</Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section" id="faq">
        <div className="container narrow">
          <h2>Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="faq">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="hero" style={{ padding: '56px 0' }}>
        <div className="container" style={{ display: 'block', textAlign: 'center' }}>
          <h2 style={{ fontSize: 34 }}>Ready for a cleaner car?</h2>
          <p className="lead" style={{ margin: '0 auto 24px' }}>Get 20% off your first wash with code <b>WELCOME20</b>.</p>
          <Link to="/book" className="btn teal">Book your first wash</Link>
        </div>
      </section>
    </>
  );
}
