import { useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';

const EVENT_TYPES = [
  { k: 'SEARCH',                hint: 'Map searches and filter changes' },
  { k: 'CLICK',                 hint: 'Station popup opens' },
  { k: 'RESERVATION_CONFIRMED', hint: 'Successful reservations after the hold window ends' },
  { k: 'RESERVATION_REJECTED',  hint: 'Failed reservations' },
  { k: 'RESERVATION_CANCELLED', hint: 'Cancelled reservations' }
] as const;

type EventKey = typeof EVENT_TYPES[number]['k'];

export default function LogExportPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10));
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [separateFiles, setSeparateFiles] = useState(false); // NEW STATE
  const [types, setTypes] = useState<Record<EventKey, boolean>>({
    SEARCH: true,
    CLICK: true,
    RESERVATION_CONFIRMED: true,
    RESERVATION_REJECTED: false,
    RESERVATION_CANCELLED: false
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Updated to accept single key OR array of keys
  async function downloadOne(eventTypes?: EventKey | EventKey[]) {
    try {
      const r = await api.post('/analytics/export',
        {
          from,
          to,
          format,
          timeZone: 'Europe/Athens',
          ...(eventTypes ? { eventType: eventTypes } : {})
        },
        { responseType: format === 'csv' ? 'blob' : 'json' }
      );
      
      const blob = format === 'csv'
        ? r.data
        : new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Determine file name: if array (combined), use 'combined', else use the single event name
      let namePart = Array.isArray(eventTypes) ? 'combined' : (eventTypes ? (eventTypes as string).toLowerCase() : 'all');
      
      a.download = `saasplug-${namePart}-${from}_${to}.${format}`;
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch (e: any) {
      throw e;
    }
  }

  async function generate() {
    setBusy(true); setErr(null); setInfo(null);
    
    // VALIDATION: Check dates
    if (new Date(from) > new Date(to)) {
      setErr('From date cannot be later than To date.');
      setBusy(false); 
      return;
    }

    try {
      const selected = (Object.keys(types) as EventKey[]).filter(k => types[k]);
      // VALIDATION: Check at least one event type selected
      if (selected.length === 0) {
        setErr('Pick at least one event type.');
        setBusy(false); 
        return;
      }

      if (separateFiles) {
        // Loop individually
        for (const k of selected) await downloadOne(k);
        setInfo(`Downloaded ${selected.length} separate ${format.toUpperCase()} file(s).`);
      } else {
        // Combined request (passed as array to backend)
        await downloadOne(selected);
        setInfo(`Downloaded 1 combined ${format.toUpperCase()} file.`);
      }
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="t-display">Export logs</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>
            Generate a one-time export of raw events for your account.
          </div>
        </div>

        <div className="card">
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>From</label>
                <input className="input t-mono" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>To</label>
                <input className="input t-mono" type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8, display: 'block' }}>
                Event types
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EVENT_TYPES.map(t => {
                  const on = types[t.k];
                  return (
                    <label key={t.k} style={{
                        display: 'flex', gap: 12, padding: 12,
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--r-2)', cursor: 'pointer',
                        background: on ? 'var(--accent-50)' : 'var(--bg-elev)'
                      }}>
                      <input type="checkbox" checked={on} onChange={() => setTypes({ ...types, [t.k]: !on })} style={{ accentColor: 'var(--accent)' }} />
                      <div>
                        <div className="t-mono t-small" style={{ color: on ? 'var(--accent)' : 'var(--text)', fontWeight: 500 }}>{t.k.toLowerCase()}</div>
                        <div className="t-small muted">{t.hint}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Format</label>
                <div className="seg" style={{ width: 'fit-content' }}>
                  <button aria-pressed={format === 'csv'}  onClick={() => setFormat('csv')}>CSV</button>
                  <button aria-pressed={format === 'json'} onClick={() => setFormat('json')}>JSON</button>
                </div>
              </div>

              {/* Toggle for Separate Files */}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 20 }}>
                <input type="checkbox" checked={separateFiles} onChange={e => setSeparateFiles(e.target.checked)} />
                <span className="t-small">Download as separate files</span>
              </label>
            </div>

            {err  && <div className="t-small" style={{ color: 'var(--offline)' }}>{err}</div>}
            {info && <div className="t-small" style={{ color: 'var(--available)' }}>{info}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn btn-primary" onClick={generate} disabled={busy}>
                <Icon name="download" size={14} />
                {busy ? 'Exporting…' : `Generate ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
