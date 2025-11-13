// /public/scripts/meal-plan.js
(async function () {
  const plansContainer = document.getElementById("plansContainer");
  const modal = document.getElementById("planModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalIngredients = document.getElementById("modalIngredients");
  const closeModal = document.getElementById("closeModal");
  const newBtn = document.getElementById("newPlanBtn");
  const form = document.getElementById("newPlanForm");
  const saveBtn = document.getElementById("savePlanBtn");

  const defaultPlans = [
    {
      name: "Green Veg Delight",
      type: "Vegetarian",
      description: "A fiber-rich low-calorie vegetarian bowl packed with vitamins and minerals.",
      cost: 12.99,
      ingredients: ["Spinach", "Broccoli", "Paneer", "Brown Rice", "Olive Oil"]
    },
    {
      name: "Protein Power Meal",
      type: "Non-Veg",
      description: "High-protein meal perfect for gym lovers and athletes.",
      cost: 15.49,
      ingredients: ["Chicken Breast", "Quinoa", "Eggs", "Sweet Potato", "Avocado"]
    },
    {
      name: "Balanced Fusion Bowl",
      type: "Mixed",
      description: "A perfect blend of vegan and lean protein options for a balanced diet.",
      cost: 13.75,
      ingredients: ["Tofu", "Salmon", "Veggies", "Oats", "Yogurt"]
    }
  ];

  // ---------- Render Plans ----------
  function renderPlans(plans) {
    plansContainer.innerHTML = "";
    plans.forEach(p => {
      const div = document.createElement("div");
      div.className = "plan-card";
      div.innerHTML = `
        <h3>${p.name}</h3>
        <p>${p.description || "No description"}</p>
        <p><strong>Cost:</strong> $${p.cost?.toFixed(2) || "—"}</p>
        <button class="btn view-btn">View Ingredients</button>
        ${p._id ? `
          <button class="btn edit-btn" style="background:#3b82f6;">Edit</button>
          <button class="btn" style="background:#ef4444;">Delete</button>
        ` : ""}
      `;

      div.querySelector(".view-btn").onclick = () => openModal(p);

      if (p._id) {
        div.querySelector(".edit-btn").onclick = () => editPlan(p);
        div.querySelectorAll(".btn")[2].onclick = () => deletePlan(p._id);
      }

      plansContainer.appendChild(div);
    });
  }

 // ---------- Animated Zoom Modal ----------
function openModal(plan) {
  // Remove existing overlay if any
  document.querySelector(".plan-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "plan-overlay";

  const card = document.createElement("div");
  card.className = "zoom-card";

  card.innerHTML = `
    <h2>${plan.name}</h2>
    <p style="text-align:center; opacity:0.8; margin-bottom:15px;">Cost: $${plan.cost?.toFixed(2) || "—"}</p>
    <ul>${plan.ingredients.map(i => `<li>${i}</li>`).join("")}</ul>
    <div style="text-align:center;">
      <button id="closeZoom">Close</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Animate each ingredient list item
  const items = card.querySelectorAll("ul li");
  items.forEach((li, i) => {
    li.style.animationDelay = `${i * 0.08}s`;
  });

  document.getElementById("closeZoom").onclick = () => {
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.remove(), 200);
  };
}

  // ---------- Load Logged-in User ----------
  async function getCurrentUser() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) {
      location.href = "/auth/signin.html";
      return null;
    }
    return await res.json();
  }

  // ---------- Load User Plans ----------
  async function loadUserPlans() {
    try {
      const res = await fetch("/api/mealplans", { credentials: "include" });
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Load plans error:", err);
      return [];
    }
  }

  // ---------- Save or Update ----------
  let editingId = null;
  saveBtn.onclick = async () => {
    const name = document.getElementById("planName").value.trim();
    const ingredients = document.getElementById("planIngredients").value
      .split(",").map(x => x.trim()).filter(Boolean);
    const description = prompt("Add a short description:");
    const cost = parseFloat(prompt("Enter cost ($):", "10.00")) || 0;

    if (!name || ingredients.length === 0)
      return alert("Please fill out all fields.");

    const method = editingId ? "PUT" : "POST";
    const url = editingId ? `/api/mealplans/${editingId}` : "/api/mealplans";

    const resp = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, ingredients, cost }),
    });

    const result = await resp.json().catch(() => ({}));
    if (result.success) {
      alert(editingId ? "✅ Plan updated!" : "✅ Plan saved!");
      editingId = null;
      form.style.display = "none";
      newBtn.style.display = "block";
      const userPlans = await loadUserPlans();
      renderPlans([...defaultPlans, ...userPlans]);
    } else {
      alert("❌ Error saving meal plan.");
    }
  };

  // ---------- Delete ----------
  async function deletePlan(id) {
    if (!confirm("Delete this meal plan?")) return;
    const res = await fetch(`/api/mealplans/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      alert("🗑️ Deleted!");
      const userPlans = await loadUserPlans();
      renderPlans([...defaultPlans, ...userPlans]);
    } else {
      alert("❌ Could not delete.");
    }
  }

  // ---------- Edit ----------
  function editPlan(plan) {
    editingId = plan._id;
    form.style.display = "block";
    newBtn.style.display = "none";
    document.getElementById("planName").value = plan.name;
    document.getElementById("planIngredients").value = plan.ingredients.join(", ");
  }

  // ---------- Add New ----------
  newBtn.onclick = () => {
    editingId = null;
    form.style.display = "block";
    newBtn.style.display = "none";
    document.getElementById("planName").value = "";
    document.getElementById("planIngredients").value = "";
  };

  // ---------- Init ----------
  const user = await getCurrentUser();
  if (!user) return; // redirect handled above

  const userPlans = await loadUserPlans();
  renderPlans([...defaultPlans, ...userPlans]);
})();
