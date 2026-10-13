import { useEffect, useState } from 'react';
import { api, when } from '../api';
import { SEGMENTS } from './Customers';

export default function Campaigns() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', body: '', segment: 'all' as keyof typeof SEGMENTS });
  const [msg, setMsg] = useState('');

  const load = () => api<any[]>('/admin/campaigns').then(setRows);
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!confirm(`Send this push notification to "${SEGMENTS[form.segment]}"?`)) return;
    const c = await api('/admin/campaigns', form);
    setMsg(`Sent to ${c.sent_count} devices.`);
    setForm({ ...form, title: '', body: '' });
    load();
  };

  return (
    <>
      <h2>Push campaigns</h2>
      <div className="card" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as keyof typeof SEGMENTS })}>
          {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Title, e.g. Weekend special" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea rows={3} placeholder="Message, e.g. 20% off a Full Valet with code WEEKEND20" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <button onClick={send} disabled={!form.title || !form.body}>Send notification</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Sent</th><th>Segment</th><th>Title</th><th>Message</th><th>Devices</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}><td>{when(c.created_at)}</td><td>{SEGMENTS[c.segment as keyof typeof SEGMENTS] ?? c.segment}</td><td>{c.title}</td><td>{c.body}</td><td>{c.sent_count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
