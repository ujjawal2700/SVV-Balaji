import type { Invoice, InvoiceParty } from '../api/invoices';

/**
 * Print a GST tax invoice exactly as the server issued it (Rule 46 fields:
 * seller/buyer GSTIN, serial number, date, HSN, taxable value, rate, CGST/SGST
 * or IGST, place of supply, IRN + QR for B2B e-invoices).
 *
 * Nothing is computed here - every figure comes from the invoice - and every
 * value is escaped, because names and addresses are typed by customers.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

/** Indian-system words for the grand total, e.g. "Eight Hundred Forty Rupees and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const rest = n % 1e3;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(' ');
  };
  const paise = Math.round(amount * 100);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `${words(r)} Rupees${p ? ` and ${two(p)} Paise` : ''} Only`;
}

function party(title: string, p: InvoiceParty) {
  return `
    <div class="card">
      <div class="label">${esc(title)}</div>
      <div class="strong">${esc(p.legalName)}</div>
      ${p.tradeName ? `<div>${esc(p.tradeName)}</div>` : ''}
      <div>${esc(p.addressLine1)}${p.addressLine2 ? `, ${esc(p.addressLine2)}` : ''}</div>
      <div>${esc([p.city, p.pincode].filter(Boolean).join(' - '))}</div>
      <div>State: ${esc(p.stateName ?? '')}${p.stateCode ? ` (${esc(p.stateCode)})` : ''}</div>
      ${p.gstin ? `<div>GSTIN: <b>${esc(p.gstin)}</b></div>` : '<div class="muted">Unregistered (no GSTIN)</div>'}
      ${p.phone ? `<div>Phone: ${esc(p.phone)}</div>` : ''}
    </div>`;
}

export function taxInvoiceHtml(inv: Invoice): string {
  const footerNote = inv.seller.footerNote;
  const inter = inv.isInterState;
  const taxHead = inter ? '<th class="num">IGST</th>' : '<th class="num">CGST</th><th class="num">SGST</th>';
  const taxCells = (c: number, s: number, i: number) =>
    inter ? `<td class="num">${money(i)}</td>` : `<td class="num">${money(c)}</td><td class="num">${money(s)}</td>`;

  const rows = inv.lines.map((l) => `
    <tr>
      <td>${l.lineNo}</td>
      <td>${esc(l.description)}${l.sku ? `<div class="muted">${esc(l.sku)}</div>` : ''}</td>
      <td>${esc(l.hsnSac ?? '—')}</td>
      <td class="num">${esc(l.quantity)} ${esc(l.uqc)}</td>
      <td class="num">${money(l.unitPrice)}</td>
      <td class="num">${l.discount ? money(l.discount) : '—'}</td>
      <td class="num">${money(l.taxableValue)}</td>
      <td class="num">${esc(l.gstRatePercent)}%</td>
      ${taxCells(l.cgstAmount, l.sgstAmount, l.igstAmount)}
      <td class="num">${money(l.lineTotal)}</td>
    </tr>`).join('');

  const hsnRows = inv.hsnSummary.map((h) => `
    <tr>
      <td>${esc(h.hsnSac ?? '—')}</td><td class="num">${esc(h.gstRatePercent)}%</td>
      <td class="num">${money(h.taxableValue)}</td>
      ${taxCells(h.cgst, h.sgst, h.igst)}
    </tr>`).join('');

  const cancelled = inv.status === 'CANCELLED';
  const irn = inv.irn
    ? `<div class="irn">
         ${inv.signedQrImage ? `<img src="${esc(inv.signedQrImage)}" alt="e-invoice QR" />` : ''}
         <div><div class="label">e-Invoice</div>
           <div>IRN: <span class="mono">${esc(inv.irn)}</span></div>
           <div>Ack No: ${esc(inv.ackNo)} · Ack Date: ${esc(date(inv.ackDate))}</div></div>
       </div>`
    : '';

  return `
    ${cancelled ? `<div class="void">CANCELLED${inv.cancelReason ? ` — ${esc(inv.cancelReason)}` : ''}</div>` : ''}
    <div class="head">
      <div>
        <div class="title">${esc(inv.seller.tradeName || inv.seller.legalName)}</div>
        ${inv.seller.tradeName ? `<div class="muted">${esc(inv.seller.legalName)}</div>` : ''}
        <div class="muted">GSTIN ${esc(inv.seller.gstin)}</div>
      </div>
      <div class="right">
        <div class="badge">Tax Invoice</div>
        <div class="strong">${esc(inv.invoiceNumber)}</div>
        <div>Date: ${esc(date(inv.invoiceDate))}</div>
        <div>${inv.order ? `Order: ${esc(inv.order.orderNumber)}` : inv.posSale ? `Counter sale: ${esc(inv.posSale.saleNumber)}` : ''}</div>
      </div>
    </div>
    ${irn}
    <div class="grid">
      ${party('Seller', inv.seller)}
      ${party(inv.supplyType === 'B2B' ? 'Buyer (Bill to)' : 'Billed to', inv.buyer)}
    </div>
    <div class="pos">Place of supply: <b>${esc(inv.placeOfSupplyName ?? '')} (${esc(inv.placeOfSupply)})</b>
      · ${inter ? 'Inter-state supply — IGST' : 'Intra-state supply — CGST + SGST'} · Reverse charge: No</div>

    <table>
      <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Taxable</th><th class="num">GST</th>${taxHead}<th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Taxable value</td><td class="num">₹${money(inv.taxableTotal)}</td></tr>
        ${inter ? `<tr><td>IGST</td><td class="num">₹${money(inv.igstTotal)}</td></tr>`
          : `<tr><td>CGST</td><td class="num">₹${money(inv.cgstTotal)}</td></tr><tr><td>SGST</td><td class="num">₹${money(inv.sgstTotal)}</td></tr>`}
        ${inv.roundOff ? `<tr><td>Round off</td><td class="num">₹${money(inv.roundOff)}</td></tr>` : ''}
        <tr class="grand"><td>Invoice total</td><td class="num">₹${money(inv.grandTotal)}</td></tr>
      </table>
    </div>
    <div class="words">${esc(amountInWords(inv.grandTotal))}</div>

    <div class="label" style="margin-top:16px">Tax summary by HSN/SAC</div>
    <table class="small">
      <thead><tr><th>HSN/SAC</th><th class="num">Rate</th><th class="num">Taxable</th>${taxHead}</tr></thead>
      <tbody>${hsnRows}</tbody>
    </table>

    <div class="foot">
      ${footerNote ? `<div>${esc(footerNote)}</div>` : ''}
      <div>This is a computer-generated invoice and does not require a signature.</div>
    </div>`;
}

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;background:#f1f5f9;padding:20px}
  .page{max-width:900px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;position:relative}
  .bar{max-width:900px;margin:0 auto 12px;display:flex;justify-content:flex-end}
  .bar button{background:#065f46;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer}
  .head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #065f46;padding-bottom:14px;margin-bottom:14px}
  .title{font-size:20px;font-weight:800;color:#065f46}
  .right{text-align:right}
  .badge{display:inline-block;border:1px solid #065f46;color:#065f46;font-weight:700;text-transform:uppercase;font-size:11px;padding:3px 10px;border-radius:4px;margin-bottom:4px}
  .strong{font-weight:700;font-size:13px}
  .muted{color:#64748b;font-size:11px}
  .label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px;letter-spacing:.04em}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}
  .card{border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
  .pos{margin:6px 0 12px;font-size:12px}
  .irn{display:flex;gap:14px;align-items:center;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:12px}
  .irn img{width:110px;height:110px}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;word-break:break-all}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;text-align:left;font-size:10px;text-transform:uppercase;padding:6px;border-bottom:1px solid #cbd5e1}
  td{padding:6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  .small td,.small th{font-size:11px}
  .totals{display:flex;justify-content:flex-end;margin-top:10px}
  .totals table{width:300px}
  .grand td{font-weight:800;font-size:14px;border-top:2px solid #065f46}
  .words{text-align:right;font-style:italic;margin-top:4px}
  .foot{margin-top:18px;padding-top:10px;border-top:1px dashed #cbd5e1;color:#64748b;font-size:11px;text-align:center}
  .void{position:absolute;top:40%;left:0;right:0;text-align:center;font-size:40px;font-weight:900;color:rgba(220,38,38,.18);transform:rotate(-12deg);pointer-events:none}
  @media (max-width:640px){.grid{grid-template-columns:1fr}.head{flex-direction:column}.right{text-align:left}}
  @media print{body{background:#fff;padding:0}.page{border:0;padding:0}.bar{display:none}}
`;

/** The complete printable page - what the print window shows. */
export function taxInvoiceDocument(inv: Invoice): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${esc(inv.invoiceNumber.replace(/\//g, '-'))}</title><style>${CSS}</style></head>
    <body><div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
    <div class="page">${taxInvoiceHtml(inv)}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

/** Open the invoice in a new window and bring up the print dialog (Save as PDF works there). */
export function printTaxInvoice(inv: Invoice): boolean {
  const w = window.open('', '_blank', 'width=960,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(taxInvoiceDocument(inv));
  w.document.close();
  return true;
}
