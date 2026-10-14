import type { OrderDetail } from '../api/checkout';
import type { Invoice } from '@shared/api/invoices';
import { amountInWords } from '@shared/utils/taxInvoicePrint';
import { DESI_TOKRI_LOGO_BASE64 } from './logoBase64';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
    : '';

const INVOICE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; background: #f1f5f9; padding: 20px; }
  .page { max-width: 900px; margin: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; position: relative; }
  .bar { max-width: 900px; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 10px; }
  .bar button { background: #065f46; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-weight: 600; cursor: pointer; font-size: 13px; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #065f46; padding-bottom: 14px; margin-bottom: 14px; }
  .title { font-size: 22px; font-weight: 800; color: #065f46; }
  .right { text-align: right; }
  .badge { display: inline-block; border: 1px solid #065f46; color: #065f46; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 3px 10px; border-radius: 4px; margin-bottom: 4px; }
  .strong { font-weight: 700; font-size: 13px; }
  .muted { color: #64748b; font-size: 11px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; letter-spacing: .04em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; background: #f8fafc; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #f1f5f9; text-align: left; font-size: 10px; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #cbd5e1; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { display: flex; justify-content: flex-end; margin-top: 12px; }
  .totals table { width: 340px; }
  .grand td { font-weight: 800; font-size: 14px; border-top: 2px solid #065f46; color: #065f46; }
  .words { text-align: right; font-style: italic; margin-top: 6px; color: #475569; font-size: 11.5px; }
  .foot { margin-top: 24px; padding-top: 14px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 11px; text-align: center; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .head { flex-direction: column; } .right { text-align: left; } }
  @media print { body { background: #fff; padding: 0; } .page { border: 0; padding: 0; } .bar { display: none; } }
`;

export function generateOrderInvoiceDocument(o: OrderDetail): string {
  const paymentModeLabel =
    o.payment.mode === 'COD'
      ? 'Cash on Delivery'
      : o.payment.mode === 'CREDIT'
      ? 'On Account (Credit)'
      : 'Online Payment';

  const rows = o.items
    .map(
      (item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <div class="strong">${esc(item.name || 'Product')}</div>
        ${item.sku ? `<div class="muted">SKU: ${esc(item.sku)}</div>` : ''}
      </td>
      <td class="num">${esc(item.quantity)} ${esc(item.unit || 'unit')}</td>
      <td class="num">₹${money(item.unitPrice)}</td>
      <td class="num">${item.discount ? `₹${money(item.discount)}` : '—'}</td>
      <td class="num"><strong>₹${money(item.total)}</strong></td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Invoice-${esc(o.orderNumber)}</title>
  <style>${INVOICE_CSS}</style>
</head>
<body>
  <div class="bar">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="page">
    <div class="head">
      <div>
        <div style="margin-bottom: 8px;">
          <img
            src="${DESI_TOKRI_LOGO_BASE64}"
            alt="Desi Tokri"
            style="height: 46px; width: auto; max-width: 320px; object-fit: contain; display: block;"
          />
        </div>
        <div class="muted">SVV Balaji Food &amp; Beverages Pvt. Ltd.</div>
        <div class="muted">Direct Mandi-Grade Farm Store</div>
      </div>
      <div class="right">
        <div class="badge">Order Invoice</div>
        <div class="strong">Order #${esc(o.orderNumber)}</div>
        <div>Date: ${esc(formatDate(o.placedAt))}</div>
        ${o.deliveredAt ? `<div>Delivered: ${esc(formatDate(o.deliveredAt))}</div>` : ''}
        <div>Status: <strong>${esc(o.status)}</strong></div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="label">Fulfillment & Dispatch Hub</div>
        <div class="strong">Desi Tokri Central Dispatch</div>
        <div>${esc(o.fulfillment.nodeName || 'Central Hub')}</div>
        ${o.fulfillment.nodeCity ? `<div>City: ${esc(o.fulfillment.nodeCity)}</div>` : ''}
        <div>Delivery Method: ${o.fulfillment.method === 'LOCAL' ? 'Express Local Delivery' : 'Standard Delivery'}</div>
        <div>Support Helpline: 1800-DESI-TOKRI</div>
      </div>

      <div class="card">
        <div class="label">Billed & Delivered To</div>
        <div class="strong">${esc(o.address.fullName)}</div>
        <div>Phone: <strong>+91 ${esc(o.address.phone)}</strong></div>
        <div>${esc([o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', '))}</div>
        <div>${esc(o.address.city)}, ${esc(o.address.state)} - ${esc(o.address.pincode)}</div>
      </div>
    </div>

    <div style="font-size: 12px; margin-bottom: 8px;">
      Payment Mode: <strong>${esc(paymentModeLabel)}</strong> (${esc(o.payment.status)})
      ${o.payment.reference ? `· Ref: <span class="muted">${esc(o.payment.reference)}</span>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Item Description</th>
          <th class="num">Quantity</th>
          <th class="num">Rate</th>
          <th class="num">Discount</th>
          <th class="num">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr>
          <td>Subtotal (Items)</td>
          <td class="num">₹${money(o.totals.subtotal)}</td>
        </tr>
        ${
          o.totals.discount > 0
            ? `<tr>
                <td>Discount applied</td>
                <td class="num" style="color: #16a34a;">- ₹${money(o.totals.discount)}</td>
              </tr>`
            : ''
        }
        ${
          o.totals.loyaltyRedeemedInr > 0
            ? `<tr>
                <td>Loyalty Coins</td>
                <td class="num" style="color: #16a34a;">- ₹${money(o.totals.loyaltyRedeemedInr)}</td>
              </tr>`
            : ''
        }
        ${
          o.totals.referralRedeemedInr > 0
            ? `<tr>
                <td>Referral Reward Coins</td>
                <td class="num" style="color: #16a34a;">- ₹${money(o.totals.referralRedeemedInr)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td>Delivery Charges</td>
          <td class="num">${o.totals.deliveryFee === 0 ? '<span style="color:#16a34a">FREE</span>' : `₹${money(o.totals.deliveryFee)}`}</td>
        </tr>
        ${
          o.totals.tax > 0
            ? `<tr>
                <td>Taxes (Included)</td>
                <td class="num">₹${money(o.totals.tax)}</td>
              </tr>`
            : ''
        }
        <tr class="grand">
          <td>Grand Total Paid</td>
          <td class="num">₹${money(o.totals.total)}</td>
        </tr>
      </table>
    </div>

    <div class="words">${esc(amountInWords(o.totals.total))}</div>

    <div class="foot">
      <div style="font-weight: 700; font-size: 13.5px; color: #065f46; margin-bottom: 5px;">
        Thank you for shopping with Desi Tokri! ❤️
      </div>
      <div>This is an official computer-generated order invoice and receipt. No physical signature is required.</div>
    </div>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 350); };</script>
</body>
</html>`;
}

/**
 * Downloads the Order Invoice directly as an HTML file and opens print/PDF dialog.
 * Embeds Desi Tokri brand logo and full order details.
 */
export async function downloadOrderInvoice(o: OrderDetail, _inv?: Invoice | null): Promise<void> {
  const docHtml = generateOrderInvoiceDocument(o);

  // 1. Always trigger direct file download (guaranteed to work across all browsers)
  const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Invoice-${o.orderNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  // 2. Also try opening print/PDF window
  try {
    const win = window.open('', '_blank', 'width=960,height=1000');
    if (win) {
      win.document.open();
      win.document.write(docHtml);
      win.document.close();
    }
  } catch {
    // Popup might be blocked, but the file was already downloaded above.
  }
}
