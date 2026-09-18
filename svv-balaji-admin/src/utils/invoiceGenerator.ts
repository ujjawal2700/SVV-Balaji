import type { Order } from '../api/types';
import type { PosOrderRecord } from '../pages/pos/PosOrdersPage';
import type { ExtendedOrder } from '../pages/sales/OrdersPage';
import { formatCurrency, formatDate, formatDateTime } from './format';

/**
 * Open a styled, print-ready Bill / Tax Invoice window and trigger print / PDF save.
 */
function openPrintWindow(title: string, htmlContent: string) {
  const printWindow = window.open('', '_blank', 'width=850,height=900');
  if (!printWindow) {
    alert('Please allow pop-ups to download and print the bill.');
    return;
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
          <span style="font-size: 13px; color: #64748b;">Tax Invoice Document</span>
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
}

/**
 * Generate and download bill for standard B2C / B2B orders.
 */
export function downloadOrderBill(order: ExtendedOrder | Order | any) {
  const orderNo = order.orderNumber || order.id;
  const orderDate = order.orderDate ? formatDate(order.orderDate) : new Date().toLocaleDateString('en-IN');
  const customerName = order.customer?.name || order.customerName || 'Retail Customer';
  const customerPhone = order.customerMobile || order.customer?.phone || '+91 98765 43210';
  const address = order.deliveryAddress || `${order.deliveryCity || 'Patna'}, Bihar, India`;
  const subtotal = Number(order.subtotal || order.total || 0);
  const tax = Number(order.taxTotal || 0);
  const total = Number(order.total || subtotal + tax);

  const items = order.items && order.items.length > 0
    ? order.items
    : [
        {
          id: 'item-1',
          product: { name: order.primaryProductName || order.itemsSummary || 'SVV Pure Sharbati Atta 10kg' },
          quantity: order.totalItemCount || 1,
          unitPrice: subtotal > 0 ? (subtotal / (order.totalItemCount || 1)).toFixed(2) : '450.00',
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
        <div class="company-sub">GSTIN: 10AAACS9981P1Z5 · FSSAI: 1042100000129</div>
      </div>
      <div style="text-align: right;">
        <span class="tax-badge">TAX INVOICE</span>
        <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 6px;">INV-${orderNo}</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${orderDate}</div>
        <div style="font-size: 11px; color: #059669; font-weight: 600;">Status: ${order.paymentStatus || 'PAID'}</div>
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
          Fulfillment Hub: <strong>${order.warehouse?.name || order.assignedNodeName || 'Patna Central Processing Hub'}</strong><br />
          Payment Mode: <strong>${order.paymentMethod || order.paymentTerms || 'Prepaid Online'}</strong><br />
          Logistics / AWB: ${order.logisticsPartner || 'SVV Express'} (${order.awbNumber || 'EXP-9921'})<br />
          Order Status: <span style="color: #059669; font-weight: 700;">${order.status || 'CONFIRMED'}</span>
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
          <td>Taxes (GST 5%):</td>
          <td style="text-align: right;">₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>Delivery Charge:</td>
          <td style="text-align: right; color: #059669; font-weight: 600;">FREE</td>
        </tr>
        <tr class="grand-total">
          <td>Grand Total:</td>
          <td style="text-align: right;">₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <div>Thank you for choosing SVV Balaji! Direct Mandi to Customer Traceable Quality.</div>
      <div style="margin-top: 4px;">This is a computer-generated tax invoice. No signature required.</div>
    </div>
  `;

  openPrintWindow(`Tax-Invoice-${orderNo}`, html);
}

/**
 * Generate and download POS counter receipt / bill.
 */
export function downloadPosBill(posOrder: PosOrderRecord) {
  const itemsSummary = posOrder.itemsSummary || 'General Grocery Items';
  const subtotal = posOrder.subtotal;
  const tax = posOrder.tax;
  const discount = posOrder.discount;
  const netTotal = posOrder.netTotal;

  const html = `
    <div class="header">
      <div>
        <div class="company-name">SVV BALAJI STORE</div>
        <div class="company-sub">${posOrder.outletName}</div>
        <div class="company-sub">Cashier: ${posOrder.cashierName} · POS Terminal #01</div>
        <div class="company-sub">FSSAI Lic: 1042100000129 · GSTIN: 10AAACS9981P1Z5</div>
      </div>
      <div style="text-align: right;">
        <span class="tax-badge" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">POS COUNTER RECEIPT</span>
        <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 6px;">${posOrder.orderId}</div>
        <div style="font-size: 11px; color: #64748b;">${posOrder.createdAt}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-title">Customer Information</div>
        <div class="meta-content">
          <strong>${posOrder.customerName}</strong><br />
          Mobile: +91 ${posOrder.customerMobile}<br />
          Type: <span style="font-weight: 600;">${posOrder.customerType}</span><br />
          ${posOrder.customerGst ? `GSTIN: <strong>${posOrder.customerGst}</strong>` : ''}
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Billing & Payment Mode</div>
        <div class="meta-content">
          Payment Mode: <strong style="color: #059669; font-size: 14px;">${posOrder.paymentMode}</strong><br />
          Status: <strong style="color: #059669;">${posOrder.status}</strong><br />
          Total Items: <strong>${posOrder.itemCount} Units</strong>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Particulars / Items</th>
          <th style="text-align: right;">Qty</th>
          <th style="text-align: right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${itemsSummary}</strong>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Over-the-counter verified batch distribution</div>
          </td>
          <td style="text-align: right; font-weight: 600;">${posOrder.itemCount}</td>
          <td style="text-align: right; font-weight: 600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals-area">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td style="text-align: right; font-weight: 600;">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>GST Tax:</td>
          <td style="text-align: right;">₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="color: #059669;">Special Discount:</td>
          <td style="text-align: right; color: #059669; font-weight: 600;">-₹${discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>` : ''}
        <tr class="grand-total">
          <td>Net Paid:</td>
          <td style="text-align: right;">₹${netTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <div>*** Thank You! Please Visit Again ***</div>
      <div style="margin-top: 4px;">For returns or inquiries, please present this bill within 7 days.</div>
    </div>
  `;

  openPrintWindow(`POS-Receipt-${posOrder.orderId}`, html);
}
