/* =============================================================
 * Privacy-light measurement + player feedback
 * -------------------------------------------------------------
 * Stores a deliberately small funnel in the project's own Supabase:
 * views, mode choices, queue/match milestones and battle starts/results.
 * No card choices, emails, callsigns, chat, full user-agent or stack trace
 * is sent. A random installation id in localStorage joins sessions into
 * return visits; Settings can turn measurement off and erase that id.
 *
 * Feedback is voluntary and separate. The form can attach coarse browser
 * diagnostics (build, view, viewport, platform and last battle), visibly
 * controlled by its own checkbox.
 *
 * The database migration is docs/supabase-migration-06.sql. If it has not
 * been installed, measurement fails silently and feedback offers a copy +
 * Discord fallback. The game itself never depends on either service.
 * ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var ENABLE_KEY = 'eol.measurement';
  var VISITOR_KEY = 'eol.measurement.visitor';
  var SESSION_KEY = 'eol.measurement.session';
  var MAX_QUEUE = 40;
  var queue = [];
  var flushing = false;
  var backendMissing = false;
  var sessionStarted = false;
  var accountSeen = false;
  var lastView = '';
  var lastBattle = null;
  var feedbackSource = 'home';
  var initialized = false;
  var ephemeralVisitor = '';

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint8Array(16);
        window.crypto.getRandomValues(b);
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        var h = Array.prototype.map
          .call(b, function (x) {
            return x.toString(16).padStart(2, '0');
          })
          .join('');
        return (
          h.slice(0, 8) +
          '-' +
          h.slice(8, 12) +
          '-' +
          h.slice(12, 16) +
          '-' +
          h.slice(16, 20) +
          '-' +
          h.slice(20)
        );
      }
    } catch (e) {}
    /* Old-browser fallback: format-valid and adequate for anonymous
       product measurement, never used as a security credential. */
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function storageGet(store, key) {
    try {
      return store.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  function storageSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {}
  }

  function enabled() {
    return storageGet(localStorage, ENABLE_KEY) !== 'off';
  }

  function visitorId(persist) {
    var id = storageGet(localStorage, VISITOR_KEY) || ephemeralVisitor;
    if (!id) id = uuid();
    ephemeralVisitor = id;
    if (persist !== false && !storageGet(localStorage, VISITOR_KEY)) {
      storageSet(localStorage, VISITOR_KEY, id);
    }
    return id;
  }

  function sessionId() {
    var id = storageGet(sessionStorage, SESSION_KEY);
    if (!id) {
      id = uuid();
      storageSet(sessionStorage, SESSION_KEY, id);
    }
    return id;
  }

  function buildName() {
    var el = document.getElementById('build-tag');
    return el
      ? String(el.textContent || '')
          .trim()
          .slice(0, 80)
      : '';
  }

  function compact(value, depth) {
    if (depth > 3 || value == null) return value == null ? null : String(value).slice(0, 160);
    if (typeof value === 'string') return value.slice(0, 240);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 12).map(function (item) {
        return compact(item, depth + 1);
      });
    }
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value)
        .slice(0, 24)
        .forEach(function (key) {
          out[String(key).slice(0, 48)] = compact(value[key], depth + 1);
        });
      return out;
    }
    return String(value).slice(0, 160);
  }

  function baseContext() {
    return {
      build: buildName(),
      view: document.body ? document.body.dataset.view || 'home' : 'home',
      width: Math.round(window.innerWidth || 0),
      height: Math.round(window.innerHeight || 0),
      gfx: document.body ? document.body.dataset.gfx || '' : '',
      touch: !!('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0),
      language: String(navigator.language || '').slice(0, 24),
    };
  }

  function mergedContext(extra) {
    var out = baseContext();
    Object.keys(extra || {}).forEach(function (key) {
      out[key] = extra[key];
    });
    return compact(out, 0);
  }

  function attribution() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (key) {
        var value = q.get(key);
        if (value) out[key] = value.slice(0, 120);
      });
    } catch (e) {}
    try {
      if (document.referrer) out.referrer = new URL(document.referrer).hostname.slice(0, 160);
    } catch (e2) {}
    return out;
  }

  function client() {
    var auth = window.EOL.auth;
    return auth && auth.rawClient ? auth.rawClient() : null;
  }

  function missingFunction(err) {
    var msg = String((err && (err.message || err.details || err.code)) || '');
    return /PGRST202|record_telemetry.*schema cache|Could not find the function/i.test(msg);
  }

  function flush() {
    if (flushing || backendMissing || !enabled() || !queue.length) return;
    var sb = client();
    if (!sb) return;
    flushing = true;
    var item = queue[0];
    sb.rpc('record_telemetry', {
      p_visitor: visitorId(true),
      p_session: sessionId(),
      p_event: item.name,
      p_context: item.context,
    }).then(
      function (res) {
        flushing = false;
        if (res && res.error) {
          if (missingFunction(res.error)) {
            backendMissing = true;
            queue = [];
            console.warn(
              '[measurement] migration 06 is not installed; anonymous measurement is offline.'
            );
            return;
          }
          /* A temporary network failure keeps a bounded queue for the next
             auth/view tick; measurement must never interrupt the game. */
          setTimeout(flush, 10000);
          return;
        }
        queue.shift();
        flush();
      },
      function () {
        flushing = false;
        setTimeout(flush, 10000);
      }
    );
  }

  function track(name, context) {
    if (!enabled() || backendMissing) return;
    queue.push({ name: name, context: mergedContext(context || {}) });
    if (queue.length > MAX_QUEUE) queue.shift();
    flush();
  }

  function startSession() {
    if (sessionStarted || !enabled()) return;
    sessionStarted = true;
    track('session_started', attribution());
  }

  function setEnabled(on) {
    storageSet(localStorage, ENABLE_KEY, on ? 'on' : 'off');
    if (!on) {
      queue = [];
      sessionStarted = false;
      try {
        localStorage.removeItem(VISITOR_KEY);
      } catch (e) {}
      /* Voluntary feedback can still be rate-limited within this page,
         but it no longer links to the erased measurement identifier. */
      ephemeralVisitor = uuid();
    } else {
      backendMissing = false;
      startSession();
      track('view_opened', { view: document.body.dataset.view || 'home', reason: 'enabled' });
    }
    paintMeasurement();
  }

  function paintMeasurement() {
    var on = enabled();
    if (document.body) document.body.dataset.measurement = on ? 'on' : 'off';
    document.querySelectorAll('.measure-opt').forEach(function (button) {
      button.setAttribute('aria-pressed', String((button.dataset.measurement === 'on') === on));
    });
  }

  function battleStarted(context) {
    lastBattle = compact(context || {}, 0);
    track('battle_started', lastBattle);
  }

  function battleCompleted(context) {
    var all = {};
    Object.keys(lastBattle || {}).forEach(function (key) {
      all[key] = lastBattle[key];
    });
    Object.keys(context || {}).forEach(function (key) {
      all[key] = context[key];
    });
    lastBattle = compact(all, 0);
    track('battle_completed', lastBattle);
  }

  function feedbackDiagnostics() {
    var out = baseContext();
    out.platform = String(
      (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    ).slice(0, 80);
    out.online = navigator.onLine !== false;
    out.source = feedbackSource;
    if (lastBattle) out.last_battle = lastBattle;
    return compact(out, 0);
  }

  function feedbackSay(message, kind) {
    var foot = document.getElementById('feedback-foot');
    if (!foot) return;
    foot.className = 'auth-foot' + (kind ? ' ' + kind : '');
    foot.innerHTML = message ? '<i class="ri-information-line"></i>' + escapeHtml(message) : '';
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function openFeedback(source) {
    var modal = document.getElementById('feedback-modal');
    if (!modal) return;
    feedbackSource = source || 'home';
    var message = document.getElementById('feedback-message');
    if (message) message.value = '';
    var category = document.getElementById('feedback-category');
    if (category) category.value = source === 'result' ? 'balance' : 'bug';
    var diagnostics = document.getElementById('feedback-diagnostics');
    if (diagnostics) diagnostics.checked = true;
    feedbackSay('');
    modal.hidden = false;
    document.body.dataset.modal = '1';
    track('feedback_opened', { source: feedbackSource });
    setTimeout(function () {
      if (message) message.focus();
    }, 0);
  }

  function closeFeedback() {
    var modal = document.getElementById('feedback-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    delete document.body.dataset.modal;
  }

  function copyFeedback() {
    var category = document.getElementById('feedback-category');
    var message = document.getElementById('feedback-message');
    var text =
      'Echoes of Legend feedback [' +
      (category ? category.value : 'other') +
      ']\n' +
      (message ? message.value.trim() : '');
    if (!text.trim()) return Promise.reject(new Error('Nothing to copy'));
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(text);
    var temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    var ok = document.execCommand('copy');
    temp.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  }

  function submitFeedback(event) {
    event.preventDefault();
    var category = document.getElementById('feedback-category');
    var message = document.getElementById('feedback-message');
    var diagnostics = document.getElementById('feedback-diagnostics');
    var submit = document.getElementById('feedback-submit');
    var text = message ? message.value.trim() : '';
    if (text.length < 3) {
      feedbackSay('Please write at least a few words.', 'warn');
      return;
    }
    if (text.length > 2000) {
      feedbackSay('Please keep feedback under 2,000 characters.', 'warn');
      return;
    }
    var sb = client();
    if (!sb) {
      feedbackSay('The feedback inbox is offline. Copy your note and send it in Discord.', 'warn');
      return;
    }
    if (submit) submit.disabled = true;
    feedbackSay('Sending…');
    sb.rpc('submit_player_feedback', {
      p_visitor: visitorId(enabled()),
      p_session: sessionId(),
      p_category: category ? category.value : 'other',
      p_message: text,
      p_context: diagnostics && diagnostics.checked ? feedbackDiagnostics() : {},
    }).then(
      function (res) {
        if (submit) submit.disabled = false;
        if (res && res.error) {
          feedbackSay('Could not send this yet. Copy it and post it in Discord instead.', 'warn');
          return;
        }
        if (message) message.value = '';
        feedbackSay('Sent. Thank you — this went directly to the playtest inbox.', 'ok');
      },
      function () {
        if (submit) submit.disabled = false;
        feedbackSay('Could not send this yet. Copy it and post it in Discord instead.', 'warn');
      }
    );
  }

  function init() {
    if (initialized) return;
    initialized = true;
    paintMeasurement();
    startSession();

    if (window.EOL.auth && window.EOL.auth.onChange) {
      window.EOL.auth.onChange(function (user) {
        flush();
        if (user && !accountSeen) {
          accountSeen = true;
          track('account_ready', {});
        }
      });
    }

    document.addEventListener('eol:view', function (event) {
      var view = String(event.detail || '');
      if (!view || view === lastView) return;
      lastView = view;
      track('view_opened', { view: view });
    });

    document.addEventListener('click', function (event) {
      var target = event.target.closest ? event.target.closest('button, a') : null;
      if (!target) return;
      var modes = {
        'mode-classic': 'solo_classic',
        'mode-draft': 'solo_draft',
        'mode-campaign': 'campaign',
        'mode-daily': 'daily',
        'mode-mp-classic': 'online_classic',
        'mode-mp-draft': 'online_draft',
      };
      if (modes[target.id]) track('mode_selected', { mode: modes[target.id] });
      if (target.id === 'mode-daily') track('daily_opened', {});
    });

    document.querySelectorAll('.measure-opt').forEach(function (button) {
      button.addEventListener('click', function () {
        setEnabled(button.dataset.measurement === 'on');
      });
    });

    var homeFeedback = document.getElementById('btn-corner-feedback');
    if (homeFeedback)
      homeFeedback.addEventListener('click', function () {
        openFeedback('home');
      });
    var resultFeedback = document.getElementById('btn-result-feedback');
    if (resultFeedback)
      resultFeedback.addEventListener('click', function () {
        openFeedback('result');
      });
    var close = document.getElementById('feedback-close');
    if (close) close.addEventListener('click', closeFeedback);
    var scrim = document.getElementById('feedback-scrim');
    if (scrim) scrim.addEventListener('click', closeFeedback);
    var form = document.getElementById('feedback-form');
    if (form) form.addEventListener('submit', submitFeedback);
    var copy = document.getElementById('feedback-copy');
    if (copy)
      copy.addEventListener('click', function () {
        copyFeedback().then(
          function () {
            feedbackSay('Copied. You can paste it in Discord.', 'ok');
          },
          function () {
            feedbackSay(
              'Could not copy automatically. Select the message and copy it manually.',
              'warn'
            );
          }
        );
      });

    window.addEventListener('error', function (event) {
      /* Resource-load errors do not carry an ErrorEvent message; omit them
         so one blocked font CDN cannot flood the product funnel. */
      if (!event.message) return;
      var file = '';
      try {
        file = event.filename ? new URL(event.filename).pathname.split('/').pop() : '';
      } catch (e) {}
      track('client_error', {
        kind: 'error',
        message: String(event.message || 'Script error').slice(0, 180),
        file: file,
        line: event.lineno || 0,
      });
    });
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason;
      track('client_error', {
        kind: 'promise',
        message: String(
          (reason && reason.message) || reason || 'Unhandled promise rejection'
        ).slice(0, 180),
      });
    });

    /* Auth init runs in app.js's DOMContentLoaded handler after this
       module's handler. The onChange callback above flushes normally; this
       retry also covers a temporarily slow SDK without polling forever. */
    setTimeout(flush, 2500);
  }

  window.EOL.telemetry = {
    init: init,
    track: track,
    enabled: enabled,
    setEnabled: setEnabled,
    battleStarted: battleStarted,
    battleCompleted: battleCompleted,
    openFeedback: openFeedback,
    _feedbackDiagnostics: feedbackDiagnostics,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
