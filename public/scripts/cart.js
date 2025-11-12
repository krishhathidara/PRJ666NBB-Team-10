document.addEventListener('DOMContentLoaded', () => {
    const cartItemsContainer = document.getElementById('cart-items');
    const itemCount = document.getElementById('item-count');
    const subtotalEl = document.getElementById('subtotal');
    const taxEl = document.getElementById('tax');
    const totalEl = document.getElementById('total');
    const checkoutBtn = document.getElementById('checkout-btn');
    let loading = false;

    // Initialize Stripe with publishable key
    const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);

    function showMessage(text, type) {
      console.log(`Showing message: ${text} (${type})`);
      const msg = document.createElement("div");
      msg.className = `message ${type}`;
      msg.textContent = text;
      document.body.appendChild(msg);
      setTimeout(() => {
        msg.style.opacity = 0;
        setTimeout(() => msg.remove(), 500);
      }, 3000);
    }
async function loadCart() {
  if (loading) return;
  loading = true;
  cartItemsContainer.innerHTML = '<p>Loading...</p>';

  try {
    const response = await fetch('/api/cart', {
      method: 'GET',
      credentials: 'include' // Send cookies
    });

    // ✅ Parse JSON only once
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Failed to load cart');

    // ✅ Use the "items" array from backend object
    renderCart(data.items);

    // ✅ Update totals from backend (subtotal, tax, total)
    subtotalEl.textContent = data.subtotal.toFixed(2);
    taxEl.textContent = data.tax.toFixed(2);
    totalEl.textContent = data.total.toFixed(2);

  } catch (err) {
    cartItemsContainer.innerHTML = '';
    const errBox = document.getElementById('cart-error');
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = `Error: ${err.message}`;
    }
  } finally {
    loading = false;
  }
}


    function renderCart(items) {
        if (!items || items.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
        itemCount.textContent = '0 items';
        subtotalEl.textContent = '0.00';
        taxEl.textContent = '0.00';
        totalEl.textContent = '0.00';
        checkoutBtn.disabled = true;
        return;
        }
        checkoutBtn.disabled = false;
        cartItemsContainer.innerHTML = items.map(item => `
        <div class="cart-row" data-product-id="${item.productId}">
            <div class="cart-left">
            <div class="cart-title">${item.name}</div>
            <div class="muted">${item.store}</div>
            </div>
            <div class="cart-right">
            <div class="quantity-control">
                <button class="btn-outline" data-action="decrease">-</button>
                <input class="qty" type="number" min="1" value="${item.quantity}" aria-label="Quantity for ${item.name}">
                <button class="btn-outline" data-action="increase">+</button>
            </div>
            <div class="cart-price">$${item.quantity * item.price.toFixed(2)}</div>
            <button class="remove" aria-label="Remove ${item.name}">×</button>
            </div>
        </div>
        `).join('');
        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const tax = subtotal * 0.13; // 13% HST
        const total = subtotal + tax;
        itemCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
        subtotalEl.textContent = subtotal.toFixed(2);
        taxEl.textContent = tax.toFixed(2);
        totalEl.textContent = total.toFixed(2);
    }

    cartItemsContainer.addEventListener('click', async (e) => {
        if (loading) return;
        const row = e.target.closest('.cart-row');
        if (!row) return;
        const productId = row.dataset.productId;

        if (e.target.classList.contains('remove')) {
        loading = true;
        try {
            const response = await fetch('/api/cart/remove', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ productId })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Failed to remove item');
            const items = await response.json();
            renderCart(items);
            showMessage('Item removed!!!', 'success');
        } catch (err) {
            document.getElementById('cart-error').style.display = 'block';
            document.getElementById('cart-error').textContent = `Error: ${err.message}`;
            showMessage(`Error removing item: ${err.message}`, 'error');
        } finally {
            loading = false;
        }
        }

        if (e.target.dataset.action === 'increase' || e.target.dataset.action === 'decrease') {
        const input = row.querySelector('.qty');
        let quantity = parseInt(input.value);
        if (e.target.dataset.action === 'increase') quantity++;
        if (e.target.dataset.action === 'decrease' && quantity > 1) quantity--;
        loading = true;
        try {
            const response = await fetch('/api/cart/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ productId, quantity })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Failed to update quantity');
            const items = await response.json();
            renderCart(items);
        } catch (err) {
            document.getElementById('cart-error').style.display = 'block';
            document.getElementById('cart-error').textContent = `Error: ${err.message}`;
        } finally {
            loading = false;
        }
        }
    });

    cartItemsContainer.addEventListener('input', async (e) => {
        if (e.target.classList.contains('qty')) {
        if (loading) return;
        const row = e.target.closest('.cart-row');
        let quantity = parseInt(e.target.value);
        if (isNaN(quantity) || quantity < 1) {
            quantity = 1;
            e.target.value = 1;
        }
        loading = true;
        try {
            const response = await fetch('/api/cart/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ productId: row.dataset.productId, quantity })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Failed to update quantity');
            const items = await response.json();
            renderCart(items);
        } catch (err) {
            document.getElementById('cart-error').style.display = 'block';
            document.getElementById('cart-error').textContent = `Error: ${err.message}`;
        } finally {
            loading = false;
        }
        }
    });

    checkoutBtn.addEventListener('click', async () => {
        if (loading || checkoutBtn.disabled) return;
        loading = true;
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Processing...';
        try {
        console.log('Initiating checkout');
        const response = await fetch('/api/checkout', {
            method: 'POST',
            credentials: 'include'
        });
        console.log('Checkout response status:', response.status);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to checkout');
        }
        const { sessionId } = await response.json();
        console.log('Redirecting to Stripe Checkout with sessionId:', sessionId);
        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({ sessionId });
        if (error) {
            throw new Error(error.message);
        }
        } catch (err) {
        console.error('Checkout error:', err);
        cartItemsContainer.innerHTML = `<p class="cart-error">Error: ${err.message}</p>`;
        document.getElementById('cart-error').style.display = 'block';
        document.getElementById('cart-error').textContent = `Error: ${err.message}`;
        } finally {
        loading = false;
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Checkout';
        }
    });

    loadCart();
});