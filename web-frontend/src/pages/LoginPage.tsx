import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { api } from '../lib/api';
import { setTokens, broadcastAuthChange } from '../lib/auth';
import { Wordmark } from '../lib/charts';
import { Icon } from '../lib/Icon';

type Role = 'ev_user' | 'provider' | 'operator';

const ROLE_DEFAULTS: Record<Role, { email: string; name: string }> = {
  ev_user:  { email: 'anna@example.com',        name: 'Anna' },
  provider: { email: 'ops@redplug.gr',          name: 'redPlug Ops' },
  operator: { email: 'platform@saasplug.io',    name: 'Platform' }
};

const ROLE_LABELS: Record<string, string> = {
  ev_user: 'EV Driver', provider: 'Provider', operator: 'Operator'
};

export default function LoginPage() {
  const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [role, setRole] = useState<Role>('ev_user');
  const [email, setEmail] = useState<string>(ROLE_DEFAULTS.ev_user.email);
  const [name,  setName]  = useState<string>(ROLE_DEFAULTS.ev_user.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  function chooseRole(r: Role) {
    setRole(r);
    setEmail(ROLE_DEFAULTS[r].email);
    setName(ROLE_DEFAULTS[r].name);
  }

  async function devSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/dev-login', { email, name, role });
      setTokens(r.data.accessToken, r.data.refreshToken);
      broadcastAuthChange();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  async function handleGoogle(idToken: string) {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/google/callback', { idToken });
      setTokens(r.data.accessToken, r.data.refreshToken);
      broadcastAuthChange();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-split">
      {/* Left — auth */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '32px 48px', justifyContent: 'space-between' }}>
        <Wordmark />
        <div style={{ maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div className="t-display">Sign in</div>
            <div className="t-small muted" style={{ marginTop: 6 }}>
              The infrastructure layer between EV drivers and charging providers.
            </div>
          </div>

          {googleEnabled ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={cr => cr.credential && handleGoogle(cr.credential)}
                onError={() => setErr('Google sign-in was cancelled or failed.')}
                useOneTap
              />
            </div>
          ) : (
            <div className="t-small muted" style={{ padding: 12, background: 'var(--bg-sunk)', borderRadius: 'var(--r-2)', border: '1px solid var(--border)' }}>
              Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable Google sign-in. See <code>docs/GOOGLE_SSO_SETUP.md</code>.
            </div>
          )}

          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="t-small muted">or use the demo</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <form onSubmit={devSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Sign in as</label>
              <div className="seg" style={{ width: '100%' }}>
                {(Object.keys(ROLE_DEFAULTS) as Role[]).map(r => (
                  <button type="button" key={r} aria-pressed={role === r} onClick={() => chooseRole(r)} style={{ flex: 1 }}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input input-lg" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Display name</label>
              <input className="input input-lg" value={name} onChange={e => setName(e.target.value)} />
            </div>

            {err && <div className="t-small" style={{ color: 'var(--offline)' }}>{err}</div>}

            <button className="btn btn-primary btn-lg" disabled={busy} type="submit">
              {busy ? 'Signing in…' : <>Sign in <Icon name="arrow-right" size={14} /></>}
            </button>
          </form>
        </div>
        <div className="t-small muted">© 2026 saasPlug · Athens</div>
      </div>

      {/* Right — visual */}
      <div className="hero" style={{
        background: 'linear-gradient(180deg, #15151a 0%, #0a0a0b 100%)',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
      }}>
        <svg viewBox="0 0 600 800" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#grid)" />
          <g opacity="0.85">
            <circle cx="300" cy="380" r="170" fill="none" stroke="rgba(79,70,229,0.35)" strokeWidth="1.5" />
            <circle cx="300" cy="380" r="240" fill="none" stroke="rgba(79,70,229,0.18)" strokeWidth="1" />
            <circle cx="300" cy="380" r="310" fill="none" stroke="rgba(79,70,229,0.10)" strokeWidth="1" />
          </g>
          <g>
            <circle cx="220" cy="280" r="6" fill="#16a34a" />
            <circle cx="220" cy="280" r="6" fill="#16a34a" className="marker-pulse" opacity="0.6" />
            <circle cx="380" cy="320" r="5" fill="#f59e0b" />
            <circle cx="160" cy="460" r="5" fill="#16a34a" />
            <circle cx="430" cy="500" r="5" fill="#dc2626" />
            <circle cx="320" cy="540" r="5" fill="#16a34a" />
          </g>
          <g transform="translate(220, 220)">
            <rect width="180" height="58" rx="8" fill="#15151a" stroke="rgba(255,255,255,0.08)" />
            <circle cx="14" cy="14" r="3" fill="#16a34a" />
            <text x="22" y="17" fill="#16a34a" fontSize="9" fontWeight="500">Available</text>
            <text x="14" y="36" fill="white" fontSize="11" fontWeight="600">Syntagma North</text>
            <text x="14" y="50" fill="rgba(255,255,255,0.4)" fontSize="9">redPlug:42</text>
            <text x="160" y="50" fill="white" fontSize="11" fontWeight="500" textAnchor="end">€0.31/kWh</text>
          </g>
        </svg>
        <div style={{ position: 'relative', textAlign: 'center', padding: '0 48px', color: 'rgba(255,255,255,0.7)' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            One map · all providers
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'white', letterSpacing: '-0.01em', lineHeight: 1.35, maxWidth: 360, margin: '0 auto' }}>
            Find a station nearby. Reserve in seconds. Drive on.
          </div>
        </div>
      </div>
    </div>
  );
}
