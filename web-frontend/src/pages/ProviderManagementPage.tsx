import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';

type Connector = {
  providerSystemId: string;
  apiBaseUrl: string | null;
  reachable: boolean;
  registered: boolean;
  error?: string;
};

type Provider = {
  _id: string;
  companyName: string;
  contactEmail: string;
  providerSystemId?: string;
  pricingPlan: string;
  status: string;
  userId?: string;
};

type AssignedUser = { _id: string; name?: string; email: string; role: string };

type UserResult = { _id: string; email: string; name?: string; role: string };

function AssignUserRow({ provider, onAssigned }: {
  provider: Provider;
  onAssigned: (providerId: string, userId: string, userDetail?: AssignedUser) => void;
}) {
  const [open,  setOpen]  = useState(false);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<UserResult | null | undefined>(undefined);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function search() {
    if (!email.trim()) return;
    setBusy(true); setFound(undefined); setErr(null);
    try {
      const r = await api.get('/auth/users', { params: { search: email.trim(), limit: 1 } });
      setFound(r.data.users[0] ?? null);
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!found) return;
    setBusy(true); setErr(null);
    try {
      await api.patch(`/providers/${provider._id}/assign-user`, { userId: found._id });
      setSaved(true);
      onAssigned(provider._id, found._id, found);
      setTimeout(() => { setSaved(false); setOpen(false); setEmail(''); setFound(undefined); }, 1500);
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Icon name="user" size={13} /> {provider.userId ? 'Reassign' : 'Assign user'}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--r-2)', background: 'var(--bg-sunk)', border: '1px solid var(--border)', minWidth: 260 }}>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" style={{ flex: 1, fontSize: 13 }} placeholder="Search by email…"
          value={email} onChange={e => { setEmail(e.target.value); setFound(undefined); }}
          onKeyDown={e => e.key === 'Enter' && search()} autoFocus />
        <button className="btn btn-sm btn-primary" disabled={busy || !email.trim()} onClick={search}>{busy ? '…' : 'Search'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setEmail(''); setFound(undefined); setErr(null); }}><Icon name="x" size={13} /></button>
      </div>
      {found === null && <div className="t-small muted">No user found.</div>}
      {found && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div className="t-small" style={{ fontWeight: 500 }}>{found.name || found.email}</div>
            <div className="t-small muted">{found.email} · {found.role}</div>
          </div>
          {saved
            ? <span className="t-small" style={{ color: 'var(--available)' }}><Icon name="check" size={12} /> Done</span>
            : <button className="btn btn-sm btn-primary" disabled={busy} onClick={assign}>Assign</button>}
        </div>
      )}
      {err && <div className="t-small" style={{ color: 'var(--offline)' }}>{err}</div>}
    </div>
  );
}

function RegisterConnectorForm({ connector, onRegistered }: {
  connector: Connector;
  onRegistered: () => void;
}) {
  const [companyName,   setCompanyName]   = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post('/providers', {
        companyName,
        contactEmail,
        apiBaseUrl: connector.apiBaseUrl || '',
        providerSystemId: connector.providerSystemId,
        skipConnectivityCheck: true
      });
      onRegistered();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--bg-sunk)', border: '1px solid var(--border)' }}>
      <div className="t-small" style={{ fontWeight: 600 }}>Register <code>{connector.providerSystemId}</code></div>
      <div className="field">
        <label>Company name</label>
        <input className="input" value={companyName} onChange={e => setCompanyName(e.target.value)} required autoFocus />
      </div>
      <div className="field">
        <label>Contact email</label>
        <input className="input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} required />
      </div>
      {err && <div className="t-small" style={{ color: 'var(--offline)' }}>{err}</div>}
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRegistered()}>Cancel</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !companyName || !contactEmail}>
          {busy ? 'Registering…' : 'Register'}
        </button>
      </div>
    </form>
  );
}

export default function ProviderManagementPage() {
  const [connectors,  setConnectors]  = useState<Connector[]>([]);
  const [providers,   setProviders]   = useState<Provider[]>([]);
  const [userMap,     setUserMap]     = useState<Record<string, AssignedUser>>({});
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [disc, list] = await Promise.all([
        api.get('/providers/discover'),
        api.get('/providers')
      ]);
      const providerList: Provider[] = list.data.providers || [];
      setConnectors(disc.data.connectors || []);
      setProviders(providerList);

      // Fetch user details for every assigned provider in parallel
      const userIds = [...new Set(providerList.map(p => p.userId).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const results = await Promise.allSettled(
          userIds.map(id => api.get<AssignedUser>(`/auth/users/${id}`))
        );
        const map: Record<string, AssignedUser> = {};
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') map[userIds[i]] = r.value.data;
        });
        setUserMap(map);
      }
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function handleRegistered() {
    setRegistering(null);
    load(); // reload to reflect new registration
  }

  function handleAssigned(providerId: string, userId: string, userDetail?: AssignedUser) {
    setProviders(ps => ps.map(p => p._id === providerId ? { ...p, userId } : p));
    if (userDetail) setUserMap(m => ({ ...m, [userId]: userDetail }));
  }

  const unregistered = connectors.filter(c => !c.registered);
  const registeredConnectors = connectors.filter(c => c.registered);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div>
          <div className="t-display">Provider adapters</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>Active connectors discovered from the orchestrator. Register them and assign user accounts.</div>
        </div>

        {err && (
          <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--offline-soft)', color: 'var(--offline)', fontSize: 13 }}>{err}</div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Discovering connectors…</div>
        ) : (
          <>
            {/* ── Unregistered connectors ── */}
            {unregistered.length > 0 && (
              <div>
                <div className="t-h3" style={{ marginBottom: 12 }}>
                  <Icon name="bolt" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Active — not yet registered ({unregistered.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {unregistered.map(c => (
                    <div key={c.providerSystemId} className="card">
                      <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div className="row" style={{ gap: 8 }}>
                              <code className="t-mono" style={{ fontSize: 13, fontWeight: 600 }}>{c.providerSystemId}</code>
                              {c.reachable
                                ? <span className="badge-available" style={{ fontSize: 11 }}>reachable</span>
                                : <span className="badge-offline" style={{ fontSize: 11 }}>unreachable</span>}
                            </div>
                            {c.apiBaseUrl && <div className="t-small muted" style={{ marginTop: 2 }}>{c.apiBaseUrl}</div>}
                            {c.error && <div className="t-small" style={{ color: 'var(--offline)', marginTop: 2 }}>{c.error}</div>}
                          </div>
                          {registering !== c.providerSystemId && (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={!c.reachable}
                              onClick={() => setRegistering(c.providerSystemId)}
                            >
                              <Icon name="plus" size={13} /> Register
                            </button>
                          )}
                        </div>
                        {registering === c.providerSystemId && (
                          <RegisterConnectorForm connector={c} onRegistered={handleRegistered} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Registered providers ── */}
            <div>
              <div className="t-h3" style={{ marginBottom: 12 }}>
                <Icon name="circle-check" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Registered ({providers.length})
              </div>
              {providers.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', border: '1px dashed var(--border)', borderRadius: 'var(--r-2)' }}>
                  No providers registered yet.
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-sunk)' }}>
                        {['Company', 'System ID', 'Plan', 'Status', 'User assigned', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p, i) => (
                        <tr key={p._id} style={{ borderBottom: i < providers.length - 1 ? '1px solid var(--border)' : 'none', verticalAlign: 'top' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.companyName}</div>
                            <div className="t-small muted">{p.contactEmail}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.providerSystemId
                              ? <code className="t-mono" style={{ fontSize: 12 }}>{p.providerSystemId}</code>
                              : <span className="t-small muted">—</span>}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className="badge">{p.pricingPlan}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={p.status === 'active' ? 'badge-available' : 'badge'}>{p.status}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.userId && userMap[p.userId] ? (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{userMap[p.userId].name || userMap[p.userId].email}</div>
                                <div className="t-small muted">{userMap[p.userId].email}</div>
                              </div>
                            ) : p.userId ? (
                              <span className="t-small muted">Loading…</span>
                            ) : (
                              <span className="t-small muted">Unassigned</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <AssignUserRow provider={p} onAssigned={handleAssigned} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
