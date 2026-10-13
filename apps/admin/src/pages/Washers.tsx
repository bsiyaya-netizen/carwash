import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Washers() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any[]>('/admin/washers').then(setRows); }, []);
  return (
    <>
      <h2>Washers</h2>
      <p className="muted">Washers sign up in the washer app with their phone number.</p>
      <div className="card scroll">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Completed jobs</th><th>Rating</th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td>{w.phone}</td>
                <td><span className="pill">{w.is_online ? 'Online' : 'Offline'}</span></td>
                <td>{w.jobs}</td>
                <td>{w.rating ? `★ ${w.rating}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
