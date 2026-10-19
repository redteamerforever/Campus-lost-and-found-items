// ===== 1. SUPABASE SETUP: paste YOUR values here =====
const SUPABASE_URL = "https://acqqbhaoukjarnijhgte.supabase.co";
const SUPABASE_KEY = "sb_publishable_B6pOoK4snvxsILZmtuPPoQ_ecFBcDLc";
// (never paste the secret / service_role key here)

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 2. PAGE ELEMENTS =====
const form = document.querySelector(".post-form");
const postBtn = form.querySelector('button[type="submit"]');
const feed = document.getElementById("feed");
const feedStatus = document.getElementById("feedStatus");
const cameraInput = document.getElementById("cameraPhoto");
const galleryInput = document.getElementById("galleryPhoto");
const photoStatus = document.getElementById("photoStatus");
const autoBtn = document.getElementById("autoBtn");
const pinBtn = document.getElementById("pinBtn");
const locationStatus = document.getElementById("locationStatus");
const mapBox = document.getElementById("mapBox");

let items = [];            // posts loaded from Supabase
let currentUserId = null;  // this browser's anonymous user id
let selectedFile = null;   // photo chosen by the user
let pickedLocation = null; // pin {lat, lng}

// ===== 3. SIGN IN (anonymous, automatic) =====
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

// ===== 4. LOAD POSTS =====
async function loadItems() {
  const { data, error } = await db
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  items = data;
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

// ===== 8. DELETE ONE OF MY OWN POSTS =====
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

// ===== 9. DRAW ALL POSTS ON THE PAGE =====
function render() {
  feed.innerHTML = "";

  if (items.length === 0) {
    feedStatus.textContent = "No posts yet. Be the first to post!";
    return;
  }
  feedStatus.textContent = "";

  items.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "card";

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

    const contactLine = document.createElement("p");
    contactLine.textContent = "Contact: " + item.contact;

    const dateLine = document.createElement("p");
    dateLine.textContent = "Date: " + new Date(item.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    card.append(nameLine, placeLine, contactLine, dateLine);

    if (item.lat && item.lng) {
      const mapLink = document.createElement("a");
      mapLink.className = "map-link";
      mapLink.href = "https://www.google.com/maps?q=" + item.lat + "," + item.lng + "&t=k";
      mapLink.target = "_blank";
      mapLink.rel = "noopener";
      mapLink.textContent = "📍 View on map";
      card.append(mapLink);
    }

    // Delete button: only on posts that belong to this browser
    if (item.owner_id === currentUserId) {
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
}

// ===== 10. WHEN THE FORM IS SUBMITTED =====
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  postBtn.disabled = true;
  postBtn.textContent = "Posting...";

  try {
    await ensureSignedIn();

    // upload the photo (if any) to Supabase Storage
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
      name: document.getElementById("name").value,
      title: document.getElementById("title").value,
      place: document.getElementById("place").value,
      contact: document.getElementById("contact").value,
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

// ===== 11. START =====
async function start() {
  feedStatus.textContent = "Loading posts...";
  try {
    await ensureSignedIn();
    await loadItems();
  } catch (err) {
    console.error(err);
    feedStatus.textContent = "Could not connect to the database. Check your keys and that anonymous sign-ins are on.";
  }
}

start();
