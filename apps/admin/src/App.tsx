import { useState } from 'react';
import { api, getToken, setToken } from './api';
import Bookings from './pages/Bookings';
import Campaigns from './pages/Campaigns';
import Customers from './pages/Customers';
import Overview from './pages/Overview';
import Promos from './pages/Promos';
import Washers from './pages/Washers';

const PAGES = { Overview, Bookings, Customers, Washers, Campaigns, Promos } as const;
type PageName = keyof typeof PAGES;

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [page, setPage] = useState<PageName>('Overview');
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const Page = PAGES[page];
  return (
    <div className="layout">
      <nav className="nav">
        <h1>🚿 Car Wash Admin</h1>
        {(Object.keys(PAGES) as PageName[]).map((p) => (
          <a key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</a>
        ))}
        <a onClick={() => { setToken(null); setAuthed(false); }}>Sign out</a>
      </nav>
      <main className="main"><Page /></main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const request = async () => {
    setError('');
    try {
      const res = await api('/auth/request-code', { phone });
      if (res.devCode) setCode(res.devCode);
      setSent(true);
    } catch (e: any) { setError(e.message); }
  };
  const verify = async () => {
    setError('');
    try {
      const res = await api('/auth/verify', { phone, code });
      if (res.user.role !== 'admin') throw new Error('This account is not an admin.');
      setToken(res.token);
      onDone();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="login card">
      <h2 style={{ margin: 0 }}>Admin sign in</h2>
      <input placeholder="+27000000001" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
      {sent && <input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />}
      {sent ? <button onClick={verify}>Sign in</button> : <button onClick={request}>Send code</button>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
