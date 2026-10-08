/* Local travel album and mutually exclusive gesture states. */
const album = {
  photos: [], groups: new Map(), mode: "globe", city: null, index: 0,
  multiHandCooldown: 0, pinchClosed: false, pinchCloseFrames: 0, pinchReleaseFrames: 0, pinchAt: 0, pinchTarget: null,
  globeSwipe: null, turnX: 0, turnY: 0, pose: "", poseAt: 0,
  fistReady: false, swipeOrigin: null, swipeLastX: null, swipeArmed: true, stillFrames: 0,
  gestureLockUntil: 0, lastGestureAt: 0
};

const albumDebug = {
  enabled: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1",
  handCount: null, pose: "—", ratio: null, otherOpen: null, lastRender: -Infinity, events: []
};

function albumDebugStatus(now) {
  if (albumDebug.handCount == null) return "尚未收到手部识别结果";
  if (!albumDebug.handCount) return "未识别到手；离开画面不算松开";
  if (albumDebug.handCount > 1) return "两只手入镜，暂不处理手势";
  if (album.multiHandCooldown) return `双手切回单手，等待 ${album.multiHandCooldown} 帧`;
  if (tutorialOpen) return "教程打开，手势暂停";
  if (now < album.gestureLockUntil) return `切换保护中，还剩 ${Math.ceil(album.gestureLockUntil - now)} ms`;
  if (album.mode === "album") return "照片模式不处理捏合";
  if (album.mode === "globe" && !albumNames().length) return "没有可进入的照片城市";
  if (album.pinchClosed) return `已捏合，等待松开（${album.pinchReleaseFrames}/2 帧）`;
  if (album.pinchAt && now - album.pinchAt <= HAND_PINCH_DOUBLE_MS) return `等待第二次捏合，还剩 ${Math.ceil(HAND_PINCH_DOUBLE_MS - (now - album.pinchAt))} ms`;
  if (albumDebug.ratio != null && albumDebug.ratio < HAND_PINCH_CLOSE_RATIO && !albumDebug.otherOpen) return "指尖已接近，但其他三指未伸开";
  return "等待捏合";
}

function albumDebugRender(force = false) {
  if (!albumDebug.enabled) return;
  const now = millis();
  if (!force && now - albumDebug.lastRender < 100) return;
  albumDebug.lastRender = now;
  const readout = document.getElementById("gesture-debug-readout");
  if (!readout) return;
  readout.textContent = [
    `模式：${album.mode} · 有照片地点：${albumNames().length}`,
    `手数：${albumDebug.handCount == null ? "—" : albumDebug.handCount} · 手型：${albumDebug.pose}`,
    `拇指/食指距离÷掌长：${albumDebug.ratio == null ? "—" : albumDebug.ratio.toFixed(2)}（合 < 0.45，开 > 0.58）`,
    `其他三指有伸开：${albumDebug.otherOpen == null ? "—" : albumDebug.otherOpen ? "是" : "否"}`,
    `首次捏合：${album.pinchAt ? `${Math.round(now - album.pinchAt)} ms 前` : "未记录"}`,
    `状态：${albumDebugStatus(now)}`
  ].join("\n");
}

function albumDebugEvent(message) {
  if (!albumDebug.enabled) return;
  albumDebug.events.push(`${(millis() / 1000).toFixed(1)}s  ${message}`);
  if (albumDebug.events.length > 60) albumDebug.events.shift();
  const log = document.getElementById("gesture-debug-log");
  if (log) log.value = albumDebug.events.join("\n");
  albumDebugRender(true);
}

function albumDebugObserve(list) {
  if (!albumDebug.enabled) return;
  const previous = albumDebug.handCount;
  albumDebug.handCount = list.length;
  const lm = list[0];
  albumDebug.pose = lm ? albumPose(lm) : "—";
  albumDebug.ratio = null;
  albumDebug.otherOpen = null;
  if (lm && lm[0] && lm[4] && lm[8] && lm[9]) {
    const palm = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.001;
    albumDebug.ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palm;
    albumDebug.otherOpen = fingerExtension(lm, 12, 10) > 1.02 ||
      fingerExtension(lm, 16, 14) > 1.02 || fingerExtension(lm, 20, 18) > 1.02;
  }
  if (previous !== list.length) albumDebugEvent(`识别到 ${list.length} 只手`);
  albumDebugRender();
}

function albumDebugInit() {
  if (!albumDebug.enabled) return;
  document.body.classList.add("gesture-debugging");
  document.getElementById("gesture-debug").hidden = false;
  document.getElementById("gesture-debug-copy").onclick = async () => {
    const text = document.getElementById("gesture-debug-readout").textContent +
      "\n\n事件：\n" + document.getElementById("gesture-debug-log").value;
    const status = document.getElementById("gesture-debug-copy-status");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "已复制";
    } catch (_) {
      const log = document.getElementById("gesture-debug-log");
      log.value = text;
      log.select();
      status.textContent = "请按 ⌘C 复制选中内容";
    }
  };
  albumDebugRender(true);
}

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
  if (album.mode === "album") return;
  const pending = album.pinchAt && millis() - album.pinchAt <= HAND_PINCH_DOUBLE_MS;
  if (album.mode === "city") {
    document.getElementById("travel-hint").textContent = pending
      ? "再捏一次返回全球"
      : "握拳摆动切城市 · 张掌看照片 · 捏两次返回全球";
    return;
  }
  const city = pending ? album.pinchTarget : albumClosestCity();
  document.getElementById("travel-hint").textContent = pending
    ? `再捏一次进入：${city}`
    : city ? `单手摆动旋转 · 拇指与食指捏两次进入：${city}` : "先添加照片，再用拇指与食指捏两次进入城市";
}

function albumUpdateMode() {
  const label = album.mode === "globe" ? "全球浏览" : album.mode === "city" ? `城市观察：${album.city}` : `照片相册：${album.city}`;
  document.getElementById("travel-mode").textContent = label;
  document.getElementById("travel-open").hidden = album.mode !== "city";
  document.getElementById("travel-global").hidden = album.mode === "globe";
  if (album.mode === "album") document.getElementById("travel-hint").textContent = "张掌左右摆动翻照片；握拳保持返回城市";
  else albumUpdateTargetHint();
}

function albumEnterCity(name) {
  if (!albumHasCity(name)) return;
  album.mode = "city";
  album.city = name;
  albumResetPinch();
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
  albumResetPinch();
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
  albumResetPinch();
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
  albumResetPinch();
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
    album.globeSwipe = { x, y, lastX: x, lastY: y, movementAt: null, armed: true, still: 0, triggeredAt: 0 };
    return;
  }
  const gesture = album.globeSwipe;
  const dx = x - gesture.x, dy = y - gesture.y;
  if (gesture.movementAt == null && Math.hypot(dx, dy) > 0.015) gesture.movementAt = now;
  const still = Math.hypot(x - gesture.lastX, y - gesture.lastY) < 0.004;
  gesture.lastX = x;
  gesture.lastY = y;
  if (!gesture.armed) {
    gesture.still = Math.hypot(dx, dy) < 0.025 && still ? gesture.still + 1 : 0;
    if (gesture.still >= 5 && now - gesture.triggeredAt > 400) {
      gesture.armed = true;
      gesture.x = x;
      gesture.y = y;
      gesture.movementAt = null;
      gesture.still = 0;
    }
    return;
  }
  // 摆手越快初速度越大；回手阶段不再读取位移，交给阻尼自然停下。
  const speed = move => Math.min(0.16, Math.max(0.06, Math.abs(move) * 260 / Math.max(80, now - gesture.movementAt)));
  if (Math.abs(dx) > 0.075 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    album.turnY = Math.sign(dx) * speed(dx);
    album.turnX = 0;
  } else if (Math.abs(dy) > 0.075 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    album.turnX = Math.sign(dy) * HAND_TOUCH_Y * speed(dy) * 0.6;
    album.turnY = 0;
  } else return;
  gesture.armed = false;
  gesture.triggeredAt = now;
  gesture.still = 0;
  spinX = spinY = 0;
}

function albumUpdateGlobeTurn(scale) {
  if (frameCount % 12 === 0) albumUpdateTargetHint();
  if (album.mode !== "globe") return;
  const decay = Math.pow(0.90, Math.min(scale, 2.5));
  const travel = (1 - decay) / 0.10;
  rotX += album.turnX * travel;
  rotY += album.turnY * travel;
  album.turnX = Math.abs(album.turnX * decay) < 0.0005 ? 0 : album.turnX * decay;
  album.turnY = Math.abs(album.turnY * decay) < 0.0005 ? 0 : album.turnY * decay;
}

function albumResetPinch() {
  album.pinchClosed = false;
  album.pinchCloseFrames = 0;
  album.pinchReleaseFrames = 0;
  album.pinchAt = 0;
  album.pinchTarget = null;
}

function albumHandlePinch(lm, now) {
  if (!lm[0] || !lm[4] || !lm[8] || !lm[9]) return false;
  const palm = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.001;
  const ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palm;
  const otherOpen = fingerExtension(lm, 12, 10) > 1.02 ||
    fingerExtension(lm, 16, 14) > 1.02 || fingerExtension(lm, 20, 18) > 1.02;
  const closed = ratio < HAND_PINCH_CLOSE_RATIO && otherOpen;
  const released = ratio > HAND_PINCH_RELEASE_RATIO || !otherOpen;
  if (!album.pinchClosed) album.pinchCloseFrames = closed ? album.pinchCloseFrames + 1 : 0;
  if (album.pinchCloseFrames >= 3 && !album.pinchClosed) {
    album.pinchClosed = true;
    album.pinchCloseFrames = 0;
    album.pinchReleaseFrames = 0;
    const gap = now - album.pinchAt;
    if (album.pinchAt && gap >= HAND_PINCH_MIN_GAP_MS && gap <= HAND_PINCH_DOUBLE_MS) {
      const target = album.pinchTarget;
      albumDebugEvent(`第 2 次捏合（间隔 ${Math.round(gap)} ms）：${album.mode === "globe" ? "进入城市" : "返回全球"}`);
      if (album.mode === "globe") albumEnterCity(target);
      else albumGoGlobal();
      album.pinchClosed = true; // 切换后的这次捏合必须先松开，不能再算下一轮。
    } else if (!album.pinchAt || gap > HAND_PINCH_DOUBLE_MS) {
      const target = album.mode === "globe" ? albumClosestCity() : null;
      if (album.mode === "globe" && !target) {
        albumDebugEvent("捏合达到阈值，但没有可进入的照片城市");
        return true;
      }
      album.pinchAt = now;
      album.pinchTarget = target;
      album.turnX = album.turnY = 0;
      album.globeSwipe = null;
      spinX = spinY = 0;
      albumDebugEvent(`第 1 次捏合${target ? "，已锁定目标" : ""}`);
      albumUpdateTargetHint();
    } else albumDebugEvent(`第 2 次捏合过快（间隔 ${Math.round(gap)} ms）`);
    return true;
  }
  if (album.pinchClosed) {
    album.pinchReleaseFrames = released ? album.pinchReleaseFrames + 1 : 0;
    if (album.pinchReleaseFrames >= 2) {
      album.pinchClosed = false;
      albumDebugEvent("松开已确认");
    }
    return true;
  }
  if (album.pinchAt && now - album.pinchAt <= HAND_PINCH_DOUBLE_MS) return true;
  if (album.pinchAt) {
    albumDebugEvent("等待第 2 次捏合超时");
    albumResetPinch();
    albumUpdateTargetHint();
    album.globeSwipe = null;
  }
  return false;
}

function albumHandleHands(results) {
  const list = results.multiHandLandmarks || [];
  const now = millis();
  handCount = list.length;
  handSeen = list.length > 0;
  lastHandFrame = list.length ? frameCount : lastHandFrame;
  albumDebugObserve(list);
  if (list.length >= 2) {
    album.multiHandCooldown = 6;
    albumResetPinch();
    lastPalm = null;
    album.globeSwipe = null;
    albumResetGesture();
    spinX = spinY = 0;
    return;
  }
  if (album.multiHandCooldown) {
    album.multiHandCooldown--;
    lastPalm = null;
    spinX = spinY = 0;
    albumResetGesture();
    album.globeSwipe = null;
    return; // 两手变成单手后，稍等几帧再接受新动作。
  }
  if (!list.length) {
    album.pinchCloseFrames = 0;
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
  if (album.mode !== "album" && albumHandlePinch(list[0], now)) {
    albumResetGesture();
    lastPalm = p;
    return;
  }
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
  albumDebugInit();
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
    albumDebugEvent(`照片服务已加载：${album.photos.length} 张照片、${albumNames().length} 个地点`);
  } catch (_) {
    document.getElementById("travel-count").textContent = "请用 python3 server.py 启动照片服务";
    albumDebugEvent("照片服务不可用；请运行 python3 server.py");
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
