/* Echoes of Legend - Chapter 1 campaign flow. */
(function () {
  'use strict';
  window.EOL = window.EOL || {};
  var STORY = window.EOL.campaignCh1 || {};
  var KEY = 'eol.campaign.ch1.progress';
  var index = 0, stage = 1, lines = [], open = false, active = null, result = null;
  function $(id) { return document.getElementById(id); }
  function text(n, v) { if (n) n.textContent = v || ''; }
  function progress() {
    try { var p = JSON.parse(localStorage.getItem(KEY)); if (p && Array.isArray(p.unlocked)) return p; } catch (e) {}
    return { cleared: [], unlocked: [1] };
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function card(id) {
    for (var i = 0; i < (window.EOL.factions || []).length; i++) {
      var f = window.EOL.factions[i];
      for (var j = 0; j < f.cards.length; j++) if (f.cards[j].id === id) return { card: f.cards[j], faction: f };
    }
    return null;
  }
  function entries(ids) { return (ids || []).map(card).filter(Boolean); }
  function stageData(id) { return (STORY.stages || []).filter(function (s) { return s.id === id; })[0]; }
  function update() {
    var p = progress(), u = p.unlocked || [1], c = p.cleared || [];
    (STORY.stages || []).forEach(function (s) {
      var el = document.querySelector('[data-campaign-stage="' + s.id + '"]'); if (!el) return;
      var unlocked = u.indexOf(s.id) >= 0, cleared = c.indexOf(s.id) >= 0;
      el.disabled = !unlocked; el.classList.toggle('is-locked', !unlocked); el.classList.toggle('is-cleared', cleared);
      var badge = el.querySelector('.sc-state-badge, .rival-state, .rival-lock'), prompt = el.querySelector('.sc-prompt');
      if (badge) badge.innerHTML = cleared ? '<i class="ri-checkbox-circle-fill"></i> Gate Cleared' : unlocked ? '<i class="ri-lock-unlock-line"></i> Open Gate' : '<i class="ri-lock-2-fill"></i> Locked';
      if (prompt) prompt.innerHTML = unlocked ? '<i class="ra ra-speech-bubble"></i> Click to speak with ' + (s.rival || '') : '<i class="ri-lock-2-line"></i> Gate Locked';
    });
    var n = document.querySelector('.chapter-progress-n'); if (n) n.innerHTML = '<b>' + String(Math.min(10, Math.max(1, c.length + 1)).padStart(2, '0')) + '</b><i>/</i>10';
  }
  function renderCopy() {
    (STORY.stages || []).forEach(function (s) {
      var el = document.querySelector('[data-campaign-stage="' + s.id + '"]'); if (!el) return;
      text(el.querySelector('.sc-kicker, .rival-kicker'), 'Stage ' + s.id + ' · ' + s.format);
      text(el.querySelector('.sc-name, .rival-name'), s.rival);
      text(el.querySelector('.sc-desc, .rival-desc'), s.line);
      var m = el.querySelector('.sc-meta, .rival-meta'); if (m) { var i = m.querySelector('i'); m.textContent = ''; if (i) m.appendChild(i); m.appendChild(document.createTextNode(' ' + s.terrain)); }
    }); update();
  }
  function render() {
    var l = lines[index]; if (!l) return;
    text($('chapter-dialogue-speaker'), l.speaker); text($('chapter-dialogue-text'), l.text);
    text($('chapter-dialogue-step'), String(index + 1).padStart(2, '0') + ' / ' + String(lines.length).padStart(2, '0'));
    var next = $('chapter-dialogue-next'); if (next) { next.innerHTML = l.battle ? '<i class="ra ra-crossed-swords"></i><span>Enter the battle</span>' : l.final ? '<span>Close</span><i class="ri-check-line"></i>' : '<span>Continue</span><i class="ri-arrow-right-line"></i>'; }
  }
  function close() {
    var m = $('chapter-dialogue'); if (!m) return; m.hidden = true; m.setAttribute('aria-hidden', 'true'); document.body.dataset.campaignDialogue = '0'; open = false;
    if (stage === -1) { active = null; stage = 1; window.EOL.ui.show('chapter'); } else { var el = document.querySelector('[data-campaign-stage="' + stage + '"]'); if (el) el.focus(); }
  }
  function showDialogue(id, custom) {
    stage = id; lines = custom || (STORY.dialogues || {})[id] || [];
    if (!lines.length) return;
    index = 0; open = true; var m = $('chapter-dialogue'); if (!m) return;
    m.hidden = false; m.setAttribute('aria-hidden', 'false'); document.body.dataset.campaignDialogue = '1';
    var s = stageData(id), img = m.querySelector('.chapter-dialogue-art img');
    if (img && s && s.portrait) img.src = s.portrait;
    var k = m.querySelector('.chapter-dialogue-kicker'); if (k && s) k.innerHTML = '<i class="ri-book-open-line"></i> Chapter 1 · Gate ' + id;
    render(); setTimeout(function () { var n = $('chapter-dialogue-next'); if (n) n.focus(); }, 0);
  }
  function fight(id) {
    var s = stageData(id); if (!s || !window.EOL.play || !window.EOL.play.openClassicModal) return;
    active = id;
    window.EOL.play.openClassicModal(function (deckId) {
      var deck = deckId && window.EOL.decks.get(deckId), starter = window.EOL.decks.get('starter-grimmwood');
      var mine = deck ? window.EOL.decks.entriesOf(deck) : starter ? window.EOL.decks.entriesOf(starter) : entries((STORY.starterIds || []).slice(0, 12));
      if (!mine || mine.length < 12) mine = entries((STORY.starterIds || []).slice(0, 12));
      var modal = $('deck-modal'); if (modal) { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
      window.EOL.play.startPrep({ mode: 'classic', deckId: deckId, player12: mine, enemy12: entries(s.enemy.ids), field: window.EOL.battlefieldById(s.field), campaignStage: id, campaignPersonality: s.ai, campaignRival: s.rival, warLength: 'single', oddFirst: 'player' });
    }, { isCampaign: true, hideRandom: true });
  }
  function advance() {
    var l = lines[index]; if (index < lines.length - 1) { index++; render(); return; }
    close(); if (l && l.battle) fight(stage);
  }
  function onResult(win) {
    if (!active) return null;
    var id = active, p = progress(), cleared = p.cleared || [], unlocked = p.unlocked || [1];
    if (win) { if (cleared.indexOf(id) < 0) cleared.push(id); if (id < 10 && unlocked.indexOf(id + 1) < 0) unlocked.push(id + 1); save({ cleared: cleared, unlocked: unlocked }); update(); }
    result = { stage: id, won: win }; return { campaign: true, won: win, stage: id };
  }
  function retry(id) { result = null; active = id || 1; window.EOL.ui.show('chapter'); setTimeout(function () { showDialogue(active); }, 60); }
  function consumeResult() {
    if (!result) return false; var r = result; result = null; active = null;
    if (r.won) { var next = r.stage < 10 ? r.stage + 1 : null; if (next) showDialogue(next, STORY.victories && STORY.victories[r.stage]); else window.EOL.ui.show('chapter'); }
    else window.EOL.ui.show('chapter'); return true;
  }
  function banter() {
    if (!active || !window.EOL.campaign || !window.EOL.campaign.story) return;
    var s = stageData(active), pool = s && s.banter; if (!pool || !pool.length) return;
    var line = pool[Math.floor(Math.random() * pool.length)], host = $('campaign-rival-banter');
    if (!host) return; text($('campaign-rival-banter-name'), s.rival); text($('campaign-rival-banter-text'), '“' + line + '”'); host.classList.remove('show'); void host.offsetWidth; host.classList.add('show'); clearTimeout(host._timer); host._timer = setTimeout(function () { host.classList.remove('show'); }, 4200);
  }
  function mount() {
    renderCopy();
    for (var i = 1; i <= 10; i++) (function (id) { var el = document.querySelector('[data-campaign-stage="' + id + '"]'); if (el) el.addEventListener('click', function () { if ((progress().unlocked || [1]).indexOf(id) >= 0) showDialogue(id); }); })(i);
    var x = $('chapter-dialogue-close'), sc = $('chapter-dialogue-scrim'), n = $('chapter-dialogue-next'); if (x) x.addEventListener('click', close); if (sc) sc.addEventListener('click', close); if (n) n.addEventListener('click', advance);
    document.addEventListener('keydown', function (e) { if (!open) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } });
    document.addEventListener('eol:view', function (e) { if (e.detail === 'chapter') update(); });
  }
  window.EOL.campaign = { openStageDialogue: showDialogue, openRecruiterDialogue: function () { showDialogue(1); }, closeRecruiterDialogue: close, dialogueOpen: function () { return open; }, onBattleResult: onResult, retry: retry, consumeResult: consumeResult, updateStageCards: update, banter: banter, story: STORY };
  document.addEventListener('DOMContentLoaded', mount);
})();