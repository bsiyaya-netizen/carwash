import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getConfig } from '../lib/api';
import { useAuth } from '../lib/auth';

declare global {
  interface Window { google?: any }
}

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/bookings';

  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [target, setTarget] = useState('');
  const [step, setStep] = useState<'target' | 'code'>('target');
  const [code, setCode] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [referral, setReferral] = useState(params.get('ref') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const done = (res: any) => {
    signIn(res.token, res.user);
    navigate(next, { replace: true });
  };

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api('/auth/request-code', { body: { [channel]: target } });
      setIsNew(res.isNewUser);
      if (res.devCode) setCode(res.devCode); // dev only, until SMS/email delivery is configured
      setStep('code');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      done(await api('/auth/verify', {
        body: { [channel]: target, code, role: 'customer', ...(isNew ? { name, referralCode: referral || undefined } : {}) },
      }));
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="container page" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1 style={{ fontSize: 26 }}>{step === 'code' ? 'Enter your code' : 'Sign in or create an account'}</h1>
        {step === 'target' ? (
          <form onSubmit={request}>
            <div className="tabs" role="tablist">
              <button type="button" className={channel === 'phone' ? 'on' : ''} onClick={() => { setChannel('phone'); setTarget(''); }}>Phone</button>
              <button type="button" className={channel === 'email' ? 'on' : ''} onClick={() => { setChannel('email'); setTarget(''); }}>Email</button>
            </div>
            <label className="field">
              <span>{channel === 'phone' ? 'Mobile number' : 'Email address'}</span>
              {channel === 'phone'
                ? <input type="tel" autoComplete="tel" placeholder="+27 82 123 4567" value={target} onChange={(e) => setTarget(e.target.value)} required />
                : <input type="email" autoComplete="email" placeholder="you@example.com" value={target} onChange={(e) => setTarget(e.target.value)} required />}
            </label>
            <button className="btn block" disabled={busy || target.length < 5}>Send me a code</button>
            {error && <p className="error small" style={{ marginTop: 10 }}>{error}</p>}
            <GoogleButton onToken={async (idToken) => {
              setError('');
              try { done(await api('/auth/google', { body: { idToken, referralCode: referral || undefined } })); }
              catch (err: any) { setError(err.message); }
            }} />
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted small">We sent a 6-digit code to {target}.</p>
            <label className="field"><span>Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            </label>
            {isNew && (
              <>
                <label className="field"><span>Your name</span><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
                <label className="field"><span>Referral code (optional)</span><input value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} /></label>
              </>
            )}
            <button className="btn block" disabled={busy || code.length !== 6 || (isNew && !name)}>{isNew ? 'Create account' : 'Sign in'}</button>
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { setStep('target'); setCode(''); }}>Back</button>
            {error && <p className="error small" style={{ marginTop: 10 }}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

/** Google Identity Services button. Only shown when the API has a Google client ID configured. */
function GoogleButton({ onToken }: { onToken: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string>();
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => { getConfig().then((c) => setClientId(c.googleClientIds[0])).catch(() => {}); }, []);

  useEffect(() => {
    if (!clientId) return;
    const render = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => callback.current(r.credential) });
      if (ref.current) window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 360, text: 'continue_with' });
    };
    if (window.google?.accounts) return render();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId]);

  if (!clientId) return null;
  return (
    <>
      <div className="divider">or</div>
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />
    </>
  );
}
