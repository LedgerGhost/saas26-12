import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { KPI } from '../lib/charts';
import logoUrl from '../assets/logo.png'; // Make sure the image is saved here!

type ReservationDetail = { reservationId: string; pointId: string; timestamp: string; charge: number };
type Invoice = {
  _id: string;
  providerId: string;
  billingPeriod?: string;
  issuedAt: string;
  dueDate?: string;
  totalAmount: number;
  currency: string;
  status: 'PENDING' | 'ISSUED' | 'PAID' | 'VOID';
  reservations: ReservationDetail[];
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyIssue, setBusyIssue] = useState(false);
  const [openInvoice, setOpenInvoice] = useState<Invoice | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/invoices');
      setInvoices(r.data?.invoices || []);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function draftCurrentMonth() {
    setBusyIssue(true); setErr(null); setInfo(null);
    try {
      const r = await api.post('/invoices/draft-month');
      if (r.data?.empty) {
        setInfo('No new charges this month to draft.');
      } else {
        setInfo(r.data?.message || 'Drafted current month successfully.');
      }
      await load();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusyIssue(false); }
  }

  const kpis = useMemo(() => {
    const outstanding = invoices.filter(i => i.status === 'ISSUED' || i.status === 'PENDING').reduce((s, i) => s + i.totalAmount, 0);
    const paid        = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.totalAmount, 0);
    const avg = invoices.length ? (paid + outstanding) / invoices.length : 0;
    return { outstanding, paid, avg };
  }, [invoices]);

  if (openInvoice) {
    return (
      <InvoiceDetail
        invoice={openInvoice}
        onBack={() => setOpenInvoice(null)}
        onPaid={async () => {
          await load();
          setOpenInvoice(null);
          setInfo('Payment approved — invoice marked PAID.');
        }}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="t-display">Monthly Invoices</div>
            <div className="t-small muted" style={{ marginTop: 4 }}>
              Review & Pay Invoices.
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={load} disabled={loading}>
              <Icon name="history" size={14} /> Refresh
            </button>
            
            <button className="btn btn-primary" onClick={draftCurrentMonth} disabled={busyIssue}>
              <Icon name="plus" size={14} /> {busyIssue ? 'Drafting…' : 'Draft Current Month'}
            </button>
          </div>
        </div>

        {err  && <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>}
        {info && <div className="card" style={{ padding: 14, color: 'var(--available)' }}>{info}</div>}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <KPI label="Sum Due"        value={kpis.outstanding.toFixed(2)} prefix="€" />
          <KPI label="Total Paid"     value={kpis.paid.toFixed(2)}        prefix="€" />
          <KPI label="Avg / invoice"  value={kpis.avg.toFixed(2)}      prefix="€" />
        </div>

        {!loading && invoices.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div className="t-h2">No invoices yet</div>
            <div className="t-small muted" style={{ marginTop: 4, marginBottom: 14 }}>
              Click <em>Draft Current Month</em> to preview this month's charges.
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="card">
            <div className="card-bd flush">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Charging Period</th>
                    <th>Due Date</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr
                      key={inv._id}
                      onClick={() => setOpenInvoice(inv)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="t-mono" style={{ fontWeight: 500 }}>{inv._id.slice(-8).toUpperCase()}</td>
                      <td style={{ fontWeight: 600 }}>{inv.billingPeriod || new Date(inv.issuedAt).toLocaleDateString()}</td>
                      <td className="muted">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="num">{inv.totalAmount.toFixed(2)} {inv.currency}</td>
                      <td>
                        <span className={`badge ${
                          inv.status === 'PAID' ? 'badge-paid' : 
                          inv.status === 'VOID' ? 'badge-offline' : 
                          inv.status === 'PENDING' ? 'badge-warning' : 'badge-unpaid'
                        }`}>
                          {inv.status === 'PAID' ? 'Paid' : inv.status === 'PENDING' ? 'Draft (Cannot Pay)' : inv.status}
                        </span>
                      </td>
                      <td className="num">
                        {inv.status === 'ISSUED'
                          ? <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setOpenInvoice(inv); }}>Pay</button>
                          : <Icon name="chevron-right" size={14} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Invoice detail + payment ─── */
function InvoiceDetail({ invoice, onBack, onPaid }: {
  invoice: Invoice; onBack: () => void; onPaid: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  
  const isPaid = invoice.status === 'PAID';
  const isPending = invoice.status === 'PENDING';

  // NEW: Determine if this invoice belongs to the current calendar month
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = invoice.billingPeriod === currentMonthStr;

  const downloadPDF = async () => {
    const doc = new jsPDF();
    
    try {
      const img = new Image();
      img.src = logoUrl as string;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      doc.addImage(img, 'PNG', 14, 15, 45, 12); 
    } catch (e) {
      console.warn("Logo could not be loaded into PDF.");
    }

    // --- PAGE 1: Summary ---
    doc.setFontSize(26);
    doc.setTextColor(33, 37, 41);
    doc.text("INVOICE", 150, 25);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("saasPlug EV Platform", 14, 35);
    doc.text("Zografou, Athens, GR", 14, 40);
    doc.text("billing@saasplug.com", 14, 45);

    doc.setDrawColor(200);
    doc.line(14, 52, 196, 52);

    doc.setFontSize(12);
    doc.setTextColor(33, 37, 41);
    doc.text(`Invoice ID:`, 14, 65);
    doc.text(`Provider ID:`, 14, 72);
    doc.text(`Charging Period:`, 14, 79);
    doc.text(`Issue Date:`, 14, 86);
    
    doc.setFont('helvetica', 'bold');
    doc.text(invoice._id.toUpperCase(), 50, 65);
    doc.text(invoice.providerId, 50, 72);
    doc.text(invoice.billingPeriod || 'N/A', 50, 79);
    doc.text(new Date(invoice.issuedAt).toLocaleDateString(), 50, 86);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(16);
    if(isPaid) doc.setTextColor(40, 167, 69);
    else if(isPending) doc.setTextColor(255, 193, 7);
    else doc.setTextColor(220, 53, 69);
    doc.text(invoice.status, 150, 65);

    // --- Total Amount (on Page 1) ---
    doc.setFontSize(16);
    doc.setTextColor(33, 37, 41);
    doc.text("Total Amount Due:", 14, 110);
    doc.setFont('helvetica', 'bold');
    doc.text(`${invoice.totalAmount.toFixed(2)}` + ' €', 65, 110);
    doc.setFont('helvetica', 'normal');

    // --- PAGE 2: Table ---
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Detailed Reservation Breakdown", 14, 20);

    const tableData = invoice.reservations?.map(res => [
      res.pointId,
      new Date(res.timestamp).toLocaleString(),
      `€${res.charge.toFixed(2)}`
    ]) || [];

    autoTable(doc, {
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [52, 58, 64] },
      head: [['Charging Point ID', 'Completion Date & Time', 'Total Charge']],
      body: tableData,
    });

    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("Thank you for partnering with saasPlug.", 14, 280);

    doc.save(`saasPlug_Invoice_${invoice.billingPeriod || invoice._id.slice(-6)}.pdf`);
  };

  const handlePay = async () => {
    setPaying(true);
    setErr(null);
    try {
      const successUrl = `${window.location.origin}/invoices?success=true`;
      const cancelUrl = `${window.location.origin}/invoices?canceled=true`;
      const r = await api.post('/invoices/checkout-session', { invoiceId: invoice._id, successUrl, cancelUrl });
      if (r.data?.url) window.location.href = r.data.url;
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
      setPaying(false);
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000, margin: '0 auto' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
          ← Back to Invoices
        </button>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="row" style={{ gap: 10 }}>
              <div className="t-display t-mono">{invoice._id.slice(-8).toUpperCase()}</div>
              <span className={`badge ${isPaid ? 'badge-paid' : isPending ? 'badge-warning' : 'badge-unpaid'}`} style={{ alignSelf: 'center' }}>
                {isPaid ? 'Paid' : isPending ? 'Draft' : invoice.status}
              </span>
            </div>
            <div className="t-small muted" style={{ marginTop: 4 }}>
              Charging Period: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{invoice.billingPeriod}</span>
              {invoice.dueDate && ` · Due ${new Date(invoice.dueDate).toLocaleDateString()}`}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={downloadPDF}>
              <Icon name="download" size={14} /> Download PDF
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handlePay} 
              disabled={isPaid || isPending || paying}
            >
              <Icon name="card" size={14} /> 
              {paying ? 'Redirecting...' : isPending ? 'Cannot Pay Draft' : `Pay €${invoice.totalAmount.toFixed(2)}`}
            </button>
          </div>
        </div>

        {err && <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>}

        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="card-hd">
              <h3>Reservations Overview</h3>
              <span className="t-small muted t-mono">{invoice.reservations?.length || 0} reservation(s)</span>
            </div>
            <div className="card-bd flush">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Charging Point ID</th>
                    <th>Date & Time</th>
                    <th className="num">Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.reservations?.map((res, i) => (
                    <tr key={i}>
                      <td className="t-mono">{res.pointId}</td>
                      <td>{new Date(res.timestamp).toLocaleString()}</td>
                      <td className="num">€{res.charge.toFixed(2)}</td>
                    </tr>
                  ))}
                  {(!invoice.reservations || invoice.reservations.length === 0) && (
                    <tr><td colSpan={3} style={{ textAlign: 'center' }}>No detailed reservations found for this invoice.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 20px', borderTop: '1px solid var(--border)', alignItems: 'flex-end' }}>
                <div className="row" style={{ width: 320, justifyContent: 'space-between' }}>
                  <strong>Total due</strong>
                  <strong className="t-num" style={{ fontSize: 16 }}>€{invoice.totalAmount.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="col" style={{ gap: 16 }}>
            <div className="card">
              <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Row label="Currency" value={invoice.currency} />
                <Row label="Provider ID" value={<span className="t-mono">{invoice.providerId.slice(-10)}</span>} />
                <div style={{ height: 1, background: 'var(--border)' }} />
                
                {/* Dynamic messaging based on whether the draft is for the current month */}
                <div className="t-small muted">
                  {isPending 
                    ? (isCurrentMonth 
                        ? "This invoice is currently a draft accumulating charges for the current month. It will lock and become payable when the month concludes."
                        : `This invoice is a draft for the ${invoice.billingPeriod || 'past'} billing period. It is awaiting automated processing to become payable.`)
                    : "Payments are securely processed via Stripe. You will be redirected to a secure checkout page."
                  }
                </div>
                
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: any; value: any }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="t-small muted">{label}</span>
      <span className="t-small" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}