// /public/scripts/profile.js

let budgetChartInstance = null;

/* -------------------------------------------------
   Analytics from existing /api/orders endpoint
-------------------------------------------------- */

function safeNumber(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeAnalyticsFromOrders(orders) {
  let totalSpent = 0;
  let itemsBought = 0;
  let transactions = 0;

  const storeMap = new Map();
  const itemCounts = {};

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;

    const itemsArr = Array.isArray(order.items) ? order.items : [];

    const orderTotal =
      safeNumber(order.amount) ||
      safeNumber(order.total) ||
      (typeof order.amount_total === "number"
        ? order.amount_total / 100
        : 0);

    // Guess store name
    const storeName =
      order.storeName ||
      order.store ||
      (itemsArr[0] && itemsArr[0].store) ||
      "Unknown store";

    let orderItemsCount = 0;

    for (const it of itemsArr) {
      const qty = safeNumber(it.quantity || it.qty || 1);
      orderItemsCount += qty;

      const itemName =
        it.name || it.description || it.productName || "Unknown item";
      itemCounts[itemName] = (itemCounts[itemName] || 0) + qty;
    }

    totalSpent += orderTotal;
    itemsBought += orderItemsCount;
    transactions += 1;

    if (!storeMap.has(storeName)) {
      storeMap.set(storeName, {
        storeName,
        totalSpent: 0,
        itemsBought: 0,
        transactions: 0,
      });
    }
    const s = storeMap.get(storeName);
    s.totalSpent += orderTotal;
    s.itemsBought += orderItemsCount;
    s.transactions += 1;
  }

  const stores = Array.from(storeMap.values()).sort(
    (a, b) => b.totalSpent - a.totalSpent
  );

  // Most bought item
  let mostBoughtItemName = "—";
  let mostBoughtCount = 0;
  for (const [name, count] of Object.entries(itemCounts)) {
    if (count > mostBoughtCount) {
      mostBoughtCount = count;
      mostBoughtItemName = name;
    }
  }

  return {
    totalSpent,
    itemsBought,
    transactions,
    stores,
    mostBoughtItemName,
    listsCreated: 0, // we aren't counting lists here (you can connect later)
  };
}

async function loadProfileAnalytics() {
  try {
    // Get orders from existing endpoint
    const res = await fetch("/api/orders", {
      credentials: "include",
    });

    if (!res.ok) {
      console.warn("[profile] /api/orders HTTP error", res.status);
      return;
    }

    const orders = await res.json();
    if (!Array.isArray(orders)) {
      console.warn("[profile] /api/orders did not return array");
      return;
    }

    console.log("[profile] orders for analytics:", orders.length);

    const {
      totalSpent,
      itemsBought,
      transactions,
      stores,
      mostBoughtItemName,
      listsCreated,
    } = computeAnalyticsFromOrders(orders);

    // ---------- Quick Stats ----------
    const listsEl = document.getElementById("quickListsValue");
    const itemsEl = document.getElementById("quickItemsValue");
    const mostBoughtEl = document.getElementById("quickMostBoughtValue");

    if (listsEl) listsEl.textContent = String(listsCreated);
    if (itemsEl) itemsEl.textContent = String(itemsBought);
    if (mostBoughtEl) mostBoughtEl.textContent = mostBoughtItemName || "—";

    // ---------- Stat Cards ----------
    const totalSpentCard = document.getElementById("cardTotalSpentValue");
    const itemsBoughtCard = document.getElementById("cardItemsBoughtValue");
    const ordersCard = document.getElementById("cardOrdersValue");
    const favStoreCard = document.getElementById("cardFavStoreValue");
    const favStoreText = document.getElementById("favStoreText");

    if (totalSpentCard)
      totalSpentCard.textContent = `$${totalSpent.toFixed(2)}`;
    if (itemsBoughtCard) itemsBoughtCard.textContent = String(itemsBought);
    if (ordersCard) ordersCard.textContent = String(transactions);

    const topStore = stores[0] || null;
    if (favStoreCard) {
      favStoreCard.textContent =
        (topStore && topStore.storeName) || "—";
    }

    // If profile fav store (manual) is empty, fallback to purchases-based store
    if (
      favStoreText &&
      (!favStoreText.textContent || favStoreText.textContent === "—")
    ) {
      if (topStore && topStore.storeName) {
        favStoreText.textContent = topStore.storeName;
      }
    }

    // ---------- Goals & Progress ----------
    const progressFill = document.querySelector(".progress-fill");
    const goalLabel = document.getElementById("goalProgressText");
    if (progressFill && goalLabel) {
      const monthlyGoal = 100; // you can change this later
      const pct =
        monthlyGoal > 0
          ? Math.min(100, Math.round((totalSpent / monthlyGoal) * 100))
          : 0;

      progressFill.style.width = `${pct}%`;
      goalLabel.textContent = `${pct}% of your $${monthlyGoal} goal`;
    }

    // ---------- Budget Doughnut Chart ----------
    const chartCanvas = document.getElementById("budgetChart");
    if (chartCanvas && window.Chart) {
      const ctx = chartCanvas.getContext("2d");

      let labels = stores.map((s) => s.storeName || "Store");
      let values = stores.map((s) => s.totalSpent || 0);

      if (!labels.length) {
        labels = ["No purchases yet"];
        values = [1];
      }

      if (budgetChartInstance) {
        budgetChartInstance.destroy();
      }

      budgetChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: [
                "#22c55e",
                "#f59e0b",
                "#3b82f6",
                "#a855f7",
                "#ec4899",
                "#14b8a6",
              ],
              borderWidth: 2,
            },
          ],
        },
        options: {
          plugins: {
            legend: {
              labels: {
                color: "#f8fafc",
              },
            },
          },
        },
      });
    }
  } catch (err) {
    console.error("Failed to load profile analytics:", err);
  }
}

/* -------------------------------------------------
   Profile core: auth, avatar, edit
-------------------------------------------------- */

(async function () {
  try {
    // Require login
    const sessionRes = await fetch("/api/auth/me", {
      credentials: "include",
    });
    if (!sessionRes.ok) return (location.href = "/auth/signin.html");
    const me = await sessionRes.json();
    if (!me?.email) return (location.href = "/auth/signin.html");

    // Try to load extra user data from DB (fav store, avatar, etc.)
    const dbRes = await fetch(
      `/api/users?email=${encodeURIComponent(me.email)}`
    );
    const userData = await dbRes.json();
    const profile = dbRes.ok && userData ? userData : me;

    const nameEl = document.getElementById("name");
    const emailEl = document.getElementById("email");
    const favEl = document.getElementById("favStoreText");
    const avatarEl = document.getElementById("profile-avatar");

    if (nameEl) nameEl.textContent = profile.name || "—";
    if (emailEl) emailEl.textContent = profile.email || "—";
    if (favEl) favEl.textContent = profile.favStore || "—";
    if (avatarEl) avatarEl.src = profile.avatar || "/assets/profile.png";

    // ===== Avatar upload =====
    const changeBtn = document.getElementById("changeAvatarBtn");
    const inputEl = document.getElementById("avatarInput");
    if (changeBtn && inputEl) {
      changeBtn.addEventListener("click", () => inputEl.click());
      inputEl.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result;
          const resp = await fetch("/api/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: me.email,
              field: "avatar",
              value: base64,
            }),
          });
          if (resp.ok) {
            avatarEl.src = base64;
            alert("✅ Avatar updated successfully!");
          } else {
            alert("❌ Failed to update avatar");
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // ===== Edit profile =====
    const editBtn = document.getElementById("editProfileBtn");
    const form = document.getElementById("editProfileForm");
    const saveBtn = document.getElementById("saveProfileBtn");
    const cancelBtn = document.getElementById("cancelEditBtn");
    const nameInput = document.getElementById("editName");
    const storeSelect = document.getElementById("editFavStore");

    if (editBtn && form && saveBtn && cancelBtn && nameInput && storeSelect) {
      editBtn.onclick = () => {
        form.style.display = "flex";
        editBtn.style.display = "none";
        nameInput.value = profile.name || "";
        storeSelect.value = profile.favStore || "";
        const emailField = document.getElementById("editEmail");
        if (emailField) emailField.value = profile.email || "";
      };

      cancelBtn.onclick = () => {
        form.style.display = "none";
        editBtn.style.display = "inline-block";
      };

      saveBtn.onclick = async () => {
        const newName = nameInput.value.trim();
        const newEmail = document.getElementById("editEmail").value.trim();
        const newStore = storeSelect.value.trim();

        if (!newEmail || !newEmail.includes("@")) {
          alert("Please enter a valid email address.");
          return;
        }

        const resp = await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: me.email, // old email for lookup
            field: "profile",
            value: { name: newName, favStore: newStore, email: newEmail },
          }),
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          if (nameEl) nameEl.textContent = newName;
          if (emailEl) emailEl.textContent = newEmail;
          if (favEl) favEl.textContent = newStore;
          alert("✅ Profile updated successfully!");
          form.style.display = "none";
          editBtn.style.display = "inline-block";
        } else {
          alert("❌ Failed to update profile.");
        }
      };
    }

    // ===== Load analytics from /api/orders =====
    await loadProfileAnalytics();
  } catch (err) {
    console.error("Profile load error:", err);
    location.href = "/auth/signin.html";
  }
})();
