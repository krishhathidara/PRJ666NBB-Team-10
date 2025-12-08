document.addEventListener('DOMContentLoaded', () => {
  const cartItemsContainer = document.getElementById('cart-items');
  const itemCount = document.getElementById('item-count');
  const subtotalEl = document.getElementById('subtotal');
  const taxEl = document.getElementById('tax');
  const totalEl = document.getElementById('total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const toastRoot = document.getElementById('toast-root');
  let loading = false;

  const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);

  /* ---------------- Toast ---------------- */
  function showMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    toastRoot.appendChild(msg);
    setTimeout(() => { msg.style.opacity = 0; setTimeout(() => msg.remove(), 400); }, 2600);
  }

  /* -------------- Helpers -------------- */
  function formatMoney(n) {
    const num = Number(n || 0);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(num);
    } catch { return `$${num.toFixed(2)}`; }
  }

  // Tolerant JSON (handles HTML error pages on Vercel)
  async function fetchJsonTolerant(input, init) {
    const res = await fetch(input, init);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    return { ok: res.ok, data };
  }

  const debounce = (fn, ms = 300) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  function clearTotals() {
    itemCount.textContent = '0 items';
    subtotalEl.textContent = '0.00';
    taxEl.textContent = '0.00';
    totalEl.textContent = '0.00';
    checkoutBtn.disabled = true;
  }

  /* -------------- Skeleton UI -------------- */
  function paintSkeletons() {
    cartItemsContainer.setAttribute('aria-busy', 'true');
    cartItemsContainer.innerHTML = `
      ${[0,1].map(()=>`
        <div class="skel-store">
          <div class="skel-head">
            <div class="skel w60" style="height:18px;"></div>
            <div class="skel w20" style="height:18px;"></div>
          </div>
          <div class="skel-row">
            <div>
              <div class="skel w60" style="height:16px;margin-bottom:8px;"></div>
              <div class="skel w30"></div>
            </div>
            <div class="skel w20"></div>
          </div>
          <div class="skel-row">
            <div>
              <div class="skel w60" style="height:16px;margin-bottom:8px;"></div>
              <div class="skel w30"></div>
            </div>
            <div class="skel w20"></div>
          </div>
        </div>
      `).join('')}
    `;
  }

  /* -------------- Load Cart -------------- */
  async function loadCart() {
    if (loading) return;
    loading = true;
    paintSkeletons();

    const errBox = document.getElementById('cart-error');
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

    try {
      const { ok, data } = await fetchJsonTolerant('/api/cart/get', {
        method: 'GET',
        credentials: 'include'
      });
      if (!ok) throw new Error(data.error || 'Failed to load cart');

      const items = Array.isArray(data) ? data : (data.items || []);
      renderCart(items);

      if (!Array.isArray(data)) {
        subtotalEl.textContent = Number(data.subtotal ?? 0).toFixed(2);
        taxEl.textContent = Number(data.tax ?? 0).toFixed(2);
        totalEl.textContent = Number(data.total ?? 0).toFixed(2);
      }
    } catch (err) {
      cartItemsContainer.innerHTML = '';
      clearTotals();
      if (errBox) { errBox.style.display = 'block'; errBox.textContent = `Error: ${err.message}`; }
    } finally {
      cartItemsContainer.removeAttribute('aria-busy');
      loading = false;
    }
  }

  /* -------------- Group & Render -------------- */
  function groupByStore(items) {
    const map = new Map();
    for (const it of items) {
      const key = it.store || it.storeName || 'Store';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    // sort stores alphabetically for stable UI
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  }

  function renderCart(items) {
    if (!items || !items.length) {
      cartItemsContainer.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
      clearTotals();
      return;
    }

    checkoutBtn.disabled = false;

    const groups = groupByStore(items);
    let html = '';
    for (const [storeName, arr] of groups) {
      const storeSubtotal = arr.reduce((s, it)=> s + Number(it.price)*Number(it.quantity), 0);
      html += `
        <div class="store-card">
          <div class="store-head">
            <div class="store-name">${storeName}</div>
            <div class="store-right">
              <span class="store-badge">${arr.length} ${arr.length===1?'item':'items'}</span>
              <span class="store-sub">${formatMoney(storeSubtotal)}</span>
            </div>
          </div>
          <div class="store-body">
            ${arr.map(p => {
              const lineTotal = Number(p.price) * Number(p.quantity);
              return `
              <div class="cart-row" data-product-id="${p.productId}">
                <div class="cart-left">
                  <div class="cart-title">${p.name}</div>
                  <div class="muted">${p.unit ? p.unit : ''}</div>
                </div>
                <div class="cart-right">
                  <div class="quantity-control" role="group" aria-label="Quantity for ${p.name}">
                    <button class="btn-outline" data-action="decrease" aria-label="Decrease">−</button>
                    <input class="qty" type="number" min="1" value="${p.quantity}" inputmode="numeric" aria-label="Quantity input">
                    <button class="btn-outline" data-action="increase" aria-label="Increase">+</button>
                  </div>
                  <div class="cart-price">${formatMoney(lineTotal)}</div>
                  <button class="remove" aria-label="Remove ${p.name}" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6m3 4v8m4-8v8"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }
    cartItemsContainer.innerHTML = html;

    // Overall totals (combined across all stores)
    const subtotal = items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.price), 0);
    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    itemCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    subtotalEl.textContent = subtotal.toFixed(2);
    taxEl.textContent = tax.toFixed(2);
    totalEl.textContent = total.toFixed(2);
  }

  /* -------------- Events -------------- */
  cartItemsContainer.addEventListener('click', async (e) => {
    if (loading) return;
    const row = e.target.closest('.cart-row');
    if (!row) return;
    const productId = row.dataset.productId;

    if (e.target.closest('.remove')) {
      loading = true;
      try {
        const { ok, data } = await fetchJsonTolerant('/api/cart/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ productId })
        });
        if (!ok) throw new Error(data.error || 'Failed to remove item');

        const items = Array.isArray(data) ? data : (data.items || []);
        renderCart(items);
        showMessage('Item removed', 'success');
      } catch (err) {
        const el = document.getElementById('cart-error');
        if (el) { el.style.display = 'block'; el.textContent = `Error: ${err.message}`; }
        showMessage(`Error removing item: ${err.message}`, 'error');
      } finally { loading = false; }
    }

    if (e.target.dataset.action === 'increase' || e.target.dataset.action === 'decrease') {
      const input = row.querySelector('.qty');
      let quantity = parseInt(input.value, 10);
      if (e.target.dataset.action === 'increase') quantity++;
      if (e.target.dataset.action === 'decrease' && quantity > 1) quantity--;
      await updateQuantity(productId, quantity);
    }
  });

  cartItemsContainer.addEventListener('input', debounce(async (e) => {
    if (!e.target.classList.contains('qty') || loading) return;
    const row = e.target.closest('.cart-row');
    let quantity = parseInt(e.target.value, 10);
    if (isNaN(quantity) || quantity < 1) { quantity = 1; e.target.value = 1; }
    await updateQuantity(row.dataset.productId, quantity);
  }, 300));

  async function updateQuantity(productId, quantity) {
    loading = true;
    try {
      const { ok, data } = await fetchJsonTolerant('/api/cart/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId, quantity })
      });
      if (!ok) throw new Error(data.error || 'Failed to update quantity');
      const items = Array.isArray(data) ? data : (data.items || []);
      renderCart(items);
    } catch (err) {
      const el = document.getElementById('cart-error');
      if (el) { el.style.display = 'block'; el.textContent = `Error: ${err.message}`; }
    } finally { loading = false; }
  }

  document.getElementById('checkout-btn')?.addEventListener('click', async () => {
    if (loading || checkoutBtn.disabled) return;
    loading = true;
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing…';
    try {
      const { ok, data } = await fetchJsonTolerant('/api/checkout', {
        method: 'POST',
        credentials: 'include'
      });
      if (!ok) throw new Error(data.error || 'Failed to checkout');

      const { sessionId } = data;
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw new Error(error.message);
    } catch (err) {
      const el = document.getElementById('cart-error');
      if (el) { el.style.display = 'block'; el.textContent = `Error: ${err.message}`; }
      else alert(`Error: ${err.message}`);
    } finally {
      loading = false;
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Checkout';
    }
  });

  loadCart();
});
