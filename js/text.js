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
    ['Exposed', 'exposed'],
    ['Burning', 'burn'],
    ['Burn', 'burn'],
    ['Marked', 'marked'],
    ['Mark', 'marked'],
    ['Marks', 'marked'],
    ['Shielded', 'shield'],
    ['Shield', 'shield'],
    ['Provokes', 'taunt'],
    ['Provoking', 'taunt'],
    /* The bare verb was missing, so "and Provoke for 1 round" rendered
       uncoloured on 7 cards (King Arthur, Hercules x2, Hansel & Gretel,
       Guan Yu, Sun Wukong, Horus) while "Provokes" beside it was gold.
       Longest-first sorting keeps Provokes/Provoking winning over it. */
    ['Provoke', 'taunt'],
    ['taunt', 'taunt'],
    ['Untargetable', 'untargetable'],
    ['Silenced', 'silence'],
    ['Silence', 'silence'],
  ];
  var STAT_WORDS = [
    ['Crit Chance', 'crit'],
    ['Crit', 'crit'],
    ['Max HP', 'hp'],
    ['HP', 'hp'],
    ['ATK', 'atk'],
    ['DEF', 'def'],
    ['Energy', 'energy'],
  ];

  function esc(w) {
    return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Build one alternation of every keyword, longest first so that e.g.
     "Marks" wins over "Mark" and "Max HP" over "HP". */
  var ALL = []
    .concat(
      ELEMENTS.map(function (w) {
        return [w, 'el-' + w.toLowerCase()];
      })
    )
    .concat(
      STATUS_WORDS.map(function (p) {
        return [p[0], 'st-' + p[1]];
      })
    )
    .concat(
      STAT_WORDS.map(function (p) {
        return [p[0], 'sv-' + p[1]];
      })
    );
  ALL.sort(function (a, b) {
    return b[0].length - a[0].length;
  });

  var CLASS_OF = {};
  ALL.forEach(function (p) {
    CLASS_OF[p[0].toLowerCase()] = p[1];
  });

  var KEY_RE = new RegExp(
    '\\b(' +
      ALL.map(function (p) {
        return esc(p[0]);
      }).join('|') +
      ')\\b',
    'g'
  );

  /* Wrap every known keyword in ability text with a coloured span.
     Runs on already-built HTML, so it must not touch text inside tags. */
  window.EOL.colorElements = function (html) {
    if (!html) return html;
    var out = '';
    var i = 0;
    while (i < html.length) {
      var lt = html.indexOf('<', i);
      if (lt === -1) {
        out += html.slice(i).replace(KEY_RE, tag);
        break;
      }
      out += html.slice(i, lt).replace(KEY_RE, tag);
      var gt = html.indexOf('>', lt);
      if (gt === -1) {
        out += html.slice(lt);
        break;
      }
      out += html.slice(lt, gt + 1); // leave the tag itself alone
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
     Status registry - every buff / debuff the engine can apply
     gets its own icon, colour and label.
     ----------------------------------------------------------- */
  /* Every status carries a short `desc`: the RULE, in as few words as
     it takes. No filler, no restating the label, no explaining what DEF
     is. Only the parts a player cannot infer - that Provoke is a tax
     rather than a wall, that Burn ignores DEF and Shields, that Exposed
     zeroes DEF rather than trimming it. */
  /* Glyph law (2026-08-05): every status wears a UNIQUE, semantic icon -
     no two chips alike, and none borrows the brand's crossed swords.
     Cost rides the battery family (Energy), a Mark is a target, Counter
     is a boomerang (it comes back), Untargetable is a cloak. */
  window.EOL.STATUS = {
    // --- stat buffs ---
    'atk+': {
      icon: 'ra-muscle-up',
      kind: 'buff',
      label: 'ATK Up',
      color: '#ffb347',
      desc: 'Increases damage dealt by physical and elemental attacks.',
    },
    'def+': {
      icon: 'ra-heavy-shield',
      kind: 'buff',
      label: 'DEF Up',
      color: '#8fd0ff',
      desc: 'Reduces incoming damage by a percentage.',
    },
    'crit+': {
      icon: 'ra-on-target',
      kind: 'buff',
      label: 'Crit Up',
      color: '#ffd050',
      desc: 'Increases critical strike chance (crits deal 1.5x damage).',
    },
    // --- stat debuffs ---
    'atk-': {
      icon: 'ra-broken-bone',
      kind: 'debuff',
      label: 'ATK Down',
      color: '#ff9d9d',
      desc: 'Reduces damage dealt by physical and elemental attacks.',
    },
    'def-': {
      icon: 'ra-cracked-shield',
      kind: 'debuff',
      label: 'DEF Down',
      color: '#ff9d9d',
      desc: 'Increases incoming damage received.',
    },
    'crit-': {
      icon: 'ra-target-arrows',
      kind: 'debuff',
      label: 'Crit Down',
      color: '#ff9d9d',
      desc: 'Reduces critical strike chance.',
    },
    // --- flags / special states ---
    taunt: {
      icon: 'ra-aware',
      kind: 'buff',
      label: 'Provoking',
      color: '#ffd98a',
      desc: 'Enemy single-target attacks must hit this legend. Multi-target attacks and taunt-piercing strikes that bypass this legend deal 30% reduced damage.',
    },
    untargetable: {
      icon: 'ra-cloak-and-dagger',
      kind: 'buff',
      label: 'Untargetable',
      color: '#a9e9ff',
      desc: 'Enemies cannot target this legend at all. No exceptions.',
    },
    shield: {
      icon: 'ra-round-shield',
      kind: 'buff',
      label: 'Shielded',
      color: '#9fd8ff',
      desc: 'Absorbs incoming damage before HP is reduced. Burn ignores shields.',
    },
    silence: {
      icon: 'ra-speech-bubble',
      kind: 'debuff',
      label: 'Silenced',
      color: '#e0a3ff',
      desc: 'Cannot take any actions. Skills and Basic attacks are both blocked.',
    },
    marked: {
      icon: 'ra-targeted',
      kind: 'debuff',
      label: 'Marked',
      color: '#ffe066',
      desc: 'The next damaging Skill consumes the Mark and triggers on-hit Mark bonuses. Basic attacks do not consume Marks.',
    },
    burn: {
      icon: 'ra-burning-embers',
      kind: 'debuff',
      label: 'Burning',
      color: '#ff7a3c',
      desc: "Takes 5% Max HP true damage whenever this unit's side begins a turn. Ignores DEF and Shields.",
    },
    exposed: {
      icon: 'ra-broken-shield',
      kind: 'debuff',
      label: 'Exposed',
      color: '#ff5f7e',
      desc: 'DEF is reduced to 0%.',
    },
    resist: {
      icon: 'ra-bolt-shield',
      kind: 'buff',
      label: 'Warded',
      color: '#b6f5ff',
      desc: 'Flat damage reduction percentage. Effective even while Exposed.',
    },
    counterstrike: {
      icon: 'ra-boomerang',
      kind: 'buff',
      label: 'Counter Ready',
      color: '#ffd977',
      desc: 'Strikes back against the attacker when struck while Shielded.',
    },
    healdown: {
      icon: 'ra-broken-heart',
      kind: 'debuff',
      label: 'Healing Reduced',
      color: '#ff9d9d',
      desc: 'Reduces healing received. Shields are unaffected.',
    },
    costup: {
      icon: 'ra-battery-25',
      kind: 'debuff',
      label: 'Skill Cost Up',
      color: '#ff9d9d',
      desc: 'Increases Energy cost of abilities for this team.',
    },
    costdown: {
      icon: 'ra-battery-100',
      kind: 'buff',
      label: 'Skill Cost Down',
      color: '#8fe3b0',
      desc: 'Decreases Energy cost of abilities for this team.',
    },
  };

  /* Collapse a unit's live state into a de-duplicated icon list.
     Same status stacked twice shows once with a count.

     HONEST MERGING (the Lancelot bug, 2026-08-09): stat buffs with
     different timers share one chip, and the chip used to keep only
     the FIRST buff's timer. A permanent +10% ATK plus an ally's
     2-round +25% read as one \"+35% ATK, 99 rounds\" - the temporary
     part looked permanent (or, applied in the other order, the
     permanent part looked temporary). The chip now carries:
       turns  - the LONGEST remaining timer (when the chip vanishes)
       parts  - every contributing buff's own {amt, turns}, so the
                popup can itemize instead of lying. */
  window.EOL.statusesOf = function (u, E) {
    var out = [];
    function push(key, turns, count, amt) {
      var def = window.EOL.STATUS[key];
      if (!def) return;
      var hit = out.filter(function (o) {
        return o.key === key;
      })[0];
      if (hit) {
        hit.count += count || 1;
        /* the chip lives until its LONGEST member expires */
        if (typeof turns === 'number' && typeof hit.turns === 'number') {
          hit.turns = Math.max(hit.turns, turns);
        }
        if (amt !== undefined && hit.parts) hit.parts.push({ amt: amt, turns: turns });
        return;
      }
      out.push({
        key: key,
        icon: def.icon,
        kind: def.kind,
        label: def.label,
        turns: turns,
        count: count || 1,
        parts: amt !== undefined ? [{ amt: amt, turns: turns }] : null,
      });
    }

    (u.buffs || []).forEach(function (b) {
      if (!b.stat) return;
      push(b.stat + (b.amt >= 0 ? '+' : '-'), b.turns, 1, b.amt);
    });
    if (u.shield > 0) push('shield', null, 1);
    if (u.flags) {
      if (u.flags.taunt > 0) push('taunt', u.flags.taunt, 1);
      if (u.flags.untargetable > 0) push('untargetable', u.flags.untargetable, 1);
      if (u.flags.silence > 0) push('silence', u.flags.silence, 1);
      if (u.flags.burn > 0) push('burn', u.flags.burn, 1);
      if (u.flags.exposed > 0) push('exposed', u.flags.exposed, 1);
      /* the Warded chip was defined but never emitted - a timed damage
         resist used to be completely invisible to the player */
      if (u.flags.resistPct > 0) push('resist', u.flags.resistPctTurns, 1);
      /* an armed counter-strike (Guan Yu / Little John) shows as ready */
      if (u.flags.counterTurns > 0) push('counterstrike', u.flags.counterTurns, 1);
      /* only a heal REDUCTION wears the debuff chip */
      if (u.flags.healMod < 0) push('healdown', u.flags.healModTurns, 1);
    }
    // Mark has no duration (it lasts until damaged), so no turn count
    if (u.flags && u.flags.marked > 0) push('marked', null, 1);
    (u.costMods || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      push(up ? 'costup' : 'costdown', m.turns, 1);
    });
    return out;
  };
})();
