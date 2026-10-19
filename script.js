// ===== 1. SUPABASE SETUP: paste YOUR values here =====
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";
// (never paste the secret / service_role key here)

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 2. PAGE ELEMENTS =====
const form = document.querySelector(".post-form:not(#loginBox)");
const postBtn = form.querySelector('button[type="submit"]');
const feed = document.getElementById("feed");
const feedStatus = document.getElementById("feedStatus");
const statsBox = document.getElementById("stats");
const cameraInput = document.getElementById("cameraPhoto");
const galleryInput = document.getElementById("galleryPhoto");
const photoStatus = document.getElementById("photoStatus");
const autoBtn = document.getElementById("autoBtn");
const pinBtn = document.getElementById("pinBtn");
const locationStatus = document.getElementById("locationStatus");
const mapBox = document.getElementById("mapBox");

const authBar = document.getElementById("authBar");
const loginBox = document.getElementById("loginBox");
const stepEmail = document.getElementById("stepEmail");
const stepCode = document.getElementById("stepCode");
const loginEmail = document.getElementById("loginEmail");
const loginCode = document.getElementById("loginCode");
const sendCodeBtn = document.getElementById("sendCodeBtn");
const verifyBtn = document.getElementById("verifyBtn");
const backBtn = document.getElementById("backBtn");
const loginStatus = document.getElementById("loginStatus");

const chatModal = document.getElementById("chatModal");
const chatTitle = document.getElementById("chatTitle");
const chatClose = document.getElementById("chatClose");
const threadList = document.getElementById("threadList");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

let items = [];            // posts loaded from Supabase
let itemsLoaded = false;   // true after the first load
let currentUser = null;    // the signed-in (email) user, or null
let isAdmin = false;       // true if the signed-in user is an admin
let selectedFile = null;   // photo chosen by the user
let pickedLocation = null; // pin {lat, lng}
let pendingEmail = "";     // email we sent a code to

// ===== 3. SIGN IN WITH EMAIL CODE =====
function updateAuthUI() {
  authBar.innerHTML = "";

  if (currentUser) {
    const who = document.createElement("span");
    who.textContent = "Signed in: " + currentUser.email + (isAdmin ? " (admin)" : "");

    const outBtn = document.createElement("button");
    outBtn.type = "button";
    outBtn.textContent = "Log out";
    outBtn.addEventListener("click", function () {
      db.auth.signOut();
    });

    authBar.append(who, outBtn);
    loginBox.hidden = true;
    form.hidden = false;
  } else {
    const inBtn = document.createElement("button");
    inBtn.type = "button";
    inBtn.textContent = "Sign in to post or chat";
    inBtn.addEventListener("click", function () {
      loginBox.hidden = false;
      loginBox.scrollIntoView({ behavior: "smooth" });
    });

    authBar.append(inBtn);
    form.hidden = true;
  }
}

function resetLoginSteps() {
  stepEmail.hidden = false;
  stepCode.hidden = true;
  loginCode.value = "";
  loginStatus.textContent = "";
}

async function checkAdmin() {
  isAdmin = false;
  if (currentUser) {
    const { data } = await db.rpc("is_admin");
    isAdmin = data === true;
  }
  updateAuthUI();
  if (itemsLoaded) render();
}

db.auth.onAuthStateChange(function (event, session) {
  const u = session ? session.user : null;
  currentUser = u && !u.is_anonymous ? u : null;
  isAdmin = false;

  updateAuthUI();
  if (!currentUser) {
    closeChat();
    resetLoginSteps();
  }
  if (itemsLoaded) render();

  setTimeout(checkAdmin, 0);
});

sendCodeBtn.addEventListener("click", async function () {
  const email = loginEmail.value.trim();
  if (!email || !email.includes("@")) {
    loginStatus.textContent = "Please enter a valid email.";
    return;
  }

  sendCodeBtn.disabled = true;
  loginStatus.textContent = "Sending code...";

  const { error } = await db.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: true }
  });

  sendCodeBtn.disabled = false;

  if (error) {
    loginStatus.textContent = "Could not send code: " + error.message;
    return;
  }

  pendingEmail = email;
  stepEmail.hidden = true;
  stepCode.hidden = false;
  loginStatus.textContent = "Code sent to " + email + ". Check your inbox and spam folder.";
});

verifyBtn.addEventListener("click", async function () {
  const code = loginCode.value.trim();
  if (!code) {
    loginStatus.textContent = "Enter the code from your email.";
    return;
  }

  verifyBtn.disabled = true;
  loginStatus.textContent = "Checking...";

  const { error } = await db.auth.verifyOtp({
    email: pendingEmail,
    token: code,
    type: "email"
  });

  verifyBtn.disabled = false;

  if (error) {
    loginStatus.textContent = "Wrong or expired code. " + error.message;
    return;
  }

  loginStatus.textContent = "";
  loginEmail.value = "";
  resetLoginSteps();
  // onAuthStateChange now updates the page
});

backBtn.addEventListener("click", resetLoginSteps);

// ===== 4. LOAD POSTS =====
async function loadItems() {
  const { data, error } = await db
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  items = data;
  itemsLoaded = true;
  render();
}

// ===== 5. SHRINK A PHOTO (returns a small JPEG file) =====
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

// ===== 6. WHEN A PHOTO IS TAKEN OR CHOSEN =====
function handlePhotoPick(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile = file;
    photoStatus.textContent = "Photo selected ✓";
  }
}

cameraInput.addEventListener("change", handlePhotoPick);
galleryInput.addEventListener("change", handlePhotoPick);

// ===== 7. MAP WITH STREET / SATELLITE / TERRAIN =====
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

// ===== 8. DELETE, AND MARK AS SOLVED =====
async function deleteItem(id) {
  const sure = confirm("Delete this post? This cannot be undone.");
  if (!sure) return;

  const { error } = await db.from("items").delete().eq("id", id);

  if (error) {
    alert("Could not delete: " + error.message);
    return;
  }

  await loadItems();
}

async function setSolved(id, solved) {
  if (!confirm(solved ? "Mark this case as solved?" : "Reopen this case?")) return;

  const { error } = await db
    .from("items")
    .update({ status: solved ? "solved" : "open" })
    .eq("id", id);

  if (error) {
    alert("Could not update: " + error.message);
    return;
  }

  await loadItems();
  if (solved) celebrate();
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

// ===== 9. CHAT =====
let chatItem = null;        // the item being chatted about
let chatThreadUser = null;  // the visitor id that identifies the thread
let chatChannel = null;     // live updates
let shownIds = new Set();   // message ids already on screen
let knownThreads = [];      // thread ids (owner/admin view)

// owner or admin: can see every conversation about the item
function isChatOwner() {
  return chatItem && currentUser && (chatItem.owner_id === currentUser.id || isAdmin);
}

// the real owner: the only one (besides the visitor) who can send messages
function isRealOwner() {
  return chatItem && currentUser && chatItem.owner_id === currentUser.id;
}

function addMessage(m) {
  if (shownIds.has(m.id)) return;
  shownIds.add(m.id);

  const bubble = document.createElement("div");
  bubble.className = "msg " + (m.sender_id === currentUser.id ? "mine" : "theirs");
  bubble.textContent = m.body;
  bubble.title = new Date(m.created_at).toLocaleString();
  chatMessages.append(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadMessages() {
  chatMessages.innerHTML = "";
  shownIds = new Set();

  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("item_id", chatItem.id)
    .eq("thread_user_id", chatThreadUser)
    .order("created_at", { ascending: true });

  if (error) {
    chatMessages.textContent = "Could not load messages: " + error.message;
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = isChatOwner() ? "No messages in this conversation yet." : "Say hello! Ask about this item.";
    chatMessages.append(empty);
  }

  data.forEach(addMessage);
}

function buildThreadList() {
  threadList.innerHTML = "";

  knownThreads.forEach(function (id, index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thread-btn" + (id === chatThreadUser ? " active" : "");
    btn.textContent = "Conversation " + (index + 1);
    btn.addEventListener("click", function () {
      chatThreadUser = id;
      chatForm.hidden = !isRealOwner();
      buildThreadList();
      loadMessages();
    });
    threadList.append(btn);
  });
}

async function loadThreads() {
  const { data, error } = await db
    .from("messages")
    .select("thread_user_id, created_at")
    .eq("item_id", chatItem.id)
    .order("created_at", { ascending: true });

  if (error) {
    chatMessages.textContent = "Could not load conversations: " + error.message;
    return;
  }

  knownThreads = [];
  data.forEach(function (m) {
    if (!knownThreads.includes(m.thread_user_id)) knownThreads.push(m.thread_user_id);
  });

  threadList.hidden = false;
  buildThreadList();

  if (knownThreads.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = "No one has messaged about this item yet.";
    chatMessages.append(empty);
  }
}

function subscribeChat() {
  unsubscribeChat();

  chatChannel = db
    .channel("chat-" + chatItem.id)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "item_id=eq." + chatItem.id },
      function (payload) {
        const m = payload.new;

        if (m.thread_user_id === chatThreadUser) {
          const empty = chatMessages.querySelector(".chat-empty");
          if (empty) empty.remove();
          addMessage(m);
        } else if (isChatOwner() && !knownThreads.includes(m.thread_user_id)) {
          knownThreads.push(m.thread_user_id);
          buildThreadList();
        }
      }
    )
    .subscribe();
}

function unsubscribeChat() {
  if (chatChannel) {
    db.removeChannel(chatChannel);
    chatChannel = null;
  }
}

async function openChat(item) {
  if (!currentUser) {
    alert("Please sign in to chat.");
    loginBox.hidden = false;
    loginBox.scrollIntoView({ behavior: "smooth" });
    return;
  }

  chatItem = item;
  chatThreadUser = null;
  chatMessages.innerHTML = "";
  threadList.hidden = true;
  chatForm.hidden = true;
  chatTitle.textContent = item.title;
  chatModal.hidden = false;

  if (isChatOwner()) {
    await loadThreads();
  } else {
    chatThreadUser = currentUser.id;
    chatForm.hidden = false;
    await loadMessages();
  }

  subscribeChat();
}

function closeChat() {
  unsubscribeChat();
  chatModal.hidden = true;
  chatItem = null;
  chatThreadUser = null;
}

chatClose.addEventListener("click", closeChat);

chatForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text || !chatItem || !chatThreadUser) return;

  chatInput.value = "";

  const { data, error } = await db
    .from("messages")
    .insert({
      item_id: chatItem.id,
      thread_user_id: chatThreadUser,
      body: text
    })
    .select()
    .single();

  if (error) {
    chatInput.value = text;
    alert("Could not send: " + error.message);
    return;
  }

  const empty = chatMessages.querySelector(".chat-empty");
  if (empty) empty.remove();
  addMessage(data);
});

// ===== 10. DRAW ALL POSTS ON THE PAGE =====
function render() {
  feed.innerHTML = "";

  const solvedCount = items.filter(function (i) { return i.status === "solved"; }).length;
  statsBox.textContent = items.length === 0 ? "" :
    "🎉 " + solvedCount + " reunited · 🔍 " + (items.length - solvedCount) + " still looking";

  if (items.length === 0) {
    feedStatus.textContent = "No posts yet. Be the first to post!";
    return;
  }
  feedStatus.textContent = "";

  // open cases first, solved ones after
  const sorted = items.slice().sort(function (a, b) {
    return (a.status === "solved") - (b.status === "solved");
  });

  sorted.forEach(function (item) {
    const solved = item.status === "solved";
    const isOwner = currentUser && item.owner_id === currentUser.id;
    const canManage = isOwner || isAdmin;

    const card = document.createElement("div");
    card.className = "card" + (solved ? " solved" : "");

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

    const heading = document.createElement("h2");
    heading.textContent = item.title;

    card.append(tag, heading);

    if (item.image_url) {
      const photo = document.createElement("img");
      photo.className = "item-photo";
      photo.src = item.image_url;
      photo.alt = item.title;
      card.append(photo);
    }

    const nameLine = document.createElement("p");
    nameLine.textContent = (item.type === "lost" ? "Lost by: " : "Found by: ") + item.name;

    const placeLine = document.createElement("p");
    placeLine.textContent = (item.type === "lost" ? "Lost" : "Found") + " at " + item.place;

    const dateLine = document.createElement("p");
    dateLine.textContent = "Date: " + new Date(item.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    card.append(nameLine, placeLine, dateLine);

    if (item.lat && item.lng) {
      const mapLink = document.createElement("a");
      mapLink.className = "map-link";
      mapLink.href = "https://www.google.com/maps?q=" + item.lat + "," + item.lng + "&t=k";
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = "📍 View on map";
      card.append(mapLink);
    }

    // Chat (hidden on solved cases for normal visitors)
    if (!solved || canManage) {
      const chatBtn = document.createElement("button");
      chatBtn.type = "button";
      chatBtn.className = "chat-btn";
      chatBtn.textContent = isOwner ? "💬 View messages"
        : (isAdmin ? "💬 View messages (admin)" : "💬 Chat about this item");
      chatBtn.addEventListener("click", function () {
        openChat(item);
      });
      card.append(chatBtn);
    }

    // Owner and admin buttons
    if (canManage) {
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
      deleteBtn.textContent = isOwner ? "🗑️ Delete my post" : "🗑️ Delete (admin)";
      deleteBtn.addEventListener("click", function () {
        deleteItem(item.id);
      });
      card.append(deleteBtn);
    }

    feed.append(card);
  });
}

// ===== 11. WHEN THE POST FORM IS SUBMITTED =====
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  postBtn.disabled = true;
  postBtn.textContent = "Posting...";

  try {
    // upload the photo (if any) to Supabase Storage, inside the user's own folder
    let imageUrl = null;
    if (selectedFile) {
      const blob = await shrinkImage(selectedFile);
      const path = currentUser.id + "/" + Date.now() + ".jpg";

      const upload = await db.storage
        .from("item-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upload.error) throw upload.error;

      imageUrl = db.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
    }

    // save the post
    const result = await db.from("items").insert({
      type: document.getElementById("type").value,
      name: document.getElementById("name").value.trim(),
      title: document.getElementById("title").value.trim(),
      place: document.getElementById("place").value.trim(),
      image_url: imageUrl,
      lat: pickedLocation ? pickedLocation.lat : null,
      lng: pickedLocation ? pickedLocation.lng : null
    });
    if (result.error) throw result.error;

    await loadItems();

    // reset the form
    form.reset();
    selectedFile = null;
    pickedLocation = null;
    photoStatus.textContent = "";
    locationStatus.textContent = "";
    if (map) resetMap();
  } catch (err) {
    console.error(err);
    alert("Could not post: " + (err.message || err));
  } finally {
    postBtn.disabled = false;
    postBtn.textContent = "Post";
  }
});

// ===== 12. START =====
async function start() {
  feedStatus.textContent = "Loading posts...";
  try {
    // remove any old anonymous session left over from the previous version
    const { data } = await db.auth.getSession();
    if (data.session && data.session.user.is_anonymous) {
      await db.auth.signOut();
    }

    await loadItems();
  } catch (err) {
    console.error(err);
    feedStatus.textContent = "Could not connect to the database. Check your keys.";
  }
}

start();
