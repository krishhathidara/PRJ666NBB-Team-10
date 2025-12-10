// public/scripts/profile.js

let budgetChartInstance = null;

// =========================================================
// 1. ANALYTICS: Fetch Data from Backend & Render
// =========================================================
async function loadAnalytics(email) {
  try {
    // Call the smart backend endpoint
    const res = await fetch(`/api/profile/stats?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!data.ok) {
      console.warn("Analytics Error:", data.error);
      return;
    }

    const { totals, stores, favStore, mostBought, listsCreated } = data;

    // A. Update Top Stats
    updateText("valTotalSpent", `$${totals.spent.toFixed(2)}`);
    updateText("valItems", totals.items);
    updateText("valOrders", totals.transactions);
    updateText("valFavStore", favStore);

    // B. Update Quick Insights
    updateText("insightLists", listsCreated);
    updateText("insightMostBought", mostBought);

    // C. Update Goal Progress (Example Goal: $200)
    const monthlyGoal = 200;
    const pct = Math.min(100, Math.round((totals.spent / monthlyGoal) * 100));
    const bar = document.getElementById("goalBar");
    const txt = document.getElementById("goalText");
    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.textContent = `${pct}% of Budget Used`;

    // D. Render Chart
    renderChart(stores);

  } catch (err) {
    console.error("Failed to load analytics:", err);
  }
}

// Helper to safely update text
function updateText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Chart Rendering
function renderChart(storeData) {
  const ctx = document.getElementById("budgetChart");
  if (!ctx) return;

  // Cleanup old chart
  if (budgetChartInstance) budgetChartInstance.destroy();

  // Prepare Data
  const labels = storeData.length ? storeData.map(s => s.name) : ["No Purchases"];
  const values = storeData.length ? storeData.map(s => s.spent) : [1];
  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444"];

  budgetChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#cbd5e1', font: { size: 11 } }
        }
      }
    }
  });
}

// =========================================================
// 2. PROFILE MANANGEMENT: User Info, Avatar, Edit
// =========================================================
(async function init() {
  try {
    // 1. Auth Check
    const sessionRes = await fetch("/api/auth/me");
    if (!sessionRes.ok) return (window.location.href = "/auth/signin.html");
    const me = await sessionRes.json();
    if (!me.email) return (window.location.href = "/auth/signin.html");

    // 2. Load Extended Profile Data (Avatar, manual fav store)
    const dbRes = await fetch(`/api/users?email=${encodeURIComponent(me.email)}`);
    const userData = await dbRes.json();
    const profile = (dbRes.ok && userData) ? userData : me;

    // 3. Fill Initial UI
    updateText("name", profile.name || "Grocery User");
    updateText("email", profile.email);
    updateText("insightProfileFav", profile.favStore || "Not Set");
    
    const avatarEl = document.getElementById("profile-avatar");
    if (avatarEl && profile.avatar) {
      avatarEl.src = profile.avatar;
    }

    // 4. Load Analytics
    loadAnalytics(me.email);

    // --- EVENT LISTENERS ---

    // Avatar Upload
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
          // Optimistic UI update
          avatarEl.src = base64;
          
          // Save to DB
          await fetch("/api/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: me.email,
              field: "avatar",
              value: base64
            })
          });
        };
        reader.readAsDataURL(file);
      };
    }

    // Edit Profile Modal
    const editBtn = document.getElementById("editProfileBtn");
    const modal = document.getElementById("editProfileForm");
    const cancelBtn = document.getElementById("cancelEditBtn");
    const saveBtn = document.getElementById("saveProfileBtn");

    if (editBtn && modal) {
      editBtn.onclick = () => {
        modal.style.display = "block";
        editBtn.style.display = "none";
        // Pre-fill
        document.getElementById("editName").value = profile.name || "";
        document.getElementById("editEmail").value = profile.email || "";
        document.getElementById("editFavStore").value = profile.favStore || "";
      };

      cancelBtn.onclick = () => {
        modal.style.display = "none";
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
            email: me.email,
            field: "profile",
            value: { name: newName, email: newEmail, favStore: newStore }
          })
        });

        if (resp.ok) {
          alert("Profile updated!");
          location.reload();
        } else {
          alert("Failed to update.");
        }
      };
    }

  } catch (error) {
    console.error("Profile Init Error:", error);
  }
})();