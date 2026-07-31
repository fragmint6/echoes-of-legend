/* =============================================================
   Shared text helpers
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var ELEMENTS = ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire', 'Nature'];

  /* Keyword colouring for ability text.
     Three families, each with its own CSS class prefix:
       el-*   the seven damage elements
       st-*   status effects (Burn, Exposed, Marked, Shield, ...)
       sv-*   stat words (ATK, DEF, Crit, HP, Energy)
     Order matters: the alternation is tried left to right, so longer
     phrases must come first ("Max HP" before "HP", "Lightning" before
     "Light", "Crit Chance" before "Crit"). */
  var STATUS_WORDS = [
    ['Untargetable', 'untargetable'],
    ['Exposed',      'exposed'],
    ['Burning',      'burn'],
    ['Burn',         'burn'],
    ['Marked',       'marked'],
    ['Mark',         'marked'],
    ['Marks',        'marked'],
    ['Shielded',     'shield'],
    ['Shield',       'shield'],
    ['Taunts',       'taunt'],
    ['Taunting',     'taunt'],
    ['Taunt',        'taunt'],
    ['Silenced',     'silence'],
    ['Silence',      'silence']
  ];
  var STAT_WORDS = [
    ['Crit Chance', 'crit'],
    ['Crit',        'crit'],
    ['Max HP',      'hp'],
    ['HP',          'hp'],
    ['ATK',         'atk'],
    ['DEF',         'def'],
    ['Energy',      'energy']
  ];

  function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Build one alternation of every keyword, longest first so that e.g.
     "Marks" wins over "Mark" and "Max HP" over "HP". */
  var ALL = []
    .concat(ELEMENTS.map(function (w) { return [w, 'el-' + w.toLowerCase()]; }))
    .concat(STATUS_WORDS.map(function (p) { return [p[0], 'st-' + p[1]]; }))
    .concat(STAT_WORDS.map(function (p) { return [p[0], 'sv-' + p[1]]; }));
  ALL.sort(function (a, b) { return b[0].length - a[0].length; });

  var CLASS_OF = {};
  ALL.forEach(function (p) { CLASS_OF[p[0].toLowerCase()] = p[1]; });

  var KEY_RE = new RegExp(
    '\\b(' + ALL.map(function (p) { return esc(p[0]); }).join('|') + ')\\b', 'g');

  /* Wrap every known keyword in ability text with a coloured span.
     Runs on already-built HTML, so it must not touch text inside tags. */
  window.EOL.colorElements = function (html) {
    if (!html) return html;
    var out = '';
    var i = 0;
    while (i < html.length) {
      var lt = html.indexOf('<', i);
      if (lt === -1) { out += html.slice(i).replace(KEY_RE, tag); break; }
      out += html.slice(i, lt).replace(KEY_RE, tag);
      var gt = html.indexOf('>', lt);
      if (gt === -1) { out += html.slice(lt); break; }
      out += html.slice(lt, gt + 1);   // leave the tag itself alone
      i = gt + 1;
    }
    return out;

    function tag(m) {
      var cls = CLASS_OF[m.toLowerCase()];
      return cls ? '<span class="' + cls + '">' + m + '</span>' : m;
    }
  };

  window.EOL.ELEMENTS = ELEMENTS;

  /* -----------------------------------------------------------
     Status registry — every buff / debuff the engine can apply
     gets its own icon, colour and label.
     ----------------------------------------------------------- */
  window.EOL.STATUS = {
    // --- stat buffs ---
    'atk+':   { icon: 'ra-muscle-up',      kind: 'buff',   label: 'ATK Up',   color: '#ffb347' },
    'def+':   { icon: 'ra-heavy-shield',   kind: 'buff',   label: 'DEF Up',   color: '#8fd0ff' },
    'crit+':  { icon: 'ra-target-arrows',  kind: 'buff',   label: 'Crit Up',  color: '#ffd050' },
    // --- stat debuffs ---
    'atk-':   { icon: 'ra-broken-bone',    kind: 'debuff', label: 'ATK Down', color: '#ff9d9d' },
    'def-':   { icon: 'ra-cracked-shield', kind: 'debuff', label: 'DEF Down', color: '#ff9d9d' },
    'crit-':  { icon: 'ra-target-arrows',  kind: 'debuff', label: 'Crit Down', color: '#ff9d9d' },
    // --- flags / special states ---
    taunt:        { icon: 'ra-shield',          kind: 'buff',   label: 'Taunting',        color: '#ffd98a' },
    untargetable: { icon: 'ra-aura',            kind: 'buff',   label: 'Untargetable',    color: '#a9e9ff' },
    shield:       { icon: 'ra-round-shield',    kind: 'buff',   label: 'Shielded',        color: '#9fd8ff' },
    silence:      { icon: 'ra-uncertainty',     kind: 'debuff', label: 'Silenced',        color: '#e0a3ff' },
    marked:       { icon: 'ra-lightning-storm', kind: 'debuff', label: 'Marked',          color: '#ffe066' },
    burn:         { icon: 'ra-burning-embers',  kind: 'debuff', label: 'Burning',         color: '#ff7a3c' },
    exposed:      { icon: 'ra-broken-shield',   kind: 'debuff', label: 'Exposed',         color: '#ff5f7e' },
    healdown:     { icon: 'ra-broken-heart',    kind: 'debuff', label: 'Healing Reduced', color: '#ff9d9d' },
    costup:       { icon: 'ra-hourglass',       kind: 'debuff', label: 'Ability Cost Up', color: '#ff9d9d' },
    costdown:     { icon: 'ra-hourglass',       kind: 'buff',   label: 'Ability Cost Down', color: '#8fe3b0' }
  };

  /* Collapse a unit's live state into a de-duplicated icon list.
     Same status stacked twice shows once with a count. */
  window.EOL.statusesOf = function (u, E) {
    var out = [];
    function push(key, turns, count) {
      var def = window.EOL.STATUS[key];
      if (!def) return;
      var hit = out.filter(function (o) { return o.key === key; })[0];
      if (hit) { hit.count += (count || 1); return; }
      out.push({ key: key, icon: def.icon, kind: def.kind, label: def.label,
                 turns: turns, count: count || 1 });
    }

    (u.buffs || []).forEach(function (b) {
      if (!b.stat) return;
      push(b.stat + (b.amt >= 0 ? '+' : '-'), b.turns, 1);
    });
    if (u.shield > 0) push('shield', null, 1);
    if (u.flags) {
      if (u.flags.taunt > 0) push('taunt', u.flags.taunt, 1);
      if (u.flags.untargetable > 0) push('untargetable', u.flags.untargetable, 1);
      if (u.flags.silence > 0) push('silence', u.flags.silence, 1);
      if (u.flags.burn > 0) push('burn', u.flags.burn, 1);
      if (u.flags.exposed > 0) push('exposed', u.flags.exposed, 1);
      if (u.flags.healMod) push('healdown', u.flags.healModTurns, 1);
    }
    // Mark has no duration (it lasts until damaged), so no turn count
    if (u.flags && u.flags.marked > 0) push('marked', null, 1);
    if (u.pending && u.pending.length) push('marked', null, u.pending.length);
    (u.costMods || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      push(up ? 'costup' : 'costdown', m.turns, 1);
    });
    return out;
  };
})();
