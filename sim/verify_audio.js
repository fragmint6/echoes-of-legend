/* =============================================================
   Echoes of Legend - Audio system regression
   node sim/verify_audio.js

   Runs the browser audio director against strict DOM and Web Audio
   mocks. Node cannot judge timbre; this proves every public cue family
   can synthesize, controls persist, scene routing is complete, and page,
   cloud, battle, and pack integrations stay wired.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach((name) => this.values.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }
  toggle(name, force) {
    const on = force == null ? !this.values.has(name) : !!force;
    if (on) this.values.add(name);
    else this.values.delete(name);
    return on;
  }
  contains(name) {
    return this.values.has(name);
  }
}
class EventTarget {
  constructor() {
    this.listeners = {};
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn);
  }
  dispatchEvent(event) {
    event.target = event.target || this;
    (this.listeners[event.type] || []).slice().forEach((fn) => fn(event));
    return true;
  }
}
class Element extends EventTarget {
  constructor(id, tag) {
    super();
    this.id = id;
    this.tagName = (tag || 'div').toUpperCase();
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.classList = new ClassList();
    this.attributes = {};
    this.children = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] == null ? null : this.attributes[name];
  }
  querySelector(selector) {
    return this.children[selector] || null;
  }
  closest() {
    return null;
  }
}
class Document extends EventTarget {
  constructor() {
    super();
    this.nodes = {};
    this.documentElement = new Element('html');
    this.body = new Element('body');
    this.body.dataset = { view: 'home' };
    this.hidden = false;
    this.visibilityState = 'visible';
  }
  getElementById(id) {
    return this.nodes[id] || null;
  }
  add(id, tag) {
    const node = new Element(id, tag);
    this.nodes[id] = node;
    return node;
  }
}
class Event {
  constructor(type) {
    this.type = type;
    this.target = null;
  }
}
class CustomEvent extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options && options.detail;
  }
}

const document = new Document();
['master', 'music', 'sfx'].forEach((key) => {
  document.add('audio-' + key, 'input');
  document.add('audio-' + key + '-val', 'output');
});
const mute = document.add('audio-mute', 'button');
mute.children.i = new Element('', 'i');
mute.children.span = new Element('', 'span');
const testButton = document.add('audio-test', 'button');
testButton.children.i = new Element('', 'i');
testButton.children.span = new Element('', 'span');

const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

let oscillators = 0;
let noises = 0;
class Param {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value) {
    this.value = value;
  }
  setTargetAtTime(value) {
    this.value = value;
  }
  cancelScheduledValues() {}
}
class AudioNode {
  connect() {
    return this;
  }
  disconnect() {}
}
class Source extends AudioNode {
  constructor() {
    super();
    this.frequency = new Param(440);
    this.detune = new Param(0);
    this.listeners = {};
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  start() {}
  stop() {
    if (this.listeners.ended) this.listeners.ended();
  }
}
class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = new AudioNode();
  }
  createGain() {
    const node = new AudioNode();
    node.gain = new Param(1);
    return node;
  }
  createDynamicsCompressor() {
    const node = new AudioNode();
    ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach((key) => (node[key] = new Param()));
    return node;
  }
  createConvolver() {
    return new AudioNode();
  }
  createBuffer(channels, length) {
    const rows = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => rows[channel] };
  }
  createOscillator() {
    oscillators++;
    return new Source();
  }
  createBufferSource() {
    noises++;
    return new Source();
  }
  createBiquadFilter() {
    const node = new AudioNode();
    node.frequency = new Param();
    node.Q = new Param();
    return node;
  }
  createStereoPanner() {
    const node = new AudioNode();
    node.pan = new Param();
    return node;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

const window = new EventTarget();
window.EOL = {};
window.AudioContext = FakeAudioContext;
window.matchMedia = () => ({ matches: false });
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
const context = vm.createContext({
  window,
  document,
  localStorage,
  CustomEvent,
  Event,
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  Promise,
  Float32Array,
  isFinite,
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8'), context, {
  filename: 'js/audio.js',
});
document.dispatchEvent(new Event('DOMContentLoaded'));

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
    console.log('  PASS  ' + message);
  } else {
    fail++;
    console.log('  FAIL  ' + message);
  }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const A = window.EOL.audio;
  ok(A.supported(), 'Web Audio support is detected');
  ok(A._prefKey === 'eol.audio.v1', 'audio uses the versioned preference key');
  const opening = A.unlock();
  ok(oscillators > 0, 'the opening menu bar is queued immediately with the unlock gesture');
  ok(await opening, 'the first gesture can unlock the audio context');

  ['hover', 'click', 'back', 'confirm', 'toggle', 'deny', 'modal', 'notification'].forEach(A.ui);
  ['shuffle', 'deal', 'pick', 'remove', 'ban', 'burn', 'place', 'reveal', 'legendary'].forEach(
    (kind) => A.card(kind)
  );
  ['Tank', 'Bruiser', 'Sniper', 'Caster', 'Controller', 'Medic'].forEach((role, i) =>
    A.battle('cast', {
      role,
      element: ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire'][i],
      signature: i % 2 === 0,
    })
  );
  ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire', 'Nature'].forEach((element) =>
    A.battle('element', { element, signature: true })
  );
  [
    ['impact', { element: 'Physical', crit: true }],
    ['aoe', { element: 'Lightning' }],
    ['heal', {}],
    ['shield', {}],
    ['buff', {}],
    ['debuff', {}],
    ['burn', {}],
    ['cleanse', {}],
    ['energy', { positive: true }],
    ['death', {}],
    ['revive', {}],
    ['coin', { face: 'heads' }],
    ['round', { phase: 2 }],
    ['turn', { side: 'enemy' }],
    ['pass', {}],
    ['battlefield', {}],
  ].forEach(([kind, meta]) => A.battle(kind, meta));
  ['dialogue', 'page', 'gate', 'reward', 'bark'].forEach((kind) => A.campaign(kind));
  ['buy', 'drop', 'charge', 'burst', 'deal', 'flip', 'legendary', 'summary'].forEach((kind) =>
    A.pack(kind)
  );
  A.result(true);
  A.result(false);
  ok(oscillators > 100 && noises > 20, 'all cue families synthesize oscillator and noise voices');

  const route = {
    menu: 'menu',
    campaign: 'road',
    road: 'road',
    prep: 'prep',
    shop: 'menu',
    battle: 'battleWar',
  };
  Object.keys(route).forEach((scene) =>
    ok(A._trackForScene(scene) === route[scene], scene + ' routes to the intended score')
  );

  /* All ordinary menus share one live phrase. If a route maps to the same
     track, startTrack() must leave both its token and scheduler position
     alone rather than replaying the opening bar. */
  A.scene('menu');
  const menuStart = A._musicState();
  ['play', 'shop', 'collection', 'deck', 'rulebook', 'home'].forEach((view) =>
    document.dispatchEvent(new CustomEvent('eol:view', { detail: view }))
  );
  const menuAfterTour = A._musicState();
  ok(
    menuAfterTour.track === 'menu' && menuAfterTour.token === menuStart.token,
    'the main soundtrack continues uninterrupted through every ordinary menu'
  );

  document.dispatchEvent(new CustomEvent('eol:view', { detail: 'campaign' }));
  const roadStart = A._musicState();
  document.dispatchEvent(new CustomEvent('eol:view', { detail: 'chapter' }));
  const roadAfterChapter = A._musicState();
  ok(
    roadStart.track === 'road' &&
      roadAfterChapter.track === 'road' &&
      roadAfterChapter.token === roadStart.token,
    'the Road of Echoes has one separate score across campaign and chapter screens'
  );

  document.dispatchEvent(new CustomEvent('eol:view', { detail: 'prep' }));
  const prepStart = A._musicState();
  document.dispatchEvent(new CustomEvent('eol:view', { detail: 'draft' }));
  const prepAfterDraft = A._musicState();
  ok(
    prepStart.track === 'prep' &&
      prepAfterDraft.track === 'prep' &&
      prepAfterDraft.token === prepStart.token,
    'preparation and draft phases retain their separate match-phase score'
  );

  /* Fast-forward the procedural arranger without waiting twelve seconds.
     Bar five is the first drop: it must schedule a denser oscillator stack
     and percussion layer than the opening statement. */
  const introOscBefore = oscillators;
  const introNoiseBefore = noises;
  A._scheduleStep('menu', 0);
  const introVoices = oscillators - introOscBefore;
  const introNoiseVoices = noises - introNoiseBefore;
  const dropOscBefore = oscillators;
  const dropNoiseBefore = noises;
  A._scheduleStep('menu', 64);
  const dropVoices = oscillators - dropOscBefore;
  const dropNoiseVoices = noises - dropNoiseBefore;
  ok(
    dropVoices > introVoices && dropNoiseVoices > introNoiseVoices,
    'the main theme earns a real bar-five beat drop instead of looping unchanged'
  );

  const prepInfo = A._trackInfo('prep');
  ['battleWar', 'battleBright', 'battleDark'].forEach((name) => {
    const info = A._trackInfo(name);
    ok(
      info && info.key === prepInfo.key && info.tempo > prepInfo.tempo,
      name + ' is faster while retaining Preparation’s key signature'
    );
  });

  A.scene('battle', { field: 'colosseum' });
  A.setBattlefield('mana-spring');
  ok(
    A._trackForScene('battle') === 'battleBright',
    'bright battlefields select the bright arrangement'
  );
  A.setBattlefield('spirit-world');
  ok(A._trackForScene('battle') === 'battleDark', 'dark battlefields select the dark arrangement');
  const noiseBeforeBattle = noises;
  ['battleWar', 'battleBright', 'battleDark'].forEach((name) => {
    for (let step = 0; step < 16; step++) A._scheduleStep(name, step);
  });
  ok(noises === noiseBeforeBattle, 'all three complete match arrangements avoid static/noise voices');

  const beforeTabSwitch = A._musicState();
  document.hidden = true;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.hidden = false;
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await wait(0);
  const afterTabSwitch = A._musicState();
  ok(
    afterTabSwitch.track === beforeTabSwitch.track &&
      afterTabSwitch.token === beforeTabSwitch.token,
    'returning from another tab resumes the same score generation without restarting'
  );

  const masterControl = document.getElementById('audio-master');
  masterControl.value = '61';
  masterControl.dispatchEvent(new Event('input'));
  A.setVolume('music', 37);
  A.setVolume('sfx', 73);
  let saved = JSON.parse(localStorage.getItem('eol.audio.v1'));
  ok(saved.master === 61 && saved.music === 37 && saved.sfx === 73, 'mixer values persist');
  ok(
    document.getElementById('audio-master-val').textContent === '61%',
    'mixer input bindings keep readouts synchronized'
  );
  document.getElementById('audio-mute').dispatchEvent(new Event('click'));
  saved = JSON.parse(localStorage.getItem('eol.audio.v1'));
  ok(saved.muted === true, 'mute state persists');
  ok(
    document.getElementById('audio-mute').getAttribute('aria-pressed') === 'true' &&
      document.getElementById('audio-mute').classList.contains('is-muted'),
    'mute control exposes accessible state'
  );
  document.getElementById('audio-mute').dispatchEvent(new Event('click'));
  document.getElementById('audio-test').dispatchEvent(new Event('click'));
  await wait(350);

  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cloud = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
  const battle = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
  const shop = fs.readFileSync(path.join(ROOT, 'js/shop.js'), 'utf8');
  const audioSource = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
  ok(
    page.indexOf('<script src="js/audio.js"') >= 0 &&
      page.indexOf('<script src="js/audio.js"') < page.indexOf('<script src="js/battle.js"'),
    'the audio director loads before gameplay modules'
  );
  ['audio-master', 'audio-music', 'audio-sfx', 'audio-mute', 'audio-test'].forEach((id) =>
    ok(page.includes(`id="${id}"`), 'settings includes #' + id)
  );
  ok(
    /\['eol\.audio\.v1',\s*'settings\.audio',\s*'json'\]/.test(cloud),
    'audio preferences are mirrored into cloud saves'
  );
  ok(
    /audio\.battle\('cast'/.test(battle) &&
      /audio\.battle\('coin'/.test(battle) &&
      /audio\.result\(win\)/.test(battle),
    'battle cast, bespoke coin, and result ceremonies are connected'
  );
  ok(
    /audio\.pack\('charge'/.test(shop) &&
      /audio\.pack\('burst'/.test(shop) &&
      /isLegend \? 'legendary' : 'flip'/.test(shop),
    'pack charge, burst, flip, and Legendary reveal beats are connected'
  );
  ok(
    /menu:\s*\{ tempo: 82[^\n]*phraseBars: 16/.test(audioSource) &&
      /var menuDrop =/.test(audioSource) &&
      /phraseBar === 4 \|\| phraseBar === 12/.test(audioSource),
    'the preserved menu melody now has a long-form build and two drop sections'
  );
  ok(
    /battleWar:\s*\{ tempo: 120[^\n]*key: 'D minor'/.test(audioSource) &&
      /battleBright:\s*\{ tempo: 124[^\n]*key: 'D minor'/.test(audioSource) &&
      /battleDark:\s*\{ tempo: 114[^\n]*key: 'D minor'/.test(audioSource) &&
      /var battleRoot = PREP_ROOTS\[chordIndex\]/.test(audioSource) &&
      /var battleChord = PREP_CHORDS\[chordIndex\]/.test(audioSource) &&
      /function battleBrass\(/.test(audioSource) &&
      /function battleStrings\(/.test(audioSource),
    'match scores use Preparation’s harmony with faster martial brass-and-strings arrangements'
  );

  console.log('\n' + (fail ? fail + ' FAILED' : 'ALL ' + pass + ' ASSERTIONS PASSED'));
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
