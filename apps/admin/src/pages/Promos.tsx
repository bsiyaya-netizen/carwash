import { useEffect, useState } from 'react';
import { api, money } from '../api';

export default function Promos() {
  const [rows, setRows] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [error, setError] = useState('');

  const load = () => api<any[]>('/admin/promos').then(setRows);
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    try {
      await api('/admin/promos', {
        code,
        ...(kind === 'percent' ? { percentOff: Number(value) } : { amountOffCents: Math.round(Number(value) * 100) }),
        ...(maxUses ? { maxUses: Number(maxUses) } : {}),
      });
      setCode(''); setValue(''); setMaxUses('');
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <h2>Promo codes</h2>
      <div className="toolbar card">
        <input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <select value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'amount')}>
          <option value="percent">% off</option>
          <option value="amount">Amount off (R)</option>
        </select>
        <input type="number" placeholder={kind === 'percent' ? '20' : '50'} value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 100 }} />
        <input type="number" placeholder="Max uses (optional)" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        <button onClick={save} disabled={!code || !value}>Save</button>
        {error && <span className="error">{error}</span>}
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Limit</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.code}>
                <td><b>{p.code}</b></td>
                <td>{p.percent_off ? `${p.percent_off}%` : money(p.amount_off_cents)}</td>
                <td>{p.uses}</td>
                <td>{p.max_uses ?? '∞'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
