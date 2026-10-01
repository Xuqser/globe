/* Local travel album and mutually exclusive gesture states. */
const album = {
  photos: [], groups: new Map(), mode: "globe", city: null, index: 0,
  twoHand: null, twoHandUsed: false, twoHandMissing: 0,
  globeSwipe: null, turnX: 0, turnY: 0, pose: "", poseAt: 0,
  fistReady: false, swipeOrigin: null, swipeLastX: null, swipeArmed: true, stillFrames: 0,
  gestureLockUntil: 0, lastGestureAt: 0
};

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
  return name;
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

function albumUpdateTargetHint() {
  if (album.mode !== "globe") return;
  const city = albumClosestCity();
  document.getElementById("travel-hint").textContent = city
    ? `单手摆动旋转 · 双手拉开进入：${city}`
    : "先添加照片，再用双手拉开进入城市";
}

function albumUpdateMode() {
  const label = album.mode === "globe" ? "全球浏览" : album.mode === "city" ? `城市观察：${album.city}` : `照片相册：${album.city}`;
  document.getElementById("travel-mode").textContent = label;
  document.getElementById("travel-open").hidden = album.mode !== "city";
  document.getElementById("travel-global").hidden = album.mode === "globe";
  if (album.mode === "globe") albumUpdateTargetHint();
  else document.getElementById("travel-hint").textContent = album.mode === "city"
    ? "握拳左右摆动切城市；停稳后张掌打开照片；双手靠近返回全球"
    : "张掌左右摆动翻照片；握拳保持返回城市";
}

function albumEnterCity(name) {
  if (!albumHasCity(name)) return;
  album.mode = "city";
  album.city = name;
  album.twoHand = null;
  album.turnX = album.turnY = 0;
  album.globeSwipe = null;
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
  album.globeSwipe = null;
  album.turnX = album.turnY = 0;
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
  const photo = document.getElementById("travel-photo");
  const frame = photo.parentElement;
  frame.classList.remove("is-ready");
  const reveal = () => {
    photo.onload = null;
    void frame.offsetWidth;
    frame.classList.add("is-ready");
  };
  photo.onload = reveal;
  photo.src = item.preview;
  photo.alt = item.name;
  if (photo.complete && photo.naturalWidth) reveal();
  document.getElementById("travel-gallery-city").textContent = album.city;
  const takenAt = item.takenAt
    ? item.takenAt.replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}).*$/, "$1.$2.$3 · $4")
    : "时间未知";
  document.getElementById("travel-caption").textContent = `第 ${album.index + 1} / ${items.length} 张 · ${takenAt}`;
  document.getElementById("travel-prev").disabled = album.index === 0;
  document.getElementById("travel-next").disabled = album.index === items.length - 1;
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
function albumGlobeSwipe(x, y, now) {
  if (!album.globeSwipe) {
    album.globeSwipe = { x, y, lastX: x, lastY: y, armed: true, still: 0, triggeredAt: 0 };
    return;
  }
  const gesture = album.globeSwipe;
  const dx = x - gesture.x, dy = y - gesture.y;
  const still = Math.hypot(x - gesture.lastX, y - gesture.lastY) < 0.004;
  gesture.lastX = x;
  gesture.lastY = y;
  if (!gesture.armed) {
    gesture.still = Math.hypot(dx, dy) < 0.025 && still ? gesture.still + 1 : 0;
    if (gesture.still >= 5 && now - gesture.triggeredAt > 400) {
      gesture.armed = true;
      gesture.x = x;
      gesture.y = y;
      gesture.still = 0;
    }
    return;
  }
  if (Math.abs(dx) > 0.075 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    album.turnY += Math.sign(dx) * 0.62;
  } else if (Math.abs(dy) > 0.075 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    album.turnX += Math.sign(dy) * HAND_TOUCH_Y * 0.38;
  } else return;
  gesture.armed = false;
  gesture.triggeredAt = now;
  gesture.still = 0;
  spinX = spinY = 0;
}

function albumUpdateGlobeTurn(scale) {
  if (album.mode !== "globe") return;
  const amount = 1 - Math.pow(0.82, scale);
  const dx = album.turnX * amount, dy = album.turnY * amount;
  rotX += dx;
  rotY += dy;
  album.turnX = Math.abs(album.turnX - dx) < 0.0005 ? 0 : album.turnX - dx;
  album.turnY = Math.abs(album.turnY - dy) < 0.0005 ? 0 : album.turnY - dy;
  if (frameCount % 12 === 0) albumUpdateTargetHint();
}

function albumTwoHands(list, now) {
  const a = palmCenter(list[0]), b = palmCenter(list[1]);
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (!album.twoHand) album.twoHand = { samples: [], base: null, changeAt: 0, target: albumClosestCity() };
  const gesture = album.twoHand;
  if (gesture.base == null) {
    gesture.samples.push(distance);
    if (gesture.samples.length < 5) return;
    const sorted = gesture.samples.slice().sort((x, y) => x - y);
    gesture.base = sorted[2];
    return;
  }
  // 两只手只切换模式；初次检测到两手时的距离就是本轮动作的基准。
  const change = distance - gesture.base;
  const threshold = Math.max(0.055, gesture.base * 0.22);
  const active = album.mode === "globe"
    ? change > threshold && gesture.target
    : change < -threshold;
  if (!active) {
    gesture.changeAt = 0;
    if (album.mode === "globe") gesture.base = Math.min(gesture.base, distance);
    else gesture.base = Math.max(gesture.base, distance);
    return;
  }
  if (!gesture.changeAt) gesture.changeAt = now;
  if (now - gesture.changeAt < 250) return;
  const target = gesture.target;
  if (album.mode === "globe") albumEnterCity(target);
  else if (album.mode === "city") albumGoGlobal();
  album.twoHandUsed = true;
  album.twoHand = null;
}

function albumHandleHands(results) {
  const list = results.multiHandLandmarks || [];
  const now = millis();
  handCount = list.length;
  handSeen = list.length > 0;
  lastHandFrame = list.length ? frameCount : lastHandFrame;
  if (list.length >= 2) {
    album.twoHandMissing = 0;
    lastPalm = null;
    album.globeSwipe = null;
    albumResetGesture();
    spinX = spinY = 0;
    if (album.mode !== "album" && !album.twoHandUsed && now >= album.gestureLockUntil) albumTwoHands(list, now);
    return;
  }
  if (album.twoHand || album.twoHandUsed) {
    album.twoHandMissing++;
    lastPalm = null;
    spinX = spinY = 0;
    if (album.twoHand) album.twoHand.changeAt = 0;
    if (album.twoHandMissing < 6) return; // 暂时丢失一只手，不立刻改作单手操作。
    album.twoHand = null;
    album.twoHandUsed = false;
    album.twoHandMissing = 0;
    albumResetGesture();
    album.globeSwipe = null;
  }
  if (!list.length) {
    album.globeSwipe = null;
    albumResetGesture();
    lastPalm = null;
    spinX = spinY = 0;
    return;
  }
  const p = palmCenter(list[0]);
  const x = 1 - p.x;
  const pose = albumPose(list[0]);
  if (pose !== album.pose) {
    album.pose = pose; album.poseAt = now;
    album.swipeOrigin = x; album.swipeLastX = x; album.stillFrames = 0;
  }
  if (now < album.gestureLockUntil || tutorialOpen) { lastPalm = p; return; }
  if (album.mode === "globe") {
    albumGlobeSwipe(x, p.y, now);
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
