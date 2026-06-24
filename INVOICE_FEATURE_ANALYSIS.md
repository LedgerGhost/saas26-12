# Invoice Creation Feature — Analysis Report

**Date:** 2026-06-24
**Scope:** Operator/provider "Create invoice" feature (sum a provider's reservation
fees into an invoice that appears on the provider's Invoices page).
**Files touched:**
`billing/src/controllers/invoiceController.js`, `billing/src/routes/invoices.js`,
`web-frontend/src/pages/AnalyticsPage.tsx`,
`web-frontend/src/pages/ProviderAnalyticsPage.tsx`,
`web-frontend/src/pages/InvoicesPage.tsx`.

> **Update 2026-06-24 — all findings below are now resolved.** See §6.

---

## 1. What was built

| Layer | Change |
|---|---|
| Billing API | `GET /api/invoices/billable` — un-invoiced reservation charges summed per provider (operator: all providers or `?providerId=`; provider: own only). |
| Billing API | `POST /api/invoices/create` — issues one `ISSUED` invoice covering all outstanding charges for a provider, marks the charges invoiced, publishes `invoice.issued`. Operator passes `{ providerId }`; provider self-bills. |
| Operator UI | `AnalyticsPage` "Create invoice" button → modal: pick provider, see summed total + count, issue. |
| Provider UI | `ProviderAnalyticsPage` "Create invoice" button → self-bill own outstanding fees. |
| Provider UI | `InvoicesPage` — removed obsolete "Draft Current Month" button; updated empty-state copy. |

**Data flow:** `reservation.confirmed` → billing `eventHandler` writes a `Charge`
(`amount` = provider's `ratePerReservation`, `invoicedAt: null`) → `billable`
sums charges where `invoicedAt: null` → `create` rolls them into an Invoice and
stamps `invoicedAt`.

---

## 2. Verification performed

| Check | Result |
|---|---|
| Frontend `tsc --noEmit` (3 modified pages) | ✅ No type errors |
| Frontend `vite build` (production) | ✅ Built in ~2.5s |
| `node --check` on modified billing files | ✅ Both parse |
| Controller load + new exports are functions | ✅ `billableSummary`, `createInvoice` callable |
| Route ordering (`/billable` before `/:invoiceId`) | ✅ Static route precedes param route |
| AuthZ: provider cannot bill/read another provider | ✅ See §4 finding "Verified-secure" |

---

## 3. Findings summary

| # | Severity | Origin | Area | Issue |
|---|---|---|---|---|
| F1 | **High** | Pre-existing | `scripts/seed.js:92` | Seed calls `POST /invoices/issue`, which does not exist → 404; demo never issues an invoice. |
| F2 | Medium | Pre-existing | `billing/test/rollup.test.js` | References unexported `rollupLineItems` → all 3 billing tests fail. |
| F3 | Medium | By design | Operations | Feature needs `Charge` docs; `seed-billing.js` seeds Invoices, not Charges, so a freshly seeded DB shows €0.00 outstanding everywhere. |
| F4 | Low–Med | Introduced* | `invoiceController.js:114–146` | Read-then-mark in `createInvoice` is not atomic; concurrent create / the 30s cron can double-bill the same charges. |
| F5 | Low | Pre-existing | `MapPage.tsx`, `ProviderStationsPage.tsx` | 3 pre-existing TS errors; `vite` (esbuild) doesn't typecheck, so they don't block the build but would fail a `tsc`-gated CI. |
| F6 | Low | Introduced | UX | Issuing twice in one month produces two `ISSUED` invoices sharing the same `YYYY-MM` period label. |
| F7 | Low | Latent | Provider-id consistency | Operator dropdown keys on `Provider.providerSystemId`; charges key on `reservation.providerId`. Divergent casing would detach totals from options. |

\*F4 follows the same non-transactional pattern as the existing `draftCurrentMonth`, so the risk class is pre-existing; the new endpoint adds another caller.

---

## 4. Detail

### F1 — Seed targets a non-existent endpoint (High, pre-existing)
`scripts/seed.js:92` does `POST /invoices/issue`. No such route exists
(`billing/src/routes/invoices.js` defines `/`, `/billable`, `/:invoiceId`,
`/create`, `/draft-month`, `/checkout-session`, `/webhooks/stripe`). The call
404s and step 5 silently does nothing.

The new `POST /invoices/create` is the intended endpoint. **Recommended fix:**
point the seed at `/invoices/create` and read the nested response shape:
```js
const issued = await authed(prov.accessToken, '/invoices/create', { method: 'POST' });
if (issued.data?.empty) { /* no charges yet */ }
else if (issued.data?.invoice?._id) {
  console.log('  ✓ issued invoice:', issued.data.invoice._id,
              `(${issued.data.invoice.totalAmount} ${issued.data.invoice.currency})`);
}
```
(`create` returns `{ message, invoice }`, not the invoice at the top level.)

### F2 — Stale billing unit test (Medium, pre-existing)
`billing/test/rollup.test.js:20` imports `rollupLineItems` from the controller,
which never exported it → `TypeError: rollupLineItems is not a function` ×3.
Independent of this feature. Already flagged as a separate background task.
Fix = implement+export the day-grouping helper (and optionally populate the
Invoice `lineItems` field, currently always empty) **or** delete the stale test.

### F3 — Feature depends on live Charge documents (Medium, operational)
`billable`/`create` operate on the `charges` collection, populated only by the
`reservation.confirmed` event handler. `scripts/seed-billing.js` inserts
`invoices` directly and seeds **no** charges, so after seeding:
- Operator modal lists providers all at **€0.00 outstanding**.
- "Issue invoice" returns `{ empty: true }`.

To see a non-zero total, make reservations through the app (each confirmed
reservation adds one charge), then open the modal. This is expected behavior, not
a defect — but worth documenting so it isn't mistaken for a bug.

### F4 — Non-atomic create can double-bill (Low–Medium)
`createInvoice` reads `Charge.find({ providerId, invoicedAt: null })`
(`invoiceController.js:114`) then later `Charge.updateMany(... invoicedAt ...)`
(`:142`). Between those, a second create — or the cron at
`billing/src/server.js:20` (`*/30 * * * * *`, runs `runAutomatedBilling`) — can
read the same charges and bill them twice. The existing rollup test stubs
`mongoose.startSession`/`withTransaction`, implying a transaction was originally
intended. **Recommendation:** wrap read+update in a transaction, or
`updateMany` first to claim charges by a generated `invoiceId` and create the
invoice from the claimed set.

### F5 — Pre-existing type errors not caught by build (Low)
`tsc --noEmit` reports 3 errors in untouched files (`MapPage.tsx` ×2,
`ProviderStationsPage.tsx` ×1, Leaflet bounds + `ActiveReservation` typing). The
build uses esbuild and skips type-checking, so they ship silently but would fail
any CI that runs `tsc`. Out of scope for this feature; listed for visibility.

### F6 — Duplicate period labels (Low, UX)
Two issues in the same calendar month produce two `ISSUED` invoices with the same
`billingPeriod` (`YYYY-MM`). Each is correct (covers different reservations) but
the Invoices table's period column won't distinguish them. Consider labeling by
issue date or an invoice number when multiple invoices share a period.

### F7 — Provider-id casing dependency (Low, latent)
The operator dropdown options use `Provider.providerSystemId`; billable totals
key on `reservation.providerId` (the stationId prefix / orchestrator value, e.g.
`redPlug`). Seed data uses a consistent `redPlug`, so they match today. If a
provider is ever registered with a differently-cased `providerSystemId` than its
station prefix, its outstanding total would not attach to the dropdown option
(label falls back to the raw id, total reads as 0).

### Verified-secure (no action needed)
- **Providers cannot bill others:** `resolveTargetProviderId` ignores a body
  `providerId` for non-operators and resolves the caller's own provider.
- **Providers cannot read others' totals:** `billableSummary` forces
  `match.providerId = own` for non-operators; only operators may pass
  `?providerId=` or get the all-provider view. Operator role is asserted from the
  JWT at the gateway.

---

## 5. Recommended next steps

1. **F1 (quick win):** repoint `scripts/seed.js` at `/invoices/create` and the
   `{ invoice }` response shape so the demo seeds a real issued invoice.
2. **F4:** make `createInvoice` atomic (transaction or claim-then-create) before
   relying on it in production with the 30s cron running.
3. **F2:** resolve the stale `rollupLineItems` test (background task already
   filed).
4. Optional: F6 invoice numbering; F3 a tiny charge-seeding script for demos.

---

## 6. Resolution (2026-06-24)

All seven findings fixed and verified.

| # | Fix | Where |
|---|---|---|
| F1 | Seed now calls `POST /invoices/create` and reads the nested `{ invoice }` shape. | `scripts/seed.js` |
| F2 | `rollupLineItems()` implemented + exported; `createInvoice` populates `Invoice.lineItems`. **Billing tests: 3/3 pass.** | `billing/src/controllers/invoiceController.js` |
| F3 | `seed-billing.js` seeds 12 un-invoiced `Charge` docs (€6.00 outstanding for `redPlug`) so the Create-invoice flow has a real balance. Idempotent re-seed. | `scripts/seed-billing.js` |
| F4 | `createInvoice` rewritten as **claim-then-create**: mint the invoice `_id`, `updateMany({invoicedAt:null})` to claim charges atomically, then build the invoice from the claimed set. No transaction needed (standalone Mongo). | `billing/src/controllers/invoiceController.js` |
| F5 | Typed `reservations` as `TimedReservation[]`; pass `WORLD_BOUNDS` straight to `panInsideBounds` (drop the `L.latLngBounds` wrapper). **`tsc --noEmit`: 0 errors across the whole frontend.** | `MapPage.tsx`, `ProviderStationsPage.tsx` |
| F6 | Invoices table shows the issue date beneath the billing period, disambiguating multiple invoices in the same `YYYY-MM`. | `web-frontend/src/pages/InvoicesPage.tsx` |
| F7 | Operator modal now joins billable totals to providers **case-insensitively**, bills the real charge id, and surfaces outstanding balances that have no registered provider. | `web-frontend/src/pages/AnalyticsPage.tsx` |

**Verification:** `tsc --noEmit` exit 0 / 0 errors · `vite build` exit 0 ·
billing `node --test` 3/3 pass · billing controller + seed scripts `node --check` OK.

> **Note on F2/F4:** while these fixes were being applied, the F2 background task
> also landed an implementation in the working tree. The duplicate
> `rollupLineItems` was de-duplicated (one robust version kept) and `createInvoice`
> was consolidated onto the atomic claim-then-create path.

Nothing in this list blocks the feature: build, typecheck (touched files), and
authorization checks all pass. F1 and F4 are the two worth doing before a demo.
