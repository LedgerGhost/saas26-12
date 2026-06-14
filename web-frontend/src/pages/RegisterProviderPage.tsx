import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/Icon';
import { Stepper } from '../lib/charts';

type Provider = {
  _id: string;
  companyName: string;
  contactEmail: string;
  apiBaseUrl?: string;
  providerSystemId?: string;
  pricingPlan: 'basic' | 'pro';
  ratePerReservation?: number;
  status?: string;
  clientId?: string;
};

type Credentials = { clientId: string; clientSecret: string; warning: string };

export default function RegisterProviderPage() {
  const { user } = useAuth();
  const [existing, setExisting] = useState<Provider | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) { setChecking(false); return; }
    api.get(`/providers/by-user/${encodeURIComponent(user._id)}`)
      .then(r => setExisting(r.data))
      .catch(() => setExisting(null))
      .finally(() => setChecking(false));
  }, [user]);

  if (checking) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading account…</div>;
  }
  return existing ? <ProviderAccount provider={existing} onUpdate={setExisting} /> : <RegistrationWizard onCreated={setExisting} />;
}

/* ─── Registration wizard ─── */

function RegistrationWizard({ onCreated }: { onCreated: (p: Provider) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1
  const [companyName, setCompanyName]   = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Step 2
  const [apiBaseUrl, setApiBaseUrl]   = useState('');
  const [apiKey, setApiKey]           = useState('');
  const [providerSystemId, setSysId]  = useState('');
  const [pricingPlan, setPricingPlan] = useState<'basic' | 'pro'>('basic');
  const [ratePerReservation, setRate] = useState(0.50);

  // Step 3
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [createdProvider, setCreatedProvider] = useState<Provider | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function register() {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/providers', {
        companyName, contactEmail, apiBaseUrl, apiKey,
        providerSystemId: providerSystemId || undefined,
        pricingPlan, ratePerReservation
      });
      setCreatedProvider(r.data.provider);
      setCredentials(r.data.credentials);
      setStep(3);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const canContinue =
    (step === 1 && companyName && contactEmail) ||
    (step === 2 && apiBaseUrl && apiKey) ||
    (step === 3);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 28px 80px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div className="t-display">Register as a charging provider</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>Three steps. ~5 minutes.</div>
        </div>

        <Stepper steps={[
          { n: 1, label: 'Company' },
          { n: 2, label: 'API connection' },
          { n: 3, label: 'Credentials' }
        ]} current={step} />

        <div className="card" style={{ overflow: 'visible' }}>
          <div className="card-bd" style={{ padding: 28 }}>
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="t-h2">Company details</div>
                <div className="t-small muted" style={{ marginTop: -8 }}>Your legal name and primary contact.</div>
                <div className="field">
                  <label>Legal name</label>
                  <input className="input input-lg" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. redPlug Hellas Ltd." />
                </div>
                <div className="field">
                  <label>Primary contact email</label>
                  <input className="input input-lg" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="ops@example.com" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="t-h2">Connect your station API</div>
                <div className="t-small muted" style={{ marginTop: -8 }}>
                  saasPlug polls <code>{'<apiBaseUrl>/points'}</code> to keep station status fresh.
                </div>
                <div className="field">
                  <label>API base URL</label>
                  <input className="input input-lg t-mono" value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)} placeholder="https://api.example.com/v2" />
                </div>
                <div className="field">
                  <label>API key</label>
                  <input className="input input-lg t-mono" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="••••••••••••••••" />
                </div>
                <div className="field">
                  <label>Provider system id <span className="muted">· optional</span></label>
                  <input className="input input-lg t-mono" value={providerSystemId} onChange={e => setSysId(e.target.value)} placeholder="e.g. redPlug" />
                  <div className="t-small muted">
                    The prefix saasPlug uses in your stationIds (e.g. <code>redPlug</code> in <code>redPlug:42</code>).
                    Required for your custom rate to apply to reservations.
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Pricing plan</label>
                    <select className="select input-lg" value={pricingPlan} onChange={e => setPricingPlan(e.target.value as any)}>
                      <option value="basic">basic</option>
                      <option value="pro">pro</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Rate per reservation (€)</label>
                    <input className="input input-lg t-mono" type="number" step="0.01" min="0" value={ratePerReservation} onChange={e => setRate(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                {err && (
                  <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--offline-soft)', color: 'var(--offline)', fontSize: 13 }}>
                    {err}
                  </div>
                )}
              </div>
            )}

            {step === 3 && credentials && createdProvider && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0 16px' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--available-soft)', color: 'var(--available)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={24} stroke={2.4} />
                  </div>
                  <div className="t-h1">You're registered</div>
                  <div className="t-small muted" style={{ textAlign: 'center', maxWidth: 380 }}>
                    <strong>{createdProvider.companyName}</strong> is live on the <code>{createdProvider.pricingPlan}</code> plan
                    at €{(createdProvider.ratePerReservation || 0).toFixed(2)} / reservation.
                  </div>
                </div>

                <div className="field">
                  <label>Provider ID</label>
                  <div className="input input-lg t-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                    <span>{createdProvider._id}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy('id', createdProvider._id)}>
                      {copied === 'id' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Client ID</label>
                  <div className="input input-lg t-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                    <span>{credentials.clientId}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy('clientId', credentials.clientId)}>
                      {copied === 'clientId' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Client secret <span className="muted">· shown once</span></label>
                  <div className="input input-lg t-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                    <span>{credentials.clientSecret}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy('clientSecret', credentials.clientSecret)}>
                      {copied === 'clientSecret' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--accent-50)', color: 'var(--accent)', display: 'flex', gap: 10, fontSize: 13 }}>
                  <Icon name="key" size={16} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: 2 }}>Store your secret now.</strong>
                    We don't show it again. You can rotate it from Account.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-sunk)', display: 'flex', justifyContent: 'space-between', borderBottomLeftRadius: 'var(--r-3)', borderBottomRightRadius: 'var(--r-3)' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1 || step === 3 || busy}
            >
              ← Back
            </button>
            {step === 1 && (
              <button className="btn btn-primary" disabled={!canContinue} onClick={() => setStep(2)}>
                Continue <Icon name="arrow-right" size={13} />
              </button>
            )}
            {step === 2 && (
              <button className="btn btn-primary" disabled={!canContinue || busy} onClick={register}>
                {busy ? 'Registering…' : <>Register <Icon name="arrow-right" size={13} /></>}
              </button>
            )}
            {step === 3 && createdProvider && (
              <button className="btn btn-primary" onClick={() => { onCreated(createdProvider); navigate('/provider/dashboard'); }}>
                Open dashboard <Icon name="arrow-right" size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Existing-provider account view ─── */

function ProviderAccount({ provider, onUpdate }: { provider: Provider; onUpdate: (p: Provider) => void }) {
  const [companyName, setCompanyName] = useState(provider.companyName);
  const [apiBaseUrl, setApiBaseUrl]   = useState(provider.apiBaseUrl || '');
  const [providerSystemId, setSysId]  = useState(provider.providerSystemId || '');
  const [ratePerReservation, setRate] = useState(provider.ratePerReservation ?? 0.50);
  const [pricingPlan, setPricingPlan] = useState<'basic' | 'pro'>(provider.pricingPlan);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api.put(`/providers/${provider._id}`, {
        companyName, apiBaseUrl, providerSystemId, ratePerReservation, pricingPlan
      });
      onUpdate(r.data);
      setInfo('Saved. New reservations will use the updated rate.');
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="t-display">Account</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>
            Provider settings for <strong>{provider.companyName}</strong>. Changes take effect on the next reservation.
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <Stat label="Plan" value={provider.pricingPlan} />
          <Stat label="Status" value={provider.status || 'active'} />
          <Stat label="Rate" value={`€${(provider.ratePerReservation ?? 0).toFixed(2)}`} sub="/ reservation" />
        </div>

        <form className="card" onSubmit={save}>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Company name</label>
              <input className="input input-lg" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div className="field">
              <label>API base URL</label>
              <input className="input input-lg t-mono" value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)} />
            </div>
            <div className="field">
              <label>Provider system id</label>
              <input className="input input-lg t-mono" value={providerSystemId} onChange={e => setSysId(e.target.value)} placeholder="e.g. redPlug" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Pricing plan</label>
                <select className="select input-lg" value={pricingPlan} onChange={e => setPricingPlan(e.target.value as any)}>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                </select>
              </div>
              <div className="field">
                <label>Rate per reservation (€)</label>
                <input className="input input-lg t-mono" type="number" step="0.01" min="0" value={ratePerReservation} onChange={e => setRate(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            {err  && <div className="t-small" style={{ color: 'var(--offline)' }}>{err}</div>}
            {info && <div className="t-small" style={{ color: 'var(--available)' }}>{info}</div>}
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-sunk)', display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: 'var(--r-3)', borderBottomRightRadius: 'var(--r-3)' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>

        {provider.clientId && (
          <div className="card">
            <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="t-h3">API credentials</div>
              <div className="t-small muted">Use these to authenticate your API calls back to saasPlug.</div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="t-small muted">Client ID</span>
                <span className="t-mono">{provider.clientId}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="t-small muted">Client secret</span>
                <span className="t-mono">•••••• shown once during registration</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 20 }}>{value}{sub && <span className="t-small muted" style={{ marginLeft: 6, fontWeight: 400 }}>{sub}</span>}</div>
    </div>
  );
}
