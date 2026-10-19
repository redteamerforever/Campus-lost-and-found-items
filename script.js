const form = document.querySelector(".post-form");
const feed = document.getElementById("feed");
const cameraInput = document.getElementById("cameraPhoto");
const galleryInput = document.getElementById("galleryPhoto");
const photoStatus = document.getElementById("photoStatus");
const autoBtn = document.getElementById("autoBtn");
const pinBtn = document.getElementById("pinBtn");
const locationStatus = document.getElementById("locationStatus");
const mapBox = document.getElementById("mapBox");

let selectedFile = null;   // photo chosen by the user
let pickedLocation = null; // pin {lat, lng}

// 1. Load saved items (or start with example items)
let items = JSON.parse(localStorage.getItem("items"));

if (!items) {
  items = [
    { type: "lost", name: "Rahul", title: "Blue Water Bottle", place: "near the library", contact: "98XXXXXXXX", date: "16 Oct 2026", image: "" },
    { type: "found", name: "Priya", title: "American Tourister Backpack", place: "Auditorium", contact: "98XXXXXXXX", date: "16 Oct 2026", image: "" },
  ];
}

// IDs of the posts made from THIS browser (only these can be deleted)
let myPosts = JSON.parse(localStorage.getItem("myPosts")) || [];

// 2. Save to the browser
function saveItems() {
  try {
    localStorage.setItem("items", JSON.stringify(items));
  } catch (error) {
    alert("Storage is full. Try a smaller photo or clear old posts.");
  }
}

function saveMyPosts() {
  localStorage.setItem("myPosts", JSON.stringify(myPosts));
}

// 3. Shrink a photo so it takes little space
function shrinkImage(file) {
  return new Promise(function (resolve) {
    const reader = new FileReader();

    reader.onload = function () {
      const img = new Image();

      img.onload = function () {
        const maxWidth = 600;
        const scale = Math.min(1, maxWidth / img.width);

        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

// 4. When a photo is taken or chosen
function handlePhotoPick(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile = file;
    photoStatus.textContent = "Photo selected ✓";
  }
}

cameraInput.addEventListener("change", handlePhotoPick);
galleryInput.addEventListener("change", handlePhotoPick);

// 5. Map with Street / Satellite / Terrain views
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

    street.addTo(map); // default view

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

  // the map was hidden, so tell it to recalculate its size
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

// Option A: Pin on map (manual)
pinBtn.addEventListener("click", function () {
  createMapIfNeeded();
  locationStatus.textContent = "Zoom in and tap the map to place the pin.";
});

// Option B: Auto-detect (then fine-tune by dragging the pin)
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

      // show the accuracy as a circle around the pin
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

// 6. Delete one of my own posts
function deleteItem(id) {
  const sure = confirm("Delete this post? This cannot be undone.");
  if (!sure) return;

  items = items.filter(function (item) {
    return item.id !== id;
  });
  myPosts = myPosts.filter(function (postId) {
    return postId !== id;
  });

  saveItems();
  saveMyPosts();
  render();
}

// 7. Draw all items on the page
function render() {
  feed.innerHTML = "";

  items.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "card";

    const tag = document.createElement("span");
    tag.className = "tag " + item.type;
    tag.textContent = item.type.toUpperCase();

    const heading = document.createElement("h2");
    heading.textContent = item.title;

    card.append(tag, heading);

    if (item.image) {
      const photo = document.createElement("img");
      photo.className = "item-photo";
      photo.src = item.image;
      photo.alt = item.title;
      card.append(photo);
    }

    if (item.name) {
      const nameLine = document.createElement("p");
      nameLine.textContent = (item.type === "lost" ? "Lost by: " : "Found by: ") + item.name;
      card.append(nameLine);
    }

    const placeLine = document.createElement("p");
    placeLine.textContent = (item.type === "lost" ? "Lost" : "Found") + " at " + item.place;

    const contactLine = document.createElement("p");
    contactLine.textContent = "Contact: " + item.contact;

    const dateLine = document.createElement("p");
    dateLine.textContent = "Date: " + item.date;

    card.append(placeLine, contactLine, dateLine);

    if (item.lat && item.lng) {
      const mapLink = document.createElement("a");
      mapLink.className = "map-link";
      // t=k opens Google Maps in satellite view
      mapLink.href = "https://www.google.com/maps?q=" + item.lat + "," + item.lng + "&t=k";
      mapLink.target = "_blank";
      mapLink.rel = "noopener";
      mapLink.textContent = "📍 View on map";
      card.append(mapLink);
    }

    // Delete button: only on posts made from this browser
    if (item.id && myPosts.includes(item.id)) {
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

// 8. When the form is submitted
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  let image = "";
  if (selectedFile) {
    image = await shrinkImage(selectedFile);
  }

  const newItem = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    type: document.getElementById("type").value,
    name: document.getElementById("name").value,
    title: document.getElementById("title").value,
    place: document.getElementById("place").value,
    contact: document.getElementById("contact").value,
    date: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }),
    image: image,
    lat: pickedLocation ? pickedLocation.lat : null,
    lng: pickedLocation ? pickedLocation.lng : null
  };

  items.unshift(newItem);
  myPosts.push(newItem.id);
  saveItems();
  saveMyPosts();
  render();

  form.reset();
  selectedFile = null;
  pickedLocation = null;
  photoStatus.textContent = "";
  locationStatus.textContent = "";
  if (map) resetMap();
});

// 9. Show everything when the page opens
render();