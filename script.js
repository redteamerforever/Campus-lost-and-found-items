// ===== 1. SUPABASE SETUP =====
// Only the publishable (anon) key belongs here. Never put a service_role key in frontend code.
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";

const { createClient } = supabase;
// FIX: the old `global.headers` block (with Authorization: Bearer <anon key>) was removed.
// It overrode the logged-in user's token, so auth.uid() was always null and RLS blocked updates.
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// ===== 1b. BANNED WORDS (whole-word matching, so "phone", "library", "class" are safe) =====
const BANNED_WORDS_LIBRARY = (function () {
  const WORDS = [
    // English profanity
    "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch", "asshole",
    "dumbass", "dick", "dickhead", "cock", "pussy", "cunt", "twat", "whore", "slut",
    "bastard", "stfu", "gtfo",
    // Hinglish profanity
    "bhosdi", "bhosdike", "bhosdika", "madarchod", "madarchoot", "behenchod", "bhenchod",
    "behenchoot", "gaandu", "gaand", "lund", "chut", "chutia", "chutiya", "lavde", "lavda",
    "harami", "haramzada", "randi", "bhadwa", "bhadwi", "kamina", "kamine",
    // Explicit / intimate items
    "nude", "naked", "nipple", "nipples", "boob", "boobs", "breast", "breasts",
    "underwear", "undies", "panties", "panty", "bra", "lingerie", "thong", "chaddi", "kaccha", "langot"
  ];

  const LEET = { "@": "a", "$": "s", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "!": "i" };

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[@$013457!]/g, function (c) { return LEET[c]; });
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // one regex per word, matching only whole words
  const patterns = WORDS.map(function (word) {
    return { word: word, re: new RegExp("(^|[^a-z0-9])" + escapeRegex(word) + "($|[^a-z0-9])", "i") };
  });

  function getBannedWordsFound(text) {
    if (!text || typeof text !== "string") return [];
    const versions = [text.toLowerCase(), normalize(text)];
    const found = new Set();
    patterns.forEach(function (p) {
      if (versions.some(function (v) { return p.re.test(v); })) found.add(p.word);
    });
    return Array.from(found);
  }

  function containsBannedWords(text) {
    return getBannedWordsFound(text).length > 0;
  }

  return { containsBannedWords: containsBannedWords, getBannedWordsFound: getBannedWordsFound };
})();

// ===== 2. CATEGORIES =====
const CATEGORIES = {
  wallet: "👛 Wallet",
  phone: "📱 Phone",
  keys: "🔑 Keys",
  id: "🪪 ID / Cards",
  bag: "🎒 Bag",
  books: "📚 Books",
  electronics: "💻 Electronics",
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

const POST_BUTTON_TEXT = "➕ Post an item";

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
categorySelect.innerHTML = "";
categoryFilter.innerHTML = "";
categoryFilter.append(new Option("All categories", "all"));
Object.keys(CATEGORIES).forEach(function (key) {
  categorySelect.append(new Option(CATEGORIES[key], key));
  categoryFilter.append(new Option(CATEGORIES[key], key));
});
categoryFilter.value = "all";

// ===== ADMIN CONFIG =====
// Add admin emails here - these users get full access
const ADMIN_EMAILS = [
  "admin@yourdomain.com",      // Replace with your admin email
  "your-email@gmail.com",      // Your email for testing
];

function isAdmin(session) {
  return session?.user?.email && ADMIN_EMAILS.includes(session.user.email.toLowerCase());
}

let isAdminUser = false;

function sanitizeInput(text) {
  return String(text || "").trim().slice(0, 500);
}

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
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
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

// ===== 5. DARK MODE (always dark) =====
function applyTheme() {
  document.body.classList.add("dark");
  document.body.classList.remove("light");
  if (themeBtn) themeBtn.textContent = "🌙";
}
applyTheme();
if (themeBtn) themeBtn.addEventListener("click", applyTheme);

// ===== 5a. OPEN / CLOSE THE FORM =====
// Resets the form completely, clears edit mode, and restores the button text.
function closeForm() {
  form.reset();
  delete form.dataset.editId;
  selectedFile = null;
  pickedLocation = null;
  photoStatus.textContent = "";
  locationStatus.textContent = "";
  if (map) resetMap();
  form.hidden = true;
  openPostBtn.textContent = POST_BUTTON_TEXT;
  postBtn.textContent = "Post";
}

openPostBtn.addEventListener("click", function () {
  if (!form.hidden) {
    // form is open (new post or edit): close and cancel
    closeForm();
    return;
  }
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
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

// ===== 6. AUTHENTICATION =====
// Elements
const authNotLoggedIn = document.getElementById("authNotLoggedIn");
const authLoggedIn = document.getElementById("authLoggedIn");
const userEmailEl = document.getElementById("userEmail");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authModal = document.getElementById("authModal");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const switchToSignup = document.getElementById("switchToSignup");
const switchToLogin = document.getElementById("switchToLogin");
const doLoginBtn = document.getElementById("doLoginBtn");
const doSignupBtn = document.getElementById("doSignupBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupConfirm = document.getElementById("signupConfirm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");
const modalClose = authModal?.querySelector(".modal-close");

// Admin elements
const adminBtn = document.getElementById("adminBtn");
const adminModal = document.getElementById("adminModal");

// Auth state
let isAuthInitialized = false;

function updateAuthUI(session) {
  const loggedIn = !!session;
  if (authNotLoggedIn) authNotLoggedIn.hidden = loggedIn;
  if (authLoggedIn) authLoggedIn.hidden = !loggedIn;
  if (userEmailEl && session?.user?.email) userEmailEl.textContent = session.user.email;
  
  // Show admin button for admin users
  if (adminBtn) adminBtn.hidden = !isAdmin(session);
}

function showAuthError(el, msg) {
  if (el) { el.textContent = msg; el.hidden = false; }
}

function hideAuthError(el) {
  if (el) el.hidden = true;
}

function showModal(formId) {
  if (!authModal) return;
  authModal.hidden = false;
  document.querySelectorAll(".auth-form").forEach(f => f.hidden = true);
  const form = document.getElementById(formId);
  if (form) form.hidden = false;
  hideAuthError(loginError);
  hideAuthError(signupError);
}

function hideModal() {
  if (authModal) authModal.hidden = true;
}

// Auth modal events
if (loginBtn) loginBtn.addEventListener("click", () => showModal("loginForm"));
if (signupBtn) signupBtn.addEventListener("click", () => showModal("signupForm"));
if (switchToSignup) switchToSignup.addEventListener("click", () => showModal("signupForm"));
if (switchToLogin) switchToLogin.addEventListener("click", () => showModal("loginForm"));
if (modalClose) modalClose.addEventListener("click", hideModal);
if (authModal) authModal.addEventListener("click", e => { if (e.target === authModal) hideModal(); });

// Admin modal events
if (adminBtn) adminBtn.addEventListener("click", openAdminModal);
const adminModalClose = adminModal?.querySelector(".modal-close");
if (adminModalClose) adminModalClose.addEventListener("click", () => { if (adminModal) adminModal.hidden = true; });
if (adminModal) adminModal.addEventListener("click", e => { if (e.target === adminModal) { adminModal.hidden = true; } });

// Admin action handlers
const adminDeleteAll = document.getElementById("adminDeleteAll");
const adminExportData = document.getElementById("adminExportData");
if (adminDeleteAll) adminDeleteAll.addEventListener("click", adminDeleteAllPosts);
if (adminExportData) adminExportData.addEventListener("click", adminExportAllData);

// Login
if (doLoginBtn) doLoginBtn.addEventListener("click", async () => {
  hideAuthError(loginError);
  const email = loginEmail?.value?.trim();
  const password = loginPassword?.value;
  if (!email || !password) { showAuthError(loginError, "Enter email and password"); return; }
  doLoginBtn.disabled = true; doLoginBtn.textContent = "Logging in...";
  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    hideModal();
    loginForm.reset();
  } catch (err) {
    showAuthError(loginError, err.message);
  } finally {
    doLoginBtn.disabled = false; doLoginBtn.textContent = "Login";
  }
});

// Signup
if (doSignupBtn) doSignupBtn.addEventListener("click", async () => {
  hideAuthError(signupError);
  const email = signupEmail?.value?.trim();
  const password = signupPassword?.value;
  const confirm = signupConfirm?.value;
  if (!email || !password) { showAuthError(signupError, "Enter email and password"); return; }
  if (password !== confirm) { showAuthError(signupError, "Passwords do not match"); return; }
  if (password.length < 6) { showAuthError(signupError, "Password must be at least 6 characters"); return; }
  doSignupBtn.disabled = true; doSignupBtn.textContent = "Creating account...";
  try {
    const { error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    toast("Account created! Check your email to confirm.", "success");
    showModal("loginForm");
    signupForm.reset();
  } catch (err) {
    showAuthError(signupError, err.message);
  } finally {
    doSignupBtn.disabled = false; doSignupBtn.textContent = "Create Account";
  }
});

// Logout
if (logoutBtn) logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
});

// Initialize auth - check existing session
async function initAuth() {
  if (isAuthInitialized) return;
  isAuthInitialized = true;
  
  const { data: { session } } = await db.auth.getSession();
  updateAuthUI(session);
  if (session) currentUserId = session.user.id;
  isAdminUser = isAdmin(session); // Set initial admin state
  
  // Listen for auth changes
  db.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session);
    currentUserId = session?.user?.id || null;
    isAdminUser = isAdmin(session);
    if (items.length) render();
  });
  
  // If no session, fall back to anonymous for posting
  if (!session) {
    await ensureAnonymous();
  }
}

async function ensureAnonymous() {
  if (currentUserId) return currentUserId;
  if (signInPromise) return signInPromise;
  
  signInPromise = (async () => {
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

// ===== 7. LOAD POSTS =====
async function loadItems() {
  await ensureAnonymous(); // Ensure we have a user (anon or real)
  const { data, error } = await db
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  items = data;
  render();
}

// ===== 8. SHRINK A PHOTO (returns a small JPEG blob) =====
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
      { maxZoom: 19, attribution: "Tiles © Esri, Maxar, Earthstar Geographics" }
    );

    const terrain = L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)"
    });

    street.addTo(map);

    L.control.layers({ "Street": street, "Satellite": satellite, "Terrain": terrain }).addTo(map);

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
// A 10-digit number is treated as an Indian number (+91).
function cleanWhatsApp(raw) {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

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

// ===== 12. DELETE, MARK AS SOLVED, EDIT, CONFETTI =====
async function deleteItem(id) {
  if (!confirm("Delete this post? This cannot be undone.")) return;

  const { data: rows, error } = await db
    .from("items")
    .delete()
    .eq("id", id)
    .eq("owner_id", currentUserId)
    .select();

  if (error) {
    toast("Could not delete: " + error.message, "error");
    return;
  }
  if (!rows || rows.length === 0) {
    toast("Delete was blocked (no rows changed). Check RLS policies / login.", "error");
    return;
  }

  toast("Post deleted");
  await loadItems();
}

async function setSolved(id, solved) {
  if (!confirm(solved ? "Mark this case as solved?" : "Reopen this case?")) return;

  const { data: rows, error } = await db
    .from("items")
    .update({ status: solved ? "solved" : "open" })
    .eq("id", id)
    .eq("owner_id", currentUserId)
    .select();

  if (error) {
    toast("Could not update: " + error.message, "error");
    return;
  }
  if (!rows || rows.length === 0) {
    toast("Update was blocked (no rows changed). Check RLS policies / login.", "error");
    return;
  }

  await loadItems();
  if (solved) {
    celebrate();
    toast("Case solved! 🎉", "success");
  }
}

function editItem(item) {
  // clear leftovers from any previous pin
  if (map) resetMap();

  document.getElementById("type").value = item.type || "lost";
  updatePlaceHint();
  categorySelect.value = item.category || "other";
  document.getElementById("name").value = item.name || "";
  document.getElementById("title").value = item.title || "";
  document.getElementById("description").value = item.description || "";
  document.getElementById("place").value = item.place || "";
  document.getElementById("whatsapp").value = item.whatsapp
    ? (item.whatsapp.startsWith("91") ? item.whatsapp.slice(2) : item.whatsapp)
    : "";

  selectedFile = null;
  pickedLocation = item.lat && item.lng ? { lat: item.lat, lng: item.lng } : null;
  photoStatus.textContent = item.image_url ? "Existing photo will be kept unless replaced" : "";
  locationStatus.textContent = pickedLocation ? "Previous location kept" : "";

  // show the existing pin on the map so it can be moved
  if (pickedLocation) {
    createMapIfNeeded();
    setPin(pickedLocation.lat, pickedLocation.lng);
    map.setView([pickedLocation.lat, pickedLocation.lng], 17);
  }

  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
  openPostBtn.textContent = "Cancel edit";
  postBtn.textContent = "Save edit";

  form.dataset.editId = item.id;
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

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "delete-btn";
      editBtn.textContent = "✏️ Edit my post";
      editBtn.addEventListener("click", function () {
        editItem(item);
      });
      card.append(editBtn);

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

  // check the text fields for banned words
  const fields = {
    Name: document.getElementById("name").value,
    Title: document.getElementById("title").value,
    Description: document.getElementById("description").value,
    Place: document.getElementById("place").value
  };
  const violations = [];
  Object.keys(fields).forEach(function (label) {
    const found = BANNED_WORDS_LIBRARY.getBannedWordsFound(fields[label]);
    if (found.length) violations.push(label + ": " + found.join(", "));
  });
  if (violations.length > 0) {
    toast("Inappropriate content detected: " + violations.join("; "), "error");
    return;
  }

  const editId = form.dataset.editId;
  postBtn.disabled = true;
  postBtn.textContent = editId ? "Saving..." : "Posting...";

  try {
    await ensureAnonymous(); // Use anonymous if not logged in

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

    const fieldsToSave = {
      type: sanitizeInput(document.getElementById("type").value),
      category: sanitizeInput(categorySelect.value),
      name: sanitizeInput(fields.Name),
      title: sanitizeInput(fields.Title),
      place: sanitizeInput(fields.Place),
      description: sanitizeInput(fields.Description),
      whatsapp: whatsapp,
      lat: pickedLocation ? pickedLocation.lat : null,
      lng: pickedLocation ? pickedLocation.lng : null
    };

    if (editId) {
      // keep the old photo unless a new one was chosen
      if (imageUrl !== null) fieldsToSave.image_url = imageUrl;

      const { data: rows, error } = await db
        .from("items")
        .update(fieldsToSave)
        .eq("id", editId)
        .eq("owner_id", currentUserId)
        .select();

      if (error) throw error;
      // FIX: RLS blocks updates silently (0 rows, no error), so check for it
      if (!rows || rows.length === 0) {
        throw new Error("Update was blocked (no rows changed). Check RLS policies / login.");
      }

      items = items.map(function (i) { return i.id === editId ? rows[0] : i; });
      render();
    } else {
      fieldsToSave.image_url = imageUrl;
      fieldsToSave.owner_id = currentUserId;

      const { error } = await db.from("items").insert(fieldsToSave);
      if (error) throw error;

      await loadItems();
    }

    closeForm();
    toast(editId ? "Updated! ✏️" : "Posted! 🎉", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    toast("Could not save: " + (err.message || err), "error");
  } finally {
    postBtn.disabled = false;
    postBtn.textContent = form.dataset.editId ? "Save edit" : "Post";
  }
});

// ===== 17. START =====
async function start() {
  feedStatus.textContent = "Loading posts...";

  try {
    await initAuth();
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

// ===== ADMIN FUNCTIONS =====
function openAdminModal() {
  if (!adminModal) return;
  if (!isAdminUser) { toast("Admin access denied", "error"); return; }
  adminModal.hidden = false;
  refreshAdminStats();
  renderAdminPostsList();
}

function refreshAdminStats() {
  const now = Date.now();
  const active = items.filter(i => new Date(i.expires_at).getTime() > now);
  const solved = items.filter(i => i.status === "solved");
  const elTotal = document.getElementById("adminTotalPosts");
  const elActive = document.getElementById("adminActivePosts");
  const elSolved = document.getElementById("adminSolvedPosts");
  if (elTotal) elTotal.textContent = items.length;
  if (elActive) elActive.textContent = active.length;
  if (elSolved) elSolved.textContent = solved.length;
}

function renderAdminPostsList() {
  const container = document.getElementById("adminPostsList");
  if (!container) return;
  container.innerHTML = "";
  
  const now = Date.now();
  const sorted = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  sorted.forEach(item => {
    const expired = new Date(item.expires_at).getTime() <= now;
    const row = document.createElement("div");
    row.className = "admin-post-row";
    row.innerHTML = `
      <div class="admin-post-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="admin-post-meta">
          ${escapeHtml(item.name)} · ${escapeHtml(item.place)} · ${item.type.toUpperCase()}
          ${item.status === "solved" ? " · ✅ Solved" : ""}
          ${expired ? " · ⏰ Expired" : ""}
        </span>
      </div>
      <button class="btn-danger btn-sm admin-delete-single" data-id="${item.id}">Delete</button>
    `;
    container.append(row);
  });
  
  // Attach delete handlers
  container.querySelectorAll(".admin-delete-single").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete this post permanently?")) return;
      await adminDeletePost(id);
    });
  });
}

async function adminDeletePost(id) {
  if (!isAdminUser) return;
  const { error } = await db.from("items").delete().eq("id", id);
  if (error) { toast("Delete failed: " + error.message, "error"); return; }
  toast("Post deleted");
  items = items.filter(i => i.id !== id);
  render();
  refreshAdminStats();
  renderAdminPostsList();
}

async function adminDeleteAllPosts() {
  if (!isAdminUser) return;
  if (!confirm("⚠️ Delete ALL posts? This cannot be undone!")) return;
  if (!confirm("Are you absolutely sure?")) return;
  
  const { error } = await db.from("items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { toast("Delete failed: " + error.message, "error"); return; }
  
  toast("All posts deleted");
  items = [];
  render();
  refreshAdminStats();
  renderAdminPostsList();
}

function adminExportAllData() {
  if (!isAdminUser) return;
  const data = JSON.stringify(items, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lost-found-export-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Data exported");
}

// ===== 18. CURSOR + TOUCH LIGHT =====
(function () {
  try {
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

    if (isTouchDevice) root.style.setProperty("--glow-on", "0");

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

    function lightBox(clientX, clientY, el) {
      const box = el && el.closest ? el.closest(BOXES) : null;

      if (litBox && litBox !== box) litBox.classList.remove("lit");
      litBox = box;
      if (!box) return;

      const r = box.getBoundingClientRect();
      box.style.setProperty("--mx", (clientX - r.left) + "px");
      box.style.setProperty("--my", (clientY - r.top) + "px");
      box.classList.add("lit");
    }

    function moveLight(clientX, clientY, el) {
      targetX = lastX = clientX;
      targetY = lastY = clientY;
      clearTimeout(fadeTimer);
      root.style.setProperty("--glow-on", "1");
      startTick();
      lightBox(clientX, clientY, el);
    }

    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      moveLight(e.clientX, e.clientY, e.target);
    }, { passive: true });

    function onTouch(e) {
      const t = e.touches[0];
      if (!t) return;
      touching = true;
      moveLight(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY));
    }

    function onTouchEnd() {
      touching = false;
      clearTimeout(fadeTimer);
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

    let scrollQueued = false;
    window.addEventListener("scroll", function () {
      if (touching || scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () {
        scrollQueued = false;
        lightBox(lastX, lastY, document.elementFromPoint(lastX, lastY));
      });
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", function () {
      root.style.setProperty("--glow-on", "0");
    });
    document.documentElement.addEventListener("mouseenter", function () {
      root.style.setProperty("--glow-on", "1");
    });
  } catch (e) {}
})();
