// ===== 1. SUPABASE SETUP: paste YOUR values here =====
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";
// (never paste the secret / service_role key here)

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 2. CATEGORIES =====
const CATEGORIES = {
  wallet: "👛 Wallet",
  phone: "📱 Phone",
  keys: "🔑 Keys",
  id: "🪪 ID / Cards",
  bag: "🎒 Bag",
  books: "📚 Books",
  electronics: "💻 Electronics",
  clothing: "👕 Clothing",
  other: "📦 Other"
};

// ===== 3. PAGE ELEMENTS =====
const form = document.getElementById("postForm");
const postBtn = form.querySelector('button[type="submit"]');
const openPostBtn = document.getElementById("openPostBtn");
const themeBtn = document.getElementById("themeBtn");
const categorySelect = document.getElementById("category");
const categoryFilter = document.getElementById("categoryFilter");
const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("searchInput");
const chips = document.querySelectorAll(".chip");
const tabs = document.querySelectorAll(".tab");
const feed = document.getElementById("feed");
const feedStatus = document.getElementById("feedStatus");
const viewMapBox = document.getElementById("viewMapBox");
const mapNote = document.getElementById("mapNote");
const statLost = document.getElementById("statLost");
const statFound = document.getElementById("statFound");
const statSolved = document.getElementById("statSolved");
const toasts = document.getElementById("toasts");
const cameraInput = document.getElementById("cameraPhoto");
const galleryInput = document.getElementById("galleryPhoto");
const photoStatus = document.getElementById("photoStatus");
const autoBtn = document.getElementById("autoBtn");
const pinBtn = document.getElementById("pinBtn");
const locationStatus = document.getElementById("locationStatus");
const mapBox = document.getElementById("mapBox");

let items = [];            // posts loaded from Supabase
let lastList = [];         // posts currently shown (after filters)
let currentUserId = null;  // this browser's anonymous user id
let selectedFile = null;   // photo chosen by the user
let pickedLocation = null; // pin {lat, lng}
let userPos = null;        // where the visitor is (for "nearest")
let filterType = "all";    // all | lost | found | solved
let categoryType = "all";  // all or a category key
let sortType = "newest";   // newest | expiring | nearest
let searchText = "";       // what is typed in the search box
let viewMode = "list";     // list | map
let refitNext = false;     // zoom the big map to fit the posts
let firstRender = true;    // play the entrance animation only once

// fill the two category drop-downs
categoryFilter.append(new Option("All categories", "all"));
Object.keys(CATEGORIES).forEach(function (key) {
  categorySelect.append(new Option(CATEGORIES[key], key));
  categoryFilter.append(new Option(CATEGORIES[key], key));
});

// ===== 4. SMALL HELPERS =====
function toast(message, kind) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = message;
  toasts.append(t);
  setTimeout(function () { t.remove(); }, 3500);
}

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " h ago";
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day ago" : " days ago");
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function formatDistance(km) {
  return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
}

function animateCount(el, target) {
  const start = Number(el.textContent) || 0;
  if (start === target) return;
  let step = 0;
  const timer = setInterval(function () {
    step++;
    el.textContent = Math.round(start + (target - start) * step / 20);
    if (step >= 20) {
      clearInterval(timer);
      el.textContent = target;
    }
  }, 30);
}

// ===== 5. DARK MODE =====
function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  themeBtn.textContent = dark ? "☀️" : "🌙";
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch (e) {}
}

let savedTheme = null;
try {
  savedTheme = localStorage.getItem("theme");
} catch (e) {}
applyTheme(savedTheme === "dark");

themeBtn.addEventListener("click", function () {
  applyTheme(!document.body.classList.contains("dark"));
});

// open / close the post form
openPostBtn.addEventListener("click", function () {
  form.hidden = !form.hidden;
  if (!form.hidden) form.scrollIntoView({ behavior: "smooth" });
});

// ===== 6. SIGN IN (anonymous, automatic, nothing to see) =====
async function ensureSignedIn() {
  const { data } = await db.auth.getSession();
  if (data.session) {
    currentUserId = data.session.user.id;
    return;
  }

  const result = await db.auth.signInAnonymously();
  if (result.error) throw result.error;
  currentUserId = result.data.user.id;
}

// ===== 7. LOAD POSTS =====
async function loadItems() {
  const { data, error } = await db
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  items = data;
  render();
}

// ===== 8. SHRINK A PHOTO (returns a small JPEG file) =====
function shrinkImage(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      const img = new Image();

      img.onload = function () {
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);

        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(function (blob) {
          resolve(blob);
        }, "image/jpeg", 0.75);
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== 9. WHEN A PHOTO IS TAKEN OR CHOSEN =====
function handlePhotoPick(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile = file;
    photoStatus.textContent = "Photo selected ✓";
  }
}

cameraInput.addEventListener("change", handlePhotoPick);
galleryInput.addEventListener("change", handlePhotoPick);

// ===== 10. MAP INSIDE THE FORM (pick a spot) =====
let map = null;
let marker = null;
let accuracyCircle = null;

function createMapIfNeeded() {
  mapBox.classList.add("open");

  if (!map) {
    map = L.map("pickMap").setView([20.5937, 78.9629], 5); // India overview

    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    });

    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles © Esri, Maxar, Earthstar Geographics"
      }
    );

    const terrain = L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)"
    });

    street.addTo(map);

    L.control.layers({
      "Street": street,
      "Satellite": satellite,
      "Terrain": terrain
    }).addTo(map);

    map.on("click", function (e) {
      removeAccuracyCircle();
      setPin(e.latlng.lat, e.latlng.lng);
      locationStatus.textContent = "Pin set ✓";
    });
  }

  setTimeout(function () {
    map.invalidateSize();
  }, 100);
}

function setPin(lat, lng) {
  pickedLocation = { lat: lat, lng: lng };

  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on("dragend", function () {
      const p = marker.getLatLng();
      pickedLocation = { lat: p.lat, lng: p.lng };
      removeAccuracyCircle();
      locationStatus.textContent = "Pin moved ✓";
    });
  } else {
    marker.setLatLng([lat, lng]);
  }
}

function removeAccuracyCircle() {
  if (accuracyCircle) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

function resetMap() {
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
  removeAccuracyCircle();
  mapBox.classList.remove("open");
}

pinBtn.addEventListener("click", function () {
  createMapIfNeeded();
  locationStatus.textContent = "Zoom in and tap the map to place the pin.";
});

autoBtn.addEventListener("click", function () {
  createMapIfNeeded();

  if (!navigator.geolocation) {
    locationStatus.textContent = "Auto-detect is not supported here. Tap the map to place the pin.";
    return;
  }

  autoBtn.disabled = true;
  locationStatus.textContent = "Detecting your location...";

  navigator.geolocation.getCurrentPosition(
    function (position) {
      autoBtn.disabled = false;

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const meters = Math.round(position.coords.accuracy);

      setPin(lat, lng);

      removeAccuracyCircle();
      accuracyCircle = L.circle([lat, lng], { radius: position.coords.accuracy, weight: 1 }).addTo(map);
      map.fitBounds(accuracyCircle.getBounds(), { maxZoom: 18 });

      if (meters > 100) {
        locationStatus.textContent = "Detected, but only accurate to about " + meters + " m. Drag the pin to the exact spot.";
      } else {
        locationStatus.textContent = "Detected ✓ (about " + meters + " m). Drag the pin if it's off.";
      }
    },
    function () {
      autoBtn.disabled = false;
      locationStatus.textContent = "Could not detect location. Allow location access, or tap the map to place the pin.";
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
});

// ===== 11. WHATSAPP, SHARE, PHOTO VIEWER =====
// Turns what the user typed into digits only, with country code.
// A 10-digit number is treated as an Indian number (+91).
function cleanWhatsApp(raw) {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

// Link that opens WhatsApp with a ready-made message
function whatsappLink(item) {
  const text = item.type === "lost"
    ? 'Hi, I saw your LOST post "' + item.title + '" on Campus Lost & Found. I think I may have found it.'
    : 'Hi, I saw your FOUND post "' + item.title + '" on Campus Lost & Found. I think it may be mine.';
  return "https://wa.me/" + item.whatsapp + "?text=" + encodeURIComponent(text);
}

async function sharePost(item) {
  const text = (item.type === "lost" ? "LOST: " : "FOUND: ") + item.title +
    " at " + item.place + " (Campus Lost & Found)";
  const url = window.location.href.split("#")[0];

  if (navigator.share) {
    try {
      await navigator.share({ title: "Campus Lost & Found", text: text, url: url });
    } catch (e) {}
  } else {
    window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
  }
}

function openLightbox(src) {
  const overlay = document.createElement("div");
  overlay.className =
