// /public/scripts/search.js

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("search");
  const btn = document.getElementById("search-btn");

  const searchSection = document.getElementById("search-section");
  const searchGrid = document.getElementById("search-grid");
  const searchCount = document.getElementById("search-count");

  const dealsSection = document.querySelector(".deals-section");
  const chips = document.querySelectorAll(".chip"); // category buttons

  if (
    !input ||
    !btn ||
    !searchSection ||
    !searchGrid ||
    !searchCount ||
    !dealsSection
  ) {
    console.warn("[search] required elements not found on page");
    return;
  }

  // ---------- CATEGORY → REAL QUERY MAPPING ----------
const CATEGORY_QUERIES = {
  vegetables: "vegetables",
  fruits: "fruits",
  bakery: "bakery",
  dairy: "dairy",
  meat: "meat",
  snacks: "snacks",
  beverages: "beverages",
  pantry: "pantry",
};


  // ---------- RENDER RESULTS ----------
  function renderResults(items, label) {
    searchGrid.innerHTML = "";

    if (!items || items.length === 0) {
      searchCount.textContent = label
        ? `No results found for "${label}".`
        : "No results found.";
      searchSection.style.display = "block";
      dealsSection.style.display = "none";
      return;
    }

    searchCount.textContent = `Found ${items.length} result${
      items.length > 1 ? "s" : ""
    }${label ? ` for "${label}"` : ""}`;

    items.forEach((p) => {
      const card = document.createElement("article");
      card.className = "deal-card";
      card.innerHTML = `
        <img class="deal-img" src="${
          p.img ||
          "https://dummyimage.com/600x400/e2e8f0/9ca3af.png&text=Product"
        }" alt="${p.name}">
        <div class="deal-body">
          <p class="deal-title">${p.name}</p>
          <div class="deal-price">
            <span class="price">$${Number(p.price || 0).toFixed(2)}</span>
          </div>
          <div class="deal-meta">${(p.storeId || "").toUpperCase()}</div>
        </div>
      `;
      searchGrid.appendChild(card);
    });

    // show search section above stores, hide best deals
    searchSection.style.display = "block";
    dealsSection.style.display = "none";
  }

  // ---------- CORE SEARCH FUNCTION ----------
  async function runSearch(query, labelForUI) {
    const q = (query || "").trim();
    if (!q) return;

    searchCount.textContent = `Searching${
      labelForUI ? ` for "${labelForUI}"` : "…"
    }`;
    searchSection.style.display = "block";
    searchGrid.innerHTML = "";

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      renderResults(json.results || [], labelForUI || q);
    } catch (err) {
      console.error("Search error:", err);
      searchCount.textContent = "Search failed. Please try again.";
      searchSection.style.display = "block";
      dealsSection.style.display = "none";
    }
  }

  // ---------- MANUAL SEARCH (INPUT + BUTTON) ----------
  function doSearch() {
    runSearch(input.value, input.value.trim());
  }

  btn.addEventListener("click", doSearch);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // When input is cleared, hide search and bring back Best Deals
  input.addEventListener("input", () => {
    if (input.value.trim() === "") {
      searchSection.style.display = "none";
      dealsSection.style.display = "block";
    }
  });

  // ---------- CATEGORY CHIPS ----------
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const label = chip.textContent.trim();       // e.g. "Vegetables"
      const key = label.toLowerCase();            // "vegetables"
      const mappedQuery = CATEGORY_QUERIES[key] || key;

      // Put label in the search box for clarity
      input.value = label;

      // Run search using the mapped keyword, but show the pretty label in UI
      runSearch(mappedQuery, label);
    });
  });
});
