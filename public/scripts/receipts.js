// public/scripts/receipts.js

document.addEventListener("DOMContentLoaded", async () => {
  const fileInput = document.getElementById("receiptInput");
  const statusEl = document.getElementById("upload-status");

  if (!fileInput) {
    console.warn("[receipts] #receiptInput not found");
  } else {
    fileInput.addEventListener("change", handleUpload);
  }

  let session = null;
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) session = await res.json();
  } catch (err) {
    console.error("[receipts] auth/me error", err);
  }

  if (!session || session.error || !session.id) {
    showError("Please sign in to see receipts.");
    setStatus("Sign in to scan receipts.", { error: true });
    return;
  }

  setStatus("Ready to scan.");
  const userId = session.id;

  await loadReceipts(userId);

  const params = new URLSearchParams(window.location.search);
  const openId = params.get("open");
  if (openId) {
    openReceipt(openId);
  }
});

function setStatus(text, opts = {}) {
  const el = document.getElementById("upload-status");
  if (!el) return;

  const { loading = false, error = false } = opts;
  let prefix = "";

  if (loading) {
    prefix = '<span class="spinner"></span>';
  }

  el.innerHTML = prefix + text;
  el.style.color = error ? "#f87171" : "#94a3b8";
}

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
    const res = await fetch(
      `/api/receipts/list?userId=${encodeURIComponent(userId)}`,
      { credentials: "include" }
    );
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
    console.error("[receipts] loadReceipts error", e);
    showError("Failed to load receipts.");
  }
}

async function openReceipt(id) {
  const modal = document.getElementById("order-modal");
  const details = document.getElementById("order-details");
  if (!modal || !details) return;

  details.innerHTML = "<p>Loading...</p>";
  modal.style.display = "flex";

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
    const res = await fetch(
      `/api/receipts/details?id=${encodeURIComponent(id)}`,
      { credentials: "include" }
    );
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
            <span>${it.qty} × $${it.unitPrice.toFixed(
              2
            )} = $${it.totalPrice.toFixed(2)}</span>
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

    const deleteBtn = document.getElementById("deleteReceiptBtn");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!confirm("Delete this receipt?")) return;

        try {
          const res = await fetch(
            `/api/receipts/delete?id=${encodeURIComponent(id)}`,
            { method: "POST", credentials: "include" }
          );

          const data = await res.json();
          if (data.ok) {
            alert("Receipt deleted.");
            modal.style.display = "none";

            const session = await fetch("/api/auth/me", {
              credentials: "include",
            }).then((r) => r.json());
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

// -------- Upload from receipts page (client-side OCR → text → API) --------
async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof Tesseract === "undefined") {
    alert("OCR library not loaded. Please refresh and try again.");
    setStatus("OCR library not loaded.", { error: true });
    return;
  }

  setStatus("Reading image…", { loading: true });

  let session = null;
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) session = await res.json();
  } catch (err) {
    console.error("auth/me error:", err);
  }

  if (!session || session.error || !session.id) {
    alert("You must be logged in to scan receipts.");
    setStatus("Sign in to scan receipts.", { error: true });
    return;
  }

  const userId = session.id;

  const reader = new FileReader();
  reader.onload = async () => {
    const imageBase64 = reader.result;

    try {
      setStatus("Running OCR in browser…", { loading: true });

      const result = await Tesseract.recognize(imageBase64, "eng", {
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.$-:/() ",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      const rawText = (result.data.text || "").trim();
      console.log("[receipts] OCR text (first 500 chars):", rawText.slice(0, 500));

      if (!rawText) {
        setStatus("Could not read any text from receipt.", { error: true });
        alert("Could not read any text from the receipt image.");
        return;
      }

      setStatus("Uploading & parsing receipt…", { loading: true });

      const res = await fetch("/api/receipts/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, userId }),
      });

      const data = await res.json().catch(() => ({}));
      console.log("[receipts] create response:", data);

      if (res.ok && data.ok) {
        setStatus("Receipt uploaded! Items extracted: " + data.items);
        alert("Receipt uploaded! Items extracted: " + data.items);
        await loadReceipts(userId);
      } else {
        const msg = data.error || "Failed to upload receipt.";
        setStatus("Error: " + msg, { error: true });
        alert("Upload error: " + msg);
      }
    } catch (err) {
      console.error("[receipts] OCR/upload error", err);
      setStatus("Server error while uploading.", { error: true });
      alert("Error uploading receipt.");
    } finally {
      e.target.value = "";
    }
  };

  reader.onerror = () => {
    console.error("[receipts] FileReader error");
    setStatus("Could not read image file.", { error: true });
    alert("Could not read image file.");
  };

  reader.readAsDataURL(file);
}
