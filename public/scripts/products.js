(() => {
  // =========================================================
  // CONFIGURATION
  // =========================================================
  const VENDORS = {
    walmart: "/api/vendors/walmart",
    metro: "/api/vendors/metro",
    freshco: "/api/vendors/freshco",
    nofrills: "/api/vendors/nofrills",
  };

  const EMOJI = {
    Bakery: "🥖",
    Dairy: "🥛",
    Fruits: "🍎",
    Meat: "🥩",
    Pantry: "🧂",
    Vegetables: "🥕",
    Beverages: "🥤",
    Snacks: "🍪",
    Other: "🛒",
  };

  const qs = new URLSearchParams(location.search);
  const storeKey = (qs.get("store") || "walmart").toLowerCase();
  const overrideApi = qs.get("api");
  let API_URL = overrideApi || VENDORS[storeKey];

  // Fix for running locally or on file://
  if (API_URL && API_URL.startsWith("/api/")) {
    const base =
      location.origin.includes("file://") || location.origin === "null"
        ? "http://localhost:3000"
        : location.origin;
    API_URL = `${base}${API_URL}`;
  }

  // =========================================================
  // DOM HOOKS
  // =========================================================
  const backBtn = document.getElementById("backBtn");
  const pageTitle = document.getElementById("pageTitle");
  const storeBadge = document.getElementById("storeBadge");
  const categoriesEl = document.getElementById("categories");
  const catGrid = document.getElementById("catGrid");
  const productsEl = document.getElementById("products");
  const gridEl = document.getElementById("productGrid");
  const emptyEl = document.getElementById("emptyState");

  // =========================================================
  // STATE
  // =========================================================
  let allProducts = [];
  let categories = [];
  let storeName = "";
  let activeCat = null;

  // =========================================================
  // INITIALIZATION
  // =========================================================
  init().catch((err) => showError(err));

  // =========================================================
  // MAIN INIT FUNCTION
  // =========================================================
  async function init() {
    hookBackButton();
    if (!API_URL) throw new Error(`No API mapped for "${storeKey}"`);

    paintSkeletons(catGrid, 6, "cat-card skeleton");

    console.log("🌐 Fetching products from:", API_URL);
    const payload = await fetchJSON(API_URL);
    console.log("✅ API Payload:", payload);

    storeName = payload.storeName || capitalize(storeKey);
    storeBadge.textContent = `— ${storeName}`;

    const list =
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload.products)
        ? payload.products
        : Array.isArray(payload.items)
        ? payload.items
        : [];

    if (!list.length) throw new Error("No products found for this store.");

    allProducts = list.map((p) => ({
      ...p,
      category: p.category || "Other",
      currency: p.currency || "CAD",
      inStock: p.inStock !== false,
      storeName,
    }));

    const counts = allProducts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    categories = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    renderCategories(categories, counts);
  }

  // =========================================================
  // ERROR DISPLAY
  // =========================================================
  function showError(err) {
    console.error("❌ Product init failed:", err);
    catGrid.innerHTML = `
      <div class="cat-card" style="grid-column:1/-1;justify-content:center;flex-direction:column;align-items:center;">
        <div class="cat-text" style="text-align:center;">
          <h4>Failed to load products</h4>
          <small>${err.message || "Unable to reach product server."}</small><br>
          <button id="retryBtn" class="btn-retry" style="margin-top:10px;">Retry</button>
        </div>
      </div>`;
    document.getElementById("retryBtn")?.addEventListener("click", () => {
      catGrid.innerHTML = "";
      init().catch(showError);
    });
  }

  // =========================================================
  // BACK BUTTON HANDLER
  // =========================================================
  function hookBackButton() {
    backBtn?.addEventListener("click", () => {
      if (isVisible(productsEl)) {
        productsEl.style.display = "none";
        categoriesEl.style.display = "";
        activeCat = null;
        pageTitle.textContent = "Products";
        storeBadge.textContent = `— ${storeName}`;
      } else {
        history.length > 1 ? history.back() : (location.href = "/nearby.html");
      }
    });
  }

  // =========================================================
  // CATEGORY RENDERING
  // =========================================================
  function renderCategories(cats, counts) {
    catGrid.innerHTML = "";
    cats.forEach((cat, i) => {
      const card = document.createElement("button");
      card.className = "cat-card";
      card.style.animationDelay = `${i * 50}ms`;
      card.innerHTML = `
        <div class="cat-emoji">${EMOJI[cat] || EMOJI.Other}</div>
        <div class="cat-text">
          <h4>${cat}</h4>
          <small>${counts[cat]} ${counts[cat] === 1 ? "item" : "items"}</small>
        </div>
      `;
      card.addEventListener("click", () => openCategory(cat));
      catGrid.appendChild(card);
    });
  }

  // =========================================================
  // PRODUCT GRID
  // =========================================================
  function openCategory(cat) {
    activeCat = cat;
    pageTitle.textContent = cat;
    categoriesEl.style.display = "none";
    productsEl.style.display = "";
    renderProducts(cat);
  }

  function renderProducts(cat) {
    const items = allProducts.filter((p) => p.category === cat);
    gridEl.innerHTML = "";
    emptyEl.style.display = items.length ? "none" : "";

    items.forEach((p, i) => {
      const card = document.createElement("article");
      card.className = "prd-card";
      card.style.animationDelay = `${i * 40}ms`;

      const img = document.createElement("img");
      img.className = "prd-img";
      img.src =
        p.image ||
        `https://picsum.photos/seed/${encodeURIComponent(p.name)}/800/450`;
      img.alt = p.name;

      const body = document.createElement("div");
      body.className = "prd-body";

      const name = document.createElement("h4");
      name.className = "prd-name";
      name.textContent = p.name;

      const meta = document.createElement("div");
      meta.className = "prd-meta";
      meta.textContent = [p.unit || null, p.inStock ? "In stock" : "Out of stock"]
        .filter(Boolean)
        .join(" • ");

      const bottom = document.createElement("div");
      bottom.className = "prd-bottom";

      const price = document.createElement("div");
      price.className = "prd-price";
      price.textContent = formatMoney(p.price, p.currency);

      const btn = document.createElement("button");
      btn.className = "btn-add";
      btn.type = "button";
      btn.textContent = "Add to Cart";

      // 💡 NEW: Add to Cart functionality
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Adding...";
        try {
          const resp = await fetch("/api/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              productId: p.id,
              name: p.name,
              price: p.price,
              store: storeName,
              quantity: 1,
            }),
          });

          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || "Failed to add to cart");

          showToast(`🛒 ${p.name} added to cart!`);
          btn.textContent = "Added ✓";
        } catch (err) {
          console.error("❌ Add to cart failed:", err);
          showToast("⚠️ Please sign in to add items.", "error");
          btn.textContent = "Retry";
        } finally {
          setTimeout(() => {
            btn.textContent = "Add to Cart";
            btn.disabled = false;
          }, 1200);
        }
      });

      bottom.append(price, btn);
      body.append(name, meta, bottom);
      card.append(img, body);
      gridEl.appendChild(card);
    });
  }

  // =========================================================
  // HELPERS
  // =========================================================
  function showToast(text, type = "success") {
    const msg = document.createElement("div");
    msg.className = `message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => (msg.style.opacity = "0"), 2500);
    setTimeout(() => msg.remove(), 3000);
  }

  function paintSkeletons(container, n, className) {
    container.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = className;
      container.appendChild(s);
    }
  }

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok)
        throw new Error(`Fetch failed (${res.status}): ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.error("❌ fetchJSON error:", err, "URL:", url);
      throw new Error(
        `Unable to reach product server.\nCheck API route or .env link.\n(${url})`
      );
    }
  }

  function formatMoney(v, cur) {
    const n = Number(v || 0);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur || "CAD",
      }).format(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  function capitalize(str) {
    return str?.charAt(0).toUpperCase() + str.slice(1);
  }

  function isVisible(el) {
    return !!el && window.getComputedStyle(el).display !== "none";
  }
})();
