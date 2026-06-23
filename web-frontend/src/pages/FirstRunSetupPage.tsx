import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { api } from '../lib/api';
import { setTokens, broadcastAuthChange } from '../lib/auth';
import { Wordmark } from '../lib/charts';
import { Icon } from '../lib/Icon';

export default function FirstRunSetupPage() {
  const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const devEnabled    = import.meta.env.VITE_DEV_LOGIN !== 'false';
  const [email, setEmail] = useState('admin@saasplug.io');
  const [name,  setName]  = useState('Platform Admin');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function handleGoogle(idToken: string) {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/bootstrap', { idToken });
      setTokens(r.data.accessToken, r.data.refreshToken);
      broadcastAuthChange();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  async function devSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/bootstrap', { email, name });
      setTokens(r.data.accessToken, r.data.refreshToken);
      broadcastAuthChange();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-split">
      {/* Left — setup form */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '32px 48px', justifyContent: 'space-between' }}>
        <Wordmark />

        <div style={{ maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '4px 10px', borderRadius: 'var(--r-1)', background: 'var(--accent-50)', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
              <Icon name="key" size={12} />
              First launch
            </div>
            <div className="t-display">Set up your operator account</div>
            <div className="t-small muted" style={{ marginTop: 6 }}>
              No operator exists yet. The account you create here will have full platform access.
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--bg-sunk)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="t-small" style={{ fontWeight: 600 }}>What the operator role can do</div>
            {[
              'View global analytics across all providers',
              'Manage all reservations and users',
              'Assign roles to registered users',
            ].map(item => (
              <div key={item} className="row t-small muted" style={{ gap: 8 }}>
                <Icon name="check" size={13} />
                {item}
              </div>
            ))}
          </div>

          {googleEnabled ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={cr => cr.credential && handleGoogle(cr.credential)}
                onError={() => setErr('Google sign-in was cancelled or failed.')}
                text="signup_with"
              />
            </div>
          ) : (
            <div className="t-small muted" style={{ padding: 12, background: 'var(--bg-sunk)', borderRadius: 'var(--r-2)', border: '1px solid var(--border)' }}>
              Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable Google sign-in.
            </div>
          )}

          {devEnabled && <>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="t-small muted">or use the demo</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <form onSubmit={devSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Email</label>
              <input className="input input-lg" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Display name</label>
              <input className="input input-lg" value={name} onChange={e => setName(e.target.value)} />
            </div>

            {err && (
              <div className="t-small" style={{ color: 'var(--offline)', padding: 10, background: 'var(--offline-soft)', borderRadius: 'var(--r-2)' }}>
                {err}
              </div>
            )}

            <button className="btn btn-primary btn-lg" disabled={busy} type="submit">
              {busy ? 'Creating operator…' : <>Create operator account <Icon name="arrow-right" size={14} /></>}
            </button>
          </form>
          </>}
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
            <pattern id="grid2" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#grid2)" />
          <g opacity="0.7">
            <circle cx="300" cy="380" r="170" fill="none" stroke="rgba(79,70,229,0.35)" strokeWidth="1.5" />
            <circle cx="300" cy="380" r="240" fill="none" stroke="rgba(79,70,229,0.18)" strokeWidth="1" />
            <circle cx="300" cy="380" r="310" fill="none" stroke="rgba(79,70,229,0.10)" strokeWidth="1" />
          </g>
          {/* Shield icon in center */}
          <g transform="translate(264, 344)">
            <rect width="72" height="72" rx="16" fill="rgba(79,70,229,0.15)" stroke="rgba(79,70,229,0.4)" strokeWidth="1.5" />
            <path d="M36 16 L54 24 L54 38 C54 50 44 58 36 62 C28 58 18 50 18 38 L18 24 Z"
              fill="none" stroke="rgba(79,70,229,0.8)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M28 38 L33 43 L44 32" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
        <div style={{ position: 'relative', textAlign: 'center', padding: '0 48px', color: 'rgba(255,255,255,0.7)' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            One-time setup
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'white', letterSpacing: '-0.01em', lineHeight: 1.35, maxWidth: 360, margin: '0 auto' }}>
            This screen disappears once your operator account is created.
          </div>
        </div>
      </div>
    </div>
  );
}
