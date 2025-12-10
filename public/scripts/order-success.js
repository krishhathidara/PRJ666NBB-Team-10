// public/scripts/order-success.js

document.addEventListener('DOMContentLoaded', initReceiptPage);

async function initReceiptPage() {
  const statusLabel = document.getElementById('receipt-status-label');
  const summaryLine = document.getElementById('order-summary-line');
  const errorBox = document.getElementById('receipt-error');
  const storeSections = document.getElementById('store-sections');
  
  // New elements for tax breakdown
  const subtotalEl = document.getElementById('subtotal-amount');
  const taxEl = document.getElementById('tax-amount');
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
        `#${(order._id || order.stripeSessionId || sessionId).slice(-8).toUpperCase()}`;
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
      if (order.stripeSessionId) parts.push(`Order ${order.stripeSessionId.slice(-8)}`);
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

    let calculatedSubtotal = 0;

    for (const item of items) {
      // Robust store detection for grouping
      const store = item.store || order.storeName || 'Other store';
      if (!byStore[store]) byStore[store] = [];
      byStore[store].push(item);
      
      // Accumulate subtotal
      const qty = Number(item.quantity || item.qty || 1);
      const unit = getUnitPrice(item);
      const line = getLineTotal(item, qty, unit);
      calculatedSubtotal += line;
    }

    const currency = 'CAD';

    // Generate HTML for each store
    const sectionsHtml =
      Object.entries(byStore)
        .map(([storeName, items]) => {
          // New: Get Address
          const address = getStoreAddress(storeName);
          let storeSectionTotal = 0;

          const rows = items
            .map((it) => {
              const qty = Number(it.quantity || it.qty || 1);
              const unit = getUnitPrice(it);
              const line = getLineTotal(it, qty, unit);
              storeSectionTotal += line;
              
              return `
              <tr>
                <td class="col-name">
                    <div style="font-weight:600; color:#fff;">${escapeHtml(it.name || '')}</div>
                    <div style="font-size:0.8rem; color:#94a3b8;">${it.description || ''}</div>
                </td>
                <td class="col-unit col-right">${formatMoney(unit, currency)}</td>
                <td class="col-qty col-right">× ${qty}</td>
                <td class="col-line col-right" style="font-weight:600">${formatMoney(line, currency)}</td>
              </tr>`;
            })
            .join('');

          return `
          <div class="store-section" style="background:rgba(255,255,255,0.03); border-radius:12px; padding:20px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.05);">
            <div class="store-header" style="border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:flex-end;">
              <div class="store-title">
                <h4 style="margin:0; color:#3b82f6; font-size:1.2rem;">${escapeHtml(storeName)}</h4>
                <div class="store-address" style="font-size:0.85rem; color:#94a3b8; margin-top:4px;">📍 ${escapeHtml(address)}</div>
              </div>
              <div style="text-align:right;">
                 <div style="font-size:0.8rem; color:#94a3b8;">Section Subtotal</div>
                 <div style="font-weight:700; color:#fff;">${formatMoney(storeSectionTotal, currency)}</div>
              </div>
            </div>
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <th class="col-name" style="text-align:left; padding-bottom:8px; color:#94a3b8;">Product</th>
                  <th class="col-unit col-right" style="text-align:right; padding-bottom:8px; color:#94a3b8;">Unit Price</th>
                  <th class="col-qty col-right" style="text-align:right; padding-bottom:8px; color:#94a3b8;">Qty</th>
                  <th class="col-line col-right" style="text-align:right; padding-bottom:8px; color:#94a3b8;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>`;
        })
        .join('') ||
      `<p class="muted">No items found for this order.</p>`;

    if (storeSections) {
      storeSections.innerHTML = sectionsHtml;
    }

    // ===== Calculate Tax & Totals =====
    // 13% Tax Calculation to match profile logic
    const taxRate = 0.13;
    const taxAmount = calculatedSubtotal * taxRate;
    const finalTotal = calculatedSubtotal + taxAmount;

    // Update DOM
    if (subtotalEl) subtotalEl.textContent = formatMoney(calculatedSubtotal, currency);
    if (taxEl) taxEl.textContent = formatMoney(taxAmount, currency);
    
    // Use explicit calculation for Grand Total display
    if (grandTotalEl) {
      grandTotalEl.textContent = formatMoney(finalTotal, currency);
    }
  } catch (err) {
    console.error('Receipt load error:', err);
    showError(err.message || String(err));
  }

  // ===== Helpers (PRESERVED) =====

  function showError(message) {
    console.error('Receipt error:', message);
    if (statusLabel) statusLabel.textContent = 'Failed to load receipt';
    if (storeSections) storeSections.innerHTML = '';
    if (errorBox) {
      errorBox.textContent = 'Error: ' + message;
      errorBox.style.display = 'block'; 
    } else {
      alert('Error: ' + message);
    }
  }

  function formatMoney(amount, currency) {
    const n = Number(amount || 0);
    try {
      return new Intl.NumberFormat('en-CA', {
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

  // NEW Helper for Address
  function getStoreAddress(storeName) {
      const n = (storeName || '').toLowerCase();
      if (n.includes('walmart')) return '1000 Gerrard St E, Toronto, ON';
      if (n.includes('metro')) return '425 Bloor St W, Toronto, ON';
      if (n.includes('freshco')) return '2440 Dundas St W, Toronto, ON';
      if (n.includes('no frills') || n.includes('nofrills')) return '900 Dufferin St, Toronto, ON';
      if (n.includes('t&t')) return '222 Cherry St, Toronto, ON';
      return 'Store Location (Pickup)';
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
    // UPDATED ID to match the new HTML structure
    const receiptEl = document.getElementById('receipt-card');
    if (!receiptEl || !window.html2canvas || !window.jspdf?.jsPDF) {
      alert('PDF libraries not loaded yet. Please try again.');
      return;
    }

    if (statusLabel) statusLabel.textContent = 'Rendering PDF…';
    
    // Slight style modification for clean print
    const originalBg = receiptEl.style.background;
    receiptEl.style.background = '#1e293b';

    try {
      const canvas = await window.html2canvas(receiptEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#1e293b' 
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
      receiptEl.style.background = originalBg;
      if (statusLabel) statusLabel.textContent = 'Receipt ready';
    }
  }
}