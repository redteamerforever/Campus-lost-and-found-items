// map-picker.js — load AFTER app.js. Replaces the in-form map with a full-screen picker
// (so the form's CSS can't break it) and adds Street/Satellite/Terrain to the big map.
(function () {
  const TILES = {
    street:    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }],
    satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" }],
    terrain:   ["https://tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap, © OpenTopoMap" }]
  };
  const NAMES = { street: "Street", satellite: "Satellite", terrain: "Terrain" };
  const INDIA = [20.5937, 78.9629];
  const HINT = "Drag the map so the pin sits on the exact spot.";

  const css = document.createElement("style");
  css.textContent = `
  .map-modal{position:fixed;inset:0;z-index:2200;background:#222}
  .map-modal .mm-map{position:absolute;inset:0}
  .mm-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:38px;z-index:1000;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
  .mm-top,.mm-bottom{position:absolute;left:0;right:0;z-index:1100;padding:10px;box-sizing:border-box}
  .mm-top{top:0;display:flex;gap:8px}
  .mm-bottom{bottom:0;background:rgba(24,18,48,.82);color:#fff;border-radius:20px 20px 0 0}
  .mm-search{flex:1;min-width:0;padding:12px 16px;font-size:16px;border:none;border-radius:25px;box-shadow:0 4px 14px rgba(0,0,0,.35)}
  .map-modal button,.mm-modes-view button{padding:10px 14px;border:none;border-radius:20px;font-size:14px;font-weight:bold;cursor:pointer;background:rgba(255,255,255,.2);color:#fff}
  .mm-modes-view button{background:rgba(0,0,0,.35)}
  .mm-go{background:rgb(180,92,255)!important}
  .mm-ok{background:rgb(46,139,87)!important;flex:1}
  .mm-row,.mm-modes,.mm-modes-view{display:flex;gap:8px;flex-wrap:wrap}
  .mm-modes{justify-content:center;margin-bottom:6px}
  .mm-modes-view{justify-content:center;margin-bottom:8px}
  .mm-modes button.on,.mm-modes-view button.on{background:#fff!important;color:rgb(180,92,255)!important}
  .mm-hint{margin:4px 0 10px;font-size:13px;text-align:center}
  `;
  document.head.append(css);

  // Street / Satellite / Terrain buttons for any Leaflet map
  function addModes(map, host) {
    const layers = {};
    let current = "street";
    Object.keys(TILES).forEach(function (k) { layers[k] = L.tileLayer(TILES[k][0], TILES[k][1]); });
    layers.street.addTo(map);
    Object.keys(NAMES).forEach(function (k) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = NAMES[k];
      if (k === current) b.className = "on";
      b.addEventListener("click", function () {
        map.removeLayer(layers[current]);
        layers[k].addTo(map);
        current = k;
        Array.prototype.forEach.call(host.children, function (x) { x.classList.toggle("on", x === b); });
      });
      host.append(b);
    });
  }

  // ===== Full-screen location picker =====
  let modal, pm, circle, hint, searchBox;

  function build() {
    modal = document.createElement("div");
    modal.className = "map-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="mm-map"></div><div class="mm-pin">📍</div>' +
      '<div class="mm-top"><input class="mm-search" type="search" placeholder="Search a place (e.g. Main Library)">' +
      '<button type="button" class="mm-go">Search</button></div>' +
      '<div class="mm-bottom"><div class="mm-modes"></div><p class="mm-hint"></p>' +
      '<div class="mm-row"><button type="button" class="mm-gps">📡 My location</button>' +
      '<button type="button" class="mm-skip">Skip</button>' +
      '<button type="button" class="mm-ok">Confirm spot</button></div></div>';
    document.body.append(modal);

    hint = modal.querySelector(".mm-hint");
    searchBox = modal.querySelector(".mm-search");
    pm = L.map(modal.querySelector(".mm-map"), { maxZoom: 19 }).setView(INDIA, 5);
    addModes(pm, modal.querySelector(".mm-modes"));

    modal.querySelector(".mm-go").addEventListener("click", search);
    searchBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); search(); }
    });
    modal.querySelector(".mm-gps").addEventListener("click", locate);
    modal.querySelector(".mm-skip").addEventListener("click", function () {
      pickedLocation = null;
      locationStatus.textContent = "Location skipped. Your post will have no map location.";
      modal.hidden = true;
    });
    modal.querySelector(".mm-ok").addEventListener("click", function () {
      const c = pm.getCenter();
      pickedLocation = { lat: c.lat, lng: c.lng };
      locationStatus.textContent = "📍 Location set ✓ (" + c.lat.toFixed(5) + ", " + c.lng.toFixed(5) + ")";
      modal.hidden = true;
    });
  }

  async function search() {
    const q = searchBox.value.trim();
    if (!q) return;
    hint.textContent = "Searching…";
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q));
      const data = await res.json();
      if (data[0]) {
        pm.setView([Number(data[0].lat), Number(data[0].lon)], 18);
        hint.textContent = HINT;
      } else {
        hint.textContent = "Place not found. Try a different name.";
      }
    } catch (e) {
      hint.textContent = "Search failed. Check your internet.";
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      hint.textContent = "Location is not supported here. Search a place instead.";
      return;
    }
    hint.textContent = "Detecting your location…";
    navigator.geolocation.getCurrentPosition(function (p) {
      const lat = p.coords.latitude, lng = p.coords.longitude, acc = p.coords.accuracy;
      pm.setView([lat, lng], 18);
      if (circle) pm.removeLayer(circle);
      circle = L.circle([lat, lng], { radius: acc, weight: 1 }).addTo(pm);
      hint.textContent = acc > 100
        ? "Only accurate to about " + Math.round(acc) + " m. Move the map to the exact spot."
        : "Found you (about " + Math.round(acc) + " m). Adjust if needed.";
    }, function () {
      hint.textContent = "Could not get location. Allow location access or search a place.";
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  function openPicker(autoLocate) {
    if (!modal) build();
    modal.hidden = false;
    hint.textContent = HINT;
    setTimeout(function () {
      pm.invalidateSize();
      if (pickedLocation) pm.setView([pickedLocation.lat, pickedLocation.lng], 18);
      if (autoLocate) locate();
    }, 60);
  }

  // Catch the two old buttons BEFORE app.js sees the click
  document.addEventListener("click", function (e) {
    const b = e.target.closest("#pinBtn, #autoBtn");
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openPicker(b.id === "autoBtn");
  }, true);

  // ===== Big map of all posts: add Street / Satellite / Terrain =====
  window.initViewMap = function () {
    if (viewMap) return;
    viewMap = L.map("viewMap", { maxZoom: 19 }).setView(INDIA, 5);
    const bar = document.createElement("div");
    bar.className = "mm-modes-view";
    viewMapBox.insertBefore(bar, document.getElementById("viewMap"));
    addModes(viewMap, bar);
    viewLayer = L.layerGroup().addTo(viewMap);
  };
})();
