/* =============================================================
   Shared text helpers
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var ELEMENTS = ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire', 'Nature'];

  /* Wrap every element name in ability text with a coloured span.
     Runs on already-built HTML, so it must not touch text inside tags. */
  window.EOL.colorElements = function (html) {
    if (!html) return html;
    // "Lightning" contains "Light", so match longest-first
    var re = /\b(Lightning|Physical|Magic|Shadow|Light|Fire|Nature)\b/g;
    var out = '';
    var i = 0;
    while (i < html.length) {
      var lt = html.indexOf('<', i);
      if (lt === -1) { out += html.slice(i).replace(re, tag); break; }
      out += html.slice(i, lt).replace(re, tag);
      var gt = html.indexOf('>', lt);
      if (gt === -1) { out += html.slice(lt); break; }
      out += html.slice(lt, gt + 1);   // leave the tag itself alone
      i = gt + 1;
    }
    return out;

    function tag(m) {
      return '<span class="el-' + m.toLowerCase() + '">' + m + '</span>';
    }
  };

  window.EOL.ELEMENTS = ELEMENTS;

  /* -----------------------------------------------------------
     Status registry — every buff / debuff the engine can apply
     gets its own icon, colour and label.
     ----------------------------------------------------------- */
  window.EOL.STATUS = {
    // --- stat buffs ---
    'atk+':   { icon: 'ra-muscle-up',      kind: 'buff',   label: 'ATK Up' },
    'def+':   { icon: 'ra-heavy-shield',   kind: 'buff',   label: 'DEF Up' },
    'crit+':  { icon: 'ra-target-arrows',  kind: 'buff',   label: 'Crit Up' },
    // --- stat debuffs ---
    'atk-':   { icon: 'ra-broken-bone',    kind: 'debuff', label: 'ATK Down' },
    'def-':   { icon: 'ra-cracked-shield', kind: 'debuff', label: 'DEF Down' },
    'crit-':  { icon: 'ra-target-arrows',  kind: 'debuff', label: 'Crit Down' },
    // --- flags / special states ---
    taunt:        { icon: 'ra-shield',          kind: 'buff',   label: 'Taunting' },
    untargetable: { icon: 'ra-aura',            kind: 'buff',   label: 'Untargetable' },
    shield:       { icon: 'ra-round-shield',    kind: 'buff',   label: 'Shielded' },
    silence:      { icon: 'ra-uncertainty',     kind: 'debuff', label: 'Silenced' },
    marked:       { icon: 'ra-lightning-storm', kind: 'debuff', label: 'Marked' },
    healdown:     { icon: 'ra-broken-heart',    kind: 'debuff', label: 'Healing Reduced' },
    costup:       { icon: 'ra-hourglass',       kind: 'debuff', label: 'Ability Cost Up' },
    costdown:     { icon: 'ra-hourglass',       kind: 'buff',   label: 'Ability Cost Down' }
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
      if (u.flags.healMod) push('healdown', u.flags.healModTurns, 1);
    }
    if (u.pending && u.pending.length) push('marked', null, u.pending.length);
    (u.costMods || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      push(up ? 'costup' : 'costdown', m.turns, 1);
    });
    return out;
  };
})();
