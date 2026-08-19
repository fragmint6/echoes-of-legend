/* =============================================================
   Echoes of Legend - Audio Director
   -------------------------------------------------------------
   A complete, asset-free Web Audio score and sound system. Every sound
   is synthesized at runtime from oscillators and filtered noise, so the
   game ships no third-party recordings, has no licensing attribution,
   and cannot trigger a music Content ID claim.

   The language is deliberately shared rather than one sound per legend:
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
  /* Which campaign chapter the Road view is showing. Only the music
     cares; it defaults to 1 so a caller that never sets it behaves
     exactly as before. */
  var campaignChapter = 1;
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

  /* ---------------------------------------------------------
     EXTERNAL MUTE (the portal's own audio control)
     -------------------------------------------------------------
     CrazyGames can mute a game from its own chrome, and its rule is
     explicit: that setting OUTRANKS the in-game one. A player who
     hits our Unmute button while the portal has muted us must still
     hear nothing, or we are talking over the site the game is
     embedded in.

     So this is kept SEPARATE from prefs.muted rather than folded
     into it. Two reasons: the portal's choice must never be written
     into the player's saved preferences, and when the portal unmutes
     us the player's own setting has to come back exactly as it was.
     muted() is the effective answer; prefs.muted stays the player's. */
  var externalMute = false;

  function muted() {
    return !!(prefs.muted || externalMute);
  }

  function setExternalMute(on) {
    on = !!on;
    if (on === externalMute) return;
    externalMute = on;
    applyPrefs();
    if (muted()) stopMusic(0.15);
    else if (unlocked && prefs.music > 0) startTrack(trackForScene(desiredScene));
  }

  function applyPrefs() {
    if (masterGain) smoothGain(masterGain, muted() ? 0.0001 : curve(prefs.master) * 1.35, 0.018);
    if (musicBus) smoothGain(musicBus, curve(prefs.music) * 1.25, 0.025);
    if (sfxBus) smoothGain(sfxBus, curve(prefs.sfx) * 1.35, 0.018);
    document.documentElement.classList.toggle('audio-muted', muted());
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
    initDialogueAudio();
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
    if (!currentTrack && prefs.music > 0 && !muted()) startTrack(trackForScene(desiredScene));

    unlockJob = Promise.resolve(resumeJob)
      .then(function () {
        unlocked = true;
        unlockJob = null;
        if (!currentTrack && prefs.music > 0 && !muted())
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
    if (!ensureContext() || muted()) return null;
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
    if (!ensureContext() || muted() || !noiseBuffer) return null;
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
      /* THE LEVEL-UP FANFARE. A rising arpeggio (the card getting
         stronger, said in pitch) capped by a bright bell, plus a
         short airy swell underneath so it has body. Deliberately
         longer and louder than 'confirm' - this is the payoff for
         nine duplicates, not an acknowledgement of a click. */
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
          tone({
            freq: f,
            when: t + i * 0.075,
            dur: 0.26,
            gain: 0.05,
            type: 'triangle',
            bus: 'ui',
            wet: 0.28,
          });
        });
        tone({
          freq: 1567.98,
          when: t + 0.3,
          dur: 0.7,
          gain: 0.035,
          type: 'sine',
          bus: 'ui',
          wet: 0.45,
        });
        noise({ when: t + 0.28, dur: 0.5, gain: 0.014, filter: 5200, bus: 'ui' });
        break;
      /* The same idea, bigger: the third and final level. */
      case 'levelmax':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
          tone({
            freq: f,
            when: t + i * 0.07,
            dur: 0.34,
            gain: 0.055,
            type: 'triangle',
            bus: 'ui',
            wet: 0.32,
          });
        });
        tone({
          freq: 2093,
          when: t + 0.36,
          dur: 0.9,
          gain: 0.04,
          type: 'sine',
          bus: 'ui',
          wet: 0.5,
        });
        tone({
          freq: 130.81,
          when: t + 0.34,
          dur: 0.8,
          gain: 0.05,
          type: 'sine',
          bus: 'ui',
          wet: 0.2,
        });
        noise({ when: t + 0.32, dur: 0.7, gain: 0.02, filter: 6000, bus: 'ui' });
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
        noise({ when: t, dur: 0.12, gain: 0.035, filter: 1800, filterTo: 480, q: 0.8, pan: pan });
        tone({
          freq: 120,
          to: 65,
          when: t + 0.015,
          dur: 0.22,
          gain: 0.045,
          type: 'sawtooth',
          filter: 650,
        });
        tone({ freq: 440, to: 160, when: t, dur: 0.14, gain: 0.024, type: 'triangle', filter: 1200 });
        break;
      case 'burn':
        noise({ when: t, dur: 0.22, gain: 0.032, filter: 2400, filterTo: 600, q: 0.6, pan: pan });
        for (var b = 0; b < 3; b++)
          tone({
            freq: 180 + b * 70,
            to: 420 + b * 90,
            when: t + b * 0.045,
            dur: 0.16,
            gain: 0.018,
            type: 'triangle',
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
  /* Character casts never cross into piercing whistle/chirp territory.
     This ceiling applies to every shared role and element voice, so fixing
     Lightning also prevents a future legend combination from recreating the
     same unpleasant high-frequency stack. */
  var CHARACTER_FREQ_CEILING = 900;
  function characterTone(options) {
    options = options || {};
    if (options.freq != null) options.freq = Math.min(CHARACTER_FREQ_CEILING, options.freq);
    if (options.to != null) options.to = Math.min(CHARACTER_FREQ_CEILING, options.to);
    tone(options);
  }

  function roleVoice(role, t, signature) {
    var boost = signature ? 1.22 : 1;
    switch (role) {
      case 'Tank':
        characterTone({
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
        characterTone({
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
        characterTone({
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
          characterTone({
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
        characterTone({
          freq: 210,
          to: 420,
          when: t,
          dur: 0.34,
          gain: 0.042 * boost,
          type: 'sine',
          filter: 1800,
          wet: 0.38,
        });
        characterTone({
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
        characterTone({ freq: 523, when: t, dur: 0.46, gain: 0.035 * boost, type: 'sine', wet: 0.48 });
        characterTone({ freq: 659, when: t + 0.06, dur: 0.5, gain: 0.028 * boost, type: 'sine', wet: 0.5 });
        characterTone({ freq: 784, when: t + 0.12, dur: 0.52, gain: 0.02 * boost, type: 'sine', wet: 0.52 });
        break;
      default:
        characterTone({ freq: 260, to: 190, when: t, dur: 0.16, gain: 0.045 * boost, type: 'triangle' });
    }
  }

  function elementVoice(element, t, strong) {
    var g = strong ? 1.24 : 1;
    switch (element) {
      case 'Physical':
        characterTone({ freq: 115, to: 58, when: t, dur: 0.18, gain: 0.066 * g, type: 'sine' });
        noise({ when: t, dur: 0.11, gain: 0.052 * g, filter: 720, q: 0.7 });
        break;
      case 'Magic':
        for (var m = 0; m < 4; m++)
          characterTone({
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
        characterTone({
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
        characterTone({ freq: 784, when: t, dur: 0.52, gain: 0.034 * g, type: 'sine', wet: 0.55 });
        characterTone({ freq: 1175, when: t + 0.045, dur: 0.42, gain: 0.022 * g, type: 'sine', wet: 0.58 });
        break;
      case 'Lightning':
        /* Thunder, not a bird chirp: a low body, a short midrange crack and
           three descending electrical knocks. No square-wave whistle and
           nothing near the character-frequency ceiling. */
        characterTone({
          freq: 96,
          to: 44,
          when: t,
          dur: 0.34,
          gain: 0.078 * g,
          type: 'sine',
          filter: 520,
          wet: 0.08,
        });
        noise({ when: t, dur: 0.2, gain: 0.046 * g, filter: 1350, filterTo: 480, q: 0.55 });
        for (var z = 0; z < 3; z++)
          characterTone({
            freq: 360 - z * 55,
            to: 170 - z * 25,
            when: t + 0.035 + z * 0.045,
            dur: 0.12,
            gain: 0.024 * g,
            type: 'triangle',
            filter: 820,
            pan: z % 2 ? 0.18 : -0.18,
          });
        break;
      case 'Fire':
        noise({ when: t, dur: 0.38, gain: 0.058 * g, filter: 720, filterTo: 3500, q: 0.5 });
        for (var f = 0; f < 3; f++)
          characterTone({
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
        characterTone({
          freq: 196,
          to: 145,
          when: t,
          dur: 0.13,
          gain: 0.055 * g,
          type: 'triangle',
          filter: 1200,
        });
        characterTone({ freq: 587, when: t + 0.04, dur: 0.42, gain: 0.025 * g, type: 'sine', wet: 0.48 });
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

  /* -----------------------------------------------------------
     Universal Dialogue Audio Player (Audio Files)
     --------------------------------------------------------- */
  var dialogueAudioEl = null;
  var isDialogueAudioPlaying = false;

  function initDialogueAudio() {
    if (typeof Audio !== 'undefined' && !dialogueAudioEl) {
      try {
        dialogueAudioEl = new Audio('assets/audio/dialogue-talk.wav');
        dialogueAudioEl.loop = true;
        dialogueAudioEl.volume = Math.min(1.0, (prefs.master / 100) * (prefs.sfx / 100) * 0.9);
      } catch (e) {}
    }
  }

  function startDialogueTalk(meta) {
    if (!unlocked || muted()) return;
    initDialogueAudio();
    if (dialogueAudioEl) {
      try {
        dialogueAudioEl.volume = Math.min(1.0, (prefs.master / 100) * (prefs.sfx / 100) * 0.9);
        dialogueAudioEl.currentTime = 0;
        var p = dialogueAudioEl.play();
        if (p && p.catch) p.catch(function () {});
        isDialogueAudioPlaying = true;
      } catch (e) {}
    }
  }

  function talk(meta) {
    startDialogueTalk(meta);
  }

  function stopTalk() {
    if (dialogueAudioEl) {
      try {
        dialogueAudioEl.pause();
        dialogueAudioEl.currentTime = 0;
      } catch (e) {}
    }
    isDialogueAudioPlaying = false;
  }

  /* ---------------- campaign and pack ceremonies ---------------- */
  function campaign(kind, meta) {
    if (!unlocked) return;
    meta = meta || {};
    var t = ctx ? ctx.currentTime + (meta.delay || 0) / 1000 + 0.008 : 0;
    switch (kind) {
      case 'dialogue':
      case 'talk':
        startDialogueTalk(meta);
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
        startDialogueTalk(meta);
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
  /* The menu and preparation themes both live in D minor. Battles use
     preparation's exact D–Bb–C–A harmonic spine, then change orchestration
     by battlefield instead of wandering into an unrelated key. */
  var PREP_ROOTS = [50, 46, 48, 45];
  var PREP_CHORDS = [
    [50, 53, 57], // D minor
    [46, 50, 53], // Bb major
    [48, 52, 55], // C major
    [45, 48, 52], // A minor
  ];
  var TRACKS = {
    /* Every score now travels for roughly two minutes before returning to
       bar one. The different bar counts compensate for tempo, keeping each
       complete form near 120 seconds rather than stretching one tiny loop. */
    menu: { tempo: 82, steps: 16, key: 'D minor', phraseBars: 40 },
    road: { tempo: 74, steps: 16, key: 'A minor', phraseBars: 36 },
    /* CHAPTER II's Road (2026-08-18f). A different place needs a
       different score: Chapter I's `road` is a lonely walk in A minor
       at 74bpm, all bells and space. The Concord is a CITY DURING A
       BUSY WEEK - crowds, scaffolding, a schedule - so this is quicker
       (88), in D dorian rather than natural minor (the raised sixth
       keeps it civic and expectant instead of mournful), and built on a
       steady processional pulse with a struck-metal ostinato standing
       in for the record-keeping. Forty bars lands it near 109 seconds,
       in the same two-minute envelope as every other track. */
    road2: { tempo: 88, steps: 16, key: 'D dorian', phraseBars: 40 },
    prep: { tempo: 102, steps: 16, key: 'D minor', phraseBars: 52 },
    /* Match variants keep one key/progression while changing pace, register,
       pulse and voicing to suit bright, dark and neutral battlefields. */
    battleWar: { tempo: 120, steps: 16, key: 'D minor', phraseBars: 60 },
    battleBright: { tempo: 124, steps: 16, key: 'D minor', phraseBars: 64 },
    battleDark: { tempo: 114, steps: 16, key: 'D minor', phraseBars: 56 },
  };

  function trackForScene(scene) {
    if (scene === 'battle') {
      if (['mana-spring', 'open-plains', 'heros-trial'].indexOf(battleField) >= 0)
        return 'battleBright';
      if (['blood-battlefield', 'energy-void', 'spirit-world'].indexOf(battleField) >= 0)
        return 'battleDark';
      return 'battleWar';
    }
    /* `campaign` is the chapter-select menu and stays on the continuous
       main theme. Only `road` means the actual Road of Echoes map. */
    /* Which Road you are standing on decides the score. campaignChapter
       is set by js/campaign.js whenever the chapter changes, so the
       theme follows the plate the player opened. */
    if (scene === 'road') return campaignChapter === 2 ? 'road2' : 'road';
    if (scene === 'prep') return 'prep';
    /* Shop, Play, Collection, Decks, Rulebook and every overlay all keep
       the main theme. Returning between them must not restart its phrase. */
    return 'menu';
  }

  function kick(t, gain, dest) {
    var g = gain || 0.085;
    tone({
      freq: 145,
      to: 42,
      when: t,
      dur: 0.22,
      gain: g,
      type: 'sine',
      bus: 'music',
      dest: dest,
      wet: 0,
      attack: 0.003,
      release: 0.18,
    });
    tone({
      freq: 185,
      to: 75,
      when: t,
      dur: 0.055,
      gain: g * 0.55,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: 0,
      filter: 450,
      attack: 0.002,
      release: 0.045,
    });
  }

  function snare(t, gain, dest) {
    var g = gain || 0.065;
    noise({
      when: t,
      dur: 0.11,
      gain: g * 0.75,
      filter: 1650,
      q: 1.1,
      bus: 'music',
      dest: dest,
      wet: 0.05,
    });
    tone({
      freq: 185,
      to: 105,
      when: t,
      dur: 0.1,
      gain: g * 0.85,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: 0,
      attack: 0.003,
      release: 0.085,
    });
  }

  function hat(t, gain, dest, open) {
    var g = gain || 0.018;
    noise({
      when: t,
      dur: open ? 0.065 : 0.028,
      gain: g,
      filterType: 'bandpass',
      filter: 5800,
      q: 1.8,
      bus: 'music',
      dest: dest,
      wet: 0.02,
    });
  }

  /* Preparation percussion is fully tonal. Its old filtered-noise hats and
     snare could read as static on headphones, so the planning score now uses
     a short wooden triangle click instead of any noise buffer. */
  function prepTick(t, gain, dest, open) {
    tone({
      freq: open ? 780 : 690,
      to: open ? 540 : 570,
      when: t,
      dur: open ? 0.12 : 0.055,
      gain: gain || 0.008,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: open ? 0.08 : 0.02,
      filter: open ? 1550 : 1250,
      attack: 0.002,
      release: open ? 0.09 : 0.038,
    });
  }

  /* A soft, fully tonal war drum for Preparation and matches. It contains
     no noise source and no upper-frequency burst; even headphones at high
     volume hear a rounded pulse, never static. */
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

  /* A hand-drum-sized tonal pulse for the Road. Its soft double body and
     roomy tail distinguish travel from both menu drums and battlefield
     artillery without introducing a constant noise wash. */
  function roadDrum(t, gain, dest, accent) {
    tone({
      freq: accent ? 94 : 76,
      to: accent ? 53 : 45,
      when: t,
      dur: accent ? 0.3 : 0.24,
      gain: gain || 0.03,
      type: 'sine',
      bus: 'music',
      dest: dest,
      wet: 0.18,
      filter: 480,
      attack: 0.012,
      release: 0.2,
    });
    tone({
      freq: accent ? 178 : 148,
      to: accent ? 112 : 96,
      when: t + 0.014,
      dur: 0.13,
      gain: (gain || 0.03) * 0.22,
      type: 'triangle',
      bus: 'music',
      dest: dest,
      wet: 0.08,
      filter: 720,
      attack: 0.008,
      release: 0.1,
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
    var phraseBar = bar % TRACKS[name].phraseBars;

    if (name === 'menu') {
      /* Forty bars / ~117 seconds. The preserved theme now moves through an
         opening statement, first drop, answering verse, bridge, long second
         drop, stripped reprise and final drop before it circles home. */
      var menuChords = [
        [50, 57, 62],
        [46, 53, 58],
        [48, 55, 60],
        [45, 52, 57],
      ];
      var menuTheme = [74, null, 77, 76, null, 74, 72, null, 69, null, 72, 74, null, 69, 67, null];
      var menuAnswer = [69, 72, 74, null, 77, 76, 74, null, 72, 74, 77, 69, null, 67, 69, null];
      var menuBridge = [62, null, 65, 69, null, 67, 65, null, 62, 65, 69, 72, null, 69, 67, null];
      var menuClimb = [74, null, 77, 79, null, 81, 79, null, 81, 84, 86, 84, null, 81, 84, null];
      var menuReprise = [69, null, null, 72, null, 74, null, null, 67, null, null, 69, null, 72, null, null];
      var menuPart = [menuTheme, menuAnswer, menuTheme, menuReprise];
      if (phraseBar >= 4 && phraseBar < 8)
        menuPart = [menuTheme, menuAnswer, menuClimb, menuAnswer];
      else if (phraseBar >= 8 && phraseBar < 12)
        menuPart = [menuAnswer, menuTheme, menuAnswer, menuClimb];
      else if (phraseBar >= 12 && phraseBar < 16)
        menuPart = [menuClimb, menuAnswer, menuClimb, menuTheme];
      else if (phraseBar >= 16 && phraseBar < 20)
        menuPart = [menuBridge, menuReprise, menuBridge, menuAnswer];
      else if (phraseBar >= 20 && phraseBar < 24)
        menuPart = [menuAnswer, menuTheme, menuReprise, menuClimb];
      else if (phraseBar >= 24 && phraseBar < 28)
        menuPart = [menuTheme, menuAnswer, menuClimb, menuTheme];
      else if (phraseBar >= 28 && phraseBar < 32)
        menuPart = [menuClimb, menuTheme, menuAnswer, menuClimb];
      else if (phraseBar >= 32 && phraseBar < 36)
        menuPart = [menuReprise, menuBridge, menuReprise, menuAnswer];
      else if (phraseBar >= 36)
        menuPart = [menuClimb, menuAnswer, menuTheme, menuClimb];

      var menuMelody = menuPart[phraseBar % 4];

      var menuDrop =
        (phraseBar >= 4 && phraseBar <= 7) ||
        (phraseBar >= 12 && phraseBar <= 15) ||
        (phraseBar >= 24 && phraseBar <= 31) ||
        phraseBar >= 36;
      var menuFinal = (phraseBar >= 24 && phraseBar <= 31) || phraseBar >= 36;
      var menuBuild = [3, 11, 23, 35].indexOf(phraseBar) >= 0;
      var menuBreak = (phraseBar >= 16 && phraseBar <= 19) || (phraseBar >= 32 && phraseBar <= 34);
      var menuChord = menuChords[chordIndex];

      if (s === 0)
        chord(menuChord, t, stepDur * 15.5, menuDrop ? 0.016 : menuBreak ? 0.009 : 0.012, {
          dest: dest,
          wet: menuDrop ? 0.42 : 0.48,
          filter: menuDrop ? 2200 : menuBreak ? 1350 : 1700,
          attack: menuDrop ? 0.22 : 0.55,
          release: menuBreak ? 1.9 : menuDrop ? 1.05 : 1.5,
        });

      /* The original bass remains the spine, but every section phrases it
         differently: sustained in the verses, syncopated after each drop,
         and almost absent while the bridge clears the room. */
      if (menuDrop) {
        if (s % 2 === 0) {
          var dropBassPitch = menuChord[s === 4 || s === 12 ? 1 : 0] - 12;
          if (s === 6 || s === 14) dropBassPitch += 7;
          musicNote(
            dropBassPitch,
            t,
            stepDur * 1.5,
            menuFinal ? 0.065 : 0.054,
            'triangle',
            dest,
            -0.08,
            0.05,
            850
          );
          tone({
            freq: midi(dropBassPitch - 12),
            when: t,
            dur: stepDur * 1.4,
            gain: menuFinal ? 0.078 : 0.065,
            type: 'sine',
            bus: 'music',
            dest: dest,
            filter: 340,
            attack: 0.006,
            release: stepDur * 1.1,
          });
        }
      } else if (s % (menuBreak ? 8 : 4) === 0) {
        musicNote(
          menuChord[0] - 12,
          t,
          stepDur * (menuBreak ? 5.8 : 2.8),
          menuBreak ? 0.021 : 0.027,
          'triangle',
          dest,
          -0.08,
          0.12,
          900
        );
      }
      if (menuDrop && (s === 6 || s === 14))
        musicNote(menuChord[1] - 12, t, stepDur * 1.3, 0.038, 'sine', dest, -0.12, 0.03, 680);

      if (menuMelody[s] != null) {
        musicNote(
          menuMelody[s],
          t,
          stepDur * (menuDrop ? 1.35 : menuBreak ? 2.1 : 1.6),
          menuDrop ? 0.024 : menuBreak ? 0.014 : 0.018,
          'triangle',
          dest,
          0.18,
          menuDrop ? 0.3 : 0.38,
          menuDrop ? 3600 : 3100
        );
        if (menuDrop)
          musicNote(
            menuMelody[s] - 12,
            t + 0.008,
            stepDur * 1.15,
            menuFinal ? 0.012 : 0.0085,
            'sawtooth',
            dest,
            -0.04,
            0.12,
            1450
          );
      }

      /* The answering verse introduces a distant counterline. It disappears
         during the bridge so the later return feels like a new movement. */
      if ((phraseBar >= 8 && phraseBar < 16) || (phraseBar >= 20 && phraseBar < 24)) {
        var menuCounter = [null, null, 62, null, null, 65, null, null, null, null, 60, null, null, 62, null, null];
        if (menuCounter[s] != null)
          musicNote(menuCounter[s] + 12, t, stepDur * 2.4, 0.0085, 'sine', dest, -0.22, 0.54, 3900);
      }

      if (menuDrop) {
        var menuDrive = [0, 1, 2, 1, 0, 1, 2, 1];
        if (s % 2 === 0)
          musicNote(
            menuChord[menuDrive[s / 2]],
            t,
            stepDur * 0.78,
            menuFinal ? 0.014 : 0.011,
            'triangle',
            dest,
            -0.16,
            0.08,
            1350
          );
        if ([0, 6, 8, 11].indexOf(s) >= 0 || (menuFinal && (s === 3 || s === 14)))
          kick(t, s === 0 ? (menuFinal ? 0.14 : 0.12) : (menuFinal ? 0.095 : 0.082), dest);
        if (s === 4 || s === 12) snare(t, menuFinal ? 0.085 : 0.072, dest);
        if (s % 2 === 0) hat(t, menuFinal ? 0.024 : 0.018, dest, s === 14);
        if (menuFinal && s === 8)
          chord([menuChord[0] + 12, menuChord[1] + 12], t, stepDur * 7.2, 0.0055, {
            dest: dest,
            wet: 0.58,
            filter: 4400,
            attack: 0.35,
            release: 1.1,
          });
      } else if (menuBuild) {
        if (s === 0 || s === 8) kick(t, 0.045, dest);
        if (s === 12) snare(t, 0.024, dest);
        if (s % 2 === 0) hat(t, 0.006 + s * 0.0002, dest, s === 14);
        if (s === 12) {
          tone({
            freq: 130,
            to: 440,
            when: t,
            dur: stepDur * 3.8,
            gain: 0.022,
            type: 'triangle',
            bus: 'music',
            dest: dest,
            wet: 0.25,
            filter: 1100,
            attack: 0.02,
            release: stepDur * 2.8,
          });
          noise({
            when: t,
            dur: stepDur * 3.8,
            gain: 0.004,
            filter: 420,
            filterTo: 1800,
            q: 1.4,
            bus: 'music',
            dest: dest,
            wet: 0.14,
          });
        }
      } else if (!menuBreak && (s === 4 || s === 12)) {
        prepTick(t, 0.0035, dest, false);
      }

      /* Every major downbeat lands below the kick so the transition is felt
         on phone speakers before the complete new section becomes obvious. */
      if ([4, 12, 24, 36].indexOf(phraseBar) >= 0 && s === 0)
        tone({
          freq: 88,
          to: 32,
          when: t,
          dur: stepDur * 2.8,
          gain: menuFinal ? 0.15 : 0.12,
          type: 'sine',
          bus: 'music',
          dest: dest,
          wet: 0.05,
          filter: 320,
          attack: 0.005,
          release: stepDur * 2.2,
        });
      return;
    }

    if (name === 'road') {
      /* Thirty-six bars / ~117 seconds. Departure grows into a travelling
         pulse, falls quiet among the ruins, climbs again, opens onto a wide
         vista, then reprises the lonely first figure for a seamless return. */
      var roadChords = [
        [45, 52, 57],
        [43, 50, 55],
        [41, 48, 53],
        [43, 50, 57],
      ];
      var roadChord = roadChords[chordIndex];
      var roadBellA = [69, null, null, 72, null, null, 67, null, 64, null, null, 67, null, 69, null, null];
      var roadBellB = [72, null, 74, null, null, 76, null, 74, 72, null, null, 69, null, 67, 69, null];
      var roadBellRuins = [64, null, null, null, 67, null, null, null, 60, null, null, null, 64, null, null, null];
      var roadBellVista = [69, null, 72, null, 76, null, 74, null, 72, null, 76, null, 79, null, 76, null];
      var roadBellPart = [roadBellA, roadBellA, roadBellB, roadBellA];
      if (phraseBar >= 8 && phraseBar < 16)
        roadBellPart = [roadBellA, roadBellB, roadBellB, roadBellA];
      else if (phraseBar >= 16 && phraseBar < 20)
        roadBellPart = [roadBellRuins, roadBellA, roadBellRuins, roadBellB];
      else if (phraseBar >= 20 && phraseBar < 28)
        roadBellPart = [roadBellB, roadBellA, roadBellB, roadBellVista];
      else if (phraseBar >= 28 && phraseBar < 32)
        roadBellPart = [roadBellVista, roadBellB, roadBellVista, roadBellA];
      else if (phraseBar >= 32)
        roadBellPart = [roadBellA, roadBellRuins, roadBellB, roadBellA];
      var roadBell = roadBellPart[phraseBar % 4];

      var roadRuins = phraseBar >= 16 && phraseBar < 20;
      var roadTravelling = (phraseBar >= 8 && phraseBar < 16) || (phraseBar >= 20 && phraseBar < 28);
      var roadVista = phraseBar >= 28 && phraseBar < 32;
      var roadReturn = phraseBar >= 32;
      var roadArpA = [0, null, 1, null, 2, null, 1, null, 0, null, 2, null, 1, null, 2, null];
      var roadArpB = [0, 1, 2, null, 1, 2, 0, null, 2, 1, 0, null, 1, 2, 1, null];
      var roadArp = roadTravelling || roadVista ? roadArpB : roadArpA;

      if (s === 0)
        chord(roadChord, t, stepDur * 15.8, roadVista ? 0.015 : roadRuins ? 0.009 : 0.012, {
          dest: dest,
          wet: roadRuins ? 0.68 : 0.58,
          filter: roadVista ? 1950 : roadRuins ? 1050 : 1350,
          attack: roadRuins ? 1.15 : 0.82,
          release: roadRuins ? 2.7 : 2.2,
        });
      if (s === 0 || (!roadRuins && s === 8))
        musicNote(
          roadChord[0] - 12,
          t,
          stepDur * (roadRuins ? 14.5 : 6.5),
          roadVista ? 0.03 : roadRuins ? 0.021 : 0.026,
          'sine',
          dest,
          -0.2,
          0.3,
          580
        );
      if (!roadRuins && roadArp[s] != null)
        musicNote(
          roadChord[roadArp[s]] + 12,
          t,
          stepDur * (roadTravelling ? 1.05 : 1.45),
          roadTravelling ? 0.0095 : 0.0085,
          'triangle',
          dest,
          -0.12,
          0.5,
          roadVista ? 2800 : 2100
        );
      if (roadBell[s] != null)
        musicNote(
          roadBell[s],
          t,
          stepDur * (roadVista ? 3.1 : roadRuins ? 3.6 : 2.4),
          roadVista ? 0.021 : roadRuins ? 0.014 : 0.018,
          'sine',
          dest,
          0.22,
          roadRuins ? 0.72 : 0.62,
          5000
        );

      if (roadTravelling) {
        var roadCounter = [null, null, 57, null, null, 60, null, 62, null, null, 60, null, null, 57, null, 55];
        if (roadCounter[s] != null)
          musicNote(roadCounter[s] + 12, t, stepDur * 1.8, 0.0065, 'sine', dest, 0.1, 0.48, 3200);
      }
      if (roadVista && (s === 0 || s === 8))
        chord([roadChord[1] + 12, roadChord[2] + 12], t, stepDur * 7.4, 0.006, {
          dest: dest,
          wet: 0.7,
          filter: 3800,
          attack: 0.9,
          release: 2.1,
        });

      if (s === 0 || (!roadRuins && s === 10)) roadDrum(t, s === 0 ? 0.034 : 0.025, dest, s === 0);
      if (!roadRuins && (s === 6 || (roadTravelling && s === 14)))
        roadDrum(t, roadTravelling ? 0.024 : 0.019, dest, false);
      if (roadReturn && s === 10) roadDrum(t, 0.017, dest, false);
      return;
    }

    if (name === 'road2') {
      /* CHAPTER II - THE CONCORD. Forty bars / ~109 seconds.
         -----------------------------------------------------------
         Chapter I's Road is a person walking alone; this is a city
         that exists for one week and knows it. The form is a week:
         arrival among half-built stands (0-7), the crowd filling in
         (8-15), a hush in the archive under the street (16-19), the
         schedule pressing on (20-27), the floor itself at full noise
         (28-35), and a stripped reprise as the pavilions come down
         (36-39) that hands cleanly back to bar one.

         D DORIAN, not D minor. The raised sixth (B natural) is the
         whole difference between mournful and expectant - this chapter
         is loud, political and funny before it is sad, and a natural
         minor sixth kept dragging it toward Chapter I's grief.

         The ostinato is deliberately METALLIC and on the offbeat: it
         is the sound of tablets being struck and filed, which is what
         the Concord actually does all week. It drops out entirely in
         the archive section, where the only thing left is the low
         drone and a single bell - the one place in the chapter where
         somebody is alone with a record. */
      var c2Chords = [
        [50, 57, 62], // Dm
        [55, 62, 66], // Gmaj  <- the dorian sixth, the civic colour
        [48, 55, 60], // C
        [53, 60, 65], // F
      ];
      var c2Chord = c2Chords[chordIndex];

      var c2Arrive = [74, null, null, 76, null, 77, null, null, 74, null, 72, null, null, 71, null, null];
      var c2Crowd = [77, null, 79, null, 81, null, 79, null, 77, null, 76, null, 74, null, 76, null];
      var c2Archive = [62, null, null, null, 65, null, null, null, 60, null, null, null, 62, null, null, null];
      var c2Press = [74, 76, 77, null, 79, 77, 76, null, 74, 76, 79, null, 77, null, 74, null];
      var c2Floor = [81, null, 83, 84, null, 83, 81, null, 79, null, 81, 83, null, 81, 79, null];
      var c2Strike = [69, null, null, 71, null, null, 74, null, 71, null, null, 69, null, 67, null, null];

      var c2Part = [c2Arrive, c2Arrive, c2Crowd, c2Arrive];
      if (phraseBar >= 8 && phraseBar < 16) c2Part = [c2Crowd, c2Arrive, c2Crowd, c2Press];
      else if (phraseBar >= 16 && phraseBar < 20) c2Part = [c2Archive, c2Archive, c2Strike, c2Archive];
      else if (phraseBar >= 20 && phraseBar < 28) c2Part = [c2Press, c2Crowd, c2Press, c2Floor];
      else if (phraseBar >= 28 && phraseBar < 36) c2Part = [c2Floor, c2Press, c2Floor, c2Crowd];
      else if (phraseBar >= 36) c2Part = [c2Strike, c2Arrive, c2Strike, c2Arrive];
      var c2Lead = c2Part[phraseBar % 4];

      var c2Quiet = phraseBar >= 16 && phraseBar < 20;
      var c2Busy = (phraseBar >= 8 && phraseBar < 16) || (phraseBar >= 20 && phraseBar < 28);
      var c2Peak = phraseBar >= 28 && phraseBar < 36;
      var c2Strike36 = phraseBar >= 36;

      /* The pad: wide and low in the archive, brighter and tighter on
         the floor. */
      if (s === 0)
        chord(c2Chord, t, stepDur * 15.6, c2Peak ? 0.016 : c2Quiet ? 0.0095 : 0.013, {
          dest: dest,
          wet: c2Quiet ? 0.72 : 0.5,
          filter: c2Peak ? 2200 : c2Quiet ? 980 : 1500,
          attack: c2Quiet ? 1.2 : 0.55,
          release: c2Quiet ? 2.8 : 1.9,
        });

      /* The drone under the whole city. */
      if (s === 0 || (!c2Quiet && s === 8))
        musicNote(
          c2Chord[0] - 12,
          t,
          stepDur * (c2Quiet ? 14.8 : 6.2),
          c2Peak ? 0.031 : c2Quiet ? 0.022 : 0.027,
          'sine',
          dest,
          -0.18,
          0.28,
          540
        );

      /* THE FILING OSTINATO - struck metal on the offbeat, absent in
         the archive. This is the signature the chapter is recognised
         by, the way Chapter I is recognised by its bells. */
      if (!c2Quiet && s % 2 === 1)
        musicNote(
          c2Chord[1] + 12,
          t,
          stepDur * 0.62,
          c2Peak ? 0.0085 : c2Busy ? 0.0072 : 0.0055,
          'square',
          dest,
          0.26,
          0.34,
          c2Peak ? 3400 : 2600
        );

      /* The lead. */
      if (c2Lead[s] != null)
        musicNote(
          c2Lead[s],
          t,
          stepDur * (c2Quiet ? 3.4 : c2Peak ? 2.0 : 2.3),
          c2Peak ? 0.022 : c2Quiet ? 0.015 : 0.019,
          c2Peak ? 'triangle' : 'sine',
          dest,
          0.1,
          c2Quiet ? 0.74 : 0.54,
          5200
        );

      /* A crowd counter-line once the stands fill. */
      if (c2Busy || c2Peak) {
        var c2Counter = [null, 62, null, null, 65, null, null, 67, null, null, 65, null, 62, null, null, 60];
        if (c2Counter[s] != null)
          musicNote(c2Counter[s] + 12, t, stepDur * 1.6, 0.0062, 'sine', dest, -0.22, 0.44, 3000);
      }

      /* The floor's answering brass-ish stab, peak only. */
      if (c2Peak && (s === 0 || s === 8))
        chord([c2Chord[1] + 12, c2Chord[2] + 12], t, stepDur * 6.8, 0.0068, {
          dest: dest,
          wet: 0.6,
          filter: 4200,
          attack: 0.42,
          release: 1.7,
        });

      /* PROCESSIONAL PULSE. Chapter I's road drum is a footstep; this
         is a crowd, so it carries a backbeat rather than a lone tap. */
      if (!c2Quiet) {
        if (s === 0) roadDrum(t, c2Peak ? 0.04 : 0.033, dest, true);
        if (s === 8) roadDrum(t, c2Peak ? 0.032 : 0.026, dest, false);
        if ((c2Busy || c2Peak) && (s === 4 || s === 12))
          roadDrum(t, c2Peak ? 0.024 : 0.019, dest, false);
        if (c2Peak && s === 14) roadDrum(t, 0.017, dest, false);
      } else if (s === 0) {
        roadDrum(t, 0.016, dest, false);
      }
      if (c2Strike36 && s === 10) roadDrum(t, 0.015, dest, false);
      return;
    }

    if (name === 'prep') {
      /* Fifty-two bars / ~122 seconds. The planning theme surveys the board,
         assembles, tightens, breathes, rebuilds and finally reaches a full
         readiness peak instead of repeating the same four-bar countdown. */
      var prepLeadA = [62, null, 65, 69, null, 67, 65, null, 62, 65, null, 70, 69, null, 65, 67];
      var prepLeadB = [65, null, 69, 70, null, 72, 69, null, 67, null, 65, 67, null, 69, 65, null];
      var prepLeadC = [69, null, 72, 74, null, 77, 76, null, 72, 74, null, 77, 76, null, 72, 69];
      var prepHush = [62, null, null, 65, null, null, 69, null, 57, null, null, 60, null, 62, null, null];
      var prepQuiet = phraseBar < 4 || (phraseBar >= 24 && phraseBar < 28) || phraseBar >= 48;
      var prepPressure = phraseBar >= 16 && phraseBar < 24;
      var prepBuild = phraseBar >= 28 && phraseBar < 40;
      var prepPeak = phraseBar >= 40 && phraseBar < 48;
      var prepPart = [prepLeadA, prepHush, prepLeadA, prepLeadB];
      if (phraseBar >= 8 && phraseBar < 16)
        prepPart = [prepLeadB, prepLeadA, prepLeadB, prepLeadC];
      else if (prepPressure)
        prepPart = [prepLeadB, prepLeadC, prepLeadB, prepLeadC];
      else if (phraseBar >= 24 && phraseBar < 28)
        prepPart = [prepHush, prepLeadA, prepHush, prepLeadB];
      else if (prepBuild)
        prepPart = [prepLeadA, prepLeadB, prepLeadA, prepLeadC];
      else if (prepPeak)
        prepPart = [prepLeadC, prepLeadB, prepLeadC, prepLeadA];
      else if (phraseBar >= 48)
        prepPart = [prepHush, prepLeadA, prepHush, prepLeadA];
      var prepLead = prepPart[phraseBar % 4];

      if (prepQuiet) {
        if (s === 0 || s === 8) kick(t, 0.032, dest);
        if (s === 12 && phraseBar < 48) prepTick(t, 0.0045, dest, true);
      } else {
        if (s === 0 || s === 8 || ((prepPressure || prepPeak) && s === 6))
          kick(t, prepPeak ? 0.054 : 0.045, dest);
        if (s === 4 || s === 12)
          battlePulse(t, prepPeak ? 0.027 : 0.022, dest, true);
        if (s % 2 === 0)
          prepTick(t, prepPeak ? 0.009 : prepBuild ? 0.008 : 0.007, dest, s === 14);
      }

      if (s % (prepQuiet ? 4 : 2) === 0)
        musicNote(
          PREP_ROOTS[chordIndex] - 12 + (s % 4 === 2 ? 7 : 0),
          t,
          stepDur * (prepQuiet ? 2.8 : 0.85),
          prepPeak ? 0.03 : prepQuiet ? 0.019 : 0.024,
          prepPeak ? 'sawtooth' : 'square',
          dest,
          -0.15,
          0.05,
          prepPeak ? 1250 : 1000
        );
      if (prepLead[s] != null)
        musicNote(
          prepLead[s] + 12,
          t,
          stepDur * (prepQuiet ? 1.8 : 1.2),
          prepPeak ? 0.018 : prepQuiet ? 0.011 : 0.014,
          'triangle',
          dest,
          0.18,
          prepQuiet ? 0.38 : 0.26,
          prepPeak ? 3600 : 2900
        );
      if (s === 0)
        chord(
          [PREP_ROOTS[chordIndex], PREP_ROOTS[chordIndex] + 7, PREP_ROOTS[chordIndex] + 12],
          t,
          stepDur * 15.4,
          prepPeak ? 0.0095 : prepQuiet ? 0.0055 : 0.007,
          {
            dest: dest,
            wet: prepQuiet ? 0.46 : 0.32,
            filter: prepPeak ? 1800 : prepQuiet ? 1150 : 1400,
            attack: prepQuiet ? 0.52 : 0.2,
            release: prepQuiet ? 1.5 : 0.8,
          }
        );
      if ((prepBuild || prepPeak) && (s === 3 || s === 11))
        musicNote(
          PREP_CHORDS[chordIndex][(s === 3 ? 1 : 2)] + 12,
          t,
          stepDur * 1.3,
          prepPeak ? 0.009 : 0.006,
          'sine',
          dest,
          0.08,
          0.34,
          3300
        );
      return;
    }

    /* -------------------------------------------------------
       MATCH SCORE v5 - preparation's key, battle's adrenaline.

       Every field follows preparation's D-Bb-C-A progression and D-natural
       minor pitch set. Each now has a complete two-minute form with opening,
       contrasting middle, breakdown and final assault. Distinction comes
       from performance: neutral fields drive with war drums and low strings,
       bright fields climb into heroic brass, and dark fields push the same
       harmony down into a heavier register. No battle arrangement schedules
       a noise source, so intensity never turns back into static.
       ------------------------------------------------------- */
    var battleRoot = PREP_ROOTS[chordIndex];
    var battleChord = PREP_CHORDS[chordIndex];

    if (name === 'battleBright') {
      var brightPhrase = phraseBar;
      var brightInterlude = brightPhrase >= 32 && brightPhrase < 36;
      var brightPeak = brightPhrase >= 48 && brightPhrase < 60;
      var brightTurn = brightPhrase >= 60;
      var brightLift =
        (brightPhrase >= 8 && brightPhrase < 32) || (brightPhrase >= 36 && brightPhrase < 60);
      var brightVoicesA = [0, 1, 2, 1, 0, 2, 1, 2];
      var brightVoicesB = [2, 1, 0, 1, 2, 0, 1, 0];
      var brightVoices = Math.floor(brightPhrase / 8) % 2 ? brightVoicesB : brightVoicesA;
      var brightCallA = [null, 65, null, 69, null, 72, 74, 72, null, 69, null, 72, null, 74, 72, 69];
      var brightCallB = [69, null, 72, null, 74, 76, null, 77, 76, null, 74, null, 72, 74, 69, null];
      var brightCallC = [72, null, 74, 76, null, 77, 81, null, 79, null, 77, 79, null, 81, 84, 81];
      var brightCallQuiet = [null, null, 65, null, null, null, 69, null, null, null, 67, null, null, 65, null, null];
      var brightCallPart = [brightCallA, brightCallA, brightCallB, brightCallA];
      if (brightInterlude)
        brightCallPart = [brightCallQuiet, brightCallA, brightCallQuiet, brightCallB];
      else if (brightPeak)
        brightCallPart = [brightCallC, brightCallB, brightCallC, brightCallC];
      else if (brightLift)
        brightCallPart = [brightCallB, brightCallA, brightCallB, brightCallC];
      var brightCall = brightCallPart[brightPhrase % 4];

      if (brightInterlude) {
        if (s === 0 || s === 8) battlePulse(t, 0.036, dest, false);
      } else {
        if ([0, 7, 8, 14].indexOf(s) >= 0 || (brightPeak && (s === 3 || s === 11)))
          battlePulse(t, s === 0 || s === 8 ? (brightPeak ? 0.07 : 0.062) : 0.039, dest, false);
        if (s === 4 || s === 12) battlePulse(t, brightPeak ? 0.039 : 0.033, dest, true);
      }
      if (s === 0)
        chord(battleChord, t, stepDur * 15.5, brightInterlude ? 0.008 : brightPeak ? 0.015 : 0.012, {
          dest: dest,
          wet: brightInterlude ? 0.34 : 0.18,
          filter: brightPeak ? 2400 : brightInterlude ? 1450 : 1900,
          attack: brightInterlude ? 0.52 : 0.24,
          release: brightInterlude ? 1.5 : 0.9,
        });
      if (s === 0 || (!brightInterlude && s === 8))
        musicNote(
          battleRoot - 12 + (s === 8 ? 7 : 0),
          t,
          stepDur * (brightInterlude ? 7.6 : 4.8),
          brightPeak ? 0.038 : brightInterlude ? 0.024 : 0.032,
          'sine',
          dest,
          -0.2,
          0.025,
          620
        );
      if (s % (brightInterlude ? 4 : 2) === 0)
        battleStrings(
          battleChord[brightVoices[s / (brightInterlude ? 4 : 2)]] + (brightPeak ? 12 : 0),
          t,
          stepDur * (brightInterlude ? 2.8 : 1.38),
          brightPeak ? 0.021 : brightInterlude ? 0.013 : 0.019,
          dest,
          s % 4 === 0 ? -0.13 : 0.08,
          false
        );
      if (brightCall[s] != null)
        battleBrass(
          brightCall[s],
          t,
          stepDur * (s === 7 || s === 15 ? 2.25 : brightInterlude ? 2.4 : 1.55),
          brightPeak ? 0.016 : s === 7 || s === 15 ? 0.016 : 0.012,
          dest,
          0.17,
          false
        );
      if (brightPeak && brightCall[s] != null && (s === 6 || s === 14))
        battleBrass(brightCall[s] - 12, t, stepDur * 1.5, 0.008, dest, -0.04, false);
      if (brightTurn && s === 0)
        musicNote(battleRoot + 12, t, stepDur * 7.2, 0.008, 'triangle', dest, 0.12, 0.42, 3600);
      return;
    }

    if (name === 'battleDark') {
      var darkPhrase = phraseBar;
      var darkAbyss = darkPhrase >= 24 && darkPhrase < 28;
      var darkPeak = darkPhrase >= 40 && darkPhrase < 52;
      var darkTurn = darkPhrase >= 52;
      var darkHeavy =
        (darkPhrase >= 8 && darkPhrase < 24) || (darkPhrase >= 28 && darkPhrase < 52);
      var darkVoicesA = [0, 0, 1, 0, 2, 1, 0, 1];
      var darkVoicesB = [0, 2, 0, 1, 0, 2, 1, 0];
      var darkVoices = Math.floor(darkPhrase / 8) % 2 ? darkVoicesB : darkVoicesA;
      var darkCallA = [50, null, null, 53, null, null, 57, 55, null, 53, null, null, 50, null, 48, 50];
      var darkCallB = [50, null, 53, null, 55, null, 57, null, 58, null, 57, 55, null, 53, 50, null];
      var darkCallC = [50, null, 53, 55, null, 57, 58, 57, 53, null, 55, 57, null, 58, 62, 58];
      var darkCallQuiet = [38, null, null, null, 41, null, null, null, 43, null, null, null, 41, null, 38, null];
      var darkCallPart = [darkCallA, darkCallB, darkCallA, darkCallQuiet];
      if (darkAbyss)
        darkCallPart = [darkCallQuiet, darkCallA, darkCallQuiet, darkCallB];
      else if (darkPeak)
        darkCallPart = [darkCallC, darkCallB, darkCallC, darkCallC];
      else if (darkHeavy)
        darkCallPart = [darkCallB, darkCallA, darkCallB, darkCallC];
      var darkCall = darkCallPart[darkPhrase % 4];

      if (darkAbyss) {
        if (s === 0 || s === 10) battlePulse(t, 0.039, dest, false);
      } else {
        if ([0, 3, 8, 10].indexOf(s) >= 0 || (darkPeak && (s === 6 || s === 14)))
          battlePulse(t, s === 0 || s === 8 ? (darkPeak ? 0.076 : 0.068) : 0.043, dest, false);
        if (s === 4 || s === 12) battlePulse(t, darkPeak ? 0.041 : 0.035, dest, true);
      }
      if (s === 0) {
        chord(battleChord, t, stepDur * 15.6, darkAbyss ? 0.008 : darkPeak ? 0.015 : 0.0125, {
          dest: dest,
          wet: darkAbyss ? 0.28 : 0.13,
          filter: darkPeak ? 1250 : darkAbyss ? 760 : 1050,
          attack: darkAbyss ? 0.72 : 0.38,
          release: darkAbyss ? 1.8 : 1.2,
        });
        musicNote(
          battleRoot - 24,
          t,
          stepDur * 14.8,
          darkPeak ? 0.043 : darkAbyss ? 0.029 : 0.035,
          'sine',
          dest,
          -0.22,
          0.015,
          390
        );
      }
      if (s % (darkAbyss ? 4 : 2) === 0)
        battleStrings(
          battleChord[darkVoices[s / (darkAbyss ? 4 : 2)]] - 12,
          t,
          stepDur * (darkAbyss ? 3.1 : 1.48),
          darkPeak ? 0.025 : darkAbyss ? 0.014 : 0.021,
          dest,
          -0.12,
          true
        );
      if (darkCall[s] != null)
        battleBrass(
          darkCall[s],
          t,
          stepDur * (s === 7 || s === 15 ? 2.35 : darkAbyss ? 2.7 : 1.75),
          darkPeak ? 0.019 : s === 7 || s === 15 ? 0.018 : 0.014,
          dest,
          0.12,
          true
        );
      if (darkPeak && (s === 2 || s === 10))
        musicNote(battleRoot - 12, t, stepDur * 1.7, 0.025, 'square', dest, -0.18, 0.02, 740);
      if (darkTurn && s === 8)
        musicNote(battleRoot - 5, t, stepDur * 6.8, 0.018, 'sine', dest, 0.06, 0.22, 620);
      return;
    }

    /* Neutral fields: sixty bars / exactly two minutes. The preparation
       motif crosses into an opening march, a charging answer, a mid-battle
       clash, four-bar breath, second advance, counterattack and final siege. */
    var warPhrase = phraseBar;
    var warBreak = warPhrase >= 24 && warPhrase < 28;
    var warPeak = warPhrase >= 48 && warPhrase < 56;
    var warTurn = warPhrase >= 56;
    var warAdvance =
      (warPhrase >= 8 && warPhrase < 24) || (warPhrase >= 28 && warPhrase < 48);
    var warVoicesA = [0, 1, 0, 2, 0, 1, 2, 1];
    var warVoicesB = [0, 2, 1, 0, 2, 1, 0, 1];
    var warVoices = Math.floor(warPhrase / 8) % 2 ? warVoicesB : warVoicesA;
    var warCallA = [null, null, 62, null, 65, null, 69, 67, null, null, 65, null, 62, null, 60, 62];
    var warCallB = [62, null, 65, null, 67, null, 69, null, 70, 69, null, 67, null, 65, 62, null];
    var warCallC = [62, null, 65, 67, null, 69, 72, 70, 69, null, 72, 74, null, 72, 69, 67];
    var warCallQuiet = [null, null, 50, null, null, null, 53, null, null, null, 55, null, null, 53, null, null];
    var warCallPart = [warCallA, warCallB, warCallA, warCallQuiet];
    if (warBreak) warCallPart = [warCallQuiet, warCallA, warCallQuiet, warCallB];
    else if (warPeak) warCallPart = [warCallC, warCallB, warCallC, warCallC];
    else if (warAdvance) warCallPart = [warCallB, warCallA, warCallB, warCallC];
    var warCall = warCallPart[warPhrase % 4];

    if (warBreak) {
      if (s === 0 || s === 8) battlePulse(t, 0.038, dest, false);
    } else {
      if ([0, 6, 8, 11, 14].indexOf(s) >= 0 || (warPeak && (s === 3 || s === 9)))
        battlePulse(t, s === 0 || s === 8 ? (warPeak ? 0.078 : 0.07) : 0.044, dest, false);
      if (s === 4 || s === 12) battlePulse(t, warPeak ? 0.043 : 0.037, dest, true);
    }
    if (s === 0)
      chord(battleChord, t, stepDur * 15.5, warBreak ? 0.008 : warPeak ? 0.015 : 0.012, {
        dest: dest,
        wet: warBreak ? 0.3 : 0.14,
        filter: warPeak ? 1850 : warBreak ? 1050 : 1480,
        attack: warBreak ? 0.58 : 0.28,
        release: warBreak ? 1.6 : 0.98,
      });
    if (s === 0 || (!warBreak && s === 8))
      musicNote(
        battleRoot - 12 + (s === 8 ? 7 : 0),
        t,
        stepDur * (warBreak ? 7.6 : 4.9),
        warPeak ? 0.04 : warBreak ? 0.023 : 0.034,
        'sine',
        dest,
        -0.22,
        0.02,
        540
      );
    if (s % (warBreak ? 4 : 2) === 0)
      battleStrings(
        battleChord[warVoices[s / (warBreak ? 4 : 2)]] - 12,
        t,
        stepDur * (warBreak ? 2.9 : 1.42),
        warPeak ? 0.025 : warBreak ? 0.014 : 0.021,
        dest,
        s % 4 === 0 ? -0.14 : 0.04,
        false
      );
    if (warCall[s] != null)
      battleBrass(
        warCall[s],
        t,
        stepDur * (s === 7 || s === 15 ? 2.25 : warBreak ? 2.6 : 1.65),
        warPeak ? 0.019 : s === 7 || s === 15 ? 0.017 : 0.013,
        dest,
        0.15,
        false
      );
    if (warPeak && warCall[s] != null && (s === 6 || s === 14))
      battleBrass(warCall[s] - 12, t, stepDur * 1.45, 0.008, dest, -0.08, true);
    if (warTurn && (s === 0 || s === 8))
      musicNote(battleRoot, t, stepDur * 6.6, 0.009, 'triangle', dest, 0.08, 0.38, 2600);
    return;
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
    if (!ctx || !unlocked || muted() || prefs.music <= 0 || document.hidden) return;
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

  /* Tell the score which chapter's Road is open. If the Road is already
     playing, swap the track immediately so the change is audible at the
     moment the plate opens rather than at the next scene change. */
  function setCampaignChapter(id) {
    id = parseInt(id, 10) === 2 ? 2 : 1;
    if (campaignChapter === id) return;
    campaignChapter = id;
    if (desiredScene === 'road' && unlocked && !muted() && prefs.music > 0) {
      startTrack(trackForScene('road'));
    }
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
      else if (unlocked && !muted()) startTrack(trackForScene(desiredScene));
    } else if (wasMuted && !muted() && unlocked && prefs.music > 0) {
      /* Moving any live channel is an intentional unmute. Bring the
         remembered score back too, rather than leaving the button in an
         unmuted state while music stays stopped until the next screen.
         Still subject to the portal's mute, which outranks ours. */
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
    /* An in-game unmute must NOT bring sound back while the portal is
       holding us muted - its setting takes priority over ours. The
       player's choice is still saved, and it takes effect the moment
       the portal releases the mute. */
    if (muted()) stopMusic(0.15);
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
    /* Only the actual Road map leaves the main menu soundtrack. The
       Campaign chapter-select screen is still an ordinary menu; entering
       Chapter 1 is the exact point where the Road score begins. */
    if (view === 'chapter') return scene('road');
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
    setCampaignChapter: setCampaignChapter,
    result: result,
    duck: duck,
    getPrefs: getPrefs,
    setVolume: setVolume,
    setMuted: setMuted,
    /* The embedding portal's mute. Separate from setMuted so it never
       touches - or is overridden by - the player's own preference. */
    setExternalMute: setExternalMute,
    isMuted: muted,
    talk: talk,
    startDialogueTalk: startDialogueTalk,
    stopTalk: stopTalk,
    test: function () {
      ui('test');
    },
    /* verification hooks: deterministic shape, never browser secrets */
    _trackForScene: trackForScene,
    _trackInfo: function (name) {
      var def = TRACKS[name];
      return def
        ? {
            tempo: def.tempo,
            steps: def.steps,
            key: def.key,
            phraseBars: def.phraseBars,
            phraseSeconds: (def.phraseBars * 4 * 60) / def.tempo,
          }
        : null;
    },
    _scheduleStep: function (name, absoluteStep) {
      var def = TRACKS[name];
      if (!ctx || !def) return false;
      scheduleMusicStep(
        name,
        absoluteStep | 0,
        ctx.currentTime + 0.02,
        60 / def.tempo / 4,
        trackGain || musicBus
      );
      return true;
    },
    _musicState: function () {
      return { track: currentTrack, token: musicToken, step: stepIndex };
    },
    _characterFreqCeiling: CHARACTER_FREQ_CEILING,
    _prefKey: PREF_KEY,
  };
})();
