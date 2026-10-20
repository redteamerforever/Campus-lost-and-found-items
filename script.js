// ===== 1. SUPABASE SETUP: paste YOUR values here =====
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";
// (never paste the secret / service_role key here)

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,      // keep the same anonymous user between visits
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

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
let signInPromise = null;  // makes sure only ONE sign-in runs at a time
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

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

// how long it took from posting to solving, e.g. "3 hours"
function timeBetween(startIso, endIso) {
  const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return mins + " min";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour" : " hours");
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day" : " days");
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

// ===== 5b. CHANGE THE "WHERE?" HINT FOR LOST / FOUND =====
const typeSelect = document.getElementById("type");
const placeInput = document.getElementById("place");

function updatePlaceHint() {
  placeInput.placeholder = typeSelect.value === "lost"
    ? "Where did you lose it? (e.g. Library, 2nd floor)"
    : "Where did you find it? (e.g. Canteen, near the gate)";
}

typeSelect.addEventListener("change", updatePlaceHint);
form.addEventListener("reset", function () {
  setTimeout(updatePlaceHint, 0);
});
updatePlaceHint();

// ===== 6. SIGN IN (anonymous, automatic, nothing to see) =====
// Only one sign-in can run at a time, so we never create two different
// anonymous users by accident (that would split your posts between them).
async function ensureSignedIn() {
  if (signInPromise) return signInPromise;

  signInPromise = (async function () {
    const { data } = await db.auth.getSession();
    if (data.session) {
      currentUserId = data.session.user.id;
      return currentUserId;
    }

    const result = await db.auth.signInAnonymously();
    if (result.error) throw result.error;
    currentUserId = result.data.user.id;
    return currentUserId;
  })();

  try {
    return await signInPromise;
  } finally {
    signInPromise = null;
  }
}

// Keep currentUserId equal to the user that is REALLY signed in, and redraw
// the cards so the Delete / Solved buttons match.
db.auth.onAuthStateChange(function (event, session) {
  const newId = session && session.user ? session.user.id : null;
  if (newId && newId !== currentUserId) {
    currentUserId = newId;
    if (items.length) render();
  }
});

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
      if (!mapBox.classList.contains("open")) return;

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
      if (!mapBox.classList.contains("open")) return;
      locationStatus.textContent = "Could not detect location. Allow location access, tap the map to place the pin, or press ✕ to skip.";
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
});

// ✕ button: close the map and skip the location
const mapCloseBtn = document.getElementById("mapCloseBtn");
if (mapCloseBtn) {
  mapCloseBtn.addEventListener("click", function () {
    if (map) resetMap();
    pickedLocation = null;
    autoBtn.disabled = false;
    locationStatus.textContent = "Location skipped. Your post will have no map location.";
  });
}

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
  overlay.className = "lightbox";
  const img = document.createElement("img");
  img.src = src;
  overlay.append(img);
  overlay.addEventListener("click", function () {
    overlay.remove();
  });
  document.body.append(overlay);
}

// ===== 12. DELETE, MARK AS SOLVED, CONFETTI =====
async function deleteItem(id) {
  const sure = confirm("Delete this post? This cannot be undone.");
  if (!sure) return;

  const { error } = await db.from("items").delete().eq("id", id);

  if (error) {
    toast("Could not delete: " + error.message, "error");
    return;
  }

  toast("Post deleted");
  await loadItems();
}

async function setSolved(id, solved) {
  if (!confirm(solved ? "Mark this case as solved?" : "Reopen this case?")) return;

  const { error } = await db
    .from("items")
    .update({
      status: solved ? "solved" : "open",
      solved_at: solved ? new Date().toISOString() : null
    })
    .eq("id", id);

  if (error) {
    toast("Could not update: " + error.message, "error");
    return;
  }

  await loadItems();
  if (solved) {
    celebrate();
    toast("Case solved! 🎉", "success");
  }
}

function celebrate() {
  const emojis = ["🎉", "✨", "🎊", "💙"];
  for (let i = 0; i < 30; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.textContent = emojis[i % emojis.length];
    s.style.left = Math.random() * 100 + "vw";
    s.style.animationDelay = Math.random() * 0.8 + "s";
    document.body.append(s);
    setTimeout(function () { s.remove(); }, 3500);
  }
}

// ===== 13. SEARCH, FILTER, SORT, LIST / MAP TABS =====
searchInput.addEventListener("input", function () {
  searchText = searchInput.value.trim().toLowerCase();
  refitNext = true;
  render();
});

categoryFilter.addEventListener("change", function () {
  categoryType = categoryFilter.value;
  refitNext = true;
  render();
});

chips.forEach(function (chip) {
  chip.addEventListener("click", function () {
    filterType = chip.dataset.filter;
    chips.forEach(function (c) {
      c.classList.toggle("active", c === chip);
    });
    refitNext = true;
    render();
  });
});

sortSelect.addEventListener("change", function () {
  sortType = sortSelect.value;

  if (sortType === "nearest" && !userPos) {
    if (!navigator.geolocation) {
      toast("Location is not supported on this device.", "error");
      sortType = "newest";
      sortSelect.value = "newest";
      render();
      return;
    }

    toast("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      function (position) {
        userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
        render();
      },
      function () {
        toast("Could not get your location. Please allow location access.", "error");
        sortType = "newest";
        sortSelect.value = "newest";
        render();
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  } else {
    render();
  }
});

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    viewMode = tab.dataset.view;
    tabs.forEach(function (t) {
      t.classList.toggle("active", t === tab);
    });

    feed.hidden = viewMode === "map";
    viewMapBox.hidden = viewMode !== "map";

    if (viewMode === "map") {
      initViewMap();
      refitNext = true;
      setTimeout(function () {
        viewMap.invalidateSize();
        updateViewMap();
      }, 100);
    }
  });
});

// ===== 14. BIG MAP WITH ALL POSTS =====
let viewMap = null;
let viewLayer = null;

function initViewMap() {
  if (viewMap) return;

  viewMap = L.map("viewMap").setView([20.5937, 78.9629], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(viewMap);
  viewLayer = L.layerGroup().addTo(viewMap);
}

function updateViewMap() {
  if (!viewMap) return;

  viewLayer.clearLayers();
  const points = [];
  let missing = 0;

  lastList.forEach(function (item) {
    if (!(item.lat && item.lng)) {
      missing++;
      return;
    }

    let color = item.type === "lost" ? "rgb(220, 20, 60)" : "rgb(46, 139, 87)";
    if (item.status === "solved") color = "rgb(111, 134, 214)";

    const dot = L.circleMarker([item.lat, item.lng], {
      radius: 11,
      color: "rgb(255, 255, 255)",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95
    });

    const box = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = (CATEGORIES[item.category] || CATEGORIES.other) + " " + item.title;
    const where = document.createElement("div");
    where.textContent = item.place;
    box.append(title, where);

    if (item.status !== "solved" && item.owner_id !== currentUserId) {
      const link = document.createElement("a");
      link.href = whatsappLink(item);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "💬 WhatsApp";
      box.append(link);
    }

    dot.bindPopup(box);
    dot.addTo(viewLayer);
    points.push([item.lat, item.lng]);
  });

  if (points.length === 0) {
    mapNote.textContent = "No posts with a location to show.";
  } else {
    mapNote.textContent = missing > 0
      ? missing + " post(s) have no location and are not on the map."
      : "";
  }

  if (refitNext && points.length > 0) {
    viewMap.fitBounds(points, { maxZoom: 17, padding: [30, 30] });
  }
  refitNext = false;
}

// ===== 15. DRAW ALL POSTS ON THE PAGE =====
function render() {
  feed.innerHTML = "";

  const now = Date.now();

  // posts that have not expired yet
  const active = items.filter(function (item) {
    return new Date(item.expires_at).getTime() > now;
  });

  // counters at the top
  animateCount(statLost, active.filter(function (i) {
    return i.status !== "solved" && i.type === "lost";
  }).length);
  animateCount(statFound, active.filter(function (i) {
    return i.status !== "solved" && i.type === "found";
  }).length);
  animateCount(statSolved, active.filter(function (i) {
    return i.status === "solved";
  }).length);

  // apply filter chip, category and search box
  const list = active.filter(function (item) {
    const solved = item.status === "solved";

    if (filterType === "solved" && !solved) return false;
    if ((filterType === "lost" || filterType === "found") &&
        (solved || item.type !== filterType)) return false;

    if (categoryType !== "all" && item.category !== categoryType) return false;

    if (searchText) {
      const text = (item.title + " " + item.place + " " + item.name + " " + (item.description || "")).toLowerCase();
      if (!text.includes(searchText)) return false;
    }
    return true;
  });

  // distance from the visitor (only if they allowed location)
  list.forEach(function (item) {
    item._dist = userPos && item.lat && item.lng
      ? distanceKm(userPos.lat, userPos.lng, item.lat, item.lng)
      : null;
  });

  // sort: open cases first, solved after, then the chosen order
  list.sort(function (a, b) {
    const solvedDiff = (a.status === "solved") - (b.status === "solved");
    if (solvedDiff !== 0) return solvedDiff;

    if (sortType === "expiring") {
      return new Date(a.expires_at) - new Date(b.expires_at);
    }

    if (sortType === "nearest" && userPos) {
      const da = a._dist === null ? Infinity : a._dist;
      const dbb = b._dist === null ? Infinity : b._dist;
      if (da !== dbb) return da - dbb;
    }

    return new Date(b.created_at) - new Date(a.created_at);
  });

  lastList = list;
  if (viewMode === "map") updateViewMap();

  if (active.length === 0) {
    feedStatus.textContent = "No posts yet. Be the first to post!";
    return;
  }
  if (list.length === 0) {
    feedStatus.textContent = "No posts match your search.";
    return;
  }
  feedStatus.textContent = "";

  list.forEach(function (item) {
    const solved = item.status === "solved";
    const isOwner = !!currentUserId && item.owner_id === currentUserId;

    const card = document.createElement("div");
    card.className = "card" + (solved ? " solved" : "") + (firstRender ? " pop" : "");

    if (solved) {
      const banner = document.createElement("div");
      banner.className = "solved-banner";
      banner.textContent = "🎉 SOLVED CASE" + (item.solved_at
        ? " · " + new Date(item.solved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "");
      card.append(banner);
    }

    const tag = document.createElement("span");
    tag.className = "tag " + item.type;
    tag.textContent = item.type.toUpperCase();

    const catChip = document.createElement("span");
    catChip.className = "cat-chip";
    catChip.textContent = CATEGORIES[item.category] || CATEGORIES.other;

    const heading = document.createElement("h2");
    heading.textContent = item.title;

    card.append(tag, catChip);

    // small label so you can spot your own posts
    if (isOwner) {
      const ownChip = document.createElement("span");
      ownChip.className = "own-chip";
      ownChip.textContent = "👤 Your post";
      card.append(ownChip);
    }

    card.append(heading);

    if (item.image_url) {
      const photo = document.createElement("img");
      photo.className = "item-photo";
      photo.src = item.image_url;
      photo.alt = item.title;
      photo.addEventListener("click", function () {
        openLightbox(item.image_url);
      });
      card.append(photo);
    }

    if (item.description) {
      const desc = document.createElement("p");
      desc.className = "item-desc";
      desc.textContent = item.description;
      card.append(desc);
    }

    const nameLine = document.createElement("p");
    nameLine.textContent = (item.type === "lost" ? "Lost by: " : "Found by: ") + item.name;

    const placeLine = document.createElement("p");
    placeLine.className = "place-line";
    placeLine.textContent = "📍 " + (item.type === "lost" ? "Lost at: " : "Found at: ") + item.place;

    const timeLine = document.createElement("p");
    timeLine.textContent = "🕒 Posted " + formatDateTime(item.created_at) +
      " (" + timeAgo(item.created_at) + ")";

    card.append(nameLine, placeLine, timeLine);

    // when the case was resolved, and how long it took
    if (solved && item.solved_at) {
      const resolvedLine = document.createElement("p");
      resolvedLine.className = "resolved-line";
      resolvedLine.textContent = "✅ Resolved " + formatDateTime(item.solved_at) +
        " (" + timeAgo(item.solved_at) + ") · took " +
        timeBetween(item.created_at, item.solved_at);
      card.append(resolvedLine);
    }

    if (item._dist !== null) {
      const distLine = document.createElement("p");
      distLine.textContent = "📏 " + formatDistance(item._dist) + " away";
      card.append(distLine);
    }

    const daysLeft = Math.max(0, Math.ceil((new Date(item.expires_at).getTime() - now) / 86400000));
    const expiryLine = document.createElement("p");
    expiryLine.className = "expiry" + (daysLeft <= 3 ? " soon" : "");
    expiryLine.textContent = "⏳ " + (daysLeft === 0
      ? "Expires today"
      : "Expires in " + daysLeft + (daysLeft === 1 ? " day" : " days"));
    card.append(expiryLine);

    // map link + share button
    const actions = document.createElement("div");
    actions.className = "actions";

    if (item.lat && item.lng) {
      const mapLink = document.createElement("a");
      mapLink.className = "map-link";
      mapLink.href = "https://www.google.com/maps?q=" + item.lat + "," + item.lng + "&t=k";
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = "📍 View on map";
      actions.append(mapLink);
    }

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "share-btn";
    shareBtn.textContent = "🔗 Share";
    shareBtn.addEventListener("click", function () {
      sharePost(item);
    });
    actions.append(shareBtn);

    card.append(actions);

    // WhatsApp button: only for OTHER people, on open cases
    // (you should not message yourself on your own post)
    if (!solved && !isOwner) {
      const waBtn = document.createElement("a");
      waBtn.className = "wa-btn";
      waBtn.href = whatsappLink(item);
      waBtn.target = "_blank";
      waBtn.rel = "noopener noreferrer";
      waBtn.textContent = item.type === "lost"
        ? "💬 I found it · WhatsApp"
        : "💬 This is mine · WhatsApp";
      card.append(waBtn);
    }

    // Buttons only for the person who posted it
    if (isOwner) {
      const solveBtn = document.createElement("button");
      solveBtn.type = "button";
      solveBtn.className = solved ? "reopen-btn" : "solve-btn";
      solveBtn.textContent = solved ? "↩️ Reopen case"
        : (item.type === "lost" ? "✅ I got it back" : "✅ Returned to its owner");
      solveBtn.addEventListener("click", function () {
        setSolved(item.id, !solved);
      });
      card.append(solveBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "🗑️ Delete my post";
      deleteBtn.addEventListener("click", function () {
        deleteItem(item.id);
      });
      card.append(deleteBtn);
    }

    feed.append(card);
  });

  firstRender = false;
}

// ===== 16. WHEN THE FORM IS SUBMITTED =====
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const whatsapp = cleanWhatsApp(document.getElementById("whatsapp").value);
  if (!whatsapp) {
    toast("Please enter a valid WhatsApp number (10 digits, or with country code).", "error");
    return;
  }

  postBtn.disabled = true;
  postBtn.textContent = "Posting...";

  try {
    await ensureSignedIn();

    // upload the photo (if any) to Supabase Storage, inside your own folder
    let imageUrl = null;
    if (selectedFile) {
      const blob = await shrinkImage(selectedFile);
      const path = currentUserId + "/" + Date.now() + ".jpg";

      const upload = await db.storage
        .from("item-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upload.error) throw upload.error;

      imageUrl = db.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
    }

    // save the post
    const result = await db.from("items").insert({
      type: document.getElementById("type").value,
      category: categorySelect.value,
      name: document.getElementById("name").value.trim(),
      title: document.getElementById("title").value.trim(),
      place: document.getElementById("place").value.trim(),
      description: document.getElementById("description").value.trim(),
      whatsapp: whatsapp,
      image_url: imageUrl,
      lat: pickedLocation ? pickedLocation.lat : null,
      lng: pickedLocation ? pickedLocation.lng : null
    });
    if (result.error) throw result.error;

    await loadItems();

    // reset and close the form
    form.reset();
    selectedFile = null;
    pickedLocation = null;
    photoStatus.textContent = "";
    locationStatus.textContent = "";
    if (map) resetMap();
    form.hidden = true;

    toast("Posted! 🎉", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    toast("Could not post: " + (err.message || err), "error");
  } finally {
    postBtn.disabled = false;
    postBtn.textContent = "Post";
  }
});

// ===== 17. START =====
async function start() {
  feedStatus.textContent = "Loading posts...";

  // work out who this browser is (needed for the delete / solved buttons)
  try {
    await ensureSignedIn();
    // handy for testing: open the browser console (F12) to see it
    console.log("[Lost & Found] signed in as", currentUserId);
  } catch (err) {
    console.error(err);
  }

  try {
    await loadItems();
  } catch (err) {
    console.error(err);
    feedStatus.textContent = "Could not connect to the database. Check your keys.";
  }

  // refresh the feed by itself every minute
  setInterval(function () {
    loadItems().catch(function (err) {
      console.error(err);
    });
  }, 60000);
}

start();

// ===== 18. CURSOR + TOUCH LIGHT (feeds the glow effect in style.css) =====
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.documentElement;
  const BOXES = ".card, .stat-card, .post-form";
  const isTouchDevice = window.matchMedia("(hover: none)").matches;

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight * 0.25;
  let x = targetX;
  let y = targetY;
  let lastX = targetX;
  let lastY = targetY;
  let running = false;
  let touching = false;
  let litBox = null;
  let fadeTimer = null;

  // on phones the light stays hidden until a finger touches the screen
  if (isTouchDevice) root.style.setProperty("--glow-on", "0");

  // page glow: glides after the pointer / finger
  function tick() {
    x += (targetX - x) * 0.18;
    y += (targetY - y) * 0.18;
    root.style.setProperty("--cursor-x", x.toFixed(1) + "px");
    root.style.setProperty("--cursor-y", y.toFixed(1) + "px");

    if (Math.abs(targetX - x) > 0.5 || Math.abs(targetY - y) > 0.5) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function startTick() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  // spotlight inside the card / form under the pointer or finger
  function lightBox(clientX, clientY, el) {
    const box = el && el.closest ? el.closest(BOXES) : null;

    if (litBox && litBox !== box) litBox.classList.remove("lit");
    litBox = box;
    if (!box) return;

    const r = box.getBoundingClientRect();
    box.style.setProperty("--mx", (clientX - r.left) + "px");
    box.style.setProperty("--my", (clientY - r.top) + "px");
    if (touching) box.classList.add("lit"); // touch has no :hover, so we use a class
  }

  function moveLight(clientX, clientY, el) {
    targetX = lastX = clientX;
    targetY = lastY = clientY;
    clearTimeout(fadeTimer);
    root.style.setProperty("--glow-on", "1");
    startTick();
    lightBox(clientX, clientY, el);
  }

  // MOUSE and PEN
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    moveLight(e.clientX, e.clientY, e.target);
  }, { passive: true });

  // TOUCH: the light follows the finger, even while scrolling
  function onTouch(e) {
    const t = e.touches[0];
    if (!t) return;
    touching = true;
    // for touchmove, e.target stays the first element touched,
    // so we ask the browser what is under the finger right now
    moveLight(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY));
  }

  function onTouchEnd() {
    touching = false;
    clearTimeout(fadeTimer);
    // let the light linger for a moment, then fade it out
    fadeTimer = setTimeout(function () {
      root.style.setProperty("--glow-on", "0");
      if (litBox) litBox.classList.remove("lit");
      litBox = null;
    }, 700);
  }

  window.addEventListener("touchstart", onTouch, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });

  // mouse users: when you scroll, cards move under a still mouse
  let scrollQueued = false;
  window.addEventListener("scroll", function () {
    if (touching || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      lightBox(lastX, lastY, document.elementFromPoint(lastX, lastY));
    });
  }, { passive: true });

  // mouse users: fade the glow when the mouse leaves the window
  document.documentElement.addEventListener("mouseleave", function () {
    root.style.setProperty("--glow-on", "0");
  });
  document.documentElement.addEventListener("mouseenter", function () {
    root.style.setProperty("--glow-on", "1");
  });
})();
