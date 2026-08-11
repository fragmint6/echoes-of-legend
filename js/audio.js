/* =============================================================
   Echoes of Legend - Audio Director
   -------------------------------------------------------------
   A complete, asset-free Web Audio score and sound system. Every sound
   is synthesized at runtime from oscillators and filtered noise, so the
   game ships no third-party recordings, has no licensing attribution,
   and cannot trigger a music Content ID claim.

   The language is deliberately shared rather than one sound per hero:
     - six ROLE voices describe how an action is delivered;
     - seven ELEMENT voices describe what power is released;
     - semantic UI, card, campaign, pack and battle sounds describe the
       rest of the game;
     - coin flips, revivals, criticals and Legendary reveals are the few
       authored exceptions that deserve their own ceremonies.

   Browsers forbid audio before a user gesture. `scene()` remembers the
   requested score immediately; the first pointer/key gesture creates and
   resumes the AudioContext, then starts the remembered score. Everything
   remains a silent no-op when Web Audio is unavailable.

   Persisted preference document:
     eol.audio.v1 = { master, music, sfx, muted } (0-100 volumes)
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var PREF_KEY = 'eol.audio.v1';
  var DEFAULTS = { master: 82, music: 42, sfx: 78, muted: false };
  var AudioCtor = window.AudioContext || window.webkitAudioContext || null;
  var ctx = null;
  var masterGain = null;
  var musicBus = null;
  var sfxBus = null;
  var uiBus = null;
  var reverb = null;
  var reverbReturn = null;
  var noiseBuffer = null;
  var unlocked = false;
  var unlockJob = null;
  var prefs = loadPrefs();

  var desiredScene = 'menu';
  var currentTrack = null;
  var trackGain = null;
  var musicTimer = null;
  var musicScheduler = null;
  var musicToken = 0;
  var musicSources = [];
  var nextStepTime = 0;
  var stepIndex = 0;
  var battleField = 'colosseum';
  var hiddenSuspended = false;
  var hoverAt = 0;
  var sliderAt = 0;

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function loadPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(PREF_KEY));
      if (raw && typeof raw === 'object') {
        return {
          master: clamp(raw.master == null ? DEFAULTS.master : raw.master, 0, 100),
          music: clamp(raw.music == null ? DEFAULTS.music : raw.music, 0, 100),
          sfx: clamp(raw.sfx == null ? DEFAULTS.sfx : raw.sfx, 0, 100),
          muted: !!raw.muted,
        };
      }
    } catch (e) {
      /* private mode or old malformed preference: defaults remain */
    }
    return {
      master: DEFAULTS.master,
      music: DEFAULTS.music,
      sfx: DEFAULTS.sfx,
      muted: DEFAULTS.muted,
    };
  }

  function persistPrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* the controls still govern this tab in private mode */
    }
    try {
      document.dispatchEvent(new CustomEvent('eol:audio-settings', { detail: getPrefs() }));
    } catch (e2) {
      /* decorative */
    }
  }

  function curve(v) {
    return Math.pow(clamp(v, 0, 100) / 100, 1.45);
  }

  function smoothGain(node, value, seconds) {
    if (!ctx || !node) return;
    var t = ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(Math.max(0.0001, value), t, seconds || 0.025);
  }

  function applyPrefs() {
    if (masterGain) smoothGain(masterGain, prefs.muted ? 0.0001 : curve(prefs.master), 0.018);
    if (musicBus) smoothGain(musicBus, curve(prefs.music) * 0.74, 0.025);
    if (sfxBus) smoothGain(sfxBus, curve(prefs.sfx), 0.018);
    document.documentElement.classList.toggle('audio-muted', !!prefs.muted);
    syncControls();
  }

  function makeImpulse(c, seconds, decay) {
    var len = Math.max(1, Math.floor(c.sampleRate * seconds));
    var buffer = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buffer.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buffer;
  }

  function makeNoise(c) {
    var len = Math.floor(c.sampleRate * 2);
    var buffer = c.createBuffer(1, len, c.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      /* a little correlation keeps impacts warmer than raw white noise */
      var white = Math.random() * 2 - 1;
      last = last * 0.2 + white * 0.8;
      data[i] = last;
    }
    return buffer;
  }

  function ensureContext() {
    if (ctx || !AudioCtor) return ctx;
    try {
      ctx = new AudioCtor({ latencyHint: 'interactive' });
    } catch (e) {
      try {
        ctx = new AudioCtor();
      } catch (e2) {
        ctx = null;
        return null;
      }
    }

    masterGain = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    uiBus = ctx.createGain();
    var compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 1.7, 3.1);
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.18;

    musicBus.connect(masterGain);
    sfxBus.connect(masterGain);
    uiBus.connect(sfxBus);
    reverb.connect(reverbReturn);
    reverbReturn.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
    noiseBuffer = makeNoise(ctx);
    applyPrefs();
    return ctx;
  }

  function unlock() {
    var c = ensureContext();
    if (!c) return Promise.resolve(false);
    if (unlocked && c.state === 'running') return Promise.resolve(true);
    if (unlockJob) return unlockJob;

    /* resume() must be INVOKED inside the gesture, but its promise may
       resolve noticeably later on Safari and some mobile browsers. Queue
       the opening bar now, while the context clock is still parked, so it
       begins at +80ms the instant the browser releases audio instead of
       waiting for that promise and then beginning another startup cycle. */
    var resumeJob = c.state === 'running' ? Promise.resolve() : c.resume();
    unlocked = true;
    if (!currentTrack && prefs.music > 0 && !prefs.muted) startTrack(trackForScene(desiredScene));

    unlockJob = Promise.resolve(resumeJob)
      .then(function () {
        unlocked = true;
        unlockJob = null;
        if (!currentTrack && prefs.music > 0 && !prefs.muted)
          startTrack(trackForScene(desiredScene));
        return true;
      })
      .catch(function () {
        unlocked = false;
        unlockJob = null;
        stopMusic(0.02);
        return false;
      });
    return unlockJob;
  }

  function now(when) {
    if (!ctx) return 0;
    return Math.max(ctx.currentTime + 0.006, when == null ? ctx.currentTime + 0.006 : when);
  }

  function outputFor(name) {
    if (name === 'music') return trackGain || musicBus;
    if (name === 'ui') return uiBus;
    return sfxBus;
  }

  function rememberSource(src, isMusic) {
    if (!isMusic) return;
    musicSources.push(src);
    src.addEventListener('ended', function () {
      var i = musicSources.indexOf(src);
      if (i >= 0) musicSources.splice(i, 1);
    });
  }

  function connectWet(node, amount) {
    if (!reverb || !amount) return;
    var send = ctx.createGain();
    send.gain.value = clamp(amount, 0, 1);
    node.connect(send);
    send.connect(reverb);
  }

  function tone(o) {
    if (!ensureContext() || prefs.muted) return null;
    o = o || {};
    var t = now(o.when);
    var dur = Math.max(0.025, o.dur || 0.15);
    var attack = Math.min(dur * 0.4, o.attack == null ? 0.008 : o.attack);
    var release = Math.min(dur * 0.8, o.release == null ? dur * 0.55 : o.release);
    var peak = Math.max(0.0001, o.gain == null ? 0.08 : o.gain);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var dest = o.dest || outputFor(o.bus || 'sfx');

    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, o.freq || 440), t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;

    filter.type = o.filterType || 'lowpass';
    filter.frequency.setValueAtTime(o.filter || 14000, t);
    if (o.filterTo)
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.filterTo), t + dur);
    filter.Q.value = o.q || 0.5;

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.002, attack));
    var hold = Math.max(t + attack + 0.002, t + dur - release);
    amp.gain.setValueAtTime(peak, hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filter);
    filter.connect(amp);
    if (ctx.createStereoPanner) {
      var pan = ctx.createStereoPanner();
      pan.pan.value = clamp(o.pan || 0, -1, 1);
      amp.connect(pan);
      pan.connect(dest);
      connectWet(pan, o.wet || 0);
    } else {
      amp.connect(dest);
      connectWet(amp, o.wet || 0);
    }
    osc.start(t);
    osc.stop(t + dur + 0.04);
    rememberSource(osc, o.bus === 'music');
    return osc;
  }

  function noise(o) {
    if (!ensureContext() || prefs.muted || !noiseBuffer) return null;
    o = o || {};
    var t = now(o.when);
    var dur = Math.max(0.025, Math.min(1.95, o.dur || 0.12));
    var peak = Math.max(0.0001, o.gain == null ? 0.07 : o.gain);
    var src = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var amp = ctx.createGain();
    var dest = o.dest || outputFor(o.bus || 'sfx');
    src.buffer = noiseBuffer;
    src.loop = dur > 1.7;
    filter.type = o.filterType || 'bandpass';
    filter.frequency.setValueAtTime(o.filter || 1400, t);
    if (o.filterTo)
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.filterTo), t + dur);
    filter.Q.value = o.q == null ? 0.8 : o.q;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(amp);
    if (ctx.createStereoPanner) {
      var pan = ctx.createStereoPanner();
      pan.pan.value = clamp(o.pan || 0, -1, 1);
      amp.connect(pan);
      pan.connect(dest);
      connectWet(pan, o.wet || 0);
    } else {
      amp.connect(dest);
      connectWet(amp, o.wet || 0);
    }
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.03);
    rememberSource(src, o.bus === 'music');
    return src;
  }

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  function note(n, when, dur, gain, type, o) {
    o = o || {};
    o.freq = midi(n);
    o.when = when;
    o.dur = dur;
    o.gain = gain;
    o.type = type || 'triangle';
    o.bus = o.bus || 'music';
    o.wet = o.wet == null ? 0.22 : o.wet;
    o.filter = o.filter || 5200;
    return tone(o);
  }

  function chord(notes, when, dur, gain, o) {
    o = o || {};
    notes.forEach(function (n, i) {
      note(n, when + i * 0.012, dur, gain, o.type || 'triangle', {
        bus: o.bus || 'music',
        dest: o.dest,
        wet: o.wet == null ? 0.34 : o.wet,
        filter: o.filter || 2600,
        attack: o.attack == null ? 0.28 : o.attack,
        release: o.release == null ? Math.min(1.2, dur * 0.6) : o.release,
        pan: (i - (notes.length - 1) / 2) * 0.25,
        detune: o.detune || 0,
      });
    });
  }

  /* ------------------------ UI language ------------------------ */
  function ui(kind) {
    if (!unlocked && kind !== 'test') return;
    var t = ctx ? ctx.currentTime + 0.008 : 0;
    switch (kind) {
      case 'hover':
        tone({ freq: 620, to: 690, when: t, dur: 0.045, gain: 0.016, type: 'sine', bus: 'ui' });
        break;
      case 'back':
      case 'close':
        tone({ freq: 420, to: 230, when: t, dur: 0.13, gain: 0.045, type: 'triangle', bus: 'ui' });
        noise({ when: t, dur: 0.06, gain: 0.018, filter: 900, bus: 'ui' });
        break;
      case 'confirm':
      case 'save':
        tone({ freq: 440, when: t, dur: 0.1, gain: 0.045, type: 'triangle', bus: 'ui', wet: 0.1 });
        tone({
          freq: 660,
          when: t + 0.065,
          dur: 0.15,
          gain: 0.04,
          type: 'sine',
          bus: 'ui',
          wet: 0.2,
        });
        break;
      case 'toggle':
      case 'tick':
        tone({
          freq: kind === 'tick' ? 760 : 520,
          to: kind === 'tick' ? 810 : 650,
          when: t,
          dur: 0.055,
          gain: 0.026,
          type: 'square',
          filter: 2400,
          bus: 'ui',
        });
        break;
      case 'error':
      case 'deny':
        tone({
          freq: 155,
          to: 112,
          when: t,
          dur: 0.22,
          gain: 0.065,
          type: 'sawtooth',
          filter: 1100,
          bus: 'ui',
        });
        tone({
          freq: 174,
          to: 125,
          when: t + 0.02,
          dur: 0.2,
          gain: 0.035,
          type: 'square',
          filter: 800,
          bus: 'ui',
        });
        break;
      case 'modal':
        noise({ when: t, dur: 0.18, gain: 0.024, filter: 850, filterTo: 2500, bus: 'ui' });
        tone({
          freq: 330,
          to: 495,
          when: t,
          dur: 0.2,
          gain: 0.035,
          type: 'sine',
          bus: 'ui',
          wet: 0.2,
        });
        break;
      case 'notification':
        tone({ freq: 784, when: t, dur: 0.14, gain: 0.036, type: 'sine', bus: 'ui', wet: 0.25 });
        tone({
          freq: 988,
          when: t + 0.09,
          dur: 0.18,
          gain: 0.028,
          type: 'sine',
          bus: 'ui',
          wet: 0.3,
        });
        break;
      case 'test':
        unlock().then(function () {
          ui('confirm');
          setTimeout(function () {
            card('deal', { pan: -0.2 });
          }, 140);
          setTimeout(function () {
            battle('element', { element: 'Magic', signature: true });
          }, 310);
        });
        break;
      default:
        tone({ freq: 260, to: 220, when: t, dur: 0.075, gain: 0.032, type: 'triangle', bus: 'ui' });
        noise({ when: t, dur: 0.035, gain: 0.014, filter: 1700, bus: 'ui' });
    }
  }

  /* ----------------------- card language ----------------------- */
  function card(kind, meta) {
    if (!unlocked) return;
    meta = meta || {};
    var t = ctx.currentTime + (meta.delay || 0) / 1000 + 0.006;
    var pan = clamp(meta.pan || 0, -0.85, 0.85);
    switch (kind) {
      case 'shuffle':
        for (var i = 0; i < 6; i++) {
          noise({
            when: t + i * 0.045,
            dur: 0.055,
            gain: 0.026,
            filter: 1050 + i * 90,
            q: 1.1,
            pan: i % 2 ? 0.25 : -0.25,
          });
        }
        tone({ freq: 130, to: 105, when: t, dur: 0.32, gain: 0.035, type: 'triangle' });
        break;
      case 'deal':
        noise({ when: t, dur: 0.095, gain: 0.035, filter: 1150, filterTo: 2600, q: 0.7, pan: pan });
        tone({
          freq: 180,
          to: 125,
          when: t + 0.015,
          dur: 0.095,
          gain: 0.028,
          type: 'triangle',
          pan: pan,
        });
        break;
      case 'pick':
        tone({ freq: 190, to: 120, when: t, dur: 0.12, gain: 0.062, type: 'sine', pan: pan });
        tone({
          freq: 660,
          when: t + 0.045,
          dur: 0.12,
          gain: 0.025,
          type: 'triangle',
          pan: pan,
          wet: 0.16,
        });
        break;
      case 'remove':
        noise({ when: t, dur: 0.1, gain: 0.032, filter: 1700, filterTo: 700, pan: pan });
        tone({ freq: 330, to: 180, when: t, dur: 0.13, gain: 0.03, type: 'triangle', pan: pan });
        break;
      case 'ban':
        noise({ when: t, dur: 0.16, gain: 0.075, filter: 2600, filterTo: 520, q: 0.9, pan: pan });
        tone({
          freq: 105,
          to: 62,
          when: t + 0.02,
          dur: 0.28,
          gain: 0.085,
          type: 'sawtooth',
          filter: 700,
        });
        tone({ freq: 620, to: 180, when: t, dur: 0.18, gain: 0.035, type: 'square', filter: 1800 });
        break;
      case 'burn':
        noise({ when: t, dur: 0.32, gain: 0.055, filter: 3200, filterTo: 650, q: 0.5, pan: pan });
        for (var b = 0; b < 3; b++)
          tone({
            freq: 180 + b * 70,
            to: 420 + b * 90,
            when: t + b * 0.045,
            dur: 0.19,
            gain: 0.018,
            type: 'sawtooth',
            filter: 1200,
            pan: pan,
          });
        break;
      case 'place':
        tone({ freq: 125, to: 82, when: t, dur: 0.15, gain: 0.072, type: 'sine', pan: pan });
        noise({ when: t, dur: 0.075, gain: 0.04, filter: 580, q: 0.6, pan: pan });
        break;
      case 'reveal':
        noise({
          when: t,
          dur: 0.17,
          gain: 0.03,
          filter: 750,
          filterTo: 4200,
          q: 0.5,
          pan: pan,
          wet: 0.12,
        });
        tone({
          freq: 392,
          to: 784,
          when: t + 0.025,
          dur: 0.22,
          gain: 0.036,
          type: 'triangle',
          pan: pan,
          wet: 0.24,
        });
        break;
      case 'legendary':
        chord([62, 69, 74, 78], t, 1.25, 0.047, {
          bus: 'sfx',
          wet: 0.5,
          filter: 4400,
          attack: 0.025,
          release: 0.9,
        });
        tone({ freq: 92, to: 55, when: t, dur: 0.72, gain: 0.08, type: 'sine' });
        for (var l = 0; l < 6; l++)
          tone({
            freq: midi(74 + l * 2),
            when: t + 0.12 + l * 0.065,
            dur: 0.42,
            gain: 0.019,
            type: 'sine',
            wet: 0.45,
            pan: (l - 2.5) * 0.12,
          });
        break;
      default:
        card('pick', meta);
    }
  }

  /* ---------------- role + element battle language ---------------- */
  function roleVoice(role, t, signature) {
    var boost = signature ? 1.22 : 1;
    switch (role) {
      case 'Tank':
        tone({
          freq: 94,
          to: 55,
          when: t,
          dur: 0.3,
          gain: 0.075 * boost,
          type: 'square',
          filter: 620,
        });
        noise({ when: t + 0.02, dur: 0.18, gain: 0.052 * boost, filter: 470, q: 0.7 });
        break;
      case 'Bruiser':
        noise({ when: t, dur: 0.19, gain: 0.065 * boost, filter: 2500, filterTo: 650, q: 0.6 });
        tone({
          freq: 150,
          to: 72,
          when: t + 0.03,
          dur: 0.2,
          gain: 0.055 * boost,
          type: 'sawtooth',
          filter: 900,
        });
        break;
      case 'Sniper':
        tone({
          freq: 1250,
          to: 390,
          when: t,
          dur: 0.12,
          gain: 0.035 * boost,
          type: 'sine',
          pan: -0.12,
        });
        noise({
          when: t + 0.075,
          dur: 0.055,
          gain: 0.055 * boost,
          filter: 3500,
          q: 2.1,
          pan: 0.12,
        });
        break;
      case 'Caster':
        for (var c = 0; c < (signature ? 5 : 3); c++)
          tone({
            freq: midi(62 + c * 4),
            when: t + c * 0.045,
            dur: 0.28,
            gain: 0.024 * boost,
            type: 'triangle',
            wet: 0.35,
            pan: (c - 2) * 0.1,
          });
        break;
      case 'Controller':
        tone({
          freq: 210,
          to: 420,
          when: t,
          dur: 0.34,
          gain: 0.042 * boost,
          type: 'sine',
          filter: 1800,
          wet: 0.38,
        });
        tone({
          freq: 217,
          to: 205,
          when: t,
          dur: 0.34,
          gain: 0.022 * boost,
          type: 'square',
          filter: 900,
          wet: 0.25,
        });
        break;
      case 'Medic':
        tone({ freq: 523, when: t, dur: 0.46, gain: 0.035 * boost, type: 'sine', wet: 0.48 });
        tone({ freq: 659, when: t + 0.06, dur: 0.5, gain: 0.028 * boost, type: 'sine', wet: 0.5 });
        tone({ freq: 784, when: t + 0.12, dur: 0.52, gain: 0.02 * boost, type: 'sine', wet: 0.52 });
        break;
      default:
        tone({ freq: 260, to: 190, when: t, dur: 0.16, gain: 0.045 * boost, type: 'triangle' });
    }
  }

  function elementVoice(element, t, strong) {
    var g = strong ? 1.24 : 1;
    switch (element) {
      case 'Physical':
        tone({ freq: 115, to: 58, when: t, dur: 0.18, gain: 0.066 * g, type: 'sine' });
        noise({ when: t, dur: 0.11, gain: 0.052 * g, filter: 720, q: 0.7 });
        break;
      case 'Magic':
        for (var m = 0; m < 4; m++)
          tone({
            freq: midi(67 + m * 3),
            when: t + m * 0.035,
            dur: 0.26,
            gain: 0.023 * g,
            type: 'triangle',
            wet: 0.45,
            pan: (m - 1.5) * 0.13,
          });
        break;
      case 'Shadow':
        tone({
          freq: 185,
          to: 74,
          when: t,
          dur: 0.42,
          gain: 0.055 * g,
          type: 'sawtooth',
          filter: 1050,
          filterTo: 350,
          wet: 0.35,
        });
        noise({
          when: t,
          dur: 0.34,
          gain: 0.035 * g,
          filter: 620,
          filterTo: 1700,
          q: 1.2,
          wet: 0.3,
        });
        break;
      case 'Light':
        tone({ freq: 784, when: t, dur: 0.52, gain: 0.034 * g, type: 'sine', wet: 0.55 });
        tone({ freq: 1175, when: t + 0.045, dur: 0.42, gain: 0.022 * g, type: 'sine', wet: 0.58 });
        break;
      case 'Lightning':
        noise({ when: t, dur: 0.18, gain: 0.07 * g, filter: 5400, filterTo: 950, q: 0.8 });
        for (var z = 0; z < 4; z++)
          tone({
            freq: z % 2 ? 920 : 1320,
            to: z % 2 ? 1450 : 680,
            when: t + z * 0.027,
            dur: 0.055,
            gain: 0.026 * g,
            type: 'square',
            filter: 4200,
            pan: z % 2 ? 0.25 : -0.25,
          });
        break;
      case 'Fire':
        noise({ when: t, dur: 0.38, gain: 0.058 * g, filter: 720, filterTo: 3500, q: 0.5 });
        for (var f = 0; f < 3; f++)
          tone({
            freq: 130 + f * 45,
            to: 360 + f * 80,
            when: t + f * 0.045,
            dur: 0.26,
            gain: 0.026 * g,
            type: 'sawtooth',
            filter: 1300,
          });
        break;
      case 'Nature':
        tone({
          freq: 196,
          to: 145,
          when: t,
          dur: 0.13,
          gain: 0.055 * g,
          type: 'triangle',
          filter: 1200,
        });
        tone({ freq: 587, when: t + 0.04, dur: 0.42, gain: 0.025 * g, type: 'sine', wet: 0.48 });
        noise({ when: t + 0.02, dur: 0.28, gain: 0.026 * g, filter: 2600, q: 1.3, wet: 0.2 });
        break;
      default:
        elementVoice('Physical', t, strong);
    }
  }

  /* Combat can resolve several engine events in one frame (team buffs,
     chain hits, mass deaths). Keep those events visible, but collapse
     same-family transients into one readable cue instead of stacking a
     dozen oscillator voices. Casts, rounds, turns and the authored
     ceremonies remain unthrottled because they already occur serially. */
  var battleAt = {};
  var BATTLE_GAP = {
    impact: 70,
    heal: 90,
    shield: 160,
    buff: 500,
    debuff: 500,
    burn: 140,
    cleanse: 110,
    energy: 100,
    death: 180,
  };
  function battleAllowed(kind) {
    var gap = BATTLE_GAP[kind] || 0;
    if (!gap) return true;
    var at = Date.now();
    if (battleAt[kind] && at - battleAt[kind] < gap) return false;
    battleAt[kind] = at;
    return true;
  }

  function battle(kind, meta) {
    if (!unlocked || !battleAllowed(kind)) return;
    meta = meta || {};
    var t = ctx.currentTime + (meta.delay || 0) / 1000 + 0.008;
    switch (kind) {
      case 'cast':
        roleVoice(meta.role, t, !!meta.signature);
        elementVoice(meta.element || 'Physical', t + 0.08, !!meta.signature);
        if (meta.signature)
          tone({ freq: 82, to: 48, when: t, dur: 0.46, gain: 0.06, type: 'sine' });
        break;
      case 'element':
        elementVoice(meta.element || 'Magic', t, !!meta.signature);
        break;
      case 'impact':
        elementVoice(meta.element || 'Physical', t, !!meta.crit);
        if (meta.crit) battle('crit', { delay: (meta.delay || 0) + 15 });
        break;
      case 'aoe':
        tone({ freq: 86, to: 38, when: t, dur: 0.5, gain: 0.1, type: 'sine' });
        noise({
          when: t + 0.04,
          dur: 0.5,
          gain: 0.075,
          filter: 420,
          filterTo: 2800,
          q: 0.5,
          wet: 0.2,
        });
        elementVoice(meta.element || 'Magic', t + 0.08, true);
        break;
      case 'crit':
        noise({ when: t, dur: 0.21, gain: 0.1, filter: 3900, filterTo: 650, q: 0.65 });
        tone({
          freq: 1240,
          to: 180,
          when: t,
          dur: 0.16,
          gain: 0.055,
          type: 'square',
          filter: 3600,
        });
        tone({ freq: 78, to: 42, when: t + 0.025, dur: 0.43, gain: 0.105, type: 'sine' });
        break;
      case 'heal':
        roleVoice('Medic', t, !!meta.signature);
        noise({ when: t, dur: 0.42, gain: 0.02, filter: 3000, filterTo: 6200, q: 0.7, wet: 0.4 });
        break;
      case 'shield':
        tone({ freq: 210, to: 420, when: t, dur: 0.26, gain: 0.052, type: 'triangle', wet: 0.3 });
        tone({ freq: 840, when: t + 0.12, dur: 0.42, gain: 0.027, type: 'sine', wet: 0.42 });
        noise({ when: t + 0.08, dur: 0.17, gain: 0.045, filter: 3300, q: 2.2 });
        break;
      case 'buff':
        tone({ freq: 392, to: 587, when: t, dur: 0.23, gain: 0.035, type: 'triangle', wet: 0.28 });
        tone({ freq: 784, when: t + 0.1, dur: 0.24, gain: 0.02, type: 'sine', wet: 0.4 });
        break;
      case 'debuff':
        tone({
          freq: 330,
          to: 147,
          when: t,
          dur: 0.3,
          gain: 0.045,
          type: 'sawtooth',
          filter: 950,
          wet: 0.2,
        });
        noise({ when: t, dur: 0.22, gain: 0.025, filter: 780, q: 1.4 });
        break;
      case 'burn':
        elementVoice('Fire', t, false);
        break;
      case 'cleanse':
        noise({ when: t, dur: 0.3, gain: 0.04, filter: 900, filterTo: 6500, q: 1.2, wet: 0.45 });
        tone({
          freq: 587,
          to: 1175,
          when: t + 0.03,
          dur: 0.36,
          gain: 0.03,
          type: 'sine',
          wet: 0.55,
        });
        break;
      case 'energy':
        tone({
          freq: meta.positive === false ? 520 : 260,
          to: meta.positive === false ? 210 : 720,
          when: t,
          dur: 0.24,
          gain: 0.038,
          type: 'square',
          filter: 1800,
          wet: 0.2,
        });
        break;
      case 'death':
        tone({
          freq: 165,
          to: 43,
          when: t,
          dur: 0.62,
          gain: 0.065,
          type: 'sawtooth',
          filter: 850,
          filterTo: 240,
        });
        noise({ when: t + 0.05, dur: 0.52, gain: 0.045, filter: 950, filterTo: 260, q: 0.5 });
        break;
      case 'revive':
        tone({ freq: 110, to: 220, when: t, dur: 0.65, gain: 0.045, type: 'sine', wet: 0.4 });
        for (var r = 0; r < 6; r++)
          tone({
            freq: midi(57 + r * 3),
            when: t + 0.12 + r * 0.075,
            dur: 0.62,
            gain: 0.025,
            type: 'sine',
            wet: 0.58,
            pan: (r - 2.5) * 0.1,
          });
        break;
      case 'coin':
        /* The visual coin spins for 1.45s. Accelerating metal ticks fill
           that exact flight, then the result tone lands on the frame the
           face and HEADS/TAILS label settle. */
        for (var k = 0; k < 16; k++)
          tone({
            freq: k % 2 ? 1320 : 980,
            when: t + k * (0.056 + k * 0.002),
            dur: 0.045,
            gain: 0.025,
            type: 'square',
            filter: 5200,
            pan: Math.sin(k) * 0.4,
          });
        var land = t + 1.45;
        tone({
          freq: meta.face === 'heads' ? 784 : 587,
          when: land,
          dur: 0.5,
          gain: 0.052,
          type: 'sine',
          wet: 0.55,
        });
        tone({ freq: 118, to: 70, when: land, dur: 0.25, gain: 0.068, type: 'sine' });
        noise({ when: land, dur: 0.09, gain: 0.055, filter: 2600, q: 2.4 });
        break;
      case 'round':
        tone({ freq: 73, to: 55, when: t, dur: 0.65, gain: 0.09, type: 'sine' });
        chord(meta.phase === 2 ? [62, 67, 70] : [57, 62, 65], t + 0.08, 0.72, 0.033, {
          bus: 'sfx',
          wet: 0.42,
          filter: 2300,
          attack: 0.025,
          release: 0.5,
        });
        break;
      case 'turn':
        tone({
          freq: meta.side === 'enemy' ? 196 : 294,
          to: meta.side === 'enemy' ? 147 : 440,
          when: t,
          dur: 0.18,
          gain: 0.038,
          type: 'triangle',
          wet: 0.18,
        });
        break;
      case 'pass':
        tone({ freq: 300, to: 145, when: t, dur: 0.28, gain: 0.04, type: 'triangle' });
        noise({ when: t, dur: 0.17, gain: 0.023, filter: 800 });
        break;
      case 'battlefield':
        tone({ freq: 65, to: 48, when: t, dur: 0.8, gain: 0.085, type: 'sine' });
        noise({ when: t, dur: 0.65, gain: 0.04, filter: 480, filterTo: 2300, wet: 0.35 });
        chord([50, 57, 62], t + 0.08, 1.0, 0.026, {
          bus: 'sfx',
          wet: 0.55,
          filter: 1900,
          attack: 0.18,
          release: 0.65,
        });
        break;
      default:
        elementVoice(meta.element || 'Physical', t, false);
    }
  }

  /* ---------------- campaign and pack ceremonies ---------------- */
  function campaign(kind, meta) {
    if (!unlocked) return;
    meta = meta || {};
    var t = ctx.currentTime + (meta.delay || 0) / 1000 + 0.008;
    switch (kind) {
      case 'dialogue':
        tone({ freq: 247, to: 294, when: t, dur: 0.12, gain: 0.024, type: 'triangle', wet: 0.25 });
        noise({ when: t, dur: 0.08, gain: 0.014, filter: 1200 });
        break;
      case 'page':
        noise({ when: t, dur: 0.16, gain: 0.032, filter: 1150, filterTo: 2400, q: 0.8, pan: 0.12 });
        break;
      case 'gate':
        tone({ freq: 52, to: 38, when: t, dur: 0.9, gain: 0.09, type: 'sine' });
        noise({
          when: t + 0.05,
          dur: 0.72,
          gain: 0.052,
          filter: 350,
          filterTo: 1300,
          q: 0.55,
          wet: 0.3,
        });
        chord([50, 57, 62], t + 0.16, 1.1, 0.032, {
          bus: 'sfx',
          wet: 0.5,
          filter: 1800,
          attack: 0.12,
          release: 0.72,
        });
        break;
      case 'reward':
        for (var i = 0; i < 5; i++)
          tone({
            freq: midi(62 + i * 2 + (i > 2 ? 1 : 0)),
            when: t + i * 0.075,
            dur: 0.42,
            gain: 0.028,
            type: 'triangle',
            wet: 0.45,
            pan: (i - 2) * 0.12,
          });
        tone({ freq: 110, to: 74, when: t, dur: 0.45, gain: 0.055, type: 'sine' });
        break;
      case 'bark':
        tone({ freq: 220, to: 260, when: t, dur: 0.16, gain: 0.023, type: 'sine', wet: 0.32 });
        break;
      default:
        campaign('page', meta);
    }
  }

  function pack(kind, meta) {
    if (!unlocked) return;
    meta = meta || {};
    var t = ctx.currentTime + (meta.delay || 0) / 1000 + 0.008;
    switch (kind) {
      case 'buy':
        for (var i = 0; i < 4; i++)
          tone({
            freq: 1050 + i * 90,
            when: t + i * 0.045,
            dur: 0.09,
            gain: 0.026,
            type: 'square',
            filter: 3600,
            pan: (i - 1.5) * 0.12,
          });
        tone({ freq: 135, to: 95, when: t, dur: 0.22, gain: 0.05, type: 'sine' });
        break;
      case 'drop':
        tone({ freq: 95, to: 48, when: t, dur: 0.32, gain: 0.09, type: 'sine' });
        noise({ when: t + 0.12, dur: 0.14, gain: 0.062, filter: 420, q: 0.6 });
        break;
      case 'charge':
        tone({
          freq: 105,
          to: 630,
          when: t,
          dur: 0.68,
          gain: 0.052,
          type: 'sawtooth',
          filter: 700,
          filterTo: 3600,
          wet: 0.32,
        });
        noise({ when: t, dur: 0.68, gain: 0.04, filter: 480, filterTo: 4200, q: 0.7, wet: 0.25 });
        break;
      case 'burst':
        noise({ when: t, dur: 0.52, gain: 0.11, filter: 3200, filterTo: 380, q: 0.5, wet: 0.24 });
        tone({ freq: 88, to: 38, when: t, dur: 0.55, gain: 0.11, type: 'sine' });
        chord([62, 69, 74], t + 0.04, 0.75, 0.036, {
          bus: 'sfx',
          wet: 0.46,
          filter: 3600,
          attack: 0.01,
          release: 0.55,
        });
        break;
      case 'deal':
        card('deal', meta);
        break;
      case 'flip':
        card('reveal', meta);
        break;
      case 'legendary':
        card('legendary', meta);
        break;
      case 'summary':
        ui('confirm');
        break;
      default:
        pack('drop', meta);
    }
  }

  /* --------------------------- music --------------------------- */
  var TRACKS = {
    menu: { tempo: 82, steps: 16 },
    campaign: { tempo: 70, steps: 16 },
    prep: { tempo: 102, steps: 16 },
    shop: { tempo: 92, steps: 16 },
    /* Battle keeps its noise-free orchestral language but moves with more
       urgency than the old half-time bed. These are only a modest lift;
       the intensity comes mainly from martial pulses, low-string motion
       and brass-shaped phrases rather than a retro high-register loop. */
    battleWar: { tempo: 104, steps: 16 },
    battleBright: { tempo: 108, steps: 16 },
    battleDark: { tempo: 98, steps: 16 },
  };

  function trackForScene(scene) {
    if (scene === 'battle') {
      if (['mana-spring', 'open-plains', 'heros-trial'].indexOf(battleField) >= 0)
        return 'battleBright';
      if (['blood-battlefield', 'energy-void', 'spirit-world'].indexOf(battleField) >= 0)
        return 'battleDark';
      return 'battleWar';
    }
    if (scene === 'shop') return 'shop';
    if (scene === 'campaign') return 'campaign';
    if (scene === 'prep') return 'prep';
    return 'menu';
  }

  function kick(t, gain, dest) {
    tone({
      freq: 128,
      to: 43,
      when: t,
      dur: 0.19,
      gain: gain || 0.065,
      type: 'sine',
      bus: 'music',
      dest: dest,
      wet: 0,
    });
  }

  function snare(t, gain, dest) {
    noise({
      when: t,
      dur: 0.12,
      gain: gain || 0.035,
      filter: 1650,
      q: 0.7,
      bus: 'music',
      dest: dest,
      wet: 0.08,
    });
    tone({
      freq: 155,
      to: 110,
      when: t,
      dur: 0.09,
      gain: (gain || 0.035) * 0.45,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: 0,
    });
  }

  function hat(t, gain, dest, open) {
    noise({
      when: t,
      dur: open ? 0.16 : 0.045,
      gain: gain || 0.013,
      filterType: 'highpass',
      filter: 6200,
      q: 0.4,
      bus: 'music',
      dest: dest,
      wet: 0.03,
    });
  }

  /* A soft, fully tonal war drum for matches. Unlike Prep's snare and
     hats, this contains no noise source and no upper-frequency burst;
     even headphones at high volume hear a rounded pulse, never static. */
  function battlePulse(t, gain, dest, high) {
    tone({
      freq: high ? 112 : 88,
      to: high ? 62 : 46,
      when: t,
      dur: high ? 0.22 : 0.32,
      gain: gain || 0.05,
      type: 'sine',
      bus: 'music',
      dest: dest,
      wet: 0.02,
      filter: 520,
      attack: 0.012,
      release: 0.2,
    });
    tone({
      freq: high ? 168 : 132,
      to: high ? 118 : 84,
      when: t + 0.012,
      dur: 0.16,
      gain: (gain || 0.05) * 0.24,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: 0,
      filter: 640,
      attack: 0.006,
      release: 0.11,
    });
  }

  /* Filtered, layered battle voices. A raw square/triangle lead reads as
     an 8-bit oscillator; these slower low-pass attacks suggest brass and
     bowed strings while remaining fully procedural and noise-free. */
  function battleBrass(n, t, d, g, dest, pan, dark) {
    note(n, t, d, g, 'sawtooth', {
      bus: 'music',
      dest: dest,
      pan: pan || 0,
      wet: dark ? 0.1 : 0.14,
      filter: dark ? 980 : 1450,
      attack: 0.045,
      release: Math.min(0.34, d * 0.72),
    });
    note(n - 12, t + 0.008, d * 0.94, g * 0.48, 'triangle', {
      bus: 'music',
      dest: dest,
      pan: (pan || 0) - 0.04,
      wet: 0.05,
      filter: dark ? 620 : 820,
      attack: 0.035,
      release: Math.min(0.3, d * 0.68),
    });
  }

  function battleStrings(n, t, d, g, dest, pan, dark) {
    note(n, t, d, g, 'sawtooth', {
      bus: 'music',
      dest: dest,
      pan: pan || 0,
      wet: 0.04,
      filter: dark ? 720 : 1040,
      attack: 0.014,
      release: Math.min(0.13, d * 0.48),
    });
    note(n + 12, t + 0.006, d * 0.72, g * 0.22, 'triangle', {
      bus: 'music',
      dest: dest,
      pan: (pan || 0) + 0.08,
      wet: 0.04,
      filter: dark ? 900 : 1300,
      attack: 0.012,
      release: Math.min(0.11, d * 0.42),
    });
  }

  function musicNote(n, t, d, g, wave, dest, pan, wet, filter) {
    note(n, t, d, g, wave, {
      bus: 'music',
      dest: dest,
      pan: pan || 0,
      wet: wet == null ? 0.2 : wet,
      filter: filter || 4200,
      attack: 0.008,
      release: Math.min(d * 0.75, 0.42),
    });
  }

  function scheduleMusicStep(name, absoluteStep, t, stepDur, dest) {
    var s = absoluteStep % 16;
    var bar = Math.floor(absoluteStep / 16);
    var chordIndex = bar % 4;

    if (name === 'menu') {
      var menuChords = [
        [50, 57, 62],
        [46, 53, 58],
        [48, 55, 60],
        [45, 52, 57],
      ];
      var menuMelody = [74, null, 77, 76, null, 74, 72, null, 69, null, 72, 74, null, 69, 67, null];
      if (s === 0)
        chord(menuChords[chordIndex], t, stepDur * 15.5, 0.011, {
          dest: dest,
          wet: 0.48,
          filter: 1700,
          attack: 0.55,
          release: 1.5,
        });
      if (s % 4 === 0)
        musicNote(
          menuChords[chordIndex][0] - 12,
          t,
          stepDur * 2.8,
          0.027,
          'triangle',
          dest,
          -0.08,
          0.12,
          900
        );
      if (menuMelody[s] != null)
        musicNote(menuMelody[s], t, stepDur * 1.6, 0.018, 'triangle', dest, 0.18, 0.38, 3100);
      if (s === 4 || s === 12) hat(t, 0.007, dest, true);
      return;
    }

    if (name === 'campaign') {
      var campChords = [
        [45, 52, 57],
        [43, 50, 55],
        [41, 48, 53],
        [43, 50, 57],
      ];
      var campBell = [
        69,
        null,
        null,
        72,
        null,
        null,
        67,
        null,
        64,
        null,
        null,
        67,
        null,
        69,
        null,
        null,
      ];
      if (s === 0)
        chord(campChords[chordIndex], t, stepDur * 15.8, 0.012, {
          dest: dest,
          wet: 0.58,
          filter: 1350,
          attack: 0.8,
          release: 2.2,
        });
      if (s === 0 || s === 8)
        musicNote(
          campChords[chordIndex][0] - 12,
          t,
          stepDur * 6.5,
          0.025,
          'sine',
          dest,
          -0.2,
          0.32,
          600
        );
      if (campBell[s] != null)
        musicNote(campBell[s], t, stepDur * 2.4, 0.018, 'sine', dest, 0.22, 0.62, 5000);
      if (s === 7 || s === 15)
        noise({
          when: t,
          dur: stepDur * 1.6,
          gain: 0.006,
          filter: 1600,
          q: 1.2,
          bus: 'music',
          dest: dest,
          wet: 0.35,
          pan: s === 7 ? -0.3 : 0.3,
        });
      return;
    }

    if (name === 'shop') {
      var shopRoots = [50, 55, 53, 57];
      var shopMelody = [74, 78, 81, null, 79, 78, 74, null, 76, 79, 83, null, 81, 79, 76, null];
      if (s % 4 === 0)
        musicNote(
          shopRoots[chordIndex] - 12,
          t,
          stepDur * 2.2,
          0.025,
          'triangle',
          dest,
          -0.18,
          0.08,
          1000
        );
      if (s % 2 === 0)
        musicNote(
          shopRoots[chordIndex] + (s % 4 ? 7 : 0),
          t,
          stepDur * 1.35,
          0.012,
          'square',
          dest,
          -0.05,
          0.16,
          1700
        );
      if (shopMelody[s] != null)
        musicNote(shopMelody[s], t, stepDur * 1.45, 0.016, 'triangle', dest, 0.2, 0.38, 3800);
      if (s === 4 || s === 12) hat(t, 0.008, dest, false);
      return;
    }

    if (name === 'prep') {
      var prepRoots = [50, 46, 48, 45];
      var prepLead = [62, null, 65, 69, null, 67, 65, null, 62, 65, null, 70, 69, null, 65, 67];
      if (s === 0 || s === 8) kick(t, 0.045, dest);
      if (s === 4 || s === 12) snare(t, 0.022, dest);
      if (s % 2 === 0) hat(t, 0.007, dest, s === 14);
      musicNote(
        prepRoots[chordIndex] - 12 + (s % 4 === 2 ? 7 : 0),
        t,
        stepDur * 0.85,
        0.024,
        'square',
        dest,
        -0.15,
        0.05,
        1000
      );
      if (prepLead[s] != null)
        musicNote(prepLead[s] + 12, t, stepDur * 1.2, 0.014, 'triangle', dest, 0.18, 0.26, 2900);
      if (s === 0)
        chord(
          [prepRoots[chordIndex], prepRoots[chordIndex] + 7, prepRoots[chordIndex] + 12],
          t,
          stepDur * 7.6,
          0.007,
          { dest: dest, wet: 0.32, filter: 1400, attack: 0.2, release: 0.8 }
        );
      return;
    }

    /* -------------------------------------------------------
       MATCH SCORE v3 - martial, tonal, and deliberately unlike Prep.

       Prep is a planning clock: clipped square bass, snare and hats.
       Matches use round sine war drums, filtered low strings, layered
       brass calls and sustained harmony at a slightly quicker pulse.
       Most importantly, there is NO noise source in any battle
       arrangement. Combat stays urgent without headphone static or a
       bright 8-bit lead competing with ability SFX.
       ------------------------------------------------------- */
    if (name === 'battleBright') {
      var brightRoots = [48, 55, 53, 50];
      var brightRoot = brightRoots[chordIndex];
      var brightDrive = [0, 7, 12, 7, 4, 7, 12, 9];
      var brightCall = [null, null, 67, null, 69, null, 72, 71, null, null, 69, null, 67, null, 64, 67];
      if (s % 4 === 0) battlePulse(t, s % 8 === 0 ? 0.058 : 0.034, dest, s % 8 !== 0);
      if (s === 0)
        chord([brightRoot, brightRoot + 4, brightRoot + 7], t, stepDur * 15.5, 0.009, {
          dest: dest,
          wet: 0.16,
          filter: 1700,
          attack: 0.38,
          release: 1.05,
        });
      if (s === 0 || s === 8)
        musicNote(
          brightRoot - 12 + (s === 8 ? 7 : 0),
          t,
          stepDur * 5.2,
          0.029,
          'sine',
          dest,
          -0.2,
          0.03,
          600
        );
      if (s % 2 === 0)
        battleStrings(
          brightRoot - 12 + brightDrive[s / 2],
          t,
          stepDur * 1.45,
          0.017,
          dest,
          -0.1,
          false
        );
      if (brightCall[s] != null)
        battleBrass(
          brightCall[s] + (chordIndex === 1 ? 0 : chordIndex === 2 ? -2 : 0),
          t,
          stepDur * (s === 7 || s === 15 ? 2.5 : 1.8),
          0.012,
          dest,
          0.16,
          false
        );
      return;
    }

    if (name === 'battleDark') {
      var darkRoots = [38, 41, 36, 33];
      var darkRoot = darkRoots[chordIndex];
      var darkDrive = [0, 0, 5, 3, 0, 7, 5, 3];
      var darkCall = [null, null, 50, null, null, 53, null, 52, null, null, 55, null, 53, null, 50, null];
      if (s % 4 === 0) battlePulse(t, s % 8 === 0 ? 0.061 : 0.036, dest, s % 8 !== 0);
      if (s === 6 || s === 14) battlePulse(t, 0.024, dest, true);
      if (s === 0) {
        chord([darkRoot, darkRoot + 5, darkRoot + 10], t, stepDur * 15.7, 0.01, {
          dest: dest,
          wet: 0.18,
          filter: 980,
          attack: 0.68,
          release: 1.5,
        });
        musicNote(darkRoot - 12, t, stepDur * 14.8, 0.032, 'sine', dest, -0.22, 0.02, 400);
      }
      if (s % 2 === 0)
        battleStrings(
          darkRoot + darkDrive[s / 2],
          t,
          stepDur * 1.55,
          0.018,
          dest,
          -0.12,
          true
        );
      if (darkCall[s] != null)
        battleBrass(
          darkCall[s] + (chordIndex === 2 ? -2 : chordIndex === 3 ? -3 : 0),
          t,
          stepDur * (s === 10 ? 2.7 : 2.1),
          0.014,
          dest,
          0.14,
          true
        );
      return;
    }

    /* Neutral and martial fields: a driving low-string figure, four-beat
       war-drum pattern and a descending brass answer. It leaves the upper
       spectrum open for casts and impacts instead of competing with them
       as a bright arcade lead. */
    var warRoots = [43, 46, 41, 38];
    var warRoot = warRoots[chordIndex];
    var warDrive = [0, 7, 0, 10, 0, 7, 12, 10];
    var warLead = [null, null, 67, null, 70, null, 69, 67, null, null, 65, null, 67, null, 62, 65];
    if (s % 4 === 0) battlePulse(t, s % 8 === 0 ? 0.064 : 0.038, dest, s % 8 !== 0);
    if (s === 6 || s === 14) battlePulse(t, 0.026, dest, true);
    if (s === 0)
      chord([warRoot, warRoot + 7, warRoot + 10], t, stepDur * 15.5, 0.009, {
        dest: dest,
        wet: 0.13,
        filter: 1280,
        attack: 0.42,
        release: 1.15,
      });
    if (s === 0 || s === 8)
      musicNote(
        warRoot - 12 + (s === 8 ? 7 : 0),
        t,
        stepDur * 5.5,
        0.031,
        'sine',
        dest,
        -0.22,
        0.02,
        540
      );
    if (s % 2 === 0)
      battleStrings(
        warRoot - 12 + warDrive[s / 2],
        t,
        stepDur * 1.5,
        0.018,
        dest,
        -0.1,
        false
      );
    if (warLead[s] != null)
      battleBrass(
        warLead[s] + (chordIndex === 2 ? -2 : chordIndex === 3 ? -3 : 0),
        t,
        stepDur * (s === 7 || s === 15 ? 2.5 : 1.9),
        0.013,
        dest,
        0.16,
        chordIndex === 3
      );
  }

  function stopMusic(fade) {
    musicToken++;
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
    musicScheduler = null;
    var oldGain = trackGain;
    var oldSources = musicSources.slice();
    musicSources.length = 0;
    if (ctx && oldGain) {
      var t = ctx.currentTime;
      oldGain.gain.cancelScheduledValues(t);
      oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), t);
      oldGain.gain.exponentialRampToValueAtTime(0.0001, t + (fade == null ? 0.32 : fade));
      setTimeout(
        function () {
          oldSources.forEach(function (s) {
            try {
              s.stop();
            } catch (e) {
              /* already ended */
            }
          });
          try {
            oldGain.disconnect();
          } catch (e2) {
            /* already disconnected */
          }
        },
        Math.max(80, ((fade == null ? 0.32 : fade) + 0.1) * 1000)
      );
    }
    trackGain = null;
    currentTrack = null;
  }

  function startTrack(name) {
    if (!ctx || !unlocked || prefs.muted || prefs.music <= 0 || document.hidden) return;
    if (!TRACKS[name]) name = 'menu';
    if (currentTrack === name && musicTimer) return;
    var firstTrack = !currentTrack;
    stopMusic(0.28);
    currentTrack = name;
    var token = ++musicToken;
    trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    /* The very first score should answer the unlocking gesture at once.
       Later scene changes retain a gentler crossfade. */
    trackGain.gain.exponentialRampToValueAtTime(0.82, ctx.currentTime + (firstTrack ? 0.16 : 0.48));
    trackGain.connect(musicBus);
    nextStepTime = ctx.currentTime + 0.08;
    stepIndex = 0;

    musicScheduler = function scheduler() {
      if (token !== musicToken || !ctx || currentTrack !== name) return;
      var def = TRACKS[name];
      var stepDur = 60 / def.tempo / 4;
      while (nextStepTime < ctx.currentTime + 0.35) {
        scheduleMusicStep(name, stepIndex, nextStepTime, stepDur, trackGain);
        stepIndex++;
        nextStepTime += stepDur;
      }
      musicTimer = setTimeout(musicScheduler, 90);
    };
    musicScheduler();
  }

  function scene(name, meta) {
    meta = meta || {};
    if (meta.field) battleField = meta.field;
    desiredScene = name || 'menu';
    if (!unlocked || !ctx) return;
    startTrack(trackForScene(desiredScene));
  }

  function setBattlefield(field) {
    battleField = field || 'colosseum';
    if (desiredScene === 'battle' && unlocked) startTrack(trackForScene('battle'));
  }

  function duck(amount, seconds) {
    if (!ctx || !musicBus) return;
    var target = curve(prefs.music) * 0.74;
    var t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(
      Math.max(0.0001, target * (amount == null ? 0.34 : amount)),
      t,
      0.035
    );
    musicBus.gain.setTargetAtTime(Math.max(0.0001, target), t + (seconds || 0.7), 0.18);
  }

  function result(win) {
    if (!unlocked) return;
    duck(0.16, 1.5);
    var t = ctx.currentTime + 0.02;
    if (win) {
      chord([50, 57, 62], t, 0.55, 0.04, {
        bus: 'sfx',
        wet: 0.42,
        filter: 2800,
        attack: 0.015,
        release: 0.38,
      });
      chord([53, 60, 65], t + 0.34, 0.62, 0.042, {
        bus: 'sfx',
        wet: 0.46,
        filter: 3200,
        attack: 0.015,
        release: 0.44,
      });
      chord([57, 62, 66, 69], t + 0.7, 1.25, 0.047, {
        bus: 'sfx',
        wet: 0.56,
        filter: 4200,
        attack: 0.02,
        release: 0.9,
      });
      tone({ freq: 74, to: 48, when: t, dur: 0.55, gain: 0.085, type: 'sine' });
    } else {
      chord([50, 53, 57], t, 0.75, 0.035, {
        bus: 'sfx',
        wet: 0.4,
        filter: 1700,
        attack: 0.08,
        release: 0.52,
      });
      chord([45, 48, 52], t + 0.48, 1.3, 0.04, {
        bus: 'sfx',
        wet: 0.48,
        filter: 1200,
        attack: 0.1,
        release: 0.94,
      });
      tone({ freq: 98, to: 42, when: t, dur: 1.2, gain: 0.08, type: 'sine' });
      noise({ when: t + 0.08, dur: 0.95, gain: 0.032, filter: 540, filterTo: 220, wet: 0.3 });
    }
  }

  /* ---------------- settings and global interface hooks ---------------- */
  function getPrefs() {
    return {
      master: Math.round(prefs.master),
      music: Math.round(prefs.music),
      sfx: Math.round(prefs.sfx),
      muted: !!prefs.muted,
    };
  }

  function setVolume(key, value, preview) {
    if (['master', 'music', 'sfx'].indexOf(key) < 0) return;
    var wasMuted = prefs.muted;
    prefs[key] = clamp(value, 0, 100);
    if (prefs[key] > 0 && prefs.muted) prefs.muted = false;
    persistPrefs();
    applyPrefs();
    if (key === 'music') {
      if (prefs.music <= 0) stopMusic(0.18);
      else if (unlocked) startTrack(trackForScene(desiredScene));
    } else if (wasMuted && !prefs.muted && unlocked && prefs.music > 0) {
      /* Moving any live channel is an intentional unmute. Bring the
         remembered score back too, rather than leaving the button in an
         unmuted state while music stays stopped until the next screen. */
      startTrack(trackForScene(desiredScene));
    }
    if (preview && key !== 'music') {
      var nowMs = Date.now();
      if (nowMs - sliderAt > 90) {
        sliderAt = nowMs;
        ui('tick');
      }
    }
  }

  function setMuted(on) {
    prefs.muted = !!on;
    persistPrefs();
    applyPrefs();
    if (prefs.muted) stopMusic(0.15);
    else
      unlock().then(function () {
        startTrack(trackForScene(desiredScene));
        ui('confirm');
      });
  }

  function syncControls() {
    ['master', 'music', 'sfx'].forEach(function (key) {
      var input = document.getElementById('audio-' + key);
      var out = document.getElementById('audio-' + key + '-val');
      if (input) input.value = String(Math.round(prefs[key]));
      if (out) out.textContent = Math.round(prefs[key]) + '%';
    });
    var mute = document.getElementById('audio-mute');
    if (mute) {
      mute.setAttribute('aria-pressed', String(!!prefs.muted));
      mute.classList.toggle('is-muted', !!prefs.muted);
      var icon = mute.querySelector('i');
      var text = mute.querySelector('span');
      if (icon) icon.className = prefs.muted ? 'ri-volume-mute-line' : 'ri-volume-up-line';
      if (text) text.textContent = prefs.muted ? 'Unmute audio' : 'Mute audio';
    }
  }

  function classifyClick(target) {
    var el =
      target && target.closest
        ? target.closest('button:not(:disabled), a[href], [role="button"], .card')
        : null;
    if (!el) return;
    if (
      el.closest('.bcard') ||
      el.closest('.pcard') ||
      el.closest('.dpack-card') ||
      el.closest('.gc-card-choice') ||
      el.closest('#chapter-dialogue') ||
      el.closest('.lg-row') ||
      el.closest('.buy-pack') ||
      (el.classList && el.classList.contains('card') && el.closest('.view.deck')) ||
      el.id === 'po-pack' ||
      el.id === 'po-again' ||
      el.id === 'btn-endturn'
    )
      return;
    var id = el.id || '';
    if (id === 'audio-mute' || id === 'audio-test') return;
    var cls = el.className || '';
    if (/back|close|cancel|scrim|done/.test(id + ' ' + cls)) ui('back');
    else if (/save|confirm|enter|submit|ready|buy|rematch/.test(id + ' ' + cls)) ui('confirm');
    else if (/opt|toggle|tab|switch|filter/.test(id + ' ' + cls)) ui('toggle');
    else if (el.classList && el.classList.contains('card')) card('pick');
    else ui('click');
  }

  function viewScene(view) {
    if (view === 'battle') return scene('battle', { field: battleField });
    if (view === 'prep' || view === 'draft') return scene('prep');
    if (view === 'campaign' || view === 'chapter' || view === 'play') return scene('campaign');
    if (view === 'shop') return scene('shop');
    scene('menu');
  }

  function mount() {
    /* Build the graph and procedural buffers during page setup, not on
       the player's first click. Playback remains suspended (browser
       autoplay law), but the first gesture now does only one cheap
       resume instead of context + reverb + noise initialization. */
    ensureContext();
    syncControls();
    ['master', 'music', 'sfx'].forEach(function (key) {
      var input = document.getElementById('audio-' + key);
      if (!input) return;
      input.addEventListener('input', function () {
        setVolume(key, input.value, true);
      });
      input.addEventListener('change', function () {
        if (key === 'music' && unlocked) {
          duck(0.55, 0.1);
          musicNote(74, ctx.currentTime + 0.03, 0.4, 0.025, 'triangle', musicBus, 0, 0.35, 3200);
        }
      });
    });
    var mute = document.getElementById('audio-mute');
    if (mute)
      mute.addEventListener('click', function () {
        setMuted(!prefs.muted);
      });
    var test = document.getElementById('audio-test');
    if (test)
      test.addEventListener('click', function () {
        ui('test');
      });

    document.addEventListener('click', function (e) {
      classifyClick(e.target);
    });
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      document.addEventListener('pointerover', function (e) {
        var el =
          e.target && e.target.closest
            ? e.target.closest('button:not(:disabled), a[href], [role="button"]')
            : null;
        if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
        var n = Date.now();
        if (n - hoverAt < 55) return;
        hoverAt = n;
        ui('hover');
      });
    }
    document.addEventListener('eol:view', function (e) {
      viewScene(e.detail);
    });
    viewScene(document.body.dataset.view || 'home');
  }

  function removeUnlockListeners() {
    document.removeEventListener('pointerdown', gestureUnlock, true);
    document.removeEventListener('touchstart', gestureUnlock, true);
    document.removeEventListener('mousedown', gestureUnlock, true);
    document.removeEventListener('click', gestureUnlock, true);
    document.removeEventListener('keydown', gestureUnlock, true);
  }

  function gestureUnlock(e) {
    if (e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) >= 0)
      return;
    unlock().then(function (okay) {
      /* A denied resume is retryable on the next gesture. The old path
         removed its only listeners before it knew whether audio had
         actually started, which could strand the menu in silence. */
      if (okay) removeUnlockListeners();
    });
  }

  document.addEventListener('pointerdown', gestureUnlock, true);
  document.addEventListener('touchstart', gestureUnlock, true);
  document.addEventListener('mousedown', gestureUnlock, true);
  document.addEventListener('click', gestureUnlock, true);
  document.addEventListener('keydown', gestureUnlock, true);
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) {
      hiddenSuspended = unlocked && ctx.state === 'running';
      if (musicTimer) {
        clearTimeout(musicTimer);
        musicTimer = null;
      }
      if (hiddenSuspended) ctx.suspend().catch(function () {});
    } else if (hiddenSuspended) {
      ctx
        .resume()
        .then(function () {
          hiddenSuspended = false;
          var wanted = trackForScene(desiredScene);
          if (currentTrack !== wanted) {
            /* The player may have changed scenes while the page was
               hidden. That is a real score transition, so start it. */
            startTrack(wanted);
          } else if (musicScheduler && !musicTimer) {
            /* AudioContext suspension freezes currentTime and every
               already-scheduled note. Resume the SAME scheduler at the
               SAME step: no opening bar, no crossfade, no restart. */
            musicScheduler();
          }
        })
        .catch(function () {});
    }
  });
  document.addEventListener('DOMContentLoaded', mount);

  window.EOL.audio = {
    supported: function () {
      return !!AudioCtor;
    },
    unlock: unlock,
    ui: ui,
    card: card,
    battle: battle,
    campaign: campaign,
    pack: pack,
    scene: scene,
    setBattlefield: setBattlefield,
    result: result,
    duck: duck,
    getPrefs: getPrefs,
    setVolume: setVolume,
    setMuted: setMuted,
    test: function () {
      ui('test');
    },
    /* verification hooks: deterministic shape, never browser secrets */
    _trackForScene: trackForScene,
    _musicState: function () {
      return { track: currentTrack, token: musicToken, step: stepIndex };
    },
    _prefKey: PREF_KEY,
  };
})();
