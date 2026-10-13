import { useEffect, useState } from 'react';
import { api } from '../api';

const EMPTY = { id: '', name: '', address: '', lat: '', lng: '', phone: '', hours: 'Mon-Sat 08:00-17:00', active: true };

export default function Hubs() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const load = () => api<any[]>('/admin/hubs').then(setRows);
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    const body = { ...form, lat: Number(form.lat), lng: Number(form.lng) };
    try {
      if (form.id) await api(`/admin/hubs/${form.id}`, body, 'PUT');
      else await api('/admin/hubs', body);
      setForm(EMPTY);
      load();
    } catch (e: any) { setError(e.message); }
  };
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h2>Hubs</h2>
      <p className="muted">Physical locations customers can drive to. Find coordinates by right-clicking the spot in Google Maps.</p>
      <div className="card" style={{ maxWidth: 720, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <input placeholder="Name" value={form.name} onChange={set('name')} />
        <input placeholder="Address" value={form.address} onChange={set('address')} />
        <input placeholder="Latitude, e.g. -26.1076" value={form.lat} onChange={set('lat')} />
        <input placeholder="Longitude, e.g. 28.0567" value={form.lng} onChange={set('lng')} />
        <input placeholder="Phone" value={form.phone} onChange={set('phone')} />
        <input placeholder="Opening hours" value={form.hours} onChange={set('hours')} />
        <label><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={!form.name || !form.address || !form.lat || !form.lng}>{form.id ? 'Update hub' : 'Add hub'}</button>
          {form.id && <button className="ghost" onClick={() => setForm(EMPTY)}>Cancel</button>}
        </div>
        {error && <span className="error">{error}</span>}
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Name</th><th>Address</th><th>Hours</th><th>Phone</th><th>Status</th><th>Completed washes</th><th></th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td><td>{h.address}</td><td>{h.hours}</td><td>{h.phone}</td>
                <td><span className="pill">{h.active ? 'Active' : 'Hidden'}</span></td>
                <td>{h.completed}</td>
                <td><button className="ghost" onClick={() => setForm({ ...h, lat: String(h.lat), lng: String(h.lng) })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
