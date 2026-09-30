import type { Order } from '../api/types';
import type { PosSale } from '@shared/api/pos';
import type { ExtendedOrder } from '../pages/sales/OrdersPage';
import { formatCurrency, formatDate, formatDateTime } from './format';

/**
 * Open a styled, print-ready order summary / receipt window and trigger print / PDF save.
 *
 * These are NOT tax invoices: the GST tax invoice is issued by the server at
 * dispatch (backend `src/invoices`, printed by `@shared/utils/taxInvoicePrint`).
 * Nothing here may print a GSTIN, an invoice number or a "Tax Invoice" heading.
 */
function openPrintWindow(title: string, htmlContent: string): boolean {
  const printWindow = window.open('', '_blank', 'width=850,height=900');
  if (!printWindow) {
    alert('Please allow pop-ups to download and print the bill.');
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          body { background: #f8fafc; padding: 24px; color: #1e293b; }
          .invoice-box { max-width: 800px; margin: auto; padding: 32px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #065f46; padding-bottom: 18px; margin-bottom: 20px; }
          .company-name { font-size: 22px; font-weight: 800; color: #065f46; letter-spacing: -0.5px; }
          .company-sub { font-size: 11px; color: #64748b; margin-top: 3px; }
          .tax-badge { display: inline-block; background: #ecfdf5; color: #065f46; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; border: 1px solid #a7f3d0; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .meta-card { background: #f8fafc; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .meta-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
          .meta-content { font-size: 13px; line-height: 1.5; color: #1e293b; }
          table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          table.items-table th { background: #f1f5f9; padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: left; color: #334155; border-bottom: 2px solid #cbd5e1; }
          table.items-table td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
          .totals-area { display: flex; justify-content: flex-end; margin-bottom: 24px; }
          .totals-table { width: 280px; border-collapse: collapse; }
          .totals-table td { padding: 6px 10px; font-size: 12px; }
          .totals-table .grand-total { font-size: 16px; font-weight: 800; color: #065f46; border-top: 2px solid #065f46; padding-top: 10px; }
          .footer { border-top: 1px dashed #cbd5e1; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; }
          .no-print-bar { display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto 16px; }
          .btn-print { background: #059669; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
          @media print {
            body { background: #fff; padding: 0; }
            .invoice-box { box-shadow: none; border: none; padding: 0; }
            .no-print-bar { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <span style="font-size: 13px; color: #64748b;">Order summary — not a tax invoice</span>
          <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>
        <div class="invoice-box">
          ${htmlContent}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
  return true;
}

/**
 * Generate and download bill for standard B2C / B2B orders.
 */
export function downloadOrderBill(order: ExtendedOrder | Order | any) {
  const orderNo = order.orderNumber || order.id;
  const orderDate = order.orderDate ? formatDate(order.orderDate) : new Date().toLocaleDateString('en-IN');
  const customerName = order.customer?.name || order.customerName || 'Retail Customer';
  const customerPhone = order.customerMobile || order.customer?.phone || '—';
  const address = order.deliveryAddress || order.deliveryCity || '—';
  const subtotal = Number(order.subtotal || order.total || 0);
  const tax = Number(order.taxTotal || 0);
  const total = Number(order.total || subtotal + tax);

  const items = order.items && order.items.length > 0
    ? order.items
    : [
        {
          id: 'item-1',
          product: { name: order.primaryProductName || order.itemsSummary || 'Order items' },
          quantity: order.totalItemCount || 1,
          unitPrice: (subtotal / (order.totalItemCount || 1)).toFixed(2),
          lineTotal: subtotal.toFixed(2),
        },
      ];

  const itemsRowsHtml = items
    .map(
      (item: any, idx: number) => `
      <tr>
        <td style="width: 40px; text-align: center;">${idx + 1}</td>
        <td><strong>${item.product?.name || item.name || 'Product Item'}</strong></td>
        <td style="text-align: right;">${item.quantity || 1}</td>
        <td style="text-align: right;">₹${Number(item.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: 600;">₹${Number(item.lineTotal || (item.quantity * item.unitPrice) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `,
    )
    .join('');

  const html = `
    <div class="header">
      <div>
        <div class="company-name">SVV BALAJI AGRO PRODUCER CO.</div>
        <div class="company-sub">Farm-Traceable Pure Staples & Direct Mandi Distribution</div>
      </div>
      <div style="text-align: right;">
        <span class="tax-badge">ORDER SUMMARY</span>
        <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 6px;">${orderNo}</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${orderDate}</div>
        <div style="font-size: 11px; color: #059669; font-weight: 600;">Payment: ${order.paymentStatus || '—'}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-title">Billed To (Customer Details)</div>
        <div class="meta-content">
          <strong>${customerName}</strong><br />
          Phone: ${customerPhone}<br />
          Delivery Address: ${address}<br />
          Channel: <span style="font-weight: 600; color: #2563eb;">${order.channel || 'B2C'}</span>
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Dispatch & Fulfillment Details</div>
        <div class="meta-content">
          Fulfillment Hub: <strong>${order.warehouse?.name || order.assignedNodeName || '—'}</strong><br />
          Payment Mode: <strong>${order.paymentMethod || order.paymentMode || order.paymentTerms || '—'}</strong><br />
          Logistics / AWB: ${order.logisticsPartner || order.shipment?.courier || '—'}${order.awbNumber || order.shipment?.awb ? ` (${order.awbNumber || order.shipment?.awb})` : ''}<br />
          Order Status: <span style="color: #059669; font-weight: 700;">${order.status || '—'}</span>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">#</th>
          <th>Item Description</th>
          <th style="text-align: right;">Qty</th>
          <th style="text-align: right;">Rate (₹)</th>
          <th style="text-align: right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRowsHtml}
      </tbody>
    </table>

    <div class="totals-area">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td style="text-align: right; font-weight: 600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>GST:</td>
          <td style="text-align: right;">₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>Delivery Charge:</td>
          <td style="text-align: right; font-weight: 600;">${Number(order.deliveryFee || 0) > 0 ? `₹${Number(order.deliveryFee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'FREE'}</td>
        </tr>
        <tr class="grand-total">
          <td>Grand Total:</td>
          <td style="text-align: right;">₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <div>Thank you for choosing SVV Balaji! Direct Mandi to Customer Traceable Quality.</div>
      <div style="margin-top: 4px;">Order summary only — not a tax invoice. The GST invoice is issued when the order is dispatched.</div>
    </div>
  `;

  openPrintWindow(`Order-Summary-${orderNo}`, html);
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rs = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A counter receipt from a real POS sale, used only when no GST invoice exists
 * yet (GST Settings incomplete). It says so, and prints no GSTIN of its own.
 */
export function downloadPosReceipt(sale: PosSale): boolean {
  const rows = sale.lines
    .map(
      (l) => `
      <tr>
        <td><strong>${esc(l.nameSnapshot)}</strong><div style="font-size: 11px; color: #64748b;">${esc(l.skuSnapshot ?? '')}</div></td>
        <td style="text-align: right;">${l.quantity}</td>
        <td style="text-align: right;">${rs(l.unitPrice)}</td>
        <td style="text-align: right; font-weight: 600;">${rs(l.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const html = `
    <div class="header">
      <div>
        <div class="company-name">${esc(sale.outlet.name)}</div>
        <div class="company-sub">${esc(sale.outlet.address)}, ${esc(sale.outlet.city)}</div>
        <div class="company-sub">Cashier: ${esc(sale.cashier.fullName)} · Shift ${esc(sale.shift.shiftNumber)}</div>
      </div>
      <div style="text-align: right;">
        <span class="tax-badge" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">COUNTER RECEIPT</span>
        <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 6px;">${esc(sale.saleNumber)}</div>
        <div style="font-size: 11px; color: #64748b;">${esc(formatDateTime(sale.createdAt))}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-title">Customer</div>
        <div class="meta-content">
          <strong>${esc(sale.customerName)}</strong><br />
          ${sale.customerPhone ? `Mobile: ${esc(sale.customerPhone)}<br />` : ''}
          ${sale.customerGstin ? `GSTIN: <strong>${esc(sale.customerGstin)}</strong>` : ''}
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Payment</div>
        <div class="meta-content">
          Mode: <strong>${esc(sale.paymentMode)}</strong><br />
          ${sale.amountTendered !== null ? `Tendered: ${rs(sale.amountTendered)} · Change: ${rs(sale.changeDue ?? 0)}<br />` : ''}
          ${sale.paymentReference ? `Ref: ${esc(sale.paymentReference)}<br />` : ''}
          Status: <strong>${esc(sale.status)}</strong>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead><tr><th>Item</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Rate (ex-GST)</th><th style="text-align: right;">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-area">
      <table class="totals-table">
        <tr><td>Subtotal:</td><td style="text-align: right;">${rs(sale.subtotal)}</td></tr>
        ${sale.discountTotal > 0 ? `<tr><td>Discount:</td><td style="text-align: right;">-${rs(sale.discountTotal)}</td></tr>` : ''}
        <tr><td>GST:</td><td style="text-align: right;">${rs(sale.taxTotal)}</td></tr>
        <tr class="grand-total"><td>Total:</td><td style="text-align: right;">${rs(sale.total)}</td></tr>
      </table>
    </div>

    <div class="footer">
      <div>Receipt only — not a tax invoice. The GST invoice for this sale is issued by the system.</div>
    </div>
  `;

  return openPrintWindow(`Receipt-${sale.saleNumber}`, html);
}
