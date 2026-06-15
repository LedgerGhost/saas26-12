#!/usr/bin/env node
/**
 * saasPlug demo seed
 * ------------------
 *  Creates a sample operator + provider + a few reservations + an issued invoice
 *  by hitting the public HTTP API. Safe to re-run — uses upserts and skips on
 *  conflicts. Designed for `make seed` after `docker compose up`.
 *
 * Usage:
 *   API_BASE=http://localhost/api node scripts/seed.js
 *
 * No dependencies — only Node 20's built-in fetch.
 */

const API = process.env.API_BASE || 'http://localhost/api';

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    method:  opts.method  || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body:    opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

async function devLogin(email, name, role) {
  const r = await api('/auth/dev-login', { method: 'POST', body: { email, name, role } });
  if (r.status >= 400) throw new Error(`dev-login ${role} failed: ${JSON.stringify(r.data)}`);
  return r.data; // { accessToken, refreshToken, user }
}

async function authed(token, path, opts = {}) {
  return api(path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${token}` } });
}

(async () => {
  console.log('saasPlug seed → POST', API);

  // 1) Operator (for global analytics page)
  const op = await devLogin('operator@saasplug.demo', 'Demo Operator', 'operator');
  console.log('  ✓ operator:', op.user.email);

  // 2) EV user
  const ev = await devLogin('alice@example.com', 'Alice EV', 'ev_user');
  console.log('  ✓ ev_user:', ev.user.email);

  // 3) Provider user + Provider registration
  const prov = await devLogin('founder@coolcharge.demo', 'Cool Charge Founder', 'provider');
  console.log('  ✓ provider user:', prov.user.email);

  const reg = await authed(prov.accessToken, '/providers', {
    method: 'POST',
    body: {
      companyName: 'Cool Charge AE',
      contactEmail: 'billing@coolcharge.demo',
      apiBaseUrl: 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
      apiKey: 'demo-key',
      pricingPlan: 'basic',
      providerSystemId: 'redPlug' // matches the mocked provider in the course demo
      }
  });
  if (reg.status === 201) {
    console.log('  ✓ provider registered:', reg.data.provider.companyName);
    console.log('     clientId:', reg.data.credentials.clientId);
  } else if (reg.status === 409) {
    console.log('  • provider already exists (skipping)');
  } else if (reg.status === 502) {
    console.log('  ! provider API unreachable — registration skipped:', reg.data?.message);
  } else {
    console.log('  ! provider registration failed:', reg.status, reg.data);
  }

  // 4) Reservations — try to reserve a few stations as the EV user.
  const stations = await authed(ev.accessToken, '/stations?radius=200');
  if (stations.status === 200 && Array.isArray(stations.data?.stations)) {
    const sample = stations.data.stations.slice(0, 5);
    for (const s of sample) {
      const r = await authed(ev.accessToken, '/reservations', {
        method: 'POST',
        body: { stationId: s.stationId, minutes: 30 }
      });
      console.log(`  ${r.status === 201 ? '✓' : '·'} reserve ${s.stationId} → ${r.status}`);
    }
  } else {
    console.log('  • stations list unavailable — skipping reservation demo');
  }

  // 5) Issue an invoice as the provider (will return empty if no charges yet).
  const issued = await authed(prov.accessToken, '/invoices/issue', { method: 'POST' });
  if (issued.data?.empty) console.log('  • no outstanding charges to invoice yet (run again after some reservations).');
  else if (issued.data?._id) console.log('  ✓ issued invoice:', issued.data._id, `(${issued.data.totalAmount} ${issued.data.currency})`);

  console.log('\nSeed complete. Open http://localhost and sign in as one of:');
  console.log('  operator@saasplug.demo   (role: operator)');
  console.log('  alice@example.com        (role: ev_user)');
  console.log('  founder@coolcharge.demo  (role: provider)');
})().catch(err => { console.error('seed failed:', err); process.exit(1); });
