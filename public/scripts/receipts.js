// public/scripts/receipts.js

document.addEventListener("DOMContentLoaded", async () => {
  // Button → open file picker
  const scanBtn = document.getElementById("scanReceiptBtn");
  const fileInput = document.getElementById("receiptInput");

  if (scanBtn && fileInput) {
    scanBtn.addEventListener("click", (e) => {
      e.preventDefault();
      fileInput.click();
    });

    fileInput.addEventListener("change", handleUpload);
  }

  // Load current user
  let session;
  try {
    session = await fetch("/api/auth/me").then((r) => r.json());
  } catch (err) {
    console.error("auth/me error", err);
  }

  if (!session || session.error || !session.id) {
    showError("Please sign in to see receipts.");
    return;
  }

  const userId = session.id;

  // Load receipts list
  await loadReceipts(userId);

  // If URL has ?open=<id>, open that receipt
  const params = new URLSearchParams(window.location.search);
  const openId = params.get("open");
  if (openId) {
    openReceipt(openId);
  }
});

function showError(msg) {
  const grid = document.getElementById("orders-grid");
  const err = document.getElementById("orders-error");
  if (err) {
    err.textContent = msg;
    err.style.display = "block";
  }
  if (grid) grid.innerHTML = "";
}

async function loadReceipts(userId) {
  const grid = document.getElementById("orders-grid");
  const err = document.getElementById("orders-error");

  if (!grid) return;

  grid.innerHTML = "<p style='color:#94a3b8'>Loading receipts...</p>";
  if (err) err.style.display = "none";

  try {
    const res = await fetch(`/api/receipts/list?userId=${userId}`);
    const data = await res.json();

    if (!data.ok || !data.receipts || data.receipts.length === 0) {
      grid.innerHTML = "<p style='color:#94a3b8'>No receipts uploaded yet.</p>";
      return;
    }

    grid.innerHTML = "";
    data.receipts.forEach((r) => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <h3>${r.storeName || "Receipt"}</h3>
        <p class="muted">${new Date(r.createdAt).toLocaleDateString()}</p>
        <p><strong>$${(r.total || r.subtotal || 0).toFixed(2)}</strong></p>
      `;

      card.onclick = () => openReceipt(r._id);
      grid.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    showError("Failed to load receipts.");
  }
}

async function openReceipt(id) {
  const modal = document.getElementById("order-modal");
  const details = document.getElementById("order-details");
  if (!modal || !details) return;

  details.innerHTML = "<p>Loading...</p>";
  modal.style.display = "flex";

  // Close button
  const closeBtn = modal.querySelector(".close");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  try {
    const res = await fetch(`/api/receipts/details?id=${id}`);
    const data = await res.json();

    if (!data.ok) {
      details.innerHTML = `<p style="color:#f87171">Could not load receipt.</p>`;
      return;
    }

    const r = data.receipt;
    const items = data.items || [];

    let html = `
    <button id="deleteReceiptBtn" style="
  float:right;
  background:#ef4444;
  color:white;
  border:none;
  padding:8px 14px;
  border-radius:6px;
  cursor:pointer;
">Delete</button>

      <p><strong>Store:</strong> ${r.storeName || "Receipt"}</p>
      <p><strong>Date:</strong> ${new Date(r.createdAt).toLocaleString()}</p>
      <hr style="margin:10px 0;">
      <div>
    `;

    if (items.length === 0) {
      html += `<p>No line items parsed from this receipt.</p>`;
    } else {
      items.forEach((it) => {
        html += `
          <div class="item-row">
            <span>${it.name}</span>
            <span>${it.qty} × $${it.unitPrice.toFixed(2)} = $${it.totalPrice.toFixed(2)}</span>
          </div>
        `;
      });
    }

    html += `
      <div class="tot-row">
        <span>Subtotal</span>
        <span>$${(r.subtotal || 0).toFixed(2)}</span>
      </div>
      <div class="tot-row">
        <span>Tax</span>
        <span>$${(r.tax || 0).toFixed(2)}</span>
      </div>
      <div class="tot-row tot-strong">
        <span>Total</span>
        <span>$${(r.total || r.subtotal || 0).toFixed(2)}</span>
      </div>
    </div>`;

    details.innerHTML = html;
    // Enable delete functionality
const deleteBtn = document.getElementById("deleteReceiptBtn");
if (deleteBtn) {
  deleteBtn.onclick = async () => {
    if (!confirm("Are you sure you want to delete this receipt?")) return;

    try {
      const res = await fetch(`/api/receipts/delete?id=${id}`, {
        method: "DELETE"
      });

      const data = await res.json();
      if (data.ok) {
        alert("Receipt deleted successfully.");
        modal.style.display = "none";

        // Refresh list (need userId)
        const session = await fetch("/api/auth/me").then((r) => r.json());
        if (session && session.id) {
          await loadReceipts(session.id);
        }
      } else {
        alert("Failed to delete receipt.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Server error deleting receipt.");
    }
  };
}

  } catch (err) {
    console.error(err);
    details.innerHTML = `<p style="color:#f87171">Error loading receipt.</p>`;
  }
}

// -------- Upload from receipts page (reuses API) --------
async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const session = await fetch("/api/auth/me").then((r) => r.json());
  if (!session || session.error || !session.id) {
    alert("You must be logged in to scan receipts.");
    return;
  }

  const userId = session.id;

  const reader = new FileReader();
  reader.onload = async () => {
    const imageBase64 = reader.result;

    try {
      const res = await fetch("/api/receipts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, userId }),
      });

      const data = await res.json();
      console.log("Receipt upload:", data);

      if (data.ok) {
        alert("Receipt uploaded! Items extracted: " + data.items);
        // Reload list
        await loadReceipts(userId);
      } else {
        alert("Failed to upload receipt.");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading receipt.");
    }
  };

  reader.readAsDataURL(file);
}
