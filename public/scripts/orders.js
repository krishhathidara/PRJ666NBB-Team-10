document.addEventListener('DOMContentLoaded', async () => {
    const ordersGrid = document.getElementById('orders-grid');
    const ordersError = document.getElementById('orders-error');
    const orderModal = document.getElementById('order-modal');
    const orderDetails = document.getElementById('order-details');
    const closeModalBtn = document.querySelector('.modal-content .close');

    // Fetch and render orders
    async function loadOrders() {
        try {
        console.log('Fetching orders from /api/orders');
        const response = await fetch('/api/orders', {
            method: 'GET',
            credentials: 'include'
        });
        console.log('Orders response status:', response.status);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load orders');
        }
        const orders = await response.json();
        console.log('Orders received:', orders.length);

        if (orders.length === 0) {
            ordersGrid.innerHTML = '<p class="muted">No orders found.</p>';
            return;
        }

        ordersGrid.innerHTML = orders.map(order => {
            const store = order.items[0]?.store || 'Unknown Store';
            const date = new Date(order.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
            });
            return `
            <div class="card" style="padding:14px" data-session-id="${order.stripeSessionId}">
                <div style="font-weight:700">${store}</div>
                <div class="muted">${date} • $${order.total.toFixed(2)}</div>
            </div>
            `;
        }).join('');
        } catch (err) {
        console.error('Load orders error:', err);
        ordersError.style.display = 'block';
        ordersError.textContent = `Error: ${err.message}`;
        }
    }

    // Fetch and show order details in modal
    async function showOrderDetails(sessionId) {
        try {
        console.log('Fetching order details for sessionId:', sessionId);
        const response = await fetch(`/api/orders/${sessionId}`, {
            method: 'GET',
            credentials: 'include'
        });
        console.log('Order details response status:', response.status);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load order details');
        }
        const order = await response.json();
        console.log('Order details received:', order);

        const store = order.items[0]?.store || 'Unknown Store';
        const date = new Date(order.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        });
        const subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const tax = order.total - subtotal;

        orderDetails.innerHTML = `
            <div>
            <p><strong>Store:</strong> ${store}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
            <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
            </div>
            <h4>Items</h4>
            ${order.items.map(item => `
            <div class="item-row">
                <div>${item.name} (${item.store}) x${item.quantity}</div>
                <div>$${ (item.quantity * item.price).toFixed(2) }</div>
            </div>
            `).join('')}
            <div class="tot-row">
            <div>Subtotal</div>
            <div>$${subtotal.toFixed(2)}</div>
            </div>
            <div class="tot-row">
            <div>Tax</div>
            <div>$${tax.toFixed(2)}</div>
            </div>
            <div class="tot-row tot-strong">
            <div>Total</div>
            <div>$${order.total.toFixed(2)}</div>
            </div>
        `;
        orderModal.style.display = 'flex';
        } catch (err) {
        console.error('Load order details error:', err);
        orderDetails.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        orderModal.style.display = 'flex';
        }
    }

    // Close modal
    function closeModal() {
        orderModal.style.display = 'none';
        orderDetails.innerHTML = '';
    }

    // Click on order card to show details
    ordersGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (card && card.dataset.sessionId) {
        showOrderDetails(card.dataset.sessionId);
        }
    });

    // Close modal on button click
    closeModalBtn.addEventListener('click', closeModal);

    // Close modal on click outside
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) {
        closeModal();
        }
    });

    // Load orders on page load
    loadOrders();
});