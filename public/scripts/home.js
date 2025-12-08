// ====== DOM refs ======
const storesGrid   = document.getElementById("stores-grid");
const dealsRow     = document.getElementById("deals-row");
const productsGrid = document.getElementById("products-grid");
const nearbySub    = document.getElementById("nearby-sub");

// ====== Utils ======
const money = v => "$" + Number(v).toFixed(2);
const savePct = (was, now) => {
  const p = Math.round(((was - now) / (was || 1)) * 100);
  return p > 0 ? `-${p}%` : "";
};
const km = meters => (meters / 1000).toFixed(2) + " km";
const toRad = d => (d * Math.PI) / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// ====== Sample data (unchanged) ======
const SAMPLE_DEALS = [
  { title:"Onions 2 lb", store:"Loblaws", was:2.49, now:1.49, unit:"/lb",
    img:"https://images.unsplash.com/photo-1549989476-69a92fa57c36?auto=format&fit=crop&w=800&q=60" },
  { title:"Roma Tomatoes", store:"No Frills", was:2.29, now:1.29, unit:"/lb",
    img:"https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=800&q=60" },
  { title:"Broccoli Crown", store:"Walmart", was:2.99, now:1.88, unit:"/ea",
    img:"https://images.unsplash.com/photo-1546470428-2d6e3f3f1a8b?auto=format&fit=crop&w=800&q=60" },
  { title:"Avocados (bag)", store:"Metro", was:4.99, now:2.99, unit:"/bag",
    img:"https://images.unsplash.com/photo-1526312426976-593c128eea49?auto=format&fit=crop&w=800&q=60" },
  { title:"Milk 2% 4L", store:"Loblaws", was:6.29, now:4.99, unit:"/4L",
    img:"https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=60" },
  { title:"Whole Chicken", store:"Food Basics", was:10.99, now:7.99, unit:"/kg",
    img:"https://images.unsplash.com/photo-1604908554027-7b0b2b7a53d3?auto=format&fit=crop&w=800&q=60" }
];

const SAMPLE_PRODUCTS = [
  { name:"Heinz Ketchup 1L", store:"Walmart",   was:5.49,  now:3.97, img:"https://images.unsplash.com/photo-1604908554027-9eccc9b93f2f?auto=format&fit=crop&w=800&q=60" },
  { name:"Nutella 725g",     store:"No Frills", was:9.99,  now:6.99, img:"https://images.unsplash.com/photo-1586201375754-1421e991b3a0?auto=format&fit=crop&w=800&q=60" },
  { name:"Barilla Pasta",    store:"Metro",     was:2.49,  now:1.29, img:"https://images.unsplash.com/photo-1526318472351-c75fcf070305?auto=format&fit=crop&w=800&q=60" },
  { name:"Olive Oil 1L",     store:"Loblaws",   was:12.99, now:8.99, img:"https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=60" },
  { name:"Pepsi 2L",         store:"Walmart",   was:2.99,  now:1.99, img:"https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&q=60" },
  { name:"Basmati Rice 5kg", store:"No Frills", was:21.99, now:14.99, img:"https://images.unsplash.com/photo-1516685018646-549198525c1b?auto=format&fit=crop&w=800&q=60" },
  { name:"Eggs Large 12",    store:"Food Basics", was:4.29, now:3.29, img:"https://images.unsplash.com/photo-1517959105821-eaf2591984c2?auto=format&fit=crop&w=800&q=60" },
  { name:"Kraft Dinner 12pk",store:"Loblaws",   was:11.99, now:7.99, img:"https://images.unsplash.com/photo-1526318472351-c75fcf070305?auto=format&fit=crop&w=800&q=60" }
];

const FALLBACK_STORES = [
  { name:"Loblaws", lat:43.653, lon:-79.383,
    img:"https://images.unsplash.com/photo-1586201375754-1421e991b3a0?auto=format&fit=crop&w=1200&q=60" },
  { name:"Walmart Supercentre", lat:43.642, lon:-79.38,
    img:"https://images.unsplash.com/photo-1586201376222-4b2b3f8b5a3d?auto=format&fit=crop&w=1200&q=60" },
  { name:"No Frills", lat:43.66, lon:-79.39,
    img:"https://images.unsplash.com/photo-1542834369-f10ebf06d3cb?auto=format&fit=crop&w=1200&q=60" },
  { name:"Metro", lat:43.65, lon:-79.37,
    img:"https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=1200&q=60" }
];

// ====== Renderers (unchanged) ======
function renderDeals(deals) { /* same as before */ 
  if (!dealsRow) return;
  dealsRow.innerHTML = "";
  deals.forEach(d => {
    const card = document.createElement("article");
    card.className = "deal-card";
    card.innerHTML = `
      <img class="deal-img" src="${d.img}" alt="${d.title}">
      <div class="deal-ribbon">${savePct(d.was, d.now)}</div>
      <div class="deal-body">
        <h3 class="deal-title">${d.title}</h3>
        <div class="deal-meta">
          <div class="deal-price">${money(d.now)} <span class="badge">${d.unit || ""}</span></div>
          <div class="deal-was">Was <span class="strike">${money(d.was)}</span></div>
        </div>
        <div class="muted" style="margin:6px 0 10px">${d.store}</div>
        <button class="btn btn-small">Add to Cart</button>
      </div>
    `;
    dealsRow.appendChild(card);
  });
}

function renderProducts(items) { /* same as before */
  if (!productsGrid) return;
  productsGrid.innerHTML = "";
  items.forEach(p => {
    const el = document.createElement("article");
    el.className = "product-card";
    el.innerHTML = `
      <img class="product-img" src="${p.img}" alt="${p.name}">
      <div class="product-body">
        <h3 class="product-name">${p.name}</h3>
        <div class="product-meta">${p.store}</div>
        <div class="product-pricing">
          <span class="price">${money(p.now)}</span>
          <span class="strike">${money(p.was)}</span>
          <span class="badge">${savePct(p.was, p.now)}</span>
        </div>
        <button class="btn btn-small">Add to Cart</button>
      </div>
    `;
    productsGrid.appendChild(el);
  });
}

function renderStores(stores, myLat, myLon) {
  if (!storesGrid) return;
  storesGrid.innerHTML = "";
  if (!stores.length) {
    storesGrid.innerHTML = `<p>No stores found nearby.</p>`;
    return;
  }
  stores
    .map(s => ({ ...s, distance: myLat ? haversine(myLat, myLon, s.lat, s.lon) : null }))
    .sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12))
    .slice(0, 12)
    .forEach(s => {
      const card = document.createElement("article");
      card.className = "store-card";
      card.innerHTML = `
        <img class="store-img" src="${s.img}" alt="${s.name}">
        <div class="store-body">
          <h3 class="store-title">${s.name || "Grocery Store"}</h3>
          <div class="store-meta">${s.distance != null ? km(s.distance) : ""}</div>
          <button class="btn btn-small">View Deals</button>
        </div>
      `;
      storesGrid.appendChild(card);
    });
}

// ====== Nearby via Overpass ======
async function fetchOverpass(lat, lon) {
  const radius = 4000;
  const q = `[out:json];(node["shop"="supermarket"](around:${radius},${lat},${lon});node["shop"="convenience"](around:${radius},${lat},${lon}););out body;`;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Overpass failed");
  const data = await res.json();
  const generic = "https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=1200&q=60";
  return (data.elements || [])
    .filter(e => e.lat && e.lon)
    .map(e => ({ name: (e.tags && e.tags.name) || "Grocery Store", lat: e.lat, lon: e.lon, img: generic }));
}

// ====== Init ======
(function init() {
  renderDeals(SAMPLE_DEALS);
  renderProducts(SAMPLE_PRODUCTS);

  if (!storesGrid) return;

  async function loadFor(lat, lon, label) {
    try {
      const stores = await fetchOverpass(lat, lon);
      const list = [...stores.slice(0, 8), ...FALLBACK_STORES].slice(0, 12);
      renderStores(list, lat, lon);
      if (nearbySub) nearbySub.textContent = label ? `Based on ${label}` : "Based on your location";
    } catch {
      renderStores(FALLBACK_STORES);
      if (nearbySub) nearbySub.textContent = "Unable to reach service — showing popular stores.";
    }
  }

  // Kick once if location already available
  const s = window.GWLocation?.get?.();
  if (s?.lat != null) loadFor(s.lat, s.lon, s.label);

  // React to changes
  window.addEventListener("gw:location", (ev) => {
    const { lat, lon, label } = ev.detail || {};
    if (lat != null) loadFor(lat, lon, label);
  });
})();
