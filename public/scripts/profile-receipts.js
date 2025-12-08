document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("receiptInputProfile");
  if (input) input.addEventListener("change", uploadReceiptProfile);

  loadProfileReceipts();
});

/* ============================================================
    LOAD USER RECEIPTS
============================================================ */
async function loadProfileReceipts() {
  const container = document.getElementById("profile-receipts");
  container.innerHTML = "<p style='color:#94a3b8'>Loading receipts...</p>";

  const session = await fetch("/api/auth/me").then(r => r.json());

  if (!session || session.error || !session.email) {
    container.innerHTML = "<p style='color:#94a3b8'>Please sign in to see receipts.</p>";
    return;
  }

  const userId = session.id;
  const res = await fetch(`/api/receipts/list?userId=${userId}`);
  const data = await res.json();

  if (!data.ok || data.receipts.length === 0) {
    container.innerHTML = "<p style='color:#94a3b8'>No receipts uploaded yet.</p>";
    return;
  }

  container.innerHTML = "";
  const recent = data.receipts.slice(0, 4);

  recent.forEach(r => {
    const card = document.createElement("div");
    card.className = "profile-card";
    card.style.cursor = "pointer";

    card.innerHTML = `
      <h3 style="margin:0">${r.storeName || "Receipt"}</h3>
      <p style="color:#94a3b8; margin:4px 0">${new Date(r.createdAt).toLocaleDateString()}</p>
      <p style="font-size:1.2rem; font-weight:700; color:#22c55e">$${r.total.toFixed(2)}</p>
    `;

    card.onclick = () => window.location.href = `/receipts.html?open=${r._id}`;
    container.appendChild(card);
  });
}

/* ============================================================
    UPLOAD RECEIPT (OPENAI AI VERSION ONLY — NO GOOGLE VISION)
============================================================ */
async function uploadReceiptProfile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    const imageBase64 = reader.result; // FULL base64 data URL

    const session = await fetch("/api/auth/me").then(r => r.json());
    if (!session || session.error || !session.email) {
      alert("Please sign in first.");
      return;
    }

    const userId = session.id;

    // ---------------------------------------------
    // DIRECTLY SEND TO AI RECEIPT PARSER BACKEND
    // ---------------------------------------------
    const createRes = await fetch("/api/receipts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        imageBase64
      })
    });

    const data = await createRes.json();

    if (data.ok) {
      alert("Receipt scanned successfully!");
      loadProfileReceipts();
    } else {
      alert("Failed to save receipt");
      console.error(data);
    }
  };

  reader.readAsDataURL(file);
}
