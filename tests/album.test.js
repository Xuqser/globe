const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('album.js', 'utf8');
const context = vm.createContext({
  Math, Map, Object, console,
  CITIES: { 首尔: {lat: 37.57, lon: 126.98} },
  places: [], rotX: -37.57 * Math.PI / 180, rotY: -126.98 * Math.PI / 180,
  zoomTarget: 1, ZOOM_MIN: 0.7, ZOOM_MAX: 3,
  constrain: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
  palmCenter: points => points[0],
  fingerExtension: (points, tip) => points.scores[tip],
  millis: () => context.now,
  now: 0,
  handCount: 0, handSeen: false, lastHandFrame: 0, frameCount: 0,
  lastPalm: null, spinX: 0, spinY: 0, tutorialOpen: false,
  cityFocus: null, followX: 2.4, HAND_FOLLOW_Y: 1, HAND_TOUCH_Y: -1,
  exitCityMode() {}, enterCityMode() {}
});
vm.runInContext(source, context);
const album = vm.runInContext('album', context);
album.groups.set('首尔', [{id:'one'}]);
context.entered = [];
context.exited = 0;
vm.runInContext('albumEnterCity = name => { entered.push(name); album.mode = "city"; album.city = name; album.twoHand = null; }; albumGoGlobal = () => { exited++; album.mode = "globe"; album.twoHand = null; };', context);
const two = distance => [[{x:0.3,y:0.5}], [{x:0.3+distance,y:0.5}]];
vm.runInContext('albumTwoHands', context)(two(0.2), 0);
vm.runInContext('albumTwoHands', context)(two(0.36), 200);
assert.equal(context.entered.length, 0, 'enter requires stable hold');
vm.runInContext('albumTwoHands', context)(two(0.36), 501);
assert.deepEqual(context.entered, ['首尔']);
context.zoomTarget = 1.9;
vm.runInContext('albumTwoHands', context)(two(0.36), 600);
vm.runInContext('albumTwoHands', context)(two(0.29), 900);
assert.equal(context.exited, 0, 'middle zoom keeps city mode');
vm.runInContext('albumTwoHands', context)(two(0.23), 1000);
vm.runInContext('albumTwoHands', context)(two(0.23), 1301);
assert.equal(context.exited, 1);
const pose = vm.runInContext('albumPose', context);
assert.equal(pose(Object.assign([], {scores:{8:1.0,12:1.0,16:1.0,20:1.0}})), 'fist');
assert.equal(pose(Object.assign([], {scores:{8:1.2,12:1.2,16:1.2,20:1.2}})), 'open');
assert.equal(pose(Object.assign([], {scores:{8:1.2,12:1.0,16:1.0,20:1.0}})), 'other');
let turns = 0;
album.swipeArmed = false;
const swipe = vm.runInContext('albumSwipe', context);
for (let i=0; i<6; i++) swipe(0.5, 2000+i*34, () => turns++);
swipe(0.42, 2300, () => turns++);
swipe(0.51, 2400, () => turns++);
assert.equal(turns, 1, 'return stroke does not flip back');
console.log('PASS: zoom hysteresis, pose classification, swipe rearm');
