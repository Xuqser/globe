const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = {};
const context = vm.createContext({
  Math, Map, Object, console,
  CITIES: { 首尔: { lat: 37.57, lon: 126.98 }, 东京: { lat: 35.68, lon: 139.69 } }, places: [],
  HAND_PINCH_CLOSE_RATIO: 0.45, HAND_PINCH_RELEASE_RATIO: 0.58,
  HAND_PINCH_DOUBLE_MS: 1200, HAND_PINCH_MIN_GAP_MS: 180,
  document: { getElementById: id => elements[id] ||= { textContent: '' } },
  rotX: -0.35, rotY: -1.8, zoomTarget: 1, ZOOM_MIN: 0.7, ZOOM_MAX: 3,
  constrain: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
  palmCenter: points => points[0],
  fingerExtension: (points, tip) => points.scores[tip],
  millis: () => context.now, now: 0,
  handCount: 0, handSeen: false, lastHandFrame: 0, frameCount: 1,
  lastPalm: null, spinX: 0, spinY: 0, tutorialOpen: false,
  cityFocus: null, HAND_TOUCH_Y: -1, exitCityMode() {}, enterCityMode() {}
});
vm.runInContext(fs.readFileSync('album.js', 'utf8'), context);
const album = vm.runInContext('album', context);
album.groups.set('首尔', [{ id: 'one' }]);
album.groups.set('东京', [{ id: 'two' }]);
context.entered = [];
context.exited = 0;
context.chosenCity = '首尔';
vm.runInContext(`
  albumClosestCity = () => chosenCity;
  albumEnterCity = name => { entered.push(name); album.mode = 'city'; album.city = name; albumResetPinch(); album.gestureLockUntil = now + 650; };
  albumGoGlobal = () => { exited++; album.mode = 'globe'; album.city = null; albumResetPinch(); album.gestureLockUntil = now + 650; };
`, context);
const handle = vm.runInContext('albumHandleHands', context);
const one = (x, score = 1.2) => [Object.assign([{ x, y: 0.5 }], { scores: { 8: score, 12: score, 16: score, 20: score } })];
function pinch(closed, x = 0.5) {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.5 }));
  points[0] = { x, y: 0.5 };
  points[9] = { x, y: 0.6 };
  points[4] = { x: x - 0.015, y: 0.45 };
  points[8] = { x: x + (closed ? 0.015 : 0.07), y: 0.45 };
  points.scores = { 8: closed ? 1 : 1.2, 12: 1.2, 16: 1.2, 20: 1.2 };
  return [points];
}
function feed(hands, time) { context.now = time; handle({ multiHandLandmarks: hands }); }

for (let i = 0; i < 4; i++) feed([...one(0.3), ...one(0.3 + i * 0.06)], 100 + i * 33);
assert.equal(context.entered.length, 0, '双手距离变化不再切换模式');
for (let i = 0; i < 6; i++) feed([], 250 + i * 33);

feed(pinch(true), 600);
feed(pinch(true), 630);
assert.equal(context.entered.length, 0, '长按一次不能算两次捏合');
assert.equal(elements['travel-hint'].textContent, '再捏一次进入：首尔');
feed(pinch(false), 660);
feed(pinch(false), 700);
feed([], 730); // 短暂丢失跟踪时保留第一次捏合。
context.chosenCity = '东京';
feed(pinch(true), 940);
assert.deepEqual(context.entered, ['首尔'], '第二次捏合进入第一次锁定的城市');
assert.equal(context.zoomTarget, 1, '切换模式不依赖缩放倍率');
feed(pinch(true), 970);
assert.equal(context.exited, 0, '持续捏住不会立即反向切换');

feed(pinch(false), 1600);
feed(pinch(false), 1633);
feed(pinch(true), 1700);
assert.equal(elements['travel-hint'].textContent, '再捏一次返回全球');
feed(pinch(false), 1750);
feed(pinch(false), 1783);
feed(pinch(true), 2000);
assert.equal(context.exited, 1, '城市中双捏合返回全球');
feed(pinch(false), 2660);
feed(pinch(false), 2693);

const pose = vm.runInContext('albumPose', context);
assert.equal(pose(one(0.5, 1.0)[0]), 'fist');
assert.equal(pose(one(0.5, 1.2)[0]), 'open');
for (let i = 0; i < 6; i++) feed(one(0.5), 3000 + i * 33);
feed(one(0.60), 3220); // 镜像后的 x 向左移动
assert.ok(album.turnY < 0, '摆手产生一段地球转动');
const turn = album.turnY;
assert.ok(Math.abs(turn + 0.16) < 1e-10, '快速摆手初速度为上一版上限的两倍');
feed(one(0.55), 3253);
feed(one(0.50), 3286);
assert.equal(album.turnY, turn, '收手不能反向转动');
feed([], 3320);
assert.equal(album.turnY, turn, '手离开画面后惯性继续');
const updateTurn = vm.runInContext('albumUpdateGlobeTurn', context);
const before = context.rotY;
updateTurn(1);
const firstStep = before - context.rotY;
const afterFirst = context.rotY;
updateTurn(1);
const secondStep = afterFirst - context.rotY;
assert.ok(firstStep > secondStep && secondStep > 0, '转动由快到慢且方向不变');
assert.ok(album.turnY > turn, '每帧衰减角速度');
for (let i = 0; i < 90; i++) updateTurn(1);
assert.equal(album.turnY, 0, '惯性最终停止');

album.globeSwipe = null;
album.turnY = 0;
feed(one(0.5), 4000);
feed(one(0.48), 4200);
feed(one(0.42), 4600);
assert.ok(Math.abs(album.turnY - 0.06) < 1e-10, '慢速摆手的最低初速度也翻倍');
const baseRotation = context.rotY;
album.turnY = -0.05;
updateTurn(2);
const combinedRotation = context.rotY;
context.rotY = baseRotation;
album.turnY = -0.05;
updateTurn(1);
updateTurn(1);
assert.ok(Math.abs(context.rotY - combinedRotation) < 1e-10, '不同帧率下的阻尼保持一致');

album.mode = 'city'; album.city = '首尔'; album.gestureLockUntil = 0;
vm.runInContext('albumResetPinch(); albumResetGesture()', context);
feed(one(0.5, 1.0), 5000);
feed(one(0.5, 1.0), 5250);
feed(one(0.6, 1.0), 5300);
assert.equal(album.city, '东京', '城市里握拳摆动仍可切城');
album.mode = 'city'; album.city = '首尔'; album.gestureLockUntil = 0;
vm.runInContext('albumResetPinch(); albumResetGesture()', context);
context.opened = 0;
vm.runInContext('albumOpen = () => { opened++; album.mode = "album"; }', context);
feed(one(0.5, 1.0), 6000);
feed(one(0.5, 1.0), 6250);
feed(one(0.5), 6300);
feed(one(0.5), 6550);
assert.equal(context.opened, 1, '城市里握拳后张掌仍可打开照片');
feed(pinch(true), 6700);
feed(pinch(false), 6750);
feed(pinch(false), 6790);
feed(pinch(true), 7000);
assert.equal(album.mode, 'album', '照片页不响应双捏合切换');
console.log('PASS: 双捏合双向切换、目标锁定、城市与照片手势、双倍摆手惯性');
