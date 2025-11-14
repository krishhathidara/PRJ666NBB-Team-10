// /public/scripts/meal-plan.js
(async function () {
  /* ---------- DOM ELEMENTS ---------- */
  const guestSpan = document.getElementById("account-guest");
  const userSpan = document.getElementById("account-user");
  const logoutLink = document.getElementById("logout-link");

  const plansContainer = document.getElementById("plansContainer");
  const newPlanBtn = document.getElementById("newPlanBtn");
  const newPlanForm = document.getElementById("newPlanForm");
  const planNameInput = document.getElementById("planName");
  const planIngredientsInput = document.getElementById("planIngredients");
  const planServingsInput = document.getElementById("planServings");
  const savePlanBtn = document.getElementById("savePlanBtn");
  const cancelPlanBtn = document.getElementById("cancelPlanBtn");

  const aiDishInput = document.getElementById("ai-dish");
  const aiAllergiesInput = document.getElementById("ai-allergies");
  const aiServingsInput = document.getElementById("ai-servings");
  const aiGenerateBtn = document.getElementById("ai-generate-btn");
  const aiStatus = document.getElementById("ai-status");
  const aiRecipesContainer = document.getElementById("ai-recipes");

  let currentUser = null;
  let editingPlanId = null;
  let lastAiRecipes = [];

  /* ---------- TOAST ---------- */
  function showToast(message, type = "info") {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        maxWidth: "320px",
        padding: "10px 14px",
        borderRadius: "999px",
        fontSize: "0.85rem",
        zIndex: 9999,
        boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
        transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
        opacity: "0",
        transform: "translateY(10px)",
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background =
      type === "error"
        ? "linear-gradient(120deg,#b91c1c,#ef4444)"
        : "linear-gradient(120deg,#22c55e,#16a34a)";
    toast.style.color = "#f9fafb";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
    }, 3500);
  }

  /* ---------- AUTH ---------- */
  async function fetchCurrentUser() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        guestSpan.style.display = "";
        userSpan.style.display = "none";
        return null;
      }
      const user = await res.json();
      currentUser = user;
      guestSpan.style.display = "none";
      userSpan.style.display = "";
      return user;
    } catch (err) {
      console.error("auth/me error:", err);
      return null;
    }
  }

  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (_) {}
      window.location.href = "/auth/signin.html";
    });
  }

  /* ---------- INGREDIENT FIXER ---------- */

  /**
   * Normalize ANY ingredient object/string into:
   * "80 g spaghetti"
   * "1 tbsp olive oil"
   * "cashews"
   */
  function formatIngredient(ing) {
    if (!ing) return "";

    // If already a clean string
    if (typeof ing === "string") {
      return ing.trim();
    }

    // Accept multiple AI formats
    let name =
      ing.name ||
      ing.ingredient ||
      ing.item ||
      ing.product ||
      ing.title ||
      "";

    name = String(name).replace(/[^A-Za-z0-9\s-]/g, "").trim();

    let qty =
      ing.quantity ||
      ing.qty ||
      ing.amount ||
      ing.value ||
      null;

    let unit =
      ing.unit ||
      ing.units ||
      "";

    // Convert weird strings "6.98 [EEE 22"
    if (qty && typeof qty === "string") {
      qty = qty.replace(/[^0-9.]/g, "");
    }

    const num = parseFloat(qty);

    if (!name) return ""; // skip broken objects

    // If no usable qty → just return name
    if (!Number.isFinite(num) || num <= 0) {
      return name;
    }

    return `${num}${unit ? " " + unit : ""} ${name}`.trim();
  }

  function normalizeIngredientsForAPI(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((ing) => formatIngredient(ing))
      .filter((x) => x && x.length > 0);
  }

  function shortDescription(t, max = 120) {
    if (!t) return "";
    return t.length <= max ? t : t.slice(0, max - 3) + "...";
  }

  function normalizeIngredientForDisplay(ing) {
  if (!ing) return "";

  // If it's already a string
  if (typeof ing === "string") return ing;

  // AI sometimes sends weird keys:
  const name =
    ing.name ||
    ing.ingredient ||
    ing.item ||
    "" + ing; // last resort

  if (!name) return "";

  // FIX quantity:
  let qty = ing.quantity || ing.qty || ing.amount || null;

  // Convert "80 g" → qty=80, unit="g"
  if (typeof qty === "string" && qty.includes(" ")) {
    const parts = qty.split(" ");
    const num = parseFloat(parts[0]);
    if (!isNaN(num)) {
      qty = num;
      ing.unit = parts[1]; // attach detected unit
    }
  }

  // final numeric check
  qty = parseFloat(qty);
  if (!Number.isFinite(qty) || qty <= 0) qty = null;

  // FIX unit:
  const unit =
    ing.unit ||
    ing.measure ||
    ing.uom ||
    null;

  // BUILD TEXT
  if (qty && unit) return `${qty} ${unit} ${name}`;
  if (qty) return `${qty} ${name}`;
  return name;
}


  /* ---------- VIEW RECIPE MODAL ---------- */
 function openPlanModal(plan) {
  document.querySelector(".plan-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "plan-overlay";

  const card = document.createElement("div");
  card.className = "zoom-card";

  const servingsText =
    typeof plan.servings === "number" && plan.servings > 0
      ? `Serves ${plan.servings}`
      : "";

  console.log("RAW INGREDIENTS:", plan.ingredients);

  // --------------------------
  // 🔥 FIX INGREDIENT PARSING
  // --------------------------
  const rawIngredients = Array.isArray(plan.ingredients)
    ? plan.ingredients
    : [];

  // FIX for "[object Object]" and other broken string cases
  function normalizeIngredient(item) {
    if (!item) return null;

    // CASE 1: Already an object
    if (typeof item === "object") return item;

    // CASE 2: Some AI returns JSON but as STRING
    if (typeof item === "string") {
      // Remove whitespace
      const trimmed = item.trim();

      // Try to parse JSON strings
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          return JSON.parse(trimmed);
        } catch (_) {}
      }

      // If it is "[object Object]" -> unusable
      if (trimmed === "[object Object]") {
        return null;
      }

      // ELSE: Treat it as a plain name
      return { name: trimmed, quantity: null, unit: "" };
    }

    return null;
  }

  // Turn into clean objects
  const cleanedIngredients = rawIngredients
    .map(normalizeIngredient)
    .filter(Boolean);

  // --------------------------
  // 🔥 FORMAT FOR DISPLAY
  // --------------------------
  function formatIngredientDisplay(ing) {
    if (!ing) return "";

    const name = ing.name || ing.ingredient || "";
    const qty = ing.quantity;
    const unit = ing.unit || "";

    if (!name) return "";

    // If quantity missing → just show name
    if (!qty || isNaN(qty)) return name;

    const q = Number(qty);
    const qtyText = q % 1 === 0 ? q.toString() : q.toFixed(1);

    return `${qtyText} ${unit} ${name}`.trim();
  }

  const ingredientsForDisplay = cleanedIngredients.map(formatIngredientDisplay);

  // Steps
  const steps = Array.isArray(plan.steps) ? plan.steps : [];

  const ingredientsHtml = ingredientsForDisplay
    .map((i) => `<li>${i}</li>`)
    .join("");

  const stepsHtml = steps.map((s) => `<li>${s}</li>`).join("");

  // Build modal
  card.innerHTML = `
      <h2>${plan.title || plan.name}</h2>
      <p class="modal-subtitle">
        ${servingsText}
        ${servingsText && plan.description ? " • " : ""}
        ${plan.description || ""}
      </p>

      ${
        ingredientsForDisplay.length
          ? `<h4>Ingredients</h4>
             <ul class="modal-ingredients">${ingredientsHtml}</ul>`
          : `<p class="muted">No ingredients available.</p>`
      }

      ${
        steps.length
          ? `<h4>Steps</h4><ol class="modal-steps">${stepsHtml}</ol>`
          : ""
      }

      <div class="modal-actions">
        ${
          cleanedIngredients.length
            ? `<button id="modalAddToCart" class="btn" style="margin-right:8px;">
                Add ingredients to cart
               </button>`
            : ""
        }
        <button id="closeZoom">Close</button>
      </div>
    `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  document.getElementById("closeZoom").onclick = () => {
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.remove(), 200);
  };

  // Send CLEANED OBJECTS, not displayed strings
  if (cleanedIngredients.length) {
    document.getElementById("modalAddToCart").onclick = () =>
      addIngredientsToCart(cleanedIngredients);
  }
}


  /* ---------- ADD TO CART ---------- */
  async function addIngredientsToCart(ingredients) {
    const normalized = normalizeIngredientsForAPI(ingredients);
    if (!normalized.length) {
      showToast("No ingredients to add.", "error");
      return;
    }

    try {
      const res = await fetch("/api/ai/add-cheapest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: normalized }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast("Could not add ingredients.", "error");
        return;
      }

      const added = data.added || [];
      const missing = data.missing || [];

      if (missing.length) {
        showToast(
          `Added ${added.length}. Missing: ${missing.join(", ")}`,
          "info"
        );
      } else {
        showToast(`Added ${added.length} ingredient(s).`, "info");
      }
    } catch (err) {
      showToast("Something went wrong.", "error");
    }
  }

  /* ---------- LOAD SAVED PLANS ---------- */
  async function loadUserPlans() {
    try {
      const res = await fetch("/api/mealplans", { credentials: "include" });
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("loadUserPlans error:", err);
      return [];
    }
  }

  function renderPlans(plans) {
    plansContainer.innerHTML = "";

    if (!plans.length) {
      plansContainer.innerHTML =
        '<p class="muted">No saved meal plans yet.</p>';
      return;
    }

    for (const p of plans) {
      const card = document.createElement("article");
      card.className = "plan-card";

      card.innerHTML = `
  <button class="delete-plan-btn" data-id="${p._id}">✕</button>
  <h3>${p.name}</h3>
  <p class="muted">${shortDescription(
    p.description || "Custom plan created by you."
  )}</p>
  ${
    p.servings
      ? `<p class="muted" style="margin-top:4px;">Servings: ${p.servings}</p>`
      : ""
  }
`;


      card.addEventListener("click", () => openPlanModal(p));
      plansContainer.appendChild(card);
    }
  }

  /* ---------- SAVE CUSTOM PLAN ---------- */

  function showPlanForm(editing = false) {
    newPlanForm.hidden = false;
    if (!editing) {
      editingPlanId = null;
      planNameInput.value = "";
      planIngredientsInput.value = "";
      planServingsInput.value = "2";
    }
    newPlanBtn.style.display = "none";
  }

  function hidePlanForm() {
    newPlanForm.hidden = true;
    newPlanBtn.style.display = "";
    editingPlanId = null;
  }

  newPlanBtn?.addEventListener("click", () => showPlanForm(false));
  cancelPlanBtn?.addEventListener("click", () => hidePlanForm());

  savePlanBtn?.addEventListener("click", async () => {
    const name = planNameInput.value.trim();
    const ingredientsRaw = planIngredientsInput.value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const servings = parseInt(planServingsInput.value, 10) || 2;

    if (!name || !ingredientsRaw.length) {
      showToast("Enter name + ingredients.", "error");
      return;
    }

    const body = {
      name,
      description: "Custom meal plan created by you.",
      ingredients: ingredientsRaw,
      servings,
      fromAi: false,
    };

    const url = editingPlanId
      ? `/api/mealplans/${editingPlanId}`
      : "/api/mealplans";

    try {
      const res = await fetch(url, {
        method: editingPlanId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        showToast("Could not save.", "error");
        return;
      }

      showToast("Meal plan saved.", "info");
      hidePlanForm();

      const plans = await loadUserPlans();
      renderPlans(plans);
    } catch (err) {
      showToast("Error saving.", "error");
    }
  });

  /* ---------- AI PLANNER ---------- */
function renderAiRecipes(recipes) {
  aiRecipesContainer.innerHTML = "";

  if (!recipes.length) {
    aiRecipesContainer.innerHTML =
      '<p class="muted">No recipes yet.</p>';
    return;
  }

  lastAiRecipes = recipes;

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];

    const card = document.createElement("article");
    card.className = "ai-recipe-card";

    const serves =
      typeof r.servings === "number" && r.servings > 0
        ? r.servings
        : null;

    // ❗ DO NOT use formatIngredient() → we NEVER touch the original object
    const previewObjects = Array.isArray(r.ingredients)
      ? r.ingredients
      : [];

    // PURE display formatter (no mutation)
    const preview = previewObjects.map((ing) => {
      const name =
        ing.name ||
        ing.ingredient ||
        ing.item ||
        "";

      const qty = parseFloat(ing.quantity);
      const unit = ing.unit || "";

      if (!name) return "";

      if (!Number.isFinite(qty)) return name;

      const qtyStr = qty % 1 === 0 ? qty : qty.toFixed(1);

      return `${qtyStr} ${unit} ${name}`.trim();
    }).filter(Boolean);

    const previewHtml = preview
      .slice(0, 4)
      .map(
        (txt) =>
          `<li><span class="dot"></span><span>${txt}</span></li>`
      )
      .join("");

    const moreCount = Math.max(0, preview.length - 4);

    card.innerHTML = `
      <div class="ai-recipe-header">
        <h3>${r.title || "AI Recipe"}</h3>
        <span class="ai-badge">${
          serves ? `Serves ${serves}` : "AI recipe"
        }</span>
      </div>

      <p class="ai-recipe-desc">${shortDescription(
        r.description || "",
        160
      )}</p>

      <ul class="ai-ingredients">
        ${previewHtml}
        ${
          moreCount > 0
            ? `<li class="ai-more">…and ${moreCount} more</li>`
            : ""
        }
      </ul>

      <div class="ai-recipe-actions">
        <button class="btn-outline ai-view">View</button>
        <button class="btn-outline ai-add-cart">Add to cart</button>
        <button class="btn ai-use">Use this recipe</button>
      </div>
    `;

    // ✔ SAFE: send ORIGINAL OBJECTS to modal
    card.querySelector(".ai-view").onclick = () =>
      openPlanModal({
        name: r.title,
        description: r.description,
        ingredients: r.ingredients, // original untouched
        servings: r.servings,
        steps: r.steps,
      });

    // ✔ Add raw objects to cart
    card.querySelector(".ai-add-cart").onclick = () =>
      addIngredientsToCart(r.ingredients || []);

    // ✔ Save plan cleanly
    card.querySelector(".ai-use").onclick = () =>
      saveAiPlan({
        name: r.title,
        description: r.description,
        ingredients: r.ingredients,
        servings: r.servings,
        steps: r.steps,
      });

    aiRecipesContainer.appendChild(card);
  }
}


  async function saveAiPlan(recipe) {
    try {
      const res = await fetch("/api/mealplans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      const data = await res.json();
      if (!data.success) throw new Error();

      showToast("Recipe saved!", "info");
      const plans = await loadUserPlans();
      renderPlans(plans);
    } catch (err) {
      showToast("Could not save AI recipe.", "error");
    }
  }

  async function handleGenerate() {
    const dish = aiDishInput.value.trim();
    const allergies = aiAllergiesInput.value.trim();
    const servings = parseInt(aiServingsInput.value, 10) || 2;

    if (!dish) {
      showToast("Enter a dish name.", "error");
      return;
    }

    aiStatus.textContent = "Talking to the chef…";
    aiGenerateBtn.disabled = true;

    try {
      const res = await fetch("/api/ai/mealplan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dish, allergies, servings }),
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (!data.recipes?.length) {
        aiStatus.textContent = "No recipes found.";
        return;
      }

      aiStatus.textContent = `Showing ${data.recipes.length} ideas`;
      console.log("🔥 FULL AI RAW RECIPES:", data.recipes);

      renderAiRecipes(data.recipes);
    } catch (err) {
      aiStatus.textContent = "Error generating recipes.";
    } finally {
      aiGenerateBtn.disabled = false;
    }
  }

  aiGenerateBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    handleGenerate();
  });

  /* ---------- EDIT / DELETE MODE ---------- */
let editMode = false;

const editBtn = document.getElementById("editPlansBtn");

if (editBtn) {
  editBtn.addEventListener("click", () => {
    editMode = !editMode;

    editBtn.classList.toggle("edit-btn-active", editMode);
    editBtn.textContent = editMode ? "Done" : "Edit";

    // Show or hide delete buttons
    document.querySelectorAll(".delete-plan-btn").forEach((btn) => {
      btn.classList.toggle("show", editMode);
    });
  });
}

// DELETE HANDLER
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete-plan-btn")) return;

  e.stopPropagation(); // prevent opening modal

  const id = e.target.dataset.id;
  if (!id) return;

  const confirmDelete = confirm("Delete this meal plan?");
  if (!confirmDelete) return;

  try {
    const res = await fetch(`/api/mealplans/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      showToast("Failed to delete.", "error");
      return;
    }

    // Remove card from UI
    e.target.closest(".plan-card").remove();
    showToast("Deleted!", "info");
  } catch (err) {
    showToast("Error deleting.", "error");
  }
});

  /* ---------- INIT ---------- */
  await fetchCurrentUser();
  const plans = await loadUserPlans();
  renderPlans(plans);
})();
