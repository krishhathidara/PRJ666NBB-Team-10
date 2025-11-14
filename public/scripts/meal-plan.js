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

  /* ---------- SMALL TOAST HELPER ---------- */
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

  /* ---------- AUTH / ACCOUNT UI ---------- */
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

  /* ---------- UTIL HELPERS ---------- */

  function formatIngredient(ing) {
    if (!ing) return "";
    if (typeof ing === "string") return ing;

    const name = ing.name || ing.ingredient || "";
    if (!name) return "";

    let quantity = ing.quantity;
    let unit = ing.unit || "";

    // Only use quantity if it’s actually numeric
    const num = parseFloat(quantity);
    const hasNumericQty = Number.isFinite(num) && num > 0;

    if (!hasNumericQty) {
      // drop weird “g paneer” cases and just show the name
      return name.trim();
    }

    const qtyPart = num % 1 === 0 ? num.toString() : num.toFixed(1);
    return [qtyPart, unit, name].filter(Boolean).join(" ").trim();
  }

  function normalizeIngredientsForAPI(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((ing) => {
        if (!ing) return null;
        if (typeof ing === "string") return ing;
        // Just send the human readable string, server will clean
        return formatIngredient(ing);
      })
      .filter(Boolean);
  }

  function shortDescription(text, max = 120) {
    if (!text) return "";
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + "...";
  }

  /* ---------- PLAN MODAL ---------- */

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

    const ingredients = Array.isArray(plan.ingredients) ? plan.ingredients : [];
    const steps = Array.isArray(plan.steps) ? plan.steps : [];

    const ingredientsHtml = ingredients
      .map((ing) => `<li>${formatIngredient(ing)}</li>`)
      .join("");

    const stepsHtml = steps
      .map((s) => `<li>${s}</li>`)
      .join("");

    card.innerHTML = `
      <h2>${plan.name || "Meal plan"}</h2>
      <p class="modal-subtitle">
        ${servingsText || ""}${
      servingsText && plan.description ? " • " : ""
    }${plan.description || ""}
      </p>

      ${
        ingredients.length
          ? `<h4>Ingredients</h4><ul class="modal-ingredients">${ingredientsHtml}</ul>`
          : `<p class="muted">No ingredients stored for this plan.</p>`
      }

      ${
        steps.length
          ? `<h4>Steps</h4><ol class="modal-steps">${stepsHtml}</ol>`
          : ""
      }

      <div class="modal-actions">
        ${
          ingredients.length
            ? `<button id="modalAddToCart" class="btn" style="margin-right:8px;">Add ingredients to cart</button>`
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

    const addBtn = document.getElementById("modalAddToCart");
    if (addBtn && ingredients.length) {
      addBtn.onclick = () => addIngredientsToCart(ingredients);
    }
  }

  /* ---------- CART: ADD CHEAPEST ITEMS ---------- */

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

      if (!res.ok) {
        const text = await res.text();
        console.error("add-cheapest error:", text);
        showToast("Unable to add items to cart.", "error");
        return;
      }

      const data = await res.json();
      const addedCount = (data.added || []).length;
      const missing = data.missing || [];

      if (addedCount === 0 && !missing.length) {
        showToast("No matching products found for any ingredient.", "error");
        return;
      }

      if (missing.length) {
        showToast(
          `Added ${addedCount} item(s). Could not find: ${missing.join(", ")}.`,
          "info"
        );
      } else {
        showToast(`Added ${addedCount} ingredient(s) to your cart.`, "info");
      }
    } catch (err) {
      console.error("add-cheapest error:", err);
      showToast("Something went wrong adding to cart.", "error");
    }
  }

  /* ---------- USER PLANS: LOAD & RENDER ---------- */

  async function loadUserPlans() {
    try {
      const res = await fetch("/api/mealplans", { credentials: "include" });
      if (!res.ok) return [];
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
        '<p class="muted">No saved meal plans yet. Use the AI planner above or create your own.</p>';
      return;
    }

    for (const p of plans) {
      const card = document.createElement("article");
      card.className = "plan-card";

      const desc =
        p.description ||
        "Custom meal plan created by you. Tap to see all ingredients.";

      const servingsText =
        typeof p.servings === "number" && p.servings > 0
          ? `Servings: ${p.servings}`
          : "";

      card.innerHTML = `
        <h3>${p.name || "Meal plan"}</h3>
        <p class="muted">${shortDescription(desc, 140)}</p>
        ${
          servingsText
            ? `<p class="muted" style="margin-top:4px;">${servingsText}</p>`
            : ""
        }
      `;

      card.addEventListener("click", () => openPlanModal(p));
      plansContainer.appendChild(card);
    }
  }

  /* ---------- MANUAL CUSTOM PLAN ---------- */

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
      showToast("Please enter a name and at least one ingredient.", "error");
      return;
    }

    const body = {
      name,
      description: "Custom meal plan created by you.",
      ingredients: ingredientsRaw,
      servings,
      fromAi: false,
    };

    const method = editingPlanId ? "PUT" : "POST";
    const url = editingPlanId
      ? `/api/mealplans/${encodeURIComponent(editingPlanId)}`
      : "/api/mealplans";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        console.error("save plan error:", data);
        showToast("Could not save meal plan.", "error");
        return;
      }
      showToast("Meal plan saved.", "info");
      hidePlanForm();
      const plans = await loadUserPlans();
      renderPlans(plans);
    } catch (err) {
      console.error("savePlan error:", err);
      showToast("Could not save meal plan.", "error");
    }
  });

  /* ---------- AI MEAL PLANNER ---------- */

  function renderAiRecipes(recipes) {
    aiRecipesContainer.innerHTML = "";
    if (!recipes || !recipes.length) {
      aiRecipesContainer.innerHTML =
        '<p class="muted">No recipes yet. Describe a dish and hit “Generate recipes”.</p>';
      return;
    }

    lastAiRecipes = recipes;

    for (let i = 0; i < recipes.length; i++) {
      const r = recipes[i];
      const card = document.createElement("article");
      card.className = "ai-recipe-card";

      const serves =
        typeof r.servings === "number" && r.servings > 0 ? r.servings : null;
      const servesLabel = serves ? `Serves ${serves}` : "";

      const ing = Array.isArray(r.ingredients) ? r.ingredients : [];
      const previewCount = Math.min(4, ing.length);
      const preview = ing.slice(0, previewCount);
      const moreCount = Math.max(0, ing.length - previewCount);

      const ingredientsHtml = preview
        .map(
          (item) =>
            `<li><span class="dot"></span><span>${formatIngredient(
              item
            )}</span></li>`
        )
        .join("");

      card.innerHTML = `
        <div class="ai-recipe-header">
          <h3>${r.title || `Recipe ${i + 1}`}</h3>
          ${
            servesLabel
              ? `<span class="ai-badge">${servesLabel}</span>`
              : `<span class="ai-badge">AI recipe</span>`
          }
        </div>
        <p class="ai-recipe-desc">${shortDescription(r.description || "", 160)}</p>
        <ul class="ai-ingredients">
          ${ingredientsHtml}
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

      card.querySelector(".ai-view").onclick = () => openPlanModal(r);
      card.querySelector(".ai-add-cart").onclick = () =>
        addIngredientsToCart(r.ingredients || []);
      card.querySelector(".ai-use").onclick = () => saveAiPlan(r);

      aiRecipesContainer.appendChild(card);
    }
  }

  async function saveAiPlan(recipe) {
    if (!recipe) return;

    const body = {
      name: recipe.title || "AI meal plan",
      description: recipe.description || "",
      ingredients: recipe.ingredients || [],
      servings: recipe.servings || null,
      fromAi: true,
      steps: recipe.steps || [],
    };

    try {
      const res = await fetch("/api/mealplans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        console.error("save AI plan error:", data);
        showToast("Could not save this recipe as a meal plan.", "error");
        return;
      }
      showToast("Recipe saved to your meal plans.", "info");
      const plans = await loadUserPlans();
      renderPlans(plans);
    } catch (err) {
      console.error("saveAiPlan error:", err);
      showToast("Could not save this recipe as a meal plan.", "error");
    }
  }

  async function handleGenerate() {
    const dish = aiDishInput.value.trim();
    const allergies = aiAllergiesInput.value.trim();
    const servings = parseInt(aiServingsInput.value, 10) || 2;

    if (!dish) {
      showToast("Please describe a dish or cuisine first.", "error");
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
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error("Bad AI response:", text);
        aiStatus.textContent =
          "Something went wrong generating recipes. Please try again.";
        aiGenerateBtn.disabled = false;
        return;
      }

      if (!res.ok || !data.recipes || !data.recipes.length) {
        console.error("AI error:", data);
        aiStatus.textContent =
          data.error ||
          "Could not generate recipes right now. Please try again later.";
        aiGenerateBtn.disabled = false;
        return;
      }

      aiStatus.textContent = `Showing ${data.recipes.length} recipe idea(s).`;
      renderAiRecipes(data.recipes);
    } catch (err) {
      console.error("AI generate error:", err);
      aiStatus.textContent =
        "Something went wrong generating recipes. Please try again.";
    } finally {
      aiGenerateBtn.disabled = false;
    }
  }

  aiGenerateBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    handleGenerate();
  });

  /* ---------- INIT ---------- */

  const user = await fetchCurrentUser();
  if (!user) {
    // still show the page, but they’ll be redirected from other actions
    console.log("Not signed in.");
  }

  const plans = await loadUserPlans();
  renderPlans(plans);
})();
