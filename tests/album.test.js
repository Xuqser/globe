const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({
  Math, Map, Object, console,
  CITIES: { 首尔: { lat: 37.57, lon: 126.98 } }, places: [],
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
context.entered = [];
context.exited = 0;
vm.runInContext(`
  albumEnterCity = name => { entered.push(name); album.mode = 'city'; album.city = name; album.twoHand = null; };
  albumGoGlobal = () => { exited++; album.mode = 'globe'; album.twoHand = null; };
`, context);
const handle = vm.runInContext('albumHandleHands', context);
const pair = distance => [[{ x: 0.3, y: 0.5 }], [{ x: 0.3 + distance, y: 0.5 }]];
const one = (x, score = 1.2) => [Object.assign([{ x, y: 0.5 }], { scores: { 8: score, 12: score, 16: score, 20: score } })];
function feed(hands, time) { context.now = time; handle({ multiHandLandmarks: hands }); }

for (let i = 0; i < 5; i++) feed(pair(0.22), 100 + i * 33);
feed(pair(0.30), 300);
assert.equal(context.entered.length, 0, '双手变化需要短暂保持');
feed(pair(0.30), 570);
assert.deepEqual(context.entered, ['首尔'], '即使初始视角距首尔较远，双手拉开也进入提示城市');
assert.equal(context.zoomTarget, 1, '双手只切模式，不改变倍率');
feed(pair(0.12), 620);
assert.equal(context.exited, 0, '两手未收回时不得反向切回');
for (let i = 0; i < 6; i++) feed(one(0.5), 700 + i * 33);
for (let i = 0; i < 5; i++) feed(pair(0.30), 1000 + i * 33);
feed(pair(0.21), 1200);
feed(pair(0.21), 1460);
assert.equal(context.exited, 1, '重新举起双手并靠近后退出城市');

const pose = vm.runInContext('albumPose', context);
assert.equal(pose(one(0.5, 1.0)[0]), 'fist');
assert.equal(pose(one(0.5, 1.2)[0]), 'open');
for (let i = 0; i < 6; i++) feed(one(0.5), 1700 + i * 33);
feed(one(0.60), 1920); // 镜像后的 x 向左移动
assert.ok(album.turnY < 0, '摆手产生一段地球转动');
const turn = album.turnY;
feed(one(0.55), 1953);
feed(one(0.50), 1986);
assert.equal(album.turnY, turn, '收手不能反向转动');
vm.runInContext('albumUpdateGlobeTurn', context)(1);
assert.ok(context.rotY < -1.8 && album.turnY > turn, '地球逐帧平滑转动');
console.log('PASS: 双手进出模式、切换锁定、全球摆手不回抽、旋转平滑');
