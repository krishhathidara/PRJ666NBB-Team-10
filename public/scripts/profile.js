// public/scripts/profile.js

let budgetChartInstance = null;

// =========================================================
// 1. INIT & RENDER
// =========================================================
(async function init() {
  try {
    // 1. Auth Check
    const sessionRes = await fetch("/api/auth/me");
    if (!sessionRes.ok) return (window.location.href = "/auth/signin.html");
    const me = await sessionRes.json();
    if (!me.email) return (window.location.href = "/auth/signin.html");

    // 2. Fetch User + Stats (Unified Call)
    const res = await fetch(`/api/users?email=${encodeURIComponent(me.email)}`);
    const profile = await res.json(); 

    // 3. Update UI - Profile Info
    setText("name", profile.name || "Grocery User");
    setText("email", profile.email);
    setText("insightProfileFav", profile.favStore || "Not Set");
    
    // Image Fallback
    const avatarEl = document.getElementById("profile-avatar");
    if (avatarEl) {
      avatarEl.src = profile.avatar || "/assets/profile.png";
    }

    // 4. Update UI - Stats
    const stats = profile.stats || {};
    
    setText("valTotalSpent", `$${(stats.totalSpent || 0).toFixed(2)}`);
    setText("valItems", stats.itemsBought || 0);
    setText("valOrders", stats.transactions || 0);
    setText("valFavStore", stats.favStore || "—");
    
    setText("insightLists", stats.listsCreated || 0);
    setText("insightMostBought", stats.mostBought || "—");

    // Goal Progress
    const goal = 200; 
    const spent = stats.totalSpent || 0;
    const pct = Math.min(100, Math.round((spent / goal) * 100));
    
    const bar = document.getElementById("goalBar");
    const txt = document.getElementById("goalText");
    if(bar) bar.style.width = `${pct}%`;
    if(txt) txt.textContent = `${pct}% of Budget Used`;

    // 5. Render Chart
    renderChart(stats.stores || []);

    // 6. Initialize Features
    initReceiptScanner(me.email);
    setupEditListeners(profile);

  } catch (err) {
    console.error("Profile Init Error:", err);
  }
})();

function setText(id, val) {
  const el = document.getElementById(id);
  if(el) el.textContent = val;
}

function renderChart(storeData) {
  const ctx = document.getElementById("budgetChart");
  if (!ctx) return;
  if (budgetChartInstance) budgetChartInstance.destroy();

  const labels = storeData.length ? storeData.map(s => s.name) : ["No Data"];
  const values = storeData.length ? storeData.map(s => s.spent) : [1];
  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];
  const isDummy = !storeData.length;

  budgetChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ 
        data: values, 
        backgroundColor: isDummy ? ["#334155"] : colors, 
        borderWidth: 0 
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } }
    }
  });
}

// =========================================================
// 2. RECEIPT SCANNING FUNCTION (FIXED)
// =========================================================
function initReceiptScanner(userEmail) {
  const input = document.getElementById("receiptInputProfile");
  const statusEl = document.getElementById("scan-status");
  const grid = document.getElementById("profile-receipts");

  if (!input) return;

  // --- FIX: Prevent Double Initialization ---
  if (input.dataset.init === "true") return;
  input.dataset.init = "true";

  // Using 'onchange' property ensures strict single handler
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading UI
    if(statusEl) {
      statusEl.style.display = "block";
      statusEl.textContent = "Processing image... Please wait.";
      statusEl.className = "loading-pulse";
    }

    try {
      // 1. OCR Scan
      const result = await Tesseract.recognize(file, 'eng');
      const text = result.data.text;
      
      // Simple logic to find largest dollar amount
      const moneyRegex = /\$?\s?(\d+\.\d{2})/g;
      let maxVal = 0;
      let match;
      while ((match = moneyRegex.exec(text)) !== null) {
        const val = parseFloat(match[1]);
        if (val > maxVal) maxVal = val;
      }

      const foundTotal = maxVal > 0 ? maxVal : 0;
      
      // 2. Prepare Upload
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const payload = {
          email: userEmail,
          total: foundTotal,
          storeName: "Scanned Receipt",
          date: new Date().toISOString(),
          image: base64,
          items: []
        };

        // 3. Send to API
        const resp = await fetch("/api/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          alert(`Receipt scanned successfully! Total detected: $${foundTotal.toFixed(2)}`);
          location.reload(); // Reload to update stats
        } else {
          const errData = await resp.json();
          alert("Failed to save receipt: " + (errData.error || "Unknown error"));
        }
        
        if(statusEl) statusEl.style.display = "none";
      };
      reader.readAsDataURL(file);

    } catch (err) {
      console.error("Scan error:", err);
      alert("Error processing image.");
      if(statusEl) statusEl.style.display = "none";
    }
  };
}

// =========================================================
// 3. EDIT PROFILE LISTENERS
// =========================================================
function setupEditListeners(profile) {
  // Avatar
  const avatarInput = document.getElementById("avatarInput");
  const triggerAvatar = document.getElementById("triggerAvatarInput");
  if (triggerAvatar && avatarInput) {
    triggerAvatar.onclick = () => avatarInput.click();
    avatarInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
          const base64 = reader.result;
          document.getElementById("profile-avatar").src = base64;
          await fetch("/api/users", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: profile.email, field: "avatar", value: base64 })
          });
      };
      reader.readAsDataURL(file);
    };
  }

  // Edit Modal
  const editBtn = document.getElementById("editProfileBtn");
  const form = document.getElementById("editProfileForm");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const saveBtn = document.getElementById("saveProfileBtn");

  if (editBtn && form) {
    editBtn.onclick = () => {
      form.style.display = "block";
      editBtn.style.display = "none";
      document.getElementById("editName").value = profile.name || "";
      document.getElementById("editEmail").value = profile.email || "";
      document.getElementById("editFavStore").value = profile.favStore || "";
    };
    cancelBtn.onclick = () => {
      form.style.display = "none";
      editBtn.style.display = "inline-block";
    };
    saveBtn.onclick = async () => {
      const newName = document.getElementById("editName").value;
      const newEmail = document.getElementById("editEmail").value;
      const newStore = document.getElementById("editFavStore").value;
      const resp = await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              email: profile.email,
              field: "profile",
              value: { name: newName, email: newEmail, favStore: newStore }
          })
      });
      if(resp.ok) location.reload();
    };
  }
}