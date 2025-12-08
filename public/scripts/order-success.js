// public/scripts/order-success.js

document.addEventListener('DOMContentLoaded', initReceiptPage);

async function initReceiptPage() {
  const statusLabel = document.getElementById('receipt-status-label');
  const summaryLine = document.getElementById('order-summary-line');
  const errorBox = document.getElementById('receipt-error');
  const storeSections = document.getElementById('store-sections');
  const grandTotalEl = document.getElementById('grand-total-amount');

  const meta = {
    id: document.getElementById('order-id'),
    date: document.getElementById('order-date'),
    email: document.getElementById('order-email'),
    payment: document.getElementById('order-payment'),
    delivery: document.getElementById('order-delivery'),
  };

  const printBtn = document.getElementById('btn-print');
  const pdfBtn = document.getElementById('btn-download-pdf');

  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', handleDownloadPdf);
  }

  // ===== Get session id from URL =====
  const params = new URLSearchParams(window.location.search);
  const sessionId =
    params.get('session_id') ||
    params.get('sessionId') ||
    params.get('id') ||
    '';

  if (!sessionId) {
    showError(
      'Missing Stripe session id in the URL. This page should be opened from the payment success redirect.'
    );
    return;
  }

  try {
    if (statusLabel) statusLabel.textContent = 'Loading receipt…';

    const apiUrl = `/api/orders/sessionId?sessionId=${encodeURIComponent(
      sessionId
    )}`;

    console.log('[Receipt] Session id from URL:', sessionId);
    console.log('[Receipt] Fetching order from:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'GET',
      credentials: 'include',
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        'Unexpected response from server: ' + text.slice(0, 120)
      );
    }

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load order');
    }

    const order = data;

    // ===== Meta info =====
    if (meta.id) {
      meta.id.textContent =
        order._id || order.stripeSessionId || sessionId || '—';
    }

    const placed = order.createdAt ? new Date(order.createdAt) : null;
    if (meta.date) {
      meta.date.textContent = placed
        ? placed.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—';
    }

    if (meta.email) {
      meta.email.textContent = order.userEmail || order.email || '—';
    }

    if (meta.payment) {
      const baseMethod = order.paymentMethod || 'Credit card';
      const statusText = order.paymentStatus
        ? ' • ' + String(order.paymentStatus).toUpperCase()
        : '';
      meta.payment.textContent = baseMethod + statusText;
    }

    if (meta.delivery) {
      meta.delivery.textContent = order.deliveryMethod || 'Pickup at store';
    }

    if (summaryLine) {
      const parts = [];
      if (order.stripeSessionId) parts.push(`Order ${order.stripeSessionId}`);
      if (placed)
        parts.push(
          placed.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        );
      if (order.userEmail || order.email)
        parts.push(order.userEmail || order.email);
      summaryLine.textContent = parts.join(' • ');
    }

    if (statusLabel) statusLabel.textContent = 'Receipt ready';

    // ===== Group items by store =====
    const items = Array.isArray(order.items) ? order.items : [];
    const byStore = {};

    for (const item of items) {
      const store = item.store || order.storeName || 'Other store';
      if (!byStore[store]) byStore[store] = [];
      byStore[store].push(item);
    }

    let grandTotal = 0;
    const currency = 'CAD';

    const sectionsHtml =
      Object.entries(byStore)
        .map(([storeName, items]) => {
          let storeSubtotal = 0;

          const rows = items
            .map((it) => {
              const qty = Number(it.quantity || it.qty || 1);
              const unit = getUnitPrice(it);
              const line = getLineTotal(it, qty, unit);
              storeSubtotal += line;

              return `
              <tr>
                <td class="col-name">${escapeHtml(it.name || '')}</td>
                <td class="col-unit">${formatMoney(unit, currency)}</td>
                <td class="col-qty">× ${qty}</td>
                <td class="col-line">${formatMoney(line, currency)}</td>
              </tr>`;
            })
            .join('');

          grandTotal += storeSubtotal;

          const locationText = buildLocationText(items[0]);

          return `
          <section class="receipt-store">
            <header class="receipt-store-head">
              <div>
                <div class="store-name">${escapeHtml(storeName)}</div>
                <div class="store-meta">${locationText}</div>
              </div>
              <div class="store-subtotal-label">
                <span>Subtotal — ${escapeHtml(storeName)}</span>
                <span class="store-subtotal-amount">${formatMoney(
                  storeSubtotal,
                  currency
                )}</span>
              </div>
            </header>
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="col-name">Product</th>
                  <th class="col-unit">Unit</th>
                  <th class="col-qty">Qty</th>
                  <th class="col-line">Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </section>`;
        })
        .join('') ||
      `<p class="muted">No items found for this order.</p>`;

    if (storeSections) {
      storeSections.innerHTML = sectionsHtml;
    }

    const total = computeOrderTotal(order, grandTotal);
    if (grandTotalEl) {
      grandTotalEl.textContent = formatMoney(total, currency);
    }
  } catch (err) {
    console.error('Receipt load error:', err);
    showError(err.message || String(err));
  }

  // ===== Helpers =====

  function showError(message) {
    console.error('Receipt error:', message);
    if (statusLabel) statusLabel.textContent = 'Failed to load receipt';
    if (storeSections) storeSections.innerHTML = '';
    if (errorBox) {
      errorBox.textContent = 'Error: ' + message;
      errorBox.hidden = false;
    } else {
      alert('Error: ' + message);
    }
  }

  function formatMoney(amount, currency) {
    const n = Number(amount || 0);
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'CAD',
      }).format(n);
    } catch {
      return `CA$${n.toFixed(2)}`;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildLocationText(sampleItem) {
    if (!sampleItem) return 'Location: — • Pickup at store';
    const loc = sampleItem.storeLocation || '—';
    const mode = sampleItem.deliveryMethod || 'Pickup at store';
    return `Location: ${escapeHtml(loc)} • ${escapeHtml(mode)}`;
  }

  function getUnitPrice(it) {
    if (!it) return 0;

    const qty = Number(it.quantity || it.qty || 1) || 1;
    const candidates = [
      it.price,
      it.unitPrice,
      it.unit_price,
      it.unitAmount,
      it.unit_amount,
    ];

    if (typeof it.amount_total === 'number') {
      const val = it.amount_total / 100;
      if (qty > 0) candidates.push(val / qty);
    }
    if (typeof it.totalAmount === 'number') {
      const val = it.totalAmount;
      if (qty > 0) candidates.push(val / qty);
    }
    if (typeof it.lineTotal === 'number') {
      const val = it.lineTotal;
      if (qty > 0) candidates.push(val / qty);
    }
    if (typeof it.line_total === 'number') {
      const val = it.line_total;
      if (qty > 0) candidates.push(val / qty);
    }

    for (const v of candidates) {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
  }

  function getLineTotal(it, qty, unit) {
    const candidates = [];

    if (typeof it.lineTotal === 'number') candidates.push(it.lineTotal);
    if (typeof it.line_total === 'number') candidates.push(it.line_total);
    if (typeof it.totalAmount === 'number') candidates.push(it.totalAmount);
    if (typeof it.amount_total === 'number')
      candidates.push(it.amount_total / 100);

    for (const v of candidates) {
      const num = Number(v);
      if (Number.isFinite(num) && num >= 0) return num;
    }
    return qty * unit;
  }

  function computeOrderTotal(order, grandTotal) {
    if (!order) return grandTotal;

    const candidates = [];
    if (typeof order.total === 'number') candidates.push(order.total);
    if (typeof order.amount === 'number') candidates.push(order.amount);
    if (typeof order.amount_total === 'number')
      candidates.push(order.amount_total / 100);

    for (const v of candidates) {
      const num = Number(v);
      if (Number.isFinite(num) && num >= 0) return num;
    }
    return grandTotal;
  }

  async function handleDownloadPdf() {
    if (!window.html2canvas || !window.jspdf?.jsPDF) {
      alert('PDF libraries not loaded yet. Please try again in a moment.');
      return;
    }

    const receiptEl = document.getElementById('receipt-card');
    if (!receiptEl) return;

    if (statusLabel) statusLabel.textContent = 'Rendering PDF…';

    try {
      const canvas = await window.html2canvas(receiptEl, {
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let y = margin;
      if (imgHeight > pageHeight - margin * 2) {
        let remainingHeight = imgHeight;
        let position = margin;

        while (remainingHeight > 0) {
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          remainingHeight -= pageHeight - margin * 2;
          if (remainingHeight > 0) {
            pdf.addPage();
            position = margin;
          }
        }
      } else {
        pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      }

      pdf.save(`grocery-web-receipt-${Date.now()}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      showError('Unable to generate PDF');
    } finally {
      if (statusLabel) statusLabel.textContent = 'Receipt ready';
    }
  }
}
