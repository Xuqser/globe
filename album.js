/* Local travel album and mutually exclusive gesture states. */
const album = {
  photos: [], groups: new Map(), mode: "globe", city: null, index: 0,
  twoHand: null, enterAt: 0, exitAt: 0, pose: "", poseAt: 0,
  fistReady: false, swipeOrigin: null, swipeLastX: null, swipeArmed: true, stillFrames: 0,
  gestureLockUntil: 0, lastGestureAt: 0
};
const ENTER_ZOOM = 1.75;
const EXIT_ZOOM = 1.30;

function albumHaversine(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function albumCityFor(photo) {
  if (photo.city) return photo.city;
  if (photo.latitude == null || photo.longitude == null) return "待归类";
  const point = { lat: photo.latitude, lon: photo.longitude };
  let nearest = null, best = Infinity;
  for (const [name, city] of Object.entries(CITIES)) {
    if (name.startsWith("坐标 ")) continue;
    const distance = albumHaversine(point, city);
    if (distance < best) { nearest = name; best = distance; }
  }
  if (best <= 80) return nearest;
  const lat = Math.round(photo.latitude * 10) / 10;
  const lon = Math.round(photo.longitude * 10) / 10;
  return `坐标 ${lat}°, ${lon}°`;
}

function albumRebuild() {
  album.groups = new Map();
  for (const photo of album.photos) {
    const name = albumCityFor(photo);
    if (!album.groups.has(name)) album.groups.set(name, []);
    album.groups.get(name).push(photo);
    if (!CITIES[name] && name !== "待归类") {
      const city = { name, lat: photo.latitude, lon: photo.longitude, type: "city" };
      CITIES[name] = city;
      places.push(city);
    }
  }
  for (const group of album.groups.values()) group.sort((a, b) => (a.takenAt || "").localeCompare(b.takenAt || ""));
  albumRenderCities();
  albumRenderGallery();
}

function albumNames() { return [...album.groups.keys()].filter(name => name !== "待归类").sort(); }
function albumHasCity(name) { return album.groups.has(name) && name !== "待归类"; }
function albumClosestCity() {
  const view = { lat: -rotX * 180 / Math.PI, lon: -rotY * 180 / Math.PI };
  let name = null, best = Infinity;
  for (const candidate of albumNames()) {
    const distance = albumHaversine(view, CITIES[candidate]);
    if (distance < best) { name = candidate; best = distance; }
  }
  return best < 1800 ? name : null;
}

function albumRenderCities() {
  const list = document.getElementById("travel-cities");
  if (!list) return;
  list.replaceChildren();
  for (const name of albumNames()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${name} · ${album.groups.get(name).length}`;
    button.className = name === album.city ? "selected" : "";
    button.onclick = () => albumEnterCity(name);
    list.append(button);
  }
  const pending = album.groups.get("待归类") || [];
  const pendingEl = document.getElementById("travel-pending");
  pendingEl.replaceChildren();
  if (pending.length) {
    const title = document.createElement("p");
    title.textContent = `${pending.length} 张照片没有 GPS，请指定城市：`;
    pendingEl.append(title);
    for (const photo of pending) {
      const row = document.createElement("label");
      row.textContent = photo.name + " ";
      const select = document.createElement("select");
      const first = document.createElement("option");
      first.value = ""; first.textContent = "选择城市";
      select.append(first);
      for (const city of Object.keys(CITIES).filter(name => !name.startsWith("坐标 ")).sort()) {
        const option = document.createElement("option");
        option.value = city; option.textContent = city;
        select.append(option);
      }
      select.onchange = async () => {
        const response = await fetch(`/api/photos/${photo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: select.value }) });
        if (response.ok) { photo.city = select.value; albumRebuild(); }
      };
      row.append(select);
      pendingEl.append(row);
    }
  }
  document.getElementById("travel-count").textContent = `${album.photos.length} 张照片 · ${albumNames().length} 个地点`;
  albumUpdateMode();
}

function albumUpdateMode() {
  const label = album.mode === "globe" ? "全球浏览" : album.mode === "city" ? `城市观察：${album.city}` : `照片相册：${album.city}`;
  document.getElementById("travel-mode").textContent = label;
  document.getElementById("travel-open").hidden = album.mode !== "city";
  document.getElementById("travel-global").hidden = album.mode === "globe";
  document.getElementById("travel-hint").textContent = album.mode === "globe"
    ? "单手移动旋转；双手拉开放大进入有照片的城市"
    : album.mode === "city"
      ? "握拳左右摆动切城市；停稳后张掌打开照片；双手靠近返回全球"
      : "张掌左右摆动翻照片；握拳保持返回城市";
}

function albumEnterCity(name) {
  if (!albumHasCity(name)) return;
  album.mode = "city";
  album.city = name;
  album.twoHand = null;
  albumResetGesture();
  album.gestureLockUntil = millis() + 650;
  album.swipeArmed = false;
  enterCityMode(name);
  albumRenderCities();
}

function albumGoGlobal() {
  if (album.mode === "album") document.getElementById("travel-gallery").hidden = true;
  album.mode = "globe";
  album.city = null;
  album.twoHand = null;
  zoomTarget = Math.min(zoomTarget, 1.25);
  albumResetGesture();
  album.gestureLockUntil = millis() + 650;
  exitCityMode();
  albumRenderCities();
}

function albumOpen() {
  if (album.mode !== "city" || !albumHasCity(album.city)) return;
  album.mode = "album";
  album.index = 0;
  albumResetGesture();
  album.gestureLockUntil = millis() + 700;
  album.swipeArmed = false;
  document.getElementById("travel-gallery").hidden = false;
  spinX = spinY = 0;
  albumRenderGallery();
  albumUpdateMode();
}

function albumClose() {
  if (album.mode !== "album") return;
  album.mode = "city";
  document.getElementById("travel-gallery").hidden = true;
  albumResetGesture();
  album.gestureLockUntil = millis() + 650;
  album.swipeArmed = false;
  albumUpdateMode();
}

function albumRenderGallery() {
  if (album.mode !== "album") return;
  const items = album.groups.get(album.city) || [];
  if (!items.length) { albumClose(); return; }
  album.index = Math.max(0, Math.min(album.index, items.length - 1));
  const item = items[album.index];
  document.getElementById("travel-photo").src = item.preview;
  document.getElementById("travel-photo").alt = item.name;
  document.getElementById("travel-caption").textContent = `${album.city} · ${album.index + 1}/${items.length} · ${item.takenAt || "时间未知"}`;
  const select = document.getElementById("travel-reassign");
  select.replaceChildren();
  for (const name of Object.keys(CITIES).filter(name => !name.startsWith("坐标 ")).sort()) {
    const option = document.createElement("option");
    option.value = name; option.textContent = name;
    select.append(option);
  }
  select.value = album.city;
  select.onchange = async () => {
    const response = await fetch(`/api/photos/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: select.value }) });
    if (response.ok) {
      const city = select.value;
      item.city = city;
      album.mode = "city";
      document.getElementById("travel-gallery").hidden = true;
      albumRebuild();
      albumEnterCity(city);
      albumOpen();
      album.index = album.groups.get(city).indexOf(item);
      albumRenderGallery();
    }
  };
}
function albumStep(direction) {
  if (album.mode !== "album") return;
  const items = album.groups.get(album.city) || [];
  album.index = Math.max(0, Math.min(items.length - 1, album.index + direction));
  albumRenderGallery();
}
function albumSwitchCity(direction) {
  const names = albumNames();
  const index = names.indexOf(album.city);
  if (index < 0 || names.length < 2) return;
  albumEnterCity(names[(index + direction + names.length) % names.length]);
}

function albumResetGesture() {
  album.pose = ""; album.poseAt = 0; album.fistReady = false;
  album.swipeOrigin = null; album.swipeLastX = null; album.swipeArmed = true; album.stillFrames = 0;
}
function albumPose(lm) {
  const scores = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => fingerExtension(lm, tip, pip));
  if (scores.every(score => score < 1.06)) return "fist";
  if (scores.every(score => score > 1.10)) return "open";
  return "other";
}
function albumSwipe(x, now, callback) {
  if (!album.swipeOrigin) album.swipeOrigin = x;
  const move = x - album.swipeOrigin;
  if (album.swipeLastX != null && Math.abs(x - album.swipeLastX) < 0.004) album.stillFrames++;
  else album.stillFrames = 0;
  album.swipeLastX = x;
  if (!album.swipeArmed && album.stillFrames >= 5 && now - album.lastGestureAt > 450) {
    album.swipeArmed = true;
    album.swipeOrigin = x;
  }
  if (album.swipeArmed && Math.abs(move) > 0.065 && now - album.lastGestureAt > 550) {
    callback(move < 0 ? 1 : -1);
    album.lastGestureAt = now;
    album.swipeArmed = false;
    album.swipeOrigin = x;
    album.stillFrames = 0;
  }
}
function albumTwoHands(list, now) {
  if (album.mode === "city" && cityFocus && cityFocus.t < cityFocus.duration) return;
  const a = palmCenter(list[0]), b = palmCenter(list[1]);
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (!album.twoHand) {
    album.twoHand = { distance, zoom: zoomTarget, since: now };
    return;
  }
  if (now - album.twoHand.since < 150 || album.twoHand.distance < 0.08) return;
  const ratio = Math.max(0.5, Math.min(2, distance / album.twoHand.distance));
  zoomTarget = constrain(album.twoHand.zoom * ratio, ZOOM_MIN, ZOOM_MAX);
  if (cityFocus && album.mode === "city" && Math.abs(ratio - 1) > 0.04) cityFocus = null;
  if (album.mode === "globe") {
    const candidate = albumClosestCity();
    album.enterAt = zoomTarget >= ENTER_ZOOM && candidate ? (album.enterAt || now) : 0;
    if (album.enterAt && now - album.enterAt > 300) albumEnterCity(candidate);
  } else if (album.mode === "city") {
    album.exitAt = zoomTarget <= EXIT_ZOOM ? (album.exitAt || now) : 0;
    if (album.exitAt && now - album.exitAt > 300) albumGoGlobal();
  }
}

function albumHandleHands(results) {
  const list = results.multiHandLandmarks || [];
  const now = millis();
  handCount = list.length;
  handSeen = list.length > 0;
  if (!list.length) {
    album.twoHand = null; albumResetGesture();
    lastPalm = null; spinX = spinY = 0;
    return;
  }
  lastHandFrame = frameCount;
  if (album.mode === "album") spinX = spinY = 0;
  if (list.length >= 2) {
    lastPalm = null;
    albumResetGesture();
    if (album.mode !== "album") albumTwoHands(list, now);
    return;
  }
  album.twoHand = null;
  album.enterAt = album.exitAt = 0;
  const p = palmCenter(list[0]);
  const x = 1 - p.x;
  const pose = albumPose(list[0]);
  if (pose !== album.pose) {
    album.pose = pose; album.poseAt = now;
    album.swipeOrigin = x; album.swipeLastX = x; album.stillFrames = 0;
  }
  if (now < album.gestureLockUntil || tutorialOpen) { lastPalm = p; return; }
  if (album.mode === "globe") {
    if (lastPalm) {
      const dx = (lastPalm.x - p.x) * followX;
      const dy = (p.y - lastPalm.y) * HAND_FOLLOW_Y * HAND_TOUCH_Y;
      if (Math.hypot(dx, dy) > 0.002) { rotY += dx; rotX += dy; spinX = spinY = 0; }
    }
  } else if (album.mode === "city") {
    spinX = spinY = 0;
    if (pose === "fist" && now - album.poseAt > 220) {
      album.fistReady = true;
      albumSwipe(x, now, albumSwitchCity);
    } else if (pose === "open" && album.fistReady && now - album.poseAt > 220) {
      albumOpen();
    }
  } else if (album.mode === "album") {
    if (pose === "fist" && now - album.poseAt > 420) albumClose();
    else if (pose === "open" && now - album.poseAt > 180) albumSwipe(x, now, albumStep);
  }
  lastPalm = p;
}

function albumWheel(delta) {
  if (album.mode === "album") return;
  zoomTarget = constrain(zoomTarget * (1 - delta * 0.0012), ZOOM_MIN, ZOOM_MAX);
  if (album.mode === "globe" && zoomTarget >= ENTER_ZOOM) {
    const city = albumClosestCity();
    if (city) albumEnterCity(city);
  } else if (album.mode === "city" && zoomTarget <= EXIT_ZOOM) albumGoGlobal();
}

async function albumInit() {
  document.getElementById("travel-add").onclick = () => document.getElementById("travel-input").click();
  document.getElementById("travel-input").onchange = albumImport;
  document.getElementById("travel-open").onclick = albumOpen;
  document.getElementById("travel-global").onclick = albumGoGlobal;
  document.getElementById("travel-close").onclick = albumClose;
  document.getElementById("travel-prev").onclick = () => albumStep(-1);
  document.getElementById("travel-next").onclick = () => albumStep(1);
  try {
    const response = await fetch("/api/photos");
    if (!response.ok) throw new Error("照片服务未启动");
    album.photos = await response.json();
    albumRebuild();
  } catch (_) {
    document.getElementById("travel-count").textContent = "请用 python3 server.py 启动照片服务";
  }
}
async function albumImport(event) {
  const status = document.getElementById("travel-count");
  const files = [...event.target.files];
  let added = 0, skipped = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    status.textContent = `导入中 ${i + 1}/${files.length}：${file.name}`;
    try {
      const response = await fetch("/api/photos", { method: "POST", headers: { "X-Photo-Name": encodeURIComponent(file.name) }, body: file });
      const result = await response.json();
      if (!response.ok) { skipped++; status.textContent = result.error; continue; }
      album.photos.push(result); added++;
    } catch (_) { skipped++; status.textContent = "导入失败，请检查照片服务"; }
  }
  event.target.value = "";
  albumRebuild();
  status.textContent = `已导入 ${added} 张，跳过 ${skipped} 张 · 共 ${album.photos.length} 张`;
}
