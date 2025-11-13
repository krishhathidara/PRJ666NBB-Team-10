document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("receiptInputProfile");
  if (input) input.addEventListener("change", uploadReceiptProfile);

  loadProfileReceipts();
});

// Load the user's latest receipts
async function loadProfileReceipts() {
  const container = document.getElementById("profile-receipts");
  container.innerHTML = "<p style='color:#94a3b8'>Loading receipts...</p>";

  const session = await fetch("/api/auth/me").then(r => r.json());

  // If user is not logged in
  if (!session || session.error || !session.email) {
    container.innerHTML = "<p style='color:#94a3b8'>Please sign in to see receipts.</p>";
    return;
  }

  // User ID from JWT session
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
      <h3 style="margin:0">${r.storeName || 'Receipt'}</h3>
      <p style="color:#94a3b8; margin:4px 0">${new Date(r.createdAt).toLocaleDateString()}</p>
      <p style="font-size:1.2rem; font-weight:700; color:#22c55e">$${r.total.toFixed(2)}</p>
    `;

    card.onclick = () => window.location.href = `/receipts.html?open=${r._id}`;

    container.appendChild(card);
  });
}

// Upload receipt from profile page
async function uploadReceiptProfile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;

    const session = await fetch("/api/auth/me").then(r => r.json());

    if (!session || session.error || !session.email) {
      alert("Please sign in first.");
      return;
    }

    const userId = session.id;

    const res = await fetch("/api/receipts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
        userId
      })
    });

    const data = await res.json();

    if (data.ok) {
      alert("Receipt scanned successfully!");
      loadProfileReceipts();
    } else {
      alert("Failed to scan receipt");
      console.error(data);
    }
  };

  reader.readAsDataURL(file);
}
