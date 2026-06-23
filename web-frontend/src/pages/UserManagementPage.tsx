import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/Icon';
import { KPI } from '../lib/charts';

type Role = 'ev_user' | 'provider' | 'operator';

type UserRecord = {
  _id: string;
  email: string;
  name?: string;
  picture?: string;
  role: Role;
  status: 'active' | 'suspended';
  lastLogin?: string;
  created_at?: string;
};

type PageData = {
  users: UserRecord[];
  total: number;
  page: number;
  pages: number;
};

const ROLE_BADGE: Record<Role, string> = {
  ev_user:  'badge',
  provider: 'badge-accent',
  operator: 'badge-available'
};

const ROLE_LABEL: Record<Role, string> = {
  ev_user:  'EV Driver',
  provider: 'Provider',
  operator: 'Operator'
};

function initials(u: UserRecord) {
  const n = u.name || u.email;
  return n.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UserManagementPage() {
  const { user: me } = useAuth();
  const [data, setData]       = useState<PageData | null>(null);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRole] = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

  const [pending, setPending] = useState<Record<string, Role>>({});
  const [saving,  setSaving]  = useState<Record<string, boolean>>({});
  const [saved,   setSaved]   = useState<Record<string, boolean>>({});
  const [rowErr,  setRowErr]  = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get<PageData>('/auth/users', {
        params: { page, limit: 20, search: search || undefined, role: roleFilter || undefined }
      });
      setData(r.data);
      setPending({});
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  async function saveRole(userId: string) {
    const role = pending[userId];
    if (!role) return;
    setSaving(s => ({ ...s, [userId]: true }));
    setRowErr(e => ({ ...e, [userId]: '' }));
    try {
      await api.patch(`/auth/users/${userId}/role`, { role });
      setSaved(s => ({ ...s, [userId]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [userId]: false })), 2000);
      setData(d => d ? {
        ...d,
        users: d.users.map(u => u._id === userId ? { ...u, role } : u)
      } : d);
      setPending(p => { const next = { ...p }; delete next[userId]; return next; });
    } catch (e: any) {
      setRowErr(r => ({ ...r, [userId]: e.response?.data?.message || e.message }));
    } finally {
      setSaving(s => ({ ...s, [userId]: false }));
    }
  }

  const totalByRole = (r: Role) => data?.users.filter(u => u.role === r).length ?? '—';

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div>
          <div className="t-display">Users</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>Assign roles to platform users.</div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPI label="Total users" value={data?.total ?? '—'} />
          <KPI label="EV Drivers"  value={totalByRole('ev_user')} />
          <KPI label="Providers"   value={totalByRole('provider')} />
          <KPI label="Operators"   value={totalByRole('operator')} />
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              className="input"
              style={{ paddingLeft: 32, width: '100%' }}
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="select" value={roleFilter} onChange={e => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="ev_user">EV Driver</option>
            <option value="provider">Provider</option>
            <option value="operator">Operator</option>
          </select>
        </div>

        {err && (
          <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--offline-soft)', color: 'var(--offline)', fontSize: 13 }}>{err}</div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : !data || data.users.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>No users found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-sunk)' }}>
                  {['User', 'Email', 'Current role', 'Assign role', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.users.map((u, i) => {
                  const isSelf   = me?._id === u._id;
                  const pendRole = pending[u._id];
                  const dirty    = pendRole !== undefined && pendRole !== u.role;
                  return (
                    <tr key={u._id} style={{ borderBottom: i < data.users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div className="row" style={{ gap: 10 }}>
                          {u.picture ? (
                            <img src={u.picture} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-50)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                              {initials(u)}
                            </div>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name || '—'}</span>
                          {isSelf && <span className="badge" style={{ fontSize: 10 }}>you</span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isSelf ? (
                          <span className="t-small muted">Cannot change own role</span>
                        ) : (
                          <>
                            <select
                              className="select"
                              style={{ fontSize: 13 }}
                              value={pendRole ?? u.role}
                              onChange={e => setPending(p => ({ ...p, [u._id]: e.target.value as Role }))}
                            >
                              <option value="ev_user">EV Driver</option>
                              <option value="provider">Provider</option>
                              <option value="operator">Operator</option>
                            </select>
                            {rowErr[u._id] && (
                              <div className="t-small" style={{ color: 'var(--offline)', marginTop: 4 }}>{rowErr[u._id]}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {!isSelf && (
                          saved[u._id] ? (
                            <span className="t-small" style={{ color: 'var(--available)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="check" size={13} /> Saved
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={!dirty || saving[u._id]}
                              onClick={() => saveRole(u._id)}
                            >
                              {saving[u._id] ? 'Saving…' : 'Save'}
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {data && data.pages > 1 && (
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="t-small muted">Page {data.page} of {data.pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}

      </div>
    </div>
  );
}
