/* global google */
/* Nearby map + list using Places NearbySearch + Distance Matrix.
   Shows only Walmart, Metro, FreshCo, No Frills, Food Basics.
   All buttons use blue color for design consistency.
*/

window.initNearbyMap = function initNearbyMap() {
  const $ = (s) => document.querySelector(s);
  const listEl = $("#store-list");
  const subEl = $("#nearby-sub");
  const countEl = $("#result-count");
  const sortEl = $("#sort-select");
  const spinner = $("#map-spinner");

  const FALLBACK = { lat: 43.6532, lon: -79.3832, label: "Toronto" };

  // ---- Brand detectors ----
  const isWalmart = (name = "") => /\bwalmart\b/i.test(name);
  const isMetro = (name = "") => /\bmetro\b/i.test(name);
  const isFreshco = (name = "") => /\bfreshco\b/i.test(name);
  const isNoFrills = (name = "") => /\bno\s?frills\b/i.test(name);
  const isFoodBasics = (name = "") => /\bfood\s?basics\b/i.test(name);

  const isTargetBrand = (name = "") =>
    isWalmart(name) ||
    isMetro(name) ||
    isFreshco(name) ||
    isNoFrills(name) ||
    isFoodBasics(name);

  // ---- Location helpers ----
  function readSavedLocation() {
    try {
      const raw =
        localStorage.getItem("gw.loc") || localStorage.getItem("gw:location");
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && typeof v.lat === "number" && typeof v.lon === "number") return v;
    } catch {}
    return null;
  }

  async function getCenter() {
    const saved = readSavedLocation();
    if (saved) return saved;

    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true,
            timeout: 8000,
          })
        );
        return {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: "Your location",
        };
      } catch {}
    }
    return FALLBACK;
  }

  // ---- Distance helpers ----
  const toRad = (d) => (d * Math.PI) / 180;
  function haversine(a, b) {
    const R = 6371e3;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const A =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A)));
  }
  const km = (m) => (m / 1000).toFixed(2) + " km";

  // ---- Main render ----
  async function renderNearby(center) {
    const allResults = [];

    if (subEl)
      subEl.textContent = `Showing results around ${
        center.label || "your location"
      }`;

    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: center.lat, lng: center.lon },
      zoom: 13,
      gestureHandling: "greedy",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    // Self marker
    new google.maps.Marker({
      map,
      position: { lat: center.lat, lng: center.lon },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#2563eb",
        fillOpacity: 1,
        strokeColor: "#1e40af",
        strokeWeight: 2,
      },
      title: "You",
    });

    // ---- Corrected Places Search ----
    // --- Modern Nearby Search (confirmed working in beta v3.2+) ---
async function nearby({ location, radius }) {
  const request = {
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "types",
    ],
    locationRestriction: {
      center: { lat: location.lat, lng: location.lng || location.lon },
      radius: radius || 5000,
    },
   includedPrimaryTypes: ["supermarket", "store"],

  };

  try {
    const { places } = await google.maps.places.Place.searchNearby(request);
    return (places || []).map((p) => ({
      place_id: p.id,
      name: p.displayName || "",
      rating: p.rating || null,
      user_ratings_total: p.userRatingCount || 0,
      location: {
        lat: p.location?.lat(),
        lon: p.location?.lng(),
      },
      vicinity: p.formattedAddress || "",
    }));
  } catch (err) {
    console.error("Nearby search failed:", err.message || err);
    return [];
  }
}


    spinner.textContent = "Searching supermarkets…";
    const res1 = await nearby({
      location: { lat: center.lat, lng: center.lon },
      radius: 5000,
    });

    spinner.textContent = "Searching grocery & convenience…";
    const res2 = await nearby({
      location: { lat: center.lat, lng: center.lon },
      radius: 5000,
    });

    const uniqueById = new Map();
    [...res1, ...res2].forEach((p) => uniqueById.set(p.place_id, p));

    const filtered = Array.from(uniqueById.values()).filter((p) =>
      isTargetBrand(p.name)
    );

    allResults.push(...filtered);

    const dm = new google.maps.DistanceMatrixService();
    async function fetchTimes(destinations) {
      return new Promise((resolve) => {
        dm.getDistanceMatrix(
          {
            origins: [{ lat: center.lat, lng: center.lon }],
            destinations,
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC,
          },
          (res, status) => {
            if (status !== "OK" || !res) return resolve([]);
            resolve(res.rows[0].elements);
          }
        );
      });
    }

    allResults.forEach(
      (p) => (p.linear_meters = haversine(center, p.location))
    );

    const batches = [];
    for (let i = 0; i < allResults.length; i += 25) {
      const slice = allResults.slice(i, i + 25);
      const dests = slice.map(
        (s) => new google.maps.LatLng(s.location.lat, s.location.lon)
      );
      const elements = await fetchTimes(dests);
      slice.forEach((s, idx) => {
        const e = elements[idx];
        if (e && e.status === "OK") {
          s.drive_text = e.duration.text;
          s.drive_seconds = e.duration.value;
          s.road_meters = e.distance.value;
        } else {
          s.drive_text = null;
          s.drive_seconds = null;
          s.road_meters = s.linear_meters;
        }
      });
      batches.push(...slice);
    }

    // ---- Markers ----
    const info = new google.maps.InfoWindow();
    const markers = batches.map((p) => {
      const m = new google.maps.Marker({
        map,
        position: { lat: p.location.lat, lng: p.location.lon },
        title: p.name,
        animation: google.maps.Animation.DROP,
      });

      m.addListener("click", () => {
        let viewProductsLink = "";

        if (isWalmart(p.name))
          viewProductsLink = `<div style="margin-top:6px"><a class="btn btn-small btn-blue" href="/product.html?store=walmart">View products</a></div>`;
        else if (isMetro(p.name))
          viewProductsLink = `<div style="margin-top:6px"><a class="btn btn-small btn-blue" href="/product.html?store=metro">View products</a></div>`;
        else if (isFreshco(p.name))
          viewProductsLink = `<div style="margin-top:6px"><a class="btn btn-small btn-blue" href="/product.html?store=freshco">View products</a></div>`;
        else if (isNoFrills(p.name))
          viewProductsLink = `<div style="margin-top:6px"><a class="btn btn-small btn-blue" href="/product.html?store=nofrills">View products</a></div>`;
        else if (isFoodBasics(p.name))
          viewProductsLink = `<div style="margin-top:6px"><a class="btn btn-small btn-blue" href="/product.html?store=foodbasics">View products</a></div>`;

        info.setContent(`
          <div style="min-width:220px">
            <strong>${p.name}</strong><br>
            <small>${p.vicinity || ""}</small><br>
            <small>${km(p.road_meters || p.linear_meters)} · ${
          p.drive_text || "drive time n/a"
        }</small>
            ${viewProductsLink}
          </div>
        `);
        info.open(map, m);
      });
      p._marker = m;
      return m;
    });

    spinner.remove();

    // ---- Render List ----
    function render(sorted) {
      listEl.innerHTML = "";
      if (countEl) countEl.textContent = `${sorted.length} stores`;

      sorted.forEach((p, i) => {
        const el = document.createElement("article");
        el.className = "store-item";

        let viewProductsLink = "";
        if (isWalmart(p.name))
          viewProductsLink = `<a class="btn btn-small btn-blue" href="/product.html?store=walmart">View products</a>`;
        else if (isMetro(p.name))
          viewProductsLink = `<a class="btn btn-small btn-blue" href="/product.html?store=metro">View products</a>`;
        else if (isFreshco(p.name))
          viewProductsLink = `<a class="btn btn-small btn-blue" href="/product.html?store=freshco">View products</a>`;
        else if (isNoFrills(p.name))
          viewProductsLink = `<a class="btn btn-small btn-blue" href="/product.html?store=nofrills">View products</a>`;
        else if (isFoodBasics(p.name))
          viewProductsLink = `<a class="btn btn-small btn-blue" href="/product.html?store=foodbasics">View products</a>`;

        el.innerHTML = `
          <div class="si-badge">${i + 1}</div>
          <div class="si-main">
            <h3 class="si-title">${p.name}</h3>
            <div class="si-meta">
              <span>${p.vicinity || ""}</span>
              <span>· ${km(p.road_meters || p.linear_meters)}</span>
              <span>· ${p.drive_text || "drive n/a"}</span>
              ${
                p.rating
                  ? `<span>· ⭐ ${p.rating.toFixed(1)} (${p.user_ratings_total})</span>`
                  : ""
              }
            </div>
            <div class="si-actions" style="margin-top:8px">
              <button class="btn btn-small btn-blue" data-zoom="${p.place_id}">View on map</button>
              <a class="btn btn-small btn-outline" target="_blank" rel="noopener"
                 href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                   `${p.location.lat},${p.location.lon}`
                 )}&travelmode=driving">Directions</a>
              ${viewProductsLink}
            </div>
          </div>`;
        el.querySelector("[data-zoom]").addEventListener("click", () => {
          map.panTo({ lat: p.location.lat, lng: p.location.lon });
          map.setZoom(15);
          google.maps.event.trigger(p._marker, "click");
        });
        listEl.appendChild(el);
      });
    }

    function sortAndRender() {
      const mode = sortEl?.value || "dist";
      const items = [...batches];
      if (mode === "time")
        items.sort(
          (a, b) => (a.drive_seconds ?? 1e12) - (b.drive_seconds ?? 1e12)
        );
      else if (mode === "rating")
        items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      else
        items.sort(
          (a, b) =>
            (a.road_meters ?? a.linear_meters) -
            (b.road_meters ?? b.linear_meters)
        );
      render(items);
    }

    sortEl?.addEventListener("change", sortAndRender);
    sortAndRender();

    // ---- Fit bounds ----
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(m.getPosition()));
    bounds.extend({ lat: center.lat, lng: center.lon });
    map.fitBounds(bounds, 64);
  }

  (async () => {
    const center = await getCenter();
    renderNearby(center);
  })();

  window.addEventListener("gw:location", (e) => {
    const loc = e.detail;
    if (loc) renderNearby(loc);
  });
};
