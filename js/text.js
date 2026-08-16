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

  /* =============================================================
     SKILL TEXT THAT KNOWS ITS UPGRADES
     -------------------------------------------------------------
     A levelled card hits harder, but its printed Signature Skill
     still read "Deal 130% ATK" - so the collection told the player
     the upgrade did nothing to the thing the upgrade is FOR.

     scaleSkillText() rewrites the numbers that actually move, and
     ONLY those. The bonus is FLAT: +2 percentage points per level,
     so 50% becomes 52% at level 1 and 56% at max. That mirrors
     upAdd()/upPts() in js/engine.js exactly.

     What moves is every MAGNITUDE the signature owns - damage
     coefficients, heal and shield percentages, the stat swings a
     signature applies, and lifesteal shares. What never moves:
     thresholds ("below 25% HP"), durations ("for 2 rounds"), Energy
     costs and refunds, and counts ("2 enemies"). A cliff is not a
     curve, and moving one silently rewrites a combo.

     HOW IT AVOIDS LYING

       The values come from the SPEC, not from parsing prose, so the
       list is exactly the set the engine will scale. Each is then
       matched in the text as a whole percent token carrying the
       right unit (ATK / Max HP), because three cards in the roster
       print the same number twice with different units - Momotaro's
       "12% DEF" and "12% Max HP", Hua Tuo's two 10%s, Constantine's
       "10% ATK" and "10% Max HP". Matching on unit keeps the buff
       untouched while the shield grows.

       If a value still matches more than one place with its unit,
       the rewrite for that value is SKIPPED rather than guessed -
       an unscaled number is a small inaccuracy, a wrongly scaled
       one is a lie about the rules.

     Returns the text unchanged at level 0, so an un-upgraded card
     costs nothing but a function call.
     ============================================================= */
  function collectScalable(effects, out) {
    (effects || []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      if (e.k === 'dmg') {
        ['power', 'perDebuff', 'perBuff'].forEach(function (k) {
          if (e[k] != null) out.yes.push({ v: e[k] * 100, unit: 'atk' });
        });
      } else if (e.k === 'heal') {
        if (e.pctMaxHp != null) out.yes.push({ v: e.pctMaxHp, unit: 'hp' });
        if (e.power != null) out.yes.push({ v: e.power * 100, unit: 'atk' });
      } else if (e.k === 'shield') {
        if (e.pctMaxHp != null) out.yes.push({ v: e.pctMaxHp, unit: 'hp' });
      } else if (e.k === 'stat') {
        /* A signature's own stat swing DOES grow now (engine.js
           upToward), so it is rewritten too - as a magnitude, since
           the text prints "-30% ATK" as "by 30%". */
        if (e.amt != null) out.yes.push({ v: Math.abs(e.amt), unit: STAT_UNIT[e.stat] || null });
      } else if (e.k === 'lifesteal') {
        if (e.pct != null) out.yes.push({ v: e.pct, unit: null });
      } else if (e.k === 'taunt') {
        /* Hercules's shield-on-end, Hansel & Gretel's heal-on-hit. */
        if (e.shieldOnEnd != null) out.yes.push({ v: e.shieldOnEnd, unit: 'hp' });
        if (e.healOnHit != null) out.yes.push({ v: e.healOnHit, unit: 'hp' });
      } else if (e.k === 'revive') {
        if (e.pctMaxHp != null) out.yes.push({ v: e.pctMaxHp, unit: 'hp' });
        if (e.shieldPctMaxHp != null) out.yes.push({ v: e.shieldPctMaxHp, unit: 'hp' });
      } else if (e.k === 'counterStrike') {
        if (e.power != null) out.yes.push({ v: e.power * 100, unit: 'atk' });
        if (e.markedPower != null) out.yes.push({ v: e.markedPower * 100, unit: 'atk' });
      } else if (e.k === 'damageMult' || e.k === 'damageResist' || e.k === 'outgoingMult') {
        /* THE MULTIPLIER PASSIVES. Stored as a factor (0.85, 1.12) but
           PRINTED as the percentage it moves by - "15% less damage",
           "12% increased damage". engine.js scales these by the same
           flat points as everything else, so the text has to follow or
           Athena, Benkei, Robin Hood and Lu Bu read as unupgradeable.

           The printed number is the DISTANCE from 1, which is what
           moves: 0.85 -> 0.79 is "15% less" -> "21% less".
           `mult` may be absent - a castable damageResist uses `pct`
           instead, and that is handled just below. */
        if (e.mult != null) {
          out.yes.push({ v: Math.round(Math.abs(1 - e.mult) * 1000) / 10, unit: null });
        }
        if (e.pct != null) out.yes.push({ v: Math.abs(e.pct), unit: null });
      } else if (e.k === 'healMod') {
        /* Rumpelstiltskin's -60% healing, Sekhmet's -30%. */
        if (e.pct != null) out.yes.push({ v: Math.abs(e.pct), unit: null });
      } else if (e.k === 'copyAllyActive') {
        /* Kaguya: her whole signature IS the copy, so its
           effectiveness is the number her level raises. */
        if (e.scale != null) out.yes.push({ v: e.scale * 100, unit: null });
      }
      /* Cinderella's per-cleanse slice rides on a heal. */
      if (e.k === 'heal' && e.perCleansed != null) {
        out.yes.push({ v: e.perCleansed, unit: 'hp' });
      }
      ['then', 'other', 'effects'].forEach(function (k) {
        if (Array.isArray(e[k])) collectScalable(e[k], out);
      });
      /* Branches and coin flips hide half a card's numbers. */
      ['heads', 'tails'].forEach(function (k) {
        if (e[k] && Array.isArray(e[k].effects)) collectScalable(e[k].effects, out);
      });
      if (Array.isArray(e.choose)) {
        e.choose.forEach(function (o) {
          collectScalable(o.effects, out);
        });
      }
    });
    return out;
  }

  var STAT_UNIT = { atk: 'atk', hp: 'hp', def: 'def', crit: 'crit' };

  /* Percent tokens are matched with their unit. The unit may sit
     behind an element word and/or markup ("55% <b>Magic</b> Damage",
     "12% Max HP"), so the gap allows tags and a couple of words but
     never a sentence. */
  var UNIT_RE = {
    atk: 'ATK',
    hp: 'Max\\s+HP',
    def: 'DEF',
    crit: 'Crit(?:\\s+Chance)?',
  };

  /* `pts` is the flat bonus in percentage points (2 per level). */
  window.EOL.scaleSkillText = function (html, card, pts) {
    if (!html || !card || !pts) return html;
    var spec = (card.ability && card.ability.spec) || {};
    var found = collectScalable(spec.effects, { yes: [], no: [] });
    /* A `choose` spec keeps its effects one level up, on the SPEC
       rather than inside an effect - Qin Shi Huang's two wall
       options live here, and nowhere else. */
    if (Array.isArray(spec.choose)) {
      spec.choose.forEach(function (o) {
        collectScalable(o.effects, found);
      });
    }
    if (card.ability && card.ability.passive) {
      collectScalable(card.ability.passive.effects, found);
    }
    var list = found.yes;
    if (!list.length) return html;
    /* A number the card uses BOTH ways with the same unit cannot be
       told apart in prose, so it is skipped entirely. (No card in the
       current roster does this - the guard is here so one added later
       fails safe instead of silently mis-stating its own rules.) */
    var conflicted = {};
    found.no.forEach(function (o) {
      conflicted[Math.round(o.v * 1000) / 1000 + '|' + o.unit] = 1;
    });

    /* De-duplicate: the same number+unit only needs rewriting once,
       and a value the spec uses twice is still one token in prose. */
    var seen = {};
    var out = html;
    list.forEach(function (item) {
      var v = Math.round(item.v * 1000) / 1000;
      var key = v + '|' + item.unit;
      if (seen[key]) return;
      seen[key] = 1;
      /* Whole numbers only: every scalable value in the roster is one,
         and a fractional source would need a different rounding rule
         than the engine's. */
      if (Math.abs(v - Math.round(v)) > 1e-9) return;
      /* A value with no unit (a bare lifesteal share) is matched on
         its own; anything else must carry its unit, because three
         cards print the same number twice with different ones. */
      /* The unit can sit on either side of the number: "60% ATK
         Damage" but also "reduce their ATK by 30%". Both forms are
         tried, and the total across the two must still be
         unambiguous. */
      var n = Math.round(v);
      var after = item.unit
        ? new RegExp(
            '(^|[^\\d.])(' + n + ')%(\\s*(?:<[^>]+>|\\w+\\s)*?\\s*' + UNIT_RE[item.unit] + ')',
            'g'
          )
        : new RegExp('(^|[^\\d.])(' + n + ')%()', 'g');
      var before = item.unit
        ? new RegExp(
            '(' + UNIT_RE[item.unit] + '(?:<[^>]+>|[^<>\\d]){0,14}?)(' + n + ')%()',
            'g'
          )
        : null;
      var re = after;
      if (item.unit) {
        var nAfter = (out.match(after) || []).length;
        var nBefore = (out.match(before) || []).length;
        /* Exactly one of the two forms must match, or the value is
           printed in a way this cannot resolve safely. */
        if (nAfter && nBefore) return;
        if (!nAfter && nBefore) re = before;
      }
      if (conflicted[key]) return;
      var hits = out.match(re);
      if (!hits) return;
      /* Every remaining hit of this number WITH THIS UNIT is a
         scalable effect - branches (Hua Tuo's then/other) print one
         prose token for two spec entries, and the same-unit tokens a
         card prints twice (his 10% shield and 10% heal) both scale.
         Anything the engine leaves alone either carries a different
         unit or was caught by the conflict guard above. */
      var scaled = Math.round((v + pts) * 10) / 10;
      out = out.replace(re, function (m, pre, num, tail) {
        return (
          pre + '<span class="sk-up" title="' + num + '% before upgrades">' + scaled + '</span>%' + tail
        );
      });
    });
    return out;
  };


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
    /* A SEALED FATE THAT HAS NOT LANDED YET.
       Abe no Seimei's shikigami is the roster's only `delayed` effect:
       it sits on the target and strikes at the end of the round. It
       was completely invisible - no chip, no clock - so from the
       receiving side a legend simply took a second, unexplained hit
       after the turn was over, and there was nothing to play around.
       Being telegraphed is the whole point of the card (see the
       rework note in data/yamato.js), and it could not telegraph
       anything without a marker. */
    shikigami: {
      /* ra-quill-ink: a shikigami is an inked paper charm, and this is
         the one glyph in the font that reads as writing-as-magic.
         Checked against the real RPG-Awesome 0.2.0 stylesheet - the
         obvious 'ra-paper-lantern' does NOT exist in the font and
         would have rendered an empty box. It is also unused elsewhere
         in the game, which the glyph law above requires. */
      icon: 'ra-quill-ink',
      kind: 'debuff',
      label: 'Shikigami Sealed',
      color: '#c7a3ff',
      desc: 'A paper servant strikes this legend at the end of the round. Killing the caster first stops it.',
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
        if (amt !== undefined && hit.parts) {
          /* Equal effects on the same clock are one real stack in the
             hover breakdown. Lancelot's three permanent +10% ATK gains
             should read +30% for the battle, not three separate +10%
             lines. Different clocks stay separate so temporary help is
             never presented as permanent. */
          var part = hit.parts.filter(function (p) {
            return p.turns === turns;
          })[0];
          if (part) {
            part.amt += amt;
            part.count += count || 1;
          } else hit.parts.push({ amt: amt, turns: turns, count: count || 1 });
        }
        return;
      }
      out.push({
        key: key,
        icon: def.icon,
        kind: def.kind,
        label: def.label,
        turns: turns,
        count: count || 1,
        parts: amt !== undefined ? [{ amt: amt, turns: turns, count: count || 1 }] : null,
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
    /* Delayed effects waiting on this unit. Each carries its own tag,
       so a future delayed card gets its own chip by registering one
       above rather than by touching this loop. The clock is the real
       `turns` left on the prophecy, which is what makes it playable
       around: kill Abe no Seimei before it ticks and it never lands. */
    (u.pending || []).forEach(function (p) {
      if (p && p.tag && window.EOL.STATUS[p.tag]) push(p.tag, p.turns, 1);
    });
    (u.costMods || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      push(up ? 'costup' : 'costdown', m.turns, 1);
    });
    return out;
  };
})();
