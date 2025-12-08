// public/scripts/location.js
(function () {
  const KEY = "gw.loc";
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- state ----------
  let state = null; // { lat, lon, label }

  // ---------- create pill (pretty button) ----------
  let pill = $("#loc-pill");
  if (!pill) {
    pill = document.createElement("button");
    pill.id = "loc-pill";
    pill.type = "button";
    pill.className = "loc-pill";
    pill.innerHTML = `
      <img src="/assets/location.svg" alt="" aria-hidden="true">
      <span id="loc-pill-label">Detecting…</span>
    `;

    // insert just before the .account block in the top nav
    const header = $(".nav");
    const account = header?.querySelector(".account");
    if (header && account) header.insertBefore(pill, account);
  }
  const pillLabel = $("#loc-pill-label", pill);

  // ---------- create modal (matches base.css) ----------
  let modal = $("#loc-modal");
  if (!modal) {
    modal = document.createElement("dialog");
    modal.id = "loc-modal";
    modal.className = "loc-modal";
    modal.innerHTML = `
      <form method="dialog" class="loc-card" id="loc-form" autocomplete="off">
        <div class="loc-head">
          <h3>Select location</h3>
          <button value="cancel" class="loc-close" aria-label="Close">✕</button>
        </div>

        <div class="form-row">
          <label class="label" for="loc-search">Search address</label>
          <input id="loc-search" class="input" placeholder="Enter an address or place" />
          <ul id="loc-suggest" class="loc-suggest"></ul>
        </div>

        <div class="loc-actions">
          <button type="button" id="loc-use-device" class="btn-outline">Use my current location</button>
          <div class="spacer"></div>
          <button id="loc-save" class="btn">Use this location</button>
        </div>

        <small class="muted" id="loc-status" style="display:block;margin-top:8px;"></small>
      </form>
    `;
    document.body.appendChild(modal);
  }
  const searchInput = $("#loc-search", modal);
  const suggestList = $("#loc-suggest", modal);
  const useDeviceBtn = $("#loc-use-device", modal);
  const saveBtn = $("#loc-save", modal);
  const statusEl = $("#loc-status", modal);

  // scratch space for the "pending" selection from search
  let pendingSelection = null; // { lat, lon, label }

  // ---------- utils ----------
  const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch { return null; }
  };
  const labelFor = (str) => {
    if (!str) return "Unknown";
    return str.length > 40 ? str.slice(0, 40) + "…" : str;
  };
  function renderPillLabel(text) {
    pillLabel.textContent = text || "Choose location";
  }
  function setState(s, announce = true) {
    state = s;
    renderPillLabel(s?.label || "Choose location");
    save(s);
    if (announce && s?.lat != null) {
      window.dispatchEvent(new CustomEvent("gw:location", { detail: s }));
    }
  }

  // ---------- open/close ----------
  function openModal() {
    pendingSelection = null;
    statusEl.textContent = "";
    suggestList.innerHTML = "";
    if (!modal.open) modal.showModal();
    // focus after a tick so the dialog is mounted
    setTimeout(() => searchInput.focus(), 0);
  }
  function closeModal() {
    if (modal.open) modal.close();
  }
  pill.addEventListener("click", openModal);

  // close on ESC (dialog handles this, but keep label tidy)
  modal.addEventListener("close", () => {
    searchInput.value = "";
    suggestList.innerHTML = "";
    statusEl.textContent = "";
  });

  // ---------- search autocomplete (via your API proxy) ----------
  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { suggestList.innerHTML = ""; pendingSelection = null; return; }

    searchTimer = setTimeout(async () => {
      try {
        statusEl.textContent = "Searching…";
        const res = await fetch(`/api/geo/autocomplete?input=${encodeURIComponent(q)}`);
        const j = await res.json();
        const preds = j.predictions || [];
        statusEl.textContent = preds.length ? "" : "No matches";
        suggestList.innerHTML = preds.map(p => {
          const main = p.structured_formatting?.main_text || p.description || "";
          const secondary = p.structured_formatting?.secondary_text || "";
          return `
            <li>
              <button type="button" class="loc-item" data-id="${p.place_id}">
                <div>${main}</div>
                <div class="muted" style="font-size:.9em">${secondary}</div>
              </button>
            </li>
          `;
        }).join("");
      } catch {
        statusEl.textContent = "Search unavailable";
        suggestList.innerHTML = "";
      }
    }, 160);
  });

  // pick a suggestion → resolve to lat/lon
  suggestList.addEventListener("click", async (e) => {
    const b = e.target.closest(".loc-item");
    if (!b) return;
    const id = b.dataset.id;
    statusEl.textContent = "Loading place…";
    try {
      const r = await fetch(`/api/geo/place?id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (j && j.lat != null && j.lon != null) {
        pendingSelection = {
          lat: j.lat,
          lon: j.lon,
          label: labelFor(j.address || j.name)
        };
        statusEl.textContent = `Selected: ${pendingSelection.label}`;
      } else {
        statusEl.textContent = "Could not load place details";
      }
    } catch {
      statusEl.textContent = "Could not load place details";
    }
  });

  // ---------- use device GPS ----------
  useDeviceBtn.addEventListener("click", async () => {
    statusEl.textContent = "Detecting location…";
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
          : reject(new Error("no geolocation"))
      );
      const { latitude: lat, longitude: lon } = pos.coords;
      let label = "My location";
      try {
        const rr = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
        const jj = await rr.json();
        label = labelFor(jj.address || label);
      } catch { /* noop */ }
      pendingSelection = { lat, lon, label };
      statusEl.textContent = `Selected: ${pendingSelection.label}`;
    } catch {
      statusEl.textContent = "Location blocked or unavailable";
    }
  });

  // ---------- save / apply ----------
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!pendingSelection) {
      statusEl.textContent = "Pick a place or use your device location";
      return;
    }
    setState(pendingSelection, true);
    closeModal();
  });

  // ---------- initial bootstrap ----------
  (async function init() {
    const saved = load();
    if (saved && saved.lat != null) {
      setState(saved, false);
      // Announce once to hydrate pages that rely on it (e.g., nearby map)
      window.dispatchEvent(new CustomEvent("gw:location", { detail: saved }));
      return;
    }
    renderPillLabel("Detecting…");
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
          : reject(new Error("no geolocation"))
      );
      const { latitude: lat, longitude: lon } = pos.coords;
      let label = "My location";
      try {
        const rr = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
        const jj = await rr.json();
        label = labelFor(jj.address || label);
      } catch { /* noop */ }
      setState({ lat, lon, label }, true);
    } catch {
      renderPillLabel("Choose location");
    }
  })();

  // expose getter for other scripts
  window.GWLocation = { get: () => state };
})();
