/* =============================================================
   Echoes of Legend - Battle UI
   Renders the board, handles selection/targeting, drives the bot.
   ============================================================= */
(function () {
  'use strict';

  var E,
    AI,
    B = null;
  var sel = null; // { unit, ability, needed, chosen[] }
  var busy = false; // blocks input while the bot acts

  /* ---------------------------------------------------------
     WHO IS THE OPPONENT
     -------------------------------------------------------------
     The 'enemy' side is normally driven by the local bot. In a
     multiplayer match it is driven by a real person on another
     machine instead. `netCtl` is that person's adaptor (see
     js/netplay.js); when it is null everything below behaves exactly
     as it always has.

       decide()   -> Promise of an action, or null for a pass. Resolves
                     when the remote player's move arrives.
       onLocal(a) -> called after every action WE resolve, so the
                     adaptor can put it on the wire.
       label      -> what to call them in the banners.

     Keeping this to one object means the turn loop is shared: a
     multiplayer battle is the same battle, with a different source of
     enemy decisions. No second engine, no second loop. */
  var netCtl = null;
  /* endBattle can be reached by the normal turn loop and an asynchronous
     remote-forfeit notification in the same tick. Keep the result path
     exactly-once. */
  var endingBattle = false;
  /* CAMPAIGN rival identity for this battle ({name, img} or null).
     Set fresh on every start(); paints the enemy commander plate and
     anchors the in-battle rival dialogue (js/campaign.js). */
  var rivalInfo = null;
  /* Coarse, privacy-safe match context for the playtest funnel and the
     optional diagnostics attached to feedback. Never contains card ids,
     actions, callsigns or the deterministic seed. */
  var measurementContext = null;
  var measurementComplete = false;

  /* =============================================================
     THE SCRIPTED MATCH (campaign gate I)
     -------------------------------------------------------------
     Gate I plays a PRE-COMPUTED line: every move on both sides is
     authored data (data/campaign-ch1.js, generated against the real
     engine under the same seeded rng - see sim/gen_gate1_line.js).
     The player performs their side of the line by hand; the UI
     simply refuses everything else, the same way the prep script
     does. The rng is seeded and the AI never rolls (bestAction
     draws from B.rng, and ponder is parked), so the board replays
     the generated line exactly.

     A move: { side:'player'|'enemy', unit:cardId, ability:
     'sig'|'basic', targets:[{side,id}], say? } or { side, pass:
     true, say? }. If reality ever disagrees with the script (it
     cannot, unless a future balance patch moves a number), the
     script ABORTS gracefully and the fight continues as a normal
     battle - a stuck tutorial is worse than an unscripted one.
     ============================================================= */
  var moveScript = null; // { moves: [...], i: 0 }

  /* Campaign teaching is a Normal-only layer. Keep the difficulty law in
     campaign.js, but defend every battle-side entry point as well so a
     stale/retried config can never paint marks or replay instructions on
     Heroic or Legend. */
  function campaignTutorialsEnabled(source) {
    if (!source || !source.campaignStage) return true;
    if (window.EOL.campaign && window.EOL.campaign.tutorialsEnabled) {
      return window.EOL.campaign.tutorialsEnabled(source);
    }
    return !source.campaignDifficulty || source.campaignDifficulty === 'normal';
  }

  function scriptActive() {
    return !!(moveScript && B && !B.over && moveScript.i < moveScript.moves.length);
  }
  function scriptMove() {
    return scriptActive() ? moveScript.moves[moveScript.i] : null;
  }
  function scriptUnit(side, cardId) {
    return (
      B.units.filter(function (u) {
        return u.side === side && u.card.id === cardId && u.alive;
      })[0] || null
    );
  }
  function scriptAbilityOf(mv, u) {
    return mv.ability === 'sig' ? u.card.ability : E.roleAbility(u);
  }
  /* An off-script click re-speaks the INSTRUCTION instead of a toast
     chip (playtest 2026-08-10: the chip at the bottom went unread -
     the dialogue is where the player's eyes already live). Falls back
     to the toast outside the campaign. */
  function scriptDeny(fallback) {
    var mv = scriptMove();
    if (mv && B && B.campaignStage && window.EOL.campaign && window.EOL.campaign.onScriptDeny) {
      try {
        window.EOL.campaign.onScriptDeny(B, mv);
        return;
      } catch (e) {
        /* lore never breaks a fight */
      }
    }
    toast(fallback);
  }
  function scriptEnd(reason) {
    if (!moveScript) return;
    moveScript = null;
    if (window.EOL.campaign && window.EOL.campaign.onScriptEnd) {
      try {
        window.EOL.campaign.onScriptEnd(B, reason);
      } catch (e) {
        /* lore never breaks a fight */
      }
    }
    paintScriptMarks();
  }
  function scriptAdvance() {
    if (!moveScript) return;
    moveScript.i++;
    if (moveScript.i >= moveScript.moves.length) {
      scriptEnd('done');
      return;
    }
    scriptNotify();
  }
  function scriptNotify() {
    var mv = scriptMove();
    if (!mv) return;
    if (window.EOL.campaign && window.EOL.campaign.onScriptMove) {
      try {
        window.EOL.campaign.onScriptMove(B, mv);
      } catch (e) {
        /* narration is optional */
      }
    }
    requestAnimationFrame(paintScriptMarks);
  }
  /* The golden pulse rides the current player instruction: the unit to
     act, then the remaining targets, or the Pass button. Re-applied on
     every paintSelection (which every render runs). */
  function paintScriptMarks() {
    document.querySelectorAll('.bcard.tutor-pick').forEach(function (el) {
      el.classList.remove('tutor-pick');
    });
    var et = $('btn-endturn');
    if (et) et.classList.remove('tutor-pick');
    var mv = scriptMove();
    if (
      !mv ||
      mv.side !== 'player' ||
      !B ||
      B.turn !== 'player' ||
      !campaignTutorialsEnabled(B)
    )
      return;
    var markUid = function (uid) {
      var el = document.querySelector('.bcard[data-uid="' + uid + '"]');
      if (el) el.classList.add('tutor-pick');
    };
    if (mv.pass) {
      if (et) et.classList.add('tutor-pick');
      return;
    }
    if (sel && sel.ability) {
      (mv.targets || []).forEach(function (t) {
        var tu = scriptUnit(t.side, t.id);
        if (
          tu &&
          !sel.chosen.some(function (c) {
            return c.uid === tu.uid;
          })
        )
          markUid(tu.uid);
      });
      return;
    }
    var u = scriptUnit('player', mv.unit);
    if (u) markUid(u.uid);
  }
  /* The scripted enemy turn: build the act straight from the line.
     Returns {act} on success, {pass:true} for a scripted pass, or
     null when the line no longer matches the board (abort). */
  function scriptEnemyAct(mv) {
    if (mv.pass) {
      scriptAdvance();
      return { pass: true };
    }
    var u = scriptUnit('enemy', mv.unit);
    if (!u) return null;
    var ab = scriptAbilityOf(mv, u);
    if (!ab || !E.canUse(B, u, ab)) return null;
    var pool = E.legalTargets(B, u, ab);
    var chosen = [];
    var okay = (mv.targets || []).every(function (t) {
      var tu = scriptUnit(t.side, t.id);
      if (!tu) return false;
      var legal = pool.some(function (x) {
        return x.uid === tu.uid;
      });
      if (!legal) return false;
      chosen.push(tu);
      return true;
    });
    if (!okay || chosen.length !== E.pickCount(ab)) return null;
    scriptAdvance();
    return { act: { unit: u, ability: ab, chosen: chosen, targets: chosen, choose: 0 } };
  }
  var playerDone = false; // has the player taken their turn this round?
  var enemyDone = false; // has the bot taken its turn this round?
  var ROLE_ICON = {
    Tank: 'ra-shield',
    Bruiser: 'ra-battered-axe',
    Caster: 'ra-fairy-wand',
    Controller: 'ra-gears',
    Medic: 'ra-health',
    Sniper: 'ra-archery-target',
  };
  /* Element glyph law (2026-08-05): unique, semantic, and never the
     brand's crossed swords - those belong to the game's emblem. Magic
     casts (wand), Light radiates (beams), Physical strikes (axe). */
  var ELEMENT_ICON = {
    Physical: 'ra-axe',
    Magic: 'ra-crystal-wand',
    Shadow: 'ra-moon-sun',
    Light: 'ra-sunbeams',
    Lightning: 'ra-lightning-bolt',
    Fire: 'ra-fire',
    Nature: 'ra-leaf',
  };
  var ELEMENT_COLOR = {
    Physical: 'var(--e-physical)',
    Magic: 'var(--e-magic)',
    Shadow: 'var(--e-shadow)',
    Light: 'var(--e-light)',
    Lightning: 'var(--e-lightning)',
    Fire: 'var(--e-fire)',
    Nature: 'var(--e-nature)',
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function $(id) {
    return document.getElementById(id);
  }
  function rich(t) {
    return window.EOL.colorElements(String(t));
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  /* GUI-scale bridge: the scale feature is root-element zoom behaving
     exactly like the browser's own Ctrl +/- (js/app.js). Under zoom,
     getBoundingClientRect reports ZOOMED px (= factor x layout px)
     while style assignments and offset* stay in LAYOUT px. Divide
     rect-derived numbers by uiS() whenever one is turned into the
     other, or every dock/float/FX drifts off-target the moment the
     app is scaled away from 100%. */
  function uiS() {
    return window.EOL && window.EOL.scale && window.EOL.scale.factor
      ? window.EOL.scale.factor()
      : 1;
  }

  /* ---------------------------------------------------------
     team building
     -------------------------------------------------------------
     With a player deck (6 card ids from the deck builder): the player
     fields exactly those heroes, and the enemy draws 6 distinct random
     heroes from the remaining pool. Without a deck, both sides are
     random - 12 distinct heroes split 6v6, as before. */
  var playerDeck = null; // card ids of the last deck used (for rematch)

  function flatten() {
    var all = [];
    window.EOL.factions.forEach(function (f) {
      f.cards.forEach(function (c) {
        all.push({ card: c, faction: f });
      });
    });
    return all;
  }

  function buildTeams(deckIds) {
    var all = flatten();
    var byId = {};
    all.forEach(function (e) {
      byId[e.card.id] = e;
    });
    var deckEntries =
      deckIds && deckIds.length === 6
        ? deckIds.map(function (id) {
            return byId[id];
          })
        : null;
    var legal =
      deckEntries &&
      deckEntries.every(Boolean) &&
      new Set(deckIds).size === 6 &&
      window.EOL.rules.withinRoleCap(deckEntries); // hard deck rule: <=3 per role

    if (!legal) {
      var rnd = window.EOL.rules.splitCapped(all, Math.random);
      /* player keeps the pure-random draw; the bot drafts around three
         of its randoms, same as the deck path */
      var seeds = rnd[1].slice(0, 3);
      var rest2 = all.filter(function (e) {
        return rnd[0].indexOf(e) < 0 && seeds.indexOf(e) < 0;
      });
      return { player: rnd[0], enemy: draftBotTeam(seeds, rest2), explicit: false };
    }

    var inDeck = {};
    deckIds.forEach(function (id) {
      inDeck[id] = true;
    });
    var rest = all
      .filter(function (e) {
        return !inDeck[e.card.id];
      })
      .sort(function () {
        return Math.random() - 0.5;
      });
    /* The bot drafts, too - its team is half luck, half judgement:
       three capped randoms from the leftover pool, then three picks
       drafted around them. */
    var enemyRnd = [];
    var counts = {};
    for (var i = 0; i < rest.length && enemyRnd.length < 3; i++) {
      var r = rest[i].card.role;
      if ((counts[r] || 0) >= window.EOL.rules.MAX_PER_ROLE) continue;
      counts[r] = (counts[r] || 0) + 1;
      enemyRnd.push(rest[i]);
      rest[i] = null;
    }
    var enemy = draftBotTeam(enemyRnd, rest.filter(Boolean));
    return {
      /* the deck's array order IS the player's formation: slots 0-2 are
         the front row, 3-5 the back row (deck builder guarantees this). */
      player: deckIds.map(function (id) {
        return byId[id];
      }),
      enemy: enemy,
      explicit: true,
    };
  }

  /* ---------------------------------------------------------
     Bot drafting - three picks built around the random three
     -------------------------------------------------------------
     Synergy is scored straight from the card specs: mark sources feed
     mark consumers (discovered by walking each kit, so cards added
     later join the web automatically), then role coverage (a Tank, a
     Medic, damage dealers) and a light faction-flavour clump. A small
     roll keeps identical pools from always ending on identical boards.
     --------------------------------------------------------- */
  var MARK_SETS = null;

  function markSets() {
    if (MARK_SETS) return MARK_SETS;
    var src = {},
      con = {};
    function see(e, id) {
      if (e.k === 'mark') src[id] = true;
      if (e.k === 'consumeMark' || e.onlyMarked || e.ifTargetMarked || e.ifAttackerMarked)
        con[id] = true;
      if (e.if && (e.if.targetMarked || e.if.ifTargetMarked)) con[id] = true;
      if (e.when && (e.when.targetMarked || e.when.ifAttackerMarked)) con[id] = true;
      if (e.cond && (e.cond.anyTargetMarked || e.cond.anyEnemyMarked)) con[id] = true;
      if (e.then) walk(e.then, id);
      if (e.other) walk(e.other, id);
    }
    function walk(effects, id) {
      (effects || []).forEach(function (e) {
        see(e, id);
      });
    }
    window.EOL.factions.forEach(function (f) {
      f.cards.forEach(function (c) {
        walk(c.ability.spec && c.ability.spec.effects, c.id);
        walk(c.ability.passive && c.ability.passive.effects, c.id);
        walk(c.ability.passive && c.ability.passive.onHit, c.id);
      });
    });
    MARK_SETS = { src: src, con: con };
    return MARK_SETS;
  }

  function draftValue(team, cand) {
    var ms = markSets();
    var s = 0;
    team.forEach(function (t) {
      /* a mark link scores once per counterpart; two-way links (think
         Athena feeding Zeus AND cashing his marks) only get a small
         extra, else double-dipping buries role coverage entirely */
      var fwd = ms.src[cand.card.id] && ms.con[t.card.id];
      var rev = ms.con[cand.card.id] && ms.src[t.card.id];
      if (fwd || rev) s += 6;
      if (fwd && rev) s += 2;
      if (cand.faction.id === t.faction.id) s += 1; // flavour clump
    });
    var counts = {};
    team.forEach(function (t) {
      counts[t.card.role] = (counts[t.card.role] || 0) + 1;
    });
    var role = cand.card.role;
    /* coverage beats synergy by a nose: the first Tank outranks any
       single synergy pull (a tankless team of combos is the classic
       bad draft), the first Medic nearly so */
    if (role === 'Tank') s += counts.Tank ? 2 : 9;
    else if (role === 'Medic') s += counts.Medic ? 2 : 6;
    else {
      var dmg = (counts.Bruiser || 0) + (counts.Sniper || 0) + (counts.Caster || 0);
      s += dmg < 2 ? 4 : 1;
    }
    return s;
  }

  /* Greedy picks with a light roll for board variety. Structure rails
     guard the tail: synergy compounds quadratically (every web member
     makes the next web member look better), so a draft that still
     lacks a Tank or a Medic when the slots run short must close them
     out - the web holds the free slots, never the skeleton. */
  function draftBotTeam(randoms, pool) {
    var team = randoms.slice();
    var rest = pool.slice();
    while (team.length < 6) {
      var counts = {};
      team.forEach(function (t) {
        counts[t.card.role] = (counts[t.card.role] || 0) + 1;
      });
      var slotsLeft = 6 - team.length;
      var needTank = !counts.Tank,
        needMedic = !counts.Medic;
      var forced = null;
      if (needTank && slotsLeft <= (needMedic ? 2 : 1)) forced = 'Tank';
      else if (needMedic && slotsLeft <= 1) forced = 'Medic';

      var best = -1,
        bestScore = -Infinity;
      for (var passForced = 0; passForced < 2 && best < 0; passForced++) {
        for (var i = 0; i < rest.length; i++) {
          var cand = rest[i];
          if ((counts[cand.card.role] || 0) >= window.EOL.rules.MAX_PER_ROLE) continue;
          if (forced && !passForced && cand.card.role !== forced) continue;
          var v = draftValue(team, cand) + Math.random() * 2.5;
          if (v > bestScore) {
            bestScore = v;
            best = i;
          }
        }
        /* forced role absent from the pool: drop the rail */
      }
      if (best < 0) break; // pool exhausted under the cap
      team.push(rest.splice(best, 1)[0]);
    }
    return team;
  }

  /* ---------------------------------------------------------
     rendering
     --------------------------------------------------------- */
  /* `deadView` renders the hero as a corpse regardless of engine state.
     A revive resolves synchronously in the engine, so without this the
     card would already show its restored HP and new buffs while the
     death/resurrection is still playing out on screen. */
  function unitCardHTML(u, deadView, settledActed) {
    var pct = deadView ? 0 : Math.max(0, (u.hp / u.maxHp) * 100);
    var shieldPct = deadView ? 0 : Math.min(100, (u.shield / u.maxHp) * 100);
    var atk = deadView ? u.baseAtk : E.atkOf(u);
    var def = deadView ? u.baseDef : E.defOf(u);
    var atkDelta = deadView ? 0 : atk - u.baseAtk;
    var defDelta = deadView ? 0 : def - u.baseDef;

    /* every buff/debuff gets its own icon, laid out in rows of 3 */
    var sts = window.EOL.statusesOf(u, E);
    // team-wide cost modifiers apply to this unit too
    (B.costMods[u.side] || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      var key = up ? 'costup' : 'costdown';
      var def = window.EOL.STATUS[key];
      var hit = sts.filter(function (o) {
        return o.key === key;
      })[0];
      if (hit) {
        hit.count += 1;
        /* same honesty rule as statusesOf: the chip shows its longest clock */
        if (typeof m.turns === 'number' && typeof hit.turns === 'number')
          hit.turns = Math.max(hit.turns, m.turns);
      } else
        sts.push({
          key: key,
          icon: def.icon,
          kind: def.kind,
          label: def.label,
          turns: m.turns,
          count: 1,
        });
    });

    if (deadView) sts = [];

    /* Each chip carries a full rules panel, not a one-word title. The
       status descriptions in js/text.js are the game's only in-app rules
       reference, so they explain the parts players get wrong - that
       Provoke only redirects single-target attacks, that Burn ignores DEF
       and Shields, that Exposed zeroes DEF rather than reducing it. */
    var chips = sts
      .map(function (st) {
        var sdef = window.EOL.STATUS[st.key] || {};
        var big = st.key === 'burn' || st.key === 'exposed' ? ' big-status' : '';
        var durT = durText(st.turns);
        var dur = durT ? '<span class="stp-dur">' + durT + '</span>' : '';
        var brk = statusBreakdown(st);
        var pop =
          '<span class="st-pop">' +
          '<span class="stp-head">' +
          '<i data-icon-domain="game" class="ra ' +
          st.icon +
          '"></i>' +
          '<b>' +
          esc(st.label) +
          '</b>' +
          (st.count > 1 ? '<span class="stp-n">x' + st.count + '</span>' : '') +
          dur +
          '</span>' +
          (brk ? '<span class="stp-brk">' + brk + '</span>' : '') +
          (statusDesc(u, st) ? '<span class="stp-body">' + statusDesc(u, st) + '</span>' : '') +
          '</span>';
        return (
          '<span class="st-chip ' +
          st.kind +
          big +
          '"' +
          (sdef.color ? ' style="--sc:' + sdef.color + '"' : '') +
          ' tabindex="0">' +
          '<i data-icon-domain="game" class="ra ' +
          st.icon +
          '"></i>' +
          (st.count > 1 ? '<b class="st-n">' + st.count + '</b>' : '') +
          pop +
          '</span>'
        );
      })
      .join('');

    var acted = deadView ? false : B.acted[u.side][u.uid];
    /* a veil that was already up before this render returns "settled" -
       no animation restart (the heal-flicker fix; see captureSlots) */

    return (
      '' +
      '<div class="bstats">' +
      '<div class="bhp">' +
      '<i data-icon-domain="game" class="ra ra-health bhp-ico"></i>' +
      '<span class="bbar">' +
      '<span class="bbar-fill" style="width:' +
      pct +
      '%"></span>' +
      (!deadView && u.shield > 0
        ? '<span class="bbar-shield" style="width:' + shieldPct + '%"></span>'
        : '') +
      '</span>' +
      /* The number shown is HP + SHIELD (what you must chew through),
         but every HP-percentage condition in the game tests RAW HP. A
         shielded hero can therefore read as "half health" while the
         engine sees them near death. The title spells out the split so
         the difference is inspectable rather than a trap. */
      '<span class="bhp-txt' +
      (!deadView && u.shield > 0 ? ' shielded' : '') +
      '"' +
      (deadView
        ? ''
        : ' title="' +
          esc(
            u.shield > 0
              ? Math.ceil(u.hp).toLocaleString() +
                ' HP + ' +
                Math.ceil(u.shield).toLocaleString() +
                ' shield (' +
                Math.round((u.hp / u.maxHp) * 100) +
                '% HP - shields do not count toward HP conditions)'
              : Math.ceil(u.hp).toLocaleString() +
                ' / ' +
                Math.ceil(u.maxHp).toLocaleString() +
                ' HP (' +
                Math.round((u.hp / u.maxHp) * 100) +
                '%)'
          ) +
          '"') +
      '>' +
      (deadView ? '0' : Math.ceil(u.hp + u.shield).toLocaleString()) +
      '</span>' +
      '</div>' +
      '<div class="bnums">' +
      '<span class="bnum' +
      (atkDelta > 0 ? ' up' : atkDelta < 0 ? ' down' : '') +
      '">' +
      '<i data-icon-domain="game" class="ra ra-sword"></i>' +
      atk +
      '</span>' +
      '<span class="bnum' +
      (defDelta > 0 ? ' up' : defDelta < 0 ? ' down' : '') +
      '">' +
      '<i data-icon-domain="game" class="ra ra-shield"></i>' +
      def +
      '%</span>' +
      '</div>' +
      '</div>' +
      /* card art, styled to match the collection: rarity frame, corner
         filigree, rune ring, element orb, rarity pip and role plate */
      '<div class="bcard">' +
      '<div class="bcard-inner">' +
      '<div class="bcard-art' +
      (u.card.art ? ' has-art' : '') +
      '">' +
      '<span class="bart-ring"></span>' +
      (u.card.art
        ? '<div class="bart-portrait"><img src="' +
          esc(u.card.art) +
          '" alt="" draggable="false" /></div>'
        : '<i data-icon-domain="game" class="ra ' + u.card.icon + '"></i>') +
      '</div>' +
      '<div class="bcard-vig"></div>' +
      '<div class="bcard-frame"></div>' +
      '<span class="bcorner tl"></span><span class="bcorner tr"></span>' +
      '<span class="bcorner bl"></span><span class="bcorner br"></span>' +
      '<div class="bcard-top">' +
      '<span class="borb" title="' +
      esc(u.element) +
      '">' +
      '<i data-icon-domain="game" class="ra ' +
      (ELEMENT_ICON[u.element] || 'ra-player') +
      '"></i></span>' +
      '</div>' +
      '<div class="bcard-chips">' +
      chips +
      '</div>' +
      '<div class="bcard-foot">' +
      '<div class="bcard-role"><i data-icon-domain="game" class="ra ' +
      (ROLE_ICON[u.role] || 'ra-player') +
      '"></i>' +
      esc(u.role) +
      '</div>' +
      '<div class="bcard-name">' +
      esc(u.name) +
      '</div>' +
      '</div>' +
      (acted
        ? '<div class="bcard-acted' +
          (settledActed ? ' settled' : '') +
          '"><i class="ri-check-line"></i></div>'
        : '') +
      (!deadView && !acted && unitLockMsg(u)
        ? '<span class="bcard-lockdot" title="No legal action - hover for why"><i class="ri-lock-2-line"></i></span>'
        : '') +
      '<div class="bcard-ring"></div>' +
      '</div>' +
      '</div>'
    );
  }

  /* WHY IS THIS CARD DEAD IN THE WATER?
     -------------------------------------------------------------
     Outside playtest (2026-08-09): on the Narrow Pass, a back-row
     hero in round 1 had its Basic blocked by the terrain AND its
     signature blocked by the phase - a full lockout with a full
     energy bar, and nothing said why. Two rules, both taught, whose
     INTERSECTION nobody taught. When a living, unacted hero of yours
     has no legal action on your turn, the card itself now says why -
     shortest true words, worst offender first. */
  function unitLockMsg(u) {
    if (!B || B.over || B.turn !== 'player' || u.side !== 'player' || !u.alive) return '';
    if (B.acted.player[u.uid]) return '';
    if (scriptActive()) return ''; // the golden line owns the greying
    var basic = E.roleAbility(u);
    var sig = u.card.ability && u.card.ability.type === 'Active' ? u.card.ability : null;
    var abs = [basic, sig].filter(Boolean);
    if (!abs.length) return '';
    var usable = abs.some(function (a) {
      return E.usableNow(B, u, a);
    });
    if (usable) return '';
    if (u.flags.silence > 0) return 'Silenced - loses this turn';
    var why = function (a) {
      if (!a) return null;
      if (!a.basic && E.signatureBlocked(B, u, a)) return 'signature locked until round 2';
      if (!a.basic && a.oncePerBattle && u.usedOnce['ab:' + a.name]) return 'signature spent';
      if (B.field && B.field.basicsFrontRowOnly && a.basic && !E.isFront(u))
        return 'back row: no Basics on this arena';
      if (B.energy.player < E.costOf(B, u, a)) return 'not enough Energy';
      if (!E.usableNow(B, u, a, { ignoreEnergy: true })) return 'no legal targets';
      return null;
    };
    var rb = why(basic);
    var rs = sig ? why(sig) : null;
    if (rb && rs && rb !== rs) return 'Locked: ' + rb + ' + ' + rs;
    var one = rb || rs;
    return one ? 'Locked: ' + one : '';
  }

  function abilityTip(u) {
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    function row(a, isSig) {
      var cost = a.type === 'Active' ? E.costOf(B, u, a) : null;
      var afford = a.type !== 'Active' || B.energy[u.side] >= cost;
      return (
        '<div class="tip-ab' +
        (afford ? '' : ' poor') +
        '">' +
        '<div class="tip-ab-top">' +
        '<span class="tip-tag ' +
        (a.type === 'Passive' ? 'passive' : isSig ? 'sig' : 'role') +
        '">' +
        (a.type === 'Passive' ? 'Passive' : isSig ? 'Signature' : 'Basic Skill') +
        '</span>' +
        '<span class="tip-ab-name">' +
        esc(a.name) +
        '</span>' +
        (a.type === 'Active'
          ? '<span class="tip-cost"><i data-icon-domain="game" class="ra ra-lightning-bolt"></i>' +
            cost +
            '</span>'
          : '') +
        '</div>' +
        '<div class="tip-ab-text">' +
        a.text +
        (a.note ? '<div class="tip-note">' + a.note + '</div>' : '') +
        '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="btip">' +
      '<div class="tip-head">' +
      '<span class="tip-name">' +
      esc(u.name) +
      '</span>' +
      '<span class="tip-meta">' +
      esc(u.role) +
      '<span class="tip-dot">&middot;</span><span style="color:' +
      (ELEMENT_COLOR[u.element] || '#fff') +
      '">' +
      esc(u.element) +
      '</span>' +
      '<span class="tip-dot">&middot;</span>' +
      (E.isFront(u) ? 'Front' : 'Back') +
      ' Row</span>' +
      '</div>' +
      row(sig, true) +
      row(role, false) +
      '</div>'
    );
  }

  /* FLIP: remember where every card sits before a rebuild so we can
     glide it from its old slot to its new one afterwards. */
  function captureSlots() {
    var map = {};
    document.querySelectorAll('.bcell-wrap').forEach(function (el) {
      var card = el.querySelector('.bcard');
      if (!card || !card.dataset.uid) return;
      var r = el.getBoundingClientRect();
      /* remember who ALREADY wore the acted veil: render() rebuilds the
         whole grid on every action, and a fresh .bcard-acted node plays
         its veil-in animation again - so by the time a Medic casts (mid/
         late round, several veils up) the whole board strobed. Settled
         veils render without the animation; the first application of a
         veil keeps its fade. */
      map[card.dataset.uid] = {
        x: r.left,
        y: r.top,
        acted: !!el.querySelector('.bcard-acted'),
      };
    });
    return map;
  }

  function glideSlots(before) {
    document.querySelectorAll('.bcell-wrap').forEach(function (el) {
      var card = el.querySelector('.bcard');
      if (!card || !card.dataset.uid) return;
      var old = before[card.dataset.uid];
      if (!old) return;
      var r = el.getBoundingClientRect();
      var z = uiS(); // screen-px delta -> layout-px translate
      var dx = (old.x - r.left) / z,
        dy = (old.y - r.top) / z;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      // jump back to the old spot, then release for a smooth glide
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () {
        el.style.transition = '';
        el.style.transform = '';
      });
    });
  }

  function render() {
    if (!B) return;
    hideStatusPop();
    clearPreview();
    if (!sel || !sel.unit) {
      hoverUnit = null;
      paintDock();
    }
    var slotsBefore = captureSlots();
    ['enemy', 'player'].forEach(function (side) {
      var wrap = $('grid-' + side);
      if (!wrap) return;
      wrap.innerHTML = '';
      // slots 0-5; front row (0-2) faces the middle of the board
      /* Formation is 2 columns x 3 rows, filled row-major. Each side's
         FRONT row (slots 0-2) takes the column nearest the centre line:
           player (left side)  -> front row is the RIGHT column
           enemy  (right side) -> front row is the LEFT column */
      var order =
        side === 'player'
          ? [3, 0, 4, 1, 5, 2] // rows of: back, front
          : [0, 3, 1, 4, 2, 5]; // rows of: front, back
      order.forEach(function (slot) {
        var u = B.units.filter(function (x) {
          return x.side === side && x.slot === slot;
        })[0];
        var cell = document.createElement('div');
        cell.className = 'bcell';
        if (!u) {
          cell.classList.add('empty');
          wrap.appendChild(cell);
          return;
        }

        // a hero whose resurrection hasn't lit yet still reads as a corpse
        var vdead = !u.alive || isDownForRevive(u.uid);
        cell.className =
          'bcell-wrap ' + side + (vdead ? ' dead' : '') + (E.isFront(u) ? ' front' : ' back');
        cell.dataset.uid = u.uid;
        cell.style.setProperty('--fc-primary', u.faction.colors.primary);
        cell.style.setProperty('--el', ELEMENT_COLOR[u.element] || '#fff');
        cell.dataset.rarity = u.card.rarity;
        cell.innerHTML = unitCardHTML(
          u,
          vdead && u.alive,
          !!(slotsBefore[u.uid] && slotsBefore[u.uid].acted)
        );

        var inner = cell.querySelector('.bcard');
        if (inner) {
          inner.dataset.uid = u.uid;
          inner.dataset.rarity = u.card.rarity;
          inner.classList.add(side);
          if (vdead) inner.classList.add('dead');
          if (E.isFront(u)) inner.classList.add('front');
          else inner.classList.add('back');
        }
        /* A fallen hero stays READABLE: hovering still opens its panel
           (buffs, causes of death, the flyout), it just can never be
           selected - onCardClick treats it as strictly view-only. */
        var hit = inner;
        if (hit) {
          hit.addEventListener('click', function (ev) {
            ev.stopPropagation();
            onCardClick(u);
          });
          hit.addEventListener('mouseenter', function () {
            hoverUnit = u;
            paintDock();
          });
          hit.addEventListener('mouseleave', function () {
            if (hoverUnit === u) {
              hoverUnit = null;
              paintDock();
            }
          });
        }
        wrap.appendChild(cell);
      });
    });

    // energy + round
    ['player', 'enemy'].forEach(function (s) {
      var en = B.energy[s];
      /* Energy now CARRIES OVER, so the bar must be measured against the
         storage cap (150, or 170 on the Mana Spring) rather than the round
         grant - otherwise it pegs at full the moment a side banks 100. */
      var cap = E.energyCap(B);
      $('en-fill-' + s).style.width = Math.min(100, (en / cap) * 100) + '%';
      $('en-val-' + s).textContent = en;
      $('en-cap-' + s).textContent = '/' + cap;
      var alive = E.unitsOf(B, s).length;
      $('alive-' + s).textContent = alive;
    });
    $('round-num').textContent = B.round;

    /* The phase is announced by the ROUND overlay (subs: basics only /
       skills unlocked) and by the lock badges on the ability rows - the
       old HUD pill was removed as HUD clutter. */
    var ramp = Math.round((E.rampMult(B.round) - 1) * 100);
    var rt = $('ramp-tag');
    if (rt) {
      rt.classList.toggle('on', ramp > 0);
      /* the ramp is persistent STATE, and a playtest proved the quiet
         pill reads as scenery ('I started doing ridiculous damage -
         why?'). Every time the number grows, the pill physically
         announces itself. */
      var rv = $('ramp-val');
      if (rv.textContent !== '+' + ramp + '%') {
        rv.textContent = '+' + ramp + '%';
        if (ramp > 0) {
          rt.classList.remove('bump');
          void rt.offsetWidth;
          rt.classList.add('bump');
        }
      }
      var next = Math.round((E.rampMult(B.round + 1) - 1) * 100);
      rt.title =
        ramp > 0
          ? 'All legends have +' + ramp + '% ATK. Next round: +' + next + '%.'
          : 'From round ' +
            E.RAMP_FROM +
            ', all legends gain +' +
            Math.round(E.RAMP_STEP * 100) +
            '% ATK each round.';
    }
    var tl = $('turn-label');
    tl.textContent = B.over ? 'Battle Over' : B.turn === 'player' ? 'Your Action' : 'Enemy Action';
    tl.classList.toggle('enemy-turn', !B.over && B.turn === 'enemy');

    /* THE SET war score replaces the action pill while a set is live:
       the pill only repeated the turn label above it, and the old
       fixed top-centre chip floated over the HUD itself. Same pill
       spec as the ramp tag, in black/gray. */
    var setInfo =
      window.EOL.play && window.EOL.play.setPillInfo ? window.EOL.play.setPillInfo() : null;
    var sp = $('set-pill');
    var it = $('init-tag');
    if (setInfo && sp) {
      if (it) it.classList.remove('on');
      sp.hidden = false;
      var sk = setInfo.game + '-' + setInfo.you + '-' + setInfo.foe;
      if (sp.dataset.k !== sk) {
        sp.dataset.k = sk;
        sp.innerHTML =
          '<i data-icon-domain="game" class="ra ra-scroll-unfurled"></i><span>UNABRIDGED G' +
          setInfo.game +
          '/3 - </span><b>' +
          setInfo.you +
          ' - ' +
          setInfo.foe +
          '</b>';
        sp.classList.remove('bump');
        void sp.offsetWidth; /* restart the pop on a fresh score */
        sp.classList.add('bump');
      }
    } else {
      if (sp) sp.hidden = true;
    }
    /* Status line under the round counter. States plainly what the game
       is waiting on, which the old "who opened the round" badge did not. */
    if (it && !setInfo) {
      var msg,
        cls = false;
      /* SHORT texts only - the pill is centre-clipped to ~150 px so it
         can never creep back over the energy readouts or the Pass
         button (full text lives in the pill's tooltip). */
      if (B.over) {
        msg = 'Battle over';
      } else if (B.passed.player && !B.passed.enemy) {
        msg = 'Enemy finishing';
        cls = true;
      } else if (B.passed.enemy && !B.passed.player) {
        msg = 'Enemy passed';
      } else if (B.turnPassed.enemy && B.turn === 'player') {
        msg = 'Enemy skipped'; // back-to-back chance: act!
      } else if (B.turn === 'enemy') {
        msg = 'Enemy thinking';
        cls = true;
      } else {
        msg = 'Your action';
      }
      it.classList.toggle('on', true);
      it.classList.toggle('enemy', cls);
      $('init-val').textContent = msg;
      it.title =
        'Sides trade one action at a time. Passing skips only ' +
        'that action - the round ends when both sides pass back-to-back.';
    }
    document.body.dataset.turn = B.turn;

    var canEnd = !B.over && B.turn === 'player';
    $('btn-endturn').disabled = !canEnd;

    sizeBoard();
    glideSlots(slotsBefore);
    Object.keys(reviveFx).forEach(applyReviveClass);
    paintSelection();
    paintDock();
  }

  /* Size the grid columns from the available row height. The factor stays
     at the old portrait 250:355 so the squarer 5:6 tile always fits its
     slot vertically (tile height = width * 6/5 < artH). */
  function sizeBoard() {
    ['player', 'enemy'].forEach(function (side) {
      var grid = $('grid-' + side);
      if (!grid) return;
      var cell = grid.querySelector('.bcell-wrap');
      var stats = grid.querySelector('.bstats');
      if (!cell || !stats) return;
      var rowH = cell.getBoundingClientRect().height;
      var statsH = stats.getBoundingClientRect().height;
      var gap = 5;
      /* rects are screen-scale px under GUI scale; --cardw is a layout
         value, so convert down first */
      var artH = Math.max(40, (rowH - statsH) / uiS() - gap);
      /* Keep a little vertical breathing room, but use more of each board
         socket than the old 250/355 portrait ratio. The rendered battle
         tile is 5:6, so 270/355 remains safely inside the available row. */
      grid.style.setProperty('--cardw', Math.floor((artH * 270) / 355) + 'px');
    });
    fitNames();
  }

  /* ---------------------------------------------------------
     Per-hero name fitting
     -------------------------------------------------------------
     Names range from "Zeus" to "Rumpelstiltskin", so one font size
     can't serve both: the long ones were clipped by the card border.
     Each name is measured against its own card and given its own size,
     so every hero's name fills the available width as fully as it can
     without overflowing.

     Measurement is done on a shared off-screen canvas rather than by
     reading offsetWidth in a loop, so there is no layout thrash.
     --------------------------------------------------------- */
  var MAX_NAME_PX = 12;
  var MIN_NAME_PX = 7.5;
  var _measureCtx = null;

  function measureCtx() {
    if (!_measureCtx) {
      var c = document.createElement('canvas');
      _measureCtx = c.getContext('2d');
    }
    return _measureCtx;
  }

  /* Widest font size (in px) at which `text` fits `avail` px. */
  function fitFontSize(ctx, text, avail, weight, family) {
    // width scales linearly with font size, so one measurement at a
    // reference size gives the answer directly - no binary search
    ctx.font = weight + ' ' + MAX_NAME_PX + 'px ' + family;
    var w = ctx.measureText(text).width;
    if (w <= avail) return MAX_NAME_PX;
    var px = MAX_NAME_PX * (avail / w);
    // letter-spacing and hinting make the linear estimate slightly
    // optimistic, so shave a hair and re-check
    px = Math.floor(px * 20) / 20;
    ctx.font = weight + ' ' + px + 'px ' + family;
    while (px > MIN_NAME_PX && ctx.measureText(text).width > avail) {
      px -= 0.25;
      ctx.font = weight + ' ' + px + 'px ' + family;
    }
    return Math.max(MIN_NAME_PX, px);
  }

  /* Below this size a one-line fit reads as a squint, so a multi-word
     name should break onto two lines instead of shrinking further. */
  var WRAP_MIN_PX = 9.6;

  function fitNames() {
    /* Battle-board names only. Preparation cards (.prep-c) deliberately
       wrap onto multiple lines at a fixed size, so they must not be given
       an inline single-line font size here. */
    var nodes = document.querySelectorAll('.bcard-name:not(.prep-c .bcard-name)');
    if (!nodes.length) return;
    var ctx = measureCtx();
    // all board names share one font stack; read it once
    var probe = getComputedStyle(nodes[0]);
    var family = probe.fontFamily;
    var weight = probe.fontWeight;

    nodes.forEach(function (el) {
      /* A wrapped name holds a <br>, after which textContent can no longer
         tell "King Arthur" from "KingArthur" - the true name is kept aside
         in dataset.raw from the first fit onward. */
      var text = el.dataset.raw || el.textContent;
      if (!text) return;
      el.dataset.raw = text;
      // the foot padding is the only thing between the name and the edge
      var avail = el.clientWidth;
      if (!avail) return;
      var key = text + '|' + avail;
      if (el.dataset.fitKey === key) return;

      var words = text.split(/\s+/);
      var onePx = fitFontSize(ctx, text, avail, weight, family);

      /* A multi-word name that would over-shrink wraps onto two lines:
         split at the word boundary that most balances the halves, then
         size both lines to the wider one. A one-word name has no break
         point, so it keeps the shrink-to-fit behaviour. */
      if (words.length > 1 && onePx < WRAP_MIN_PX) {
        var best = null;
        ctx.font = weight + ' ' + MAX_NAME_PX + 'px ' + family;
        for (var i = 1; i < words.length; i++) {
          var w = Math.max(
            ctx.measureText(words.slice(0, i).join(' ')).width,
            ctx.measureText(words.slice(i).join(' ')).width
          );
          if (!best || w < best.w) best = { i: i, w: w };
        }
        var a = words.slice(0, best.i).join(' ');
        var b = words.slice(best.i).join(' ');
        var twoPx = Math.min(
          fitFontSize(ctx, a, avail, weight, family),
          fitFontSize(ctx, b, avail, weight, family)
        );
        /* small hysteresis so a borderline name does not flip between
           one and two lines on a one-pixel resize */
        if (twoPx > onePx + 0.3) {
          el.textContent = '';
          el.appendChild(document.createTextNode(a));
          el.appendChild(document.createElement('br'));
          el.appendChild(document.createTextNode(b));
          el.style.fontSize = twoPx + 'px';
          el.classList.add('wrap');
          el.dataset.fitKey = key;
          return;
        }
      }
      if (el.classList.contains('wrap')) {
        el.classList.remove('wrap');
        el.textContent = text;
      }
      el.style.fontSize = onePx + 'px';
      el.dataset.fitKey = key;
    });
  }

  /* Ability headers are a single row: [tag] [name] .......... [cost].
     The row cannot wrap (see .dk-ab-top), so a long skill name would be
     clipped instead of pushing the cost to the next line. This shrinks
     the NAME - and only the name - until it fits the space left over
     beside a full-size cost chip. Same idea as fitNames(), applied to a
     flex row rather than a card foot. */
  var MIN_AB_PX = 8.5;
  var MAX_AB_PX = 12;
  /* FIT EACH SKILL NAME BESIDE ITS COST CHIP.
     -------------------------------------------------------------
     This used to PREDICT the space the name would get:
       avail = row.clientWidth - (siblings) - (gaps)
     and size the font to that prediction. The prediction was ~6px
     optimistic - flex distributes differently than the arithmetic
     assumed once `min-width: 0` and `margin-left: auto` are in play -
     so long names ("Divine Judgment", "Shikigami Prophecy",
     "Treasonous Strike") were set one notch too large and the final
     letters were clipped by `overflow: hidden`.

     Predicting a flex layout is the wrong approach. Now it MEASURES
     the rendered result: set a size, ask the element whether its own
     text overflows (scrollWidth > clientWidth), and step down until
     it does not. A couple of extra reads per row, and it cannot be
     wrong about the layout because it is reading the layout.
     ============================================================= */
  function fitAbilityNames(root) {
    var nodes = (root || document).querySelectorAll('.dk-ab-name');
    if (!nodes.length) return;
    nodes.forEach(function (el) {
      var text = el.textContent;
      if (!text) return;

      /* Start from the full size every time. Without this the element
         keeps a smaller size left over from a previous, longer hero
         and short names render needlessly shrunken. */
      el.style.fontSize = MAX_AB_PX + 'px';
      if (el.scrollWidth <= el.clientWidth) return; // already fits

      /* First guess from the overflow ratio, so the loop below almost
         always confirms in one step instead of crawling down. */
      var px = MAX_AB_PX;
      var ratio = el.clientWidth / el.scrollWidth;
      if (ratio > 0 && ratio < 1) {
        px = Math.max(MIN_AB_PX, Math.floor(MAX_AB_PX * ratio * 20) / 20);
        el.style.fontSize = px + 'px';
      }
      /* Then step down against the REAL rendered width. Bounded so a
         pathological string can never spin here. */
      var guard = 0;
      while (px > MIN_AB_PX && el.scrollWidth > el.clientWidth && guard++ < 40) {
        px = Math.max(MIN_AB_PX, px - 0.25);
        el.style.fontSize = px + 'px';
      }
    });
  }

  /* ---------------------------------------------------------
     THE DAMAGE BREAKDOWN
     -------------------------------------------------------------
     The chip answers "how much?"; hovering it answers "why that
     much?". Players could see a number but not the attack stat,
     skill power, defence reduction and conditional arm behind it,
     so a preview that disagreed with their mental maths looked like
     a bug rather than a defence stat they had forgotten about.

     Every row comes from engine.previewDamage's `hits[].steps`,
     which records each factor AS IT IS APPLIED - the panel cannot
     drift from the arithmetic because it is not recomputing any of
     it. Multi-hit skills get one block per hit plus a grand total.
     --------------------------------------------------------- */
  function fmtMult(m) {
    /* 0.7 -> "x0.7", 2.5 -> "x2.5", and never "x0.7000000000000001" */
    return '\u00d7' + (Math.round(m * 1000) / 1000).toLocaleString();
  }

  function stepRowHTML(s) {
    var right;
    if (s.mult != null) right = fmtMult(s.mult);
    else if (s.add != null) right = '+' + Math.round(s.add).toLocaleString();
    else right = Math.round(s.value).toLocaleString();
    return (
      '<div class="dpb-row' +
      (s.subtotal ? ' sub' : '') +
      (s.k === 'total' ? ' tot' : '') +
      '"><span class="dpb-k">' +
      esc(s.label) +
      '</span><span class="dpb-v">' +
      right +
      '</span></div>'
    );
  }

  /* Open downward when there is not enough room above. Measured
     against the board rect, not the window: the board is what the
     panel would visually escape from, and the game is scaled, so
     window coordinates alone would misjudge it. */
  var DPB_H = 190; /* generous estimate; only decides the side */
  function flipBreakdown(chip) {
    try {
      var r = chip.getBoundingClientRect();
      var host = document.getElementById('board');
      var top = host ? host.getBoundingClientRect().top : 0;
      chip.classList.toggle('flip', r.top - top < DPB_H);
    } catch (e) {
      /* positioning is a nicety - never let it break targeting */
    }
  }

  function dmgBreakdownHTML(pv, tgt, lethal) {
    var hits = pv && pv.hits;
    if (!hits || !hits.length) return '';
    var multi = hits.length > 1;
    var body = '';
    hits.forEach(function (h, i) {
      if (multi) body += '<div class="dpb-hit">Hit ' + (i + 1) + '</div>';
      h.steps.forEach(function (s) {
        /* on a multi-hit skill the per-hit "Damage" line is the hit,
           not the answer - the grand total below is the answer */
        body += stepRowHTML(s);
      });
    });
    if (multi) {
      body += stepRowHTML({ k: 'total', label: 'Total damage', value: pv.dmg, subtotal: true });
    }
    var foot = '';
    if (pv.critChance > 0) {
      foot +=
        '<div class="dpb-note">On a crit (' +
        pv.critChance +
        '% chance): <b>' +
        pv.crit.toLocaleString() +
        '</b></div>';
    }
    /* WHY A BIGGER NUMBER THAN THEIR HP STILL WILL NOT KILL.
       Provoke recovery heals the target before the blow lands, so the
       pool this hit must beat is larger than the HP bar shows. Saying
       so is the difference between "the tank cheated" and "their
       Skill is doing what it says". */
    if (pv.preHeal > 0) {
      foot +=
        '<div class="dpb-note">Recovers <b>' +
        Math.round(pv.preHeal).toLocaleString() +
        '</b> HP before this hit lands, so it must beat <b>' +
        Math.round(pv.effectiveHp).toLocaleString() +
        '</b>.</div>';
    }
    if (lethal) foot += '<div class="dpb-note kill">This is lethal.</div>';
    if (pv.bonus === true) {
      foot += '<div class="dpb-note good">The Skill\u2019s bonus condition is met.</div>';
    } else if (pv.bonus === false) {
      foot +=
        '<div class="dpb-note bad">The Skill\u2019s bonus condition is not met' +
        (tgt && tgt.shield > 0
          ? ' \u2013 HP conditions ignore shields, and this target has ' +
            Math.ceil(tgt.shield).toLocaleString() +
            ' shield.'
          : '.') +
        '</div>';
    }
    return (
      '<span class="dmg-breakdown"><span class="dpb-title">How this is calculated</span>' +
      body +
      foot +
      '</span>'
    );
  }

  /* highlight selected unit + legal targets */
  function paintSelection() {
    document.querySelectorAll('.bcard').forEach(function (c) {
      c.classList.remove('selected', 'targetable', 'chosen', 'viewing');
    });
    clearPreview();
    paintScriptMarks(); // the scripted-match pulse survives every repaint
    if (!sel || !sel.unit) return;

    var selEl = document.querySelector('.bcard[data-uid="' + sel.unit.uid + '"]');
    if (selEl) selEl.classList.add(sel.view ? 'viewing' : 'selected');

    if (sel.ability) {
      var pool = E.legalTargets(B, sel.unit, sel.ability);
      var forced = E.forcedTarget(B, sel.unit, sel.ability);
      if (forced) pool = [forced];
      pool.forEach(function (u) {
        var el = document.querySelector('.bcard[data-uid="' + u.uid + '"]');
        if (el) {
          el.classList.add('targetable');
          /* THE DAMAGE PREVIEW (playtest 2026-08-10: 'attacking and
             hoping they die'): every legal enemy target wears the
             number this cast would deal it - engine math, no dice.
             Allies/heals show nothing; the chip is the answer to
             'will this kill?', not a second HUD. */
          if (u.side !== sel.unit.side) {
            var pv = E.previewDamage(B, sel.unit, sel.ability, u, sel.choose);
            if (pv) {
              var chip = el.querySelector('.dmg-preview');
              if (!chip) {
                chip = document.createElement('span');
                chip.className = 'dmg-preview';
                el.appendChild(chip);
              }
              /* Ask the engine, do not re-derive it. Some targets heal
                 BEFORE the blow lands (Provoke recovery), so hp+shield
                 is not the pool this hit has to beat. */
              var lethal = pv.lethal;
              chip.classList.toggle('lethal', lethal);
              /* CONDITIONAL BONUSES ANNOUNCE THEMSELVES. Goldilocks'
                 "between 30% and 70% HP" (and every other branch skill)
                 was invisible until after the cast, and the HP a player
                 reads off the card includes SHIELD - so a target could
                 look squarely inside the window while the engine, which
                 tests raw HP, correctly refused the bonus. The star says
                 which arm this exact shot will take, before committing. */
              chip.classList.toggle('bonus', pv.bonus === true);
              chip.innerHTML =
                '<i data-icon-domain="game" class="ra ra-sword"></i>' +
                pv.dmg.toLocaleString() +
                (pv.bonus === true
                  ? '<i data-icon-domain="game" class="ra ra-star-formation dp-bonus"></i>'
                  : '') +
                (lethal ? '<i data-icon-domain="game" class="ra ra-skull dp-skull"></i>' : '') +
                dmgBreakdownHTML(pv, u, lethal);
              /* No `title`: the hover panel above says all of this and
                 more, and a native tooltip on top of it would cover the
                 breakdown the player opened it to read. */
              chip.removeAttribute('title');
              /* The panel opens upward by default. For a unit on the top
                 row that would run off the board, so those flip below.
                 Enemies occupy the top of the board, and they are exactly
                 who wears this chip, so this is the common case - it is
                 decided per chip from its real position rather than
                 assumed from the side. */
              flipBreakdown(chip);
            }
          }
        }
      });
      sel.chosen.forEach(function (u) {
        var el = document.querySelector('.bcard[data-uid="' + u.uid + '"]');
        if (el) el.classList.add('chosen');
      });
    }
  }

  /* Hovering a Skill row previews who it can hit, using the same
     green highlight a click produces. Lets the player scan their
     options without committing to a selection first. `preview` is
     kept separate from `targetable` so leaving the row restores the
     real selection exactly. */
  function paintPreview(u, ability, choose) {
    clearPreview();
    if (!u || !ability || B.over) return;
    if (E.pickCount(ability) === 0 && (ability.spec || {}).target) {
      var t = ability.spec.target;
      if (t.side === 'self' || t.side === 'none') return;
    }
    /* WHO WOULD ACTUALLY BE HIT, not merely who is legal.
       E.affectedTargets walks the card's own effect tree, so a Skill
       that narrows its victims (Zeus striking only the Marked, a
       row-choice, a `take: top N`) highlights exactly the heroes it
       will strike. Reading the card data rather than naming heroes
       means every card behaves consistently, including future ones. */
    var pool;
    try {
      pool = E.affectedTargets(B, u, ability, [], choose || 0);
    } catch (err) {
      return;
    }
    var forced = E.forcedTarget(B, u, ability);
    if (forced) pool = [forced];

    pool.forEach(function (t) {
      var el = document.querySelector('.bcard[data-uid="' + t.uid + '"]');
      if (el) {
        el.classList.add('preview-target');
        /* hovering an ability row previews its numbers too */
        if (t.side !== u.side) {
          var pv = E.previewDamage(B, u, ability, t, choose || 0);
          if (pv) {
            var chip = document.createElement('span');
            chip.className = 'dmg-preview' + (pv.lethal ? ' lethal' : '');
            chip.innerHTML =
              '<i data-icon-domain="game" class="ra ra-sword"></i>' +
              pv.dmg.toLocaleString() +
              (pv.lethal ? '<i data-icon-domain="game" class="ra ra-skull dp-skull"></i>' : '');
            el.appendChild(chip);
          }
        }
      }
    });
  }
  function clearPreview() {
    document.querySelectorAll('.bcard.preview-target').forEach(function (el) {
      el.classList.remove('preview-target');
    });
    /* damage chips die with the selection that asked for them */
    document.querySelectorAll('.dmg-preview').forEach(function (el) {
      el.parentNode.removeChild(el);
    });
  }

  /* ---------------------------------------------------------
     Floating hero panel
     Appears in the empty space beside the board: allies on the
     left, enemies on the right. Hovering previews a hero; clicking
     one of yours locks it there and makes the abilities clickable.
     The layout is identical either way.
     --------------------------------------------------------- */
  var hoverUnit = null;

  function abilityRowHTML(u, a, isSig, interactive, idx) {
    var isActive = a.type === 'Active';
    var cost = isActive ? E.costOf(B, u, a) : null;
    var usable = isActive && E.canUse(B, u, a);
    /* a Skill must be able to MEET its pick count, not just legally hit
       someone: Tsukuyomi-style "choose 2" used to stay lit with one
       enemy alive and then soft-lock the target picker demanding a
       second click that could never come */
    /* ...and an `all` ability (pickCount 0) still needs SOMEBODY in its
       pool. Rapunzel only reaches the back row; facing a team that is all
       front-row her pool is empty, and this row used to stay lit and let
       the player burn 40 Energy on nothing. usableNow() is the engine's
       own answer to "can this fire right now", pick count included. */
    var needTargets = isActive ? E.pickCount(a) : 0;
    var hasTargets = !isActive || E.usableNow(B, u, a, { ignoreEnergy: true });
    /* Only Actives may grey out (locked/unaffordable/no targets). Passives
       simply aren't selectable - greying them read as "broken". */
    var dis = isActive && (!usable || !hasTargets);
    /* THE SCRIPTED MATCH: only the line's ability on the line's unit
       stays live; everything else greys out, and the asked-for row
       carries the golden pulse. */
    var mvS = scriptMove();
    var scriptRow = false;
    if (mvS && mvS.side === 'player' && !mvS.pass && interactive && isActive) {
      var wantedKind = mvS.ability === 'sig' ? isSig : !isSig;
      if (u.card.id !== mvS.unit || !wantedKind) dis = true;
      else scriptRow = true;
    }
    var tag = a.type === 'Passive' ? 'passive' : isSig ? 'sig' : 'role';
    /* Short tags. The row is only ~219px wide and "SIGNATURE SKILL" ate
       87px of it, squeezing long Skill names. The colour already says
       which kind it is, so the word "Skill" was pure repetition. */
    var tagTxt = a.type === 'Passive' ? 'Passive' : isSig ? 'Skill' : 'Basic';
    /* roleAbility() builds a fresh object every render, so for Basics the
       identity check fails right after re-paint and the selection's blue
       vanishes (signatures keep their gold because the card ref is stable).
       Match Basics by name + side instead. */
    var isSel =
      sel &&
      sel.ability &&
      (sel.ability === a ||
        (a.basic && sel.ability.basic && sel.ability.name === a.name && sel.unit === u));

    var lockedPhase = isSig && E.signatureBlocked(B, u, a);
    var lockTooltip = '';
    if (lockedPhase) {
      lockTooltip = 'Locked during Battle Phase 1 (Round 1). Unlocks in Round 2.';
    }

    // Only surface reasons the player can't infer from the UI itself -
    // an unaffordable cost is already obvious from the greyed-out button.
    var reason = '';
    if (lockedPhase) {
      reason = 'Locked in current Battle Phase';
    } else if (interactive && isActive && dis) {
      if (!hasTargets)
        reason =
          needTargets > 1
            ? 'Needs ' + needTargets + ' targets - not enough left'
            : 'No valid targets';
      else if (u.flags.silence > 0 && !a.basic) reason = 'Silenced';
    }

    var el = interactive && isActive && !dis ? 'button' : 'div';
    return (
      '<' +
      el +
      ' class="dk-ab ' +
      tag +
      (interactive && isActive ? ' act' : '') +
      (dis ? ' dis' : '') +
      (isSel ? ' sel' : '') +
      (scriptRow && !isSel ? ' tutor-pick' : '') +
      '"' +
      (interactive && isActive && !dis ? ' data-ab="' + idx + '"' : '') +
      (lockTooltip ? ' title="' + esc(lockTooltip) + '"' : '') +
      '>' +
      '<div class="dk-ab-top">' +
      '<span class="dk-tag ' +
      tag +
      '">' +
      tagTxt +
      '</span>' +
      '<span class="dk-ab-name">' +
      esc(a.name) +
      '</span>' +
      (lockedPhase
        ? '<span class="dk-lock-badge" title="' +
          esc(lockTooltip) +
          '"><i class="ri-lock-fill"></i></span>'
        : '') +
      (isActive && !lockedPhase
        ? '<span class="dk-cost"><i data-icon-domain="game" class="ra ra-lightning-bolt"></i>' +
          cost +
          '</span>'
        : '') +
      '</div>' +
      '<div class="dk-ab-text">' +
      rich(a.text) +
      (a.note ? '<div class="dk-note">' + rich(a.note) + '</div>' : '') +
      '</div>' +
      (reason
        ? '<div class="dk-reason"><i class="ri-error-warning-line"></i>' + reason + '</div>'
        : '') +
      '</' +
      el +
      '>'
    );
  }

  /* Engine "rest of battle" buffs are written as 99 rounds, and the
     chip used to print that literally - "99 rounds left" is a lie
     with extra steps. Anything this long reads as permanent. */
  var PERM_TURNS = 90;
  function durText(turns) {
    if (!turns) return '';
    if (turns >= PERM_TURNS) return 'for the battle';
    return turns + ' round' + (turns > 1 ? 's' : '') + ' left';
  }
  /* One chip can hold several same-stat buffs on DIFFERENT clocks
     (Lancelot: his permanent +10% ATK stacks + an ally's 2-round
     +25%). Itemize them so the temporary part never looks permanent. */
  function statusBreakdown(st) {
    if (!st.parts || st.parts.length < 2) return '';
    var mixed = st.parts.some(function (p) {
      return p.turns !== st.parts[0].turns;
    });
    if (!mixed) return '';
    return st.parts
      .map(function (p) {
        return (p.amt > 0 ? '+' : '') + p.amt + '% ' + (durText(p.turns) || 'now');
      })
      .join(' &middot; ');
  }

  /* Live value for THIS hero, then the rule from window.EOL.STATUS if
     there is one worth printing. Most stat buffs need no rule at all -
     "+15% Attack" says everything, and nobody needs DEF explained. */
  function statusDesc(u, st) {
    var amt = 0;
    (u.buffs || []).forEach(function (b) {
      if (!b.stat) return;
      var k = b.stat + (b.amt >= 0 ? '+' : '-');
      if (k === st.key) amt += b.amt;
    });
    var live = '';
    switch (st.key) {
      case 'atk+':
      case 'atk-':
        live = (amt > 0 ? '+' : '') + amt + '% ATK';
        break;
      case 'def+':
      case 'def-':
        live = (amt > 0 ? '+' : '') + amt + '% DEF';
        break;
      case 'crit+':
      case 'crit-':
        live = (amt > 0 ? '+' : '') + amt + '% Crit';
        break;
      case 'shield':
        live = u.shield.toLocaleString() + ' absorbed';
        break;
      case 'burn':
        live = Math.round(u.maxHp * 0.05).toLocaleString() + ' per turn';
        break;
      case 'healdown':
        live = '-' + Math.abs(u.flags.healMod) + '% healing';
        break;
      case 'resist':
        live = '-' + (u.flags.resistPct || 0) + '% damage taken';
        break;
      default:
        live = '';
    }
    var rule = (window.EOL.STATUS[st.key] || {}).desc || '';
    if (live && rule) return '<b>' + live + '.</b> ' + rule;
    if (live) return '<b>' + live + '</b>';
    return rule;
  }

  /* THE STATUS ROW.
     -------------------------------------------------------------
     Statuses used to be a stacked list of full rule paragraphs. On a
     hero carrying four of them that was taller than everything else
     in the panel combined, which is what forced the panel to be so
     large it had nowhere to sit.

     Now it is one row of icons - the same glyphs and colours the
     battle card uses, so a status is recognisable in both places -
     and the rules text appears on hover. Dense by default, complete
     on demand.

     Every status is colour-coded from window.EOL.STATUS, so nothing
     renders as bare text. */
  function statusListHTML(u) {
    var sts = window.EOL.statusesOf(u, E);
    (B.costMods[u.side] || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      var key = up ? 'costup' : 'costdown';
      var hit = sts.filter(function (o) {
        return o.key === key;
      })[0];
      if (hit) {
        /* same honesty rule as statusesOf: the chip shows its longest clock */
        if (typeof m.turns === 'number' && typeof hit.turns === 'number')
          hit.turns = Math.max(hit.turns, m.turns);
      } else {
        var d = window.EOL.STATUS[key];
        sts.push({
          key: key,
          icon: d.icon,
          kind: d.kind,
          label: d.label,
          turns: m.turns,
          count: 1,
        });
      }
    });

    /* An explicit empty state. A blank gap left players unsure
       whether the hero had no statuses or the panel was broken. */
    if (!sts.length) {
      return (
        '<div class="dk-strip empty">' +
        '<span class="dk-strip-label">Status</span>' +
        '<span class="dk-strip-none">None</span>' +
        '</div>'
      );
    }

    return (
      '<div class="dk-strip">' +
      '<span class="dk-strip-label">Status</span>' +
      '<div class="dk-strip-row">' +
      sts
        .map(function (st) {
          var sdef = window.EOL.STATUS[st.key] || {};
          var durT = durText(st.turns);
          var dur = durT ? '<span class="dsp-dur">' + durT + '</span>' : '';
          var brk = statusBreakdown(st);
          return (
            '<span class="dk-sicon ' +
            st.kind +
            '"' +
            (sdef.color ? ' style="--sc:' + sdef.color + '"' : '') +
            ' tabindex="0">' +
            '<i data-icon-domain="game" class="ra ' +
            st.icon +
            '"></i>' +
            (st.count > 1 ? '<b class="dk-sn">' + st.count + '</b>' : '') +
            '<span class="dk-spop">' +
            '<span class="dsp-head"><i data-icon-domain="game" class="ra ' +
            st.icon +
            '"></i><b>' +
            esc(st.label) +
            '</b>' +
            (st.count > 1 ? '<span class="dsp-n">x' + st.count + '</span>' : '') +
            dur +
            '</span>' +
            (brk ? '<span class="dsp-brk">' + brk + '</span>' : '') +
            /* statusDesc returns trusted authored markup (<b> around the
               live value); the only interpolated values are numbers. */
            '<span class="dsp-body">' +
            statusDesc(u, st) +
            '</span>' +
            '</span>' +
            '</span>'
          );
        })
        .join('') +
      '</div>' +
      '</div>'
    );
  }

  /* Roster-wide maxima for the flyout's stat bars. Computed once from
     the card data so a bar is a real comparison between heroes rather
     than a hard-coded ceiling that everyone clips. Head-room is added so
     buffed values still have somewhere to go. */
  var STAT_MAX = null;
  function statMax() {
    if (STAT_MAX) return STAT_MAX;
    var hp = 0,
      atk = 0,
      def = 0;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.stats.hp > hp) hp = c.stats.hp;
        if (c.stats.atk > atk) atk = c.stats.atk;
        if (c.stats.def > def) def = c.stats.def;
      });
    });
    STAT_MAX = {
      hp: hp || 7000,
      atk: Math.round((atk || 2000) * 1.35),
      def: Math.max(def || 30, 40),
    };
    return STAT_MAX;
  }

  function statLine(icon, key, val, pct, color) {
    return (
      '<div class="dk-stat" style="--sc:' +
      color +
      '">' +
      '<i data-icon-domain="game" class="ra ' +
      icon +
      '"></i>' +
      '<span class="dk-stat-k">' +
      key +
      '</span>' +
      /* the target width rides on a custom property and the bar fills
         to it once the panel is shown - same growing-bar read as the
         collection cards, rather than snapping to full width */
      '<span class="dk-stat-bar"><span style="--to:' +
      Math.max(2, pct) +
      '%"></span></span>' +
      '<span class="dk-stat-v">' +
      val +
      '</span></div>'
    );
  }

  /* Decide what the panel shows: a locked selection beats a hover. */
  var dockKey = '';
  var swapTimer = null;

  function paintDock() {
    var fly = $('flyout');
    if (!fly) return;

    var u = (sel && sel.unit) || hoverUnit;
    // a hero mid-resurrection has no live stats to show
    if (u && isDownForRevive(u.uid)) u = null;
    if (!u) {
      fly.classList.remove('show');
      dockKey = '';
      return;
    }

    var locked = !!(sel && sel.unit);
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    var mine = u.side === 'player';
    var interactive = locked && mine && u.alive && !sel.view && !B.over && B.turn === 'player';
    // Only a genuinely different hero replays the swap animation. Locking
    // the same card (hover -> click) must not re-animate the panel.
    var fresh = dockKey !== u.uid;
    dockKey = u.uid;

    var hint = '';
    if (interactive && sel.ability) {
      var left = sel.needed - sel.chosen.length;
      hint =
        sel.needed === 0
          ? 'Resolving...'
          : left > 0
            ? 'Select <b>' + left + '</b> target' + (left > 1 ? 's' : '')
            : 'Confirming...';
    }

    var choices = '';
    if (interactive && sel.ability && sel.ability.spec && sel.ability.spec.choose) {
      choices = '<div class="dk-choices">';
      sel.ability.spec.choose.forEach(function (c, i) {
        choices +=
          '<button class="dk-choice' +
          (sel.choose === i ? ' sel' : '') +
          '" data-choice="' +
          i +
          '"><i data-icon-domain="game" class="ra ' +
          (c.icon || 'ra-sword') +
          '"></i>' +
          esc(c.label) +
          '</button>';
      });
      choices += '</div>';
    }

    fly.innerHTML =
      '<div class="dk-head">' +
      /* The portrait plate shows the hero's assigned ra glyph, not the
         art: at this size the art read as texture while the icon is what
         already identifies the hero on the card, in the collection and
         in the prep tip. The plate is square now that nothing portrait-
         shaped needs to sit in it. */
      '<div class="dk-portrait" style="--fc-primary:' +
      u.faction.colors.primary +
      '"><i data-icon-domain="game" class="ra ' +
      u.card.icon +
      '"></i></div>' +
      '<div class="dk-id">' +
      '<div class="dk-name">' +
      esc(u.name) +
      '</div>' +
      '<div class="dk-meta">' +
      '<span>' +
      esc(u.role) +
      '</span>' +
      '<span style="color:' +
      (ELEMENT_COLOR[u.element] || '#fff') +
      '">' +
      esc(u.element) +
      '</span>' +
      '</div>' +
      '<div class="dk-pos">' +
      esc(u.faction.name) +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dk-stats">' +
      statLine(
        'ra-health',
        'HP',
        /* ROUND, DO NOT CEIL. Math.ceil turned 29.01% into "30%", which
           put the displayed number inside Goldilocks' 30-70% window
           while the engine (correctly) read 29.01% and withheld the
           bonus - the card said the trigger should fire and it did not.
           Rounding is off by at most half a point and never crosses a
           threshold the engine has not also crossed. */
        Math.max(0, Math.round((u.hp / u.maxHp) * 100)) + '%',
        (u.hp / u.maxHp) * 100,
        '#ff5f7e'
      ) +
      statLine(
        'ra-sword',
        'ATK',
        E.atkOf(u),
        Math.min(100, (E.atkOf(u) / statMax().atk) * 100),
        '#ffb347'
      ) +
      statLine(
        'ra-shield',
        'DEF',
        E.defOf(u) + '%',
        Math.min(100, (E.defOf(u) / statMax().def) * 100),
        '#5fb2ff'
      ) +
      (u.shield > 0
        ? statLine(
            'ra-round-shield',
            'SHD',
            u.shield,
            Math.min(100, (u.shield / u.maxHp) * 100),
            '#9fd8ff'
          )
        : '') +
      '</div>' +
      '<div class="dk-abs">' +
      abilityRowHTML(u, sig, true, interactive, 0) +
      abilityRowHTML(u, role, false, interactive, 1) +
      '</div>' +
      statusListHTML(u) +
      choices +
      /* THE LOCKOUT NOTE moved off the card (playtest 2026-08-10: the
         on-card strip covered the art). It now sits at the FOOT of the
         hover panel, under everything else it explains. */
      (u.side === 'player' && unitLockMsg(u)
        ? '<div class="dk-lock"><i class="ri-lock-2-line"></i><span>' +
          esc(unitLockMsg(u)) +
          '</span></div>'
        : '') +
      (hint ? '<div class="dk-hint">' + hint + '</div>' : '');

    /* allies dock left, enemies dock right - the panel sits on the
       same side as the team it describes */
    fly.classList.toggle('right', u.side === 'enemy');
    fly.classList.toggle('locked', locked);
    fly.dataset.rarity = u.card.rarity;
    // mark a fresh unit so the whole panel animates in as one piece
    if (fresh) {
      fly.classList.remove('swap');
      void fly.offsetWidth;
      fly.classList.add('swap');
      // drop the class once it's done so a later rebuild of the SAME hero
      // (e.g. hover -> click) doesn't leave it armed and replay
      clearTimeout(swapTimer);
      swapTimer = setTimeout(function () {
        fly.classList.remove('swap');
      }, 280);
    }
    fly.classList.add('show');
    /* Measure AFTER the content is in and 'show' has removed
       visibility:hidden, or offsetHeight reads 0 and the panel
       anchors to the wrong place on the first hover of a card. */
    positionDock(u.uid);
    /* Deferred a frame: the panel is mid grow-transform, and
       getBoundingClientRect reports the SCALED width, so measuring
       right now under-sizes the row and clips long Skill names. */
    requestAnimationFrame(function () {
      fitAbilityNames(fly);
    });

    fly.querySelectorAll('.dk-ab.act[data-ab]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var which = parseInt(btn.dataset.ab, 10);
        chooseAbility(u, which === 0 ? sig : role);
      });
    });
    /* hovering ANY Skill row previews its targets, including rows that
       are not currently clickable - seeing who a locked Skill would hit
       is exactly the planning information the player wants */
    fly.querySelectorAll('.dk-ab').forEach(function (row, i) {
      var ab = i === 0 ? sig : role;
      if (!ab || ab.type !== 'Active') return;
      /* A Skill that cannot be used does not preview. Highlighting
         targets for a Skill the player cannot cast implies it is
         available and invites a click that does nothing. */
      if (row.classList.contains('dis')) return;
      row.addEventListener('mouseenter', function () {
        if (sel && sel.ability) return; // a live selection wins
        paintPreview(u, ab, sel ? sel.choose : 0);
      });
      row.addEventListener('mouseleave', function () {
        /* Clicking a Skill rebuilds the dock. The old hovered row then
           emits mouseleave; blindly clearing here erased the damage chips
           paintSelection had just created for the CLICKED selection. A
           committed selection always wins over the transient hover. */
        if (sel && sel.ability) paintSelection();
        else clearPreview();
      });
    });
    fly.querySelectorAll('.dk-choice').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        sel.choose = parseInt(btn.dataset.choice, 10);
        paintDock();
      });
    });
  }

  /* EXPAND OUT OF THE CARD, NOT OFF TO ONE SIDE.
     -------------------------------------------------------------
     The panel used to dock in the margin beside the board. There is
     no margin width that works everywhere: wide screens left it
     stranded far from the card, narrow ones had nowhere to put it,
     and on the prep grids it covered the very cards being compared.

     So it now grows out of the hovered card itself, the way the
     battlefield pill grows, and layers over its neighbours. The card
     is always where the player is already looking, and the anchor is
     the card's own rectangle, so it is correct at every screen size
     by construction rather than by tuning.

     Clamped to the board so it can never open off-screen. */
  /* DOCK TO THE SIDE OF THE BOARD.
     -------------------------------------------------------------
     Expanding out of the card was tried and rejected: on a dense
     6v6 board the panel swallowed the neighbours you were comparing
     against, which is the opposite of useful.

     So it returns to the margins - your team's panel on the left,
     the enemy's on the right - which is where there is genuinely
     free space on this layout, and which keeps every card visible
     while you read one. Vertically it tracks the hovered card so
     the eye does not have to travel, clamped inside the board. */
  function positionDock(anchorUid) {
    var fly = $('flyout');
    if (!fly) return;
    var board = $('board');
    var card = anchorUid ? document.querySelector('.bcard[data-uid="' + anchorUid + '"]') : null;
    if (!board) return;

    fly.style.left = '';
    fly.style.top = '';
    if (!card) return;

    var b = board.getBoundingClientRect();
    var h = fly.offsetHeight || 300;
    var PAD = 10;
    /* board rect is screen px under GUI scale; the assignment is layout
       px (fly sits inside the board) */
    var bh = b.height / uiS();

    /* Always vertically centred on the BOARD, never on the hovered card.
       Tracking the card's row made the panel jump to a different height
       for every row, which reads as the panel moving around rather than
       as a stable place to look. */
    var top = (bh - h) / 2;
    top = Math.max(PAD, Math.min(top, bh - h - PAD));
    fly.style.top = top + 'px';
  }

  function chooseAbility(u, ability) {
    /* THE SCRIPTED MATCH: refuse anything but the line's cast. */
    var mvA = scriptMove();
    if (mvA && mvA.side === 'player' && !mvA.pass) {
      var wanted = scriptAbilityOf(mvA, u);
      var same =
        u.card.id === mvA.unit &&
        (ability === wanted ||
          (!!ability.basic === !!wanted.basic && ability.name === wanted.name));
      if (!same) {
        scriptDeny('The Recruiter shakes his head - follow the marked move');
        return;
      }
    }
    sel = { unit: u, ability: ability, needed: E.pickCount(ability), chosen: [], choose: 0 };

    // Robin Hood auto-locks his target
    var forced = E.forcedTarget(B, u, ability);
    if (forced && sel.needed === 1) {
      sel.chosen = [forced];
    }

    paintDock();
    paintSelection();

    if (sel.needed === 0) {
      // no target needed - fire immediately
      commit();
    } else if (sel.chosen.length === sel.needed) {
      commit();
    }
  }

  function onCardClick(u) {
    /* Inspection stays available even when it is not your action and
       even after the battle ends - reading a hero's statuses is not a
       move. Only TARGETING is gated below. */
    if (busy) return;

    var myTurn = !B.over && B.turn === 'player';
    /* doing things dismisses a lingering YOUR TURN caption */
    if (myTurn) cineCutTurn();
    var targeting = myTurn && !!(sel && sel.ability && sel.needed > 0);

    // picking a target for a pending ability
    if (targeting) {
      /* A corpse is never a legal target, and clicking one must not
         tear down the pending pick either - it stays inspect-by-hover
         only until the selection resolves. */
      if (!u.alive) return;
      var pool = E.legalTargets(B, sel.unit, sel.ability);
      var forced = E.forcedTarget(B, sel.unit, sel.ability);
      if (forced) pool = [forced];
      /* THE SCRIPTED MATCH: the line names the victims. A target that
         was rules-legal but not the instructed one re-speaks that line;
         never send this tutorial correction to the easy-to-miss toast. */
      var mvT = scriptMove();
      if (mvT && mvT.side === 'player' && !mvT.pass && mvT.targets) {
        var rulesLegal = pool.some(function (x) {
          return x.uid === u.uid;
        });
        pool = pool.filter(function (x) {
          return mvT.targets.some(function (t) {
            return t.side === x.side && t.id === x.card.id;
          });
        });
        if (
          rulesLegal &&
          !pool.some(function (x) {
            return x.uid === u.uid;
          })
        ) {
          scriptDeny('The Recruiter taps the marked target');
          return;
        }
      }
      if (
        pool.some(function (x) {
          return x.uid === u.uid;
        })
      ) {
        if (
          sel.chosen.some(function (x) {
            return x.uid === u.uid;
          })
        ) {
          sel.chosen = sel.chosen.filter(function (x) {
            return x.uid !== u.uid;
          });
        } else {
          sel.chosen.push(u);
        }
        paintSelection();
        paintDock();
        if (sel.chosen.length === sel.needed) commit();
        return;
      }
    }

    /* ANY card can be opened, including the enemy's.
       Statuses now live in the panel, so being unable to open an
       opposing hero meant there was no way to read what is on them -
       exactly the information you need to decide a play. Opening an
       enemy is view-only: their Skills never become clickable,
       because `interactive` in paintDock still demands the hero be
       yours, unacted and on your turn. */
    /* A dead hero can be opened but never helm an action: alive joins
       the same gates that already keep enemy and already-acted heroes
       strictly read-only. */
    // Toggle/deselect if clicking the currently selected/viewed card
    if (sel && sel.unit && sel.unit.uid === u.uid && !targeting) {
      clearSel();
      return;
    }

    var viewOnly = u.side !== 'player' || !u.alive || !myTurn || !!B.acted.player[u.uid];
    /* THE SCRIPTED MATCH: other heroes stay inspectable, but only the
       line's unit may take the action. */
    var mvU = scriptMove();
    if (!viewOnly && mvU && mvU.side === 'player') {
      if (mvU.pass) {
        viewOnly = true;
        scriptDeny('The Recruiter points at the Pass button - hoarding is also a move');
      } else if (u.card.id !== mvU.unit) {
        viewOnly = true;
        scriptDeny('The Recruiter points at the marked legend');
      }
    }
    sel = { unit: u, ability: null, needed: 0, chosen: [], choose: 0, view: viewOnly };
    paintDock();
    paintSelection();
  }

  function commit() {
    var s = sel;
    if (!s || !s.ability) return;
    stopClock();
    var mark = B.log.length;
    /* pre-cast facts for the campaign's reaction layer */
    var foesPre = B.units.filter(function (u) {
      return u.side === 'enemy' && u.alive;
    });
    var res = E.useAbility(B, s.unit, s.ability, s.chosen, s.choose);
    if (!res.ok) {
      toast('Cannot use that: ' + res.reason);
      return;
    }
    /* THE SCRIPTED MATCH: the line's player move just resolved. Read
       the RAW script here - on the killing blow B.over is already
       true and scriptMove() would refuse, stranding the final index
       unconsumed. */
    var mvC =
      moveScript && moveScript.i < moveScript.moves.length ? moveScript.moves[moveScript.i] : null;
    if (mvC && mvC.side === 'player' && !mvC.pass && s.unit.card.id === mvC.unit) {
      scriptAdvance();
    }
    /* CAMPAIGN: the Recruiter REACTS to free play (post-handoff gate 1).
       Observational only - the campaign can bark, never touch the board. */
    if (B.campaignStage && window.EOL.campaign && window.EOL.campaign.onPlayerAction) {
      try {
        window.EOL.campaign.onPlayerAction(B, {
          sig: !s.ability.basic,
          role: s.unit.role,
          killedRoles: foesPre
            .filter(function (u) {
              return !u.alive;
            })
            .map(function (u) {
              return u.role;
            }),
        });
      } catch (e) {
        /* lore never breaks a fight */
      }
    }
    /* Put the move on the wire BEFORE the animations play. The other
       client needs the whole action-time to render it, and the engine
       has already resolved it here, so sending now costs nothing and
       buys the opponent a head start. */
    if (netCtl)
      netCtl.onLocal({
        unit: s.unit,
        ability: s.ability,
        chosen: s.chosen,
        choose: s.choose,
      });
    clearSel();
    hideTip();

    /* NO SPOILERS ON THE BARGAIN (user note 2026-08-09): a coin flip
       must land BEFORE the board repaints - render() used to run
       first, so the HP bars and status chips announced heads or tails
       while the coin was still in the air. The flip now plays over the
       pre-cast board; the reveal happens when it settles. */
    var coin = B.log.slice(mark).filter(function (l) {
      return l.type === 'coin';
    })[0];
    if (coin) {
      busy = true;
      document.body.dataset.busy = '1';
      var coinHold = playCoinFlip(
        coin.meta.coin,
        coin.meta.coin === 'heads'
          ? s.unit.name + ' returns to full HP and Energy'
          : s.unit.name + ' is reduced to 1 HP'
      );
      setTimeout(function () {
        render();
        var h2 = flashRecent();
        setTimeout(function () {
          busy = false;
          document.body.dataset.busy = '0';
          render();
          afterPlayerAction();
        }, h2 || 0);
      }, coinHold);
      return;
    }
    render();

    /* Wait for the board to finish animating before control moves on.
       flashRecent() now returns the FULL length of everything it just
       scheduled (strikes, floating numbers, deaths, revives), not just
       resurrections - so a killing blow plays out completely before
       endBattle() can draw Victory over the top of it. */
    var hold = flashRecent();
    busy = true;
    document.body.dataset.busy = '1';
    setTimeout(function () {
      busy = false;
      document.body.dataset.busy = '0';
      render();
      afterPlayerAction();
    }, hold);
  }

  function clearSel() {
    sel = null;
    paintSelection();
    paintDock();
  }

  /* ---------------------------------------------------------
     Auto end-turn countdown
     When the player has no legal moves left we don't end the turn
     outright - the End Turn button fills over 5s and the player can
     click it to go immediately.
     --------------------------------------------------------- */
  var AUTO_MS = 5000;
  var autoRaf = null,
    autoStart = 0;

  function cancelAuto() {
    if (autoRaf) {
      cancelAnimationFrame(autoRaf);
      autoRaf = null;
    }
    var btn = $('btn-endturn');
    if (btn) {
      btn.classList.remove('counting');
      btn.style.setProperty('--fill', '0%');
      var lbl = btn.querySelector('.et-count');
      if (lbl) lbl.textContent = '';
    }
  }

  function startAuto() {
    cancelAuto();
    var btn = $('btn-endturn');
    if (!btn || btn.disabled) return;
    btn.classList.add('counting');
    autoStart = performance.now();

    function frame(now) {
      if (B.over || B.turn !== 'player') {
        cancelAuto();
        return;
      }
      var t = Math.min(1, (now - autoStart) / AUTO_MS);
      btn.style.setProperty('--fill', (t * 100).toFixed(1) + '%');
      var lbl = btn.querySelector('.et-count');
      if (lbl) lbl.textContent = Math.ceil(((1 - t) * AUTO_MS) / 1000) + 's';
      if (t >= 1) {
        cancelAuto();
        endTurn();
        return;
      }
      autoRaf = requestAnimationFrame(frame);
    }
    autoRaf = requestAnimationFrame(frame);
  }

  /* Player's window: banner the handover and start the bot pondering;
     if the player has no legal action left they must pass, so the End
     Turn button fills over 5s and passes for them. */
  function maybeAutoEndTurn() {
    if (B.over || B.turn !== 'player') return;
    announceTurn('player');
    ponderKick();
    startClock('player');
    if (!E.canAct(B, 'player')) startAuto();
  }

  /* =============================================================
     TURN CLOCK
     -------------------------------------------------------------
     30 seconds per action. When YOUR clock expires you pass, which
     is always a legal move and never loses the game outright. When
     THEIR clock expires we do not act on it - only the player whose
     turn it is may pass themselves, or the two clients would
     disagree about the action stream and desync. Their clock is
     shown purely so you know they are on one too.

     Online it was born to stop a stalling opponent; solo it now
     guards the player's window too (user request 2026-08-04) - the
     deadline keeps a single-player game moving, and an expiry still
     only ever PASSES, never acts. The bot's own clock stays hidden:
     it answers inside a second, so a 30s dial for it is pure noise.
     ============================================================= */
  var TURN_MS = 30000;
  var clockRaf = null;
  var clockIv = null; // background-tab watchdog (see startClock)
  var clockEnd = 0;
  var clockSide = null;

  function clockEl() {
    return $('turn-clock');
  }

  function stopClock() {
    if (clockRaf) {
      cancelAnimationFrame(clockRaf);
      clockRaf = null;
    }
    if (clockIv) {
      clearInterval(clockIv);
      clockIv = null;
    }
    clockSide = null;
    document.body.classList.remove('time-low');
    var el = clockEl();
    if (el) {
      /* Session 25: the dial NEVER leaves the top bar (its hole used to
         shift the round block off-centre every time it hid). Stopping
         just parks it in the idle state: full quiet ring, no numeral. */
      el.hidden = false;
      el.classList.remove('warn', 'crit', 'theirs');
      el.classList.add('idle');
      var num = $('tc-num');
      if (num) num.textContent = '';
      var fill = $('tc-fill');
      if (fill) fill.style.strokeDashoffset = 0;
    }
  }

  function startClock(side) {
    /* Solo guards the player's window only - the bot moves instantly,
       so its dial parks in idle instead (expiry must never act). */
    if (!netCtl && side !== 'player') {
      stopClock();
      return;
    }
    var el = clockEl();
    if (!el || !B || B.over) return;
    clockSide = side;
    clockEnd = performance.now() + TURN_MS;
    el.hidden = false;
    el.classList.remove('idle');
    el.classList.toggle('theirs', side !== 'player');

    var fill = $('tc-fill');
    var num = $('tc-num');
    var CIRC = 106.8;

    function frame(now, fromIv) {
      if (!B || B.over || clockSide !== side) {
        stopClock();
        return;
      }
      /* A coach overlay freezes the player's dial: reading an
         explanation must never cost your action. The deadline is
         re-armed each frame it is open, so closing the overlay hands
         back a full window. CAMPAIGN battles freeze it entirely - the
         Road is a school, and the tutorial SAYS the clock is for show
         there (data/campaign-ch1.js round-1 lesson), so it must be. It
         still ticks visually in ranked/solo wars as before. */
      if (
        side === 'player' &&
        ((window.EOL.coach && window.EOL.coach.open()) || scriptActive() || (B && B.campaignStage))
      ) {
        clockEnd = performance.now() + TURN_MS;
        if (num) num.textContent = Math.ceil(TURN_MS / 1000);
        clockRaf = requestAnimationFrame(function (t) {
          frame(t);
        });
        return;
      }
      var left = Math.max(0, clockEnd - now);
      var secs = Math.ceil(left / 1000);
      if (num) num.textContent = secs;
      if (fill) fill.style.strokeDashoffset = CIRC * (1 - left / TURN_MS);
      el.classList.toggle('warn', secs <= 10 && secs > 5);
      el.classList.toggle('crit', secs <= 5);
      /* Full-screen red heartbeat for the last 10 seconds of YOUR OWN
         turn. The 34px clock dial is easy to miss while reading the
         board, and running out of time silently passes the turn. Never
         fires on the opponent's clock - their timer is information, not
         a call to act. */
      document.body.classList.toggle('time-low', side === 'player' && secs <= 10 && left > 0);
      if (left <= 0) {
        stopClock();
        /* Only ever force OUR OWN pass. Acting on the opponent's
           expiry would inject an action they never sent and the two
           boards would diverge. */
        if (side === 'player' && !busy && !B.over && B.turn === 'player') {
          toast('Out of time - passing', 'ri-timer-line');
          endTurn();
        }
        return;
      }
      /* Only the rAF path continues the rAF chain - the watchdog below
         also calls this, and letting each of those calls schedule
         another rAF would compound into parallel chains. */
      if (!fromIv)
        clockRaf = requestAnimationFrame(function (t) {
          frame(t);
        });
    }
    clockRaf = requestAnimationFrame(function (t) {
      frame(t);
    });
    /* Keep honest time in a BACKGROUNDED tab. rAF pauses there, which
       used to freeze the dial for the player and quietly suspend the
       expiry: alt-tabbing out of an online match was a free stall, and
       a headless/secondary page never ticked at all (the turn timer
       must always be visible and always tell the truth - Session 25
       law). A coarse interval re-runs the same frame; it recomputes
       from the absolute deadline, so it can never drift, and Chrome's
       ~1s clamp on background intervals is plenty for a 30s dial. */
    if (clockIv) clearInterval(clockIv);
    clockIv = setInterval(function () {
      if (clockSide === side) frame(performance.now(), true);
    }, 250);
  }

  /* =============================================================
     FORFEIT
     -------------------------------------------------------------
     Two-step: the first click arms the button, the second confirms.
     A single mis-click must never end an online match. It disarms
     itself after a few seconds and on any click elsewhere.
     ============================================================= */
  var forfeitArmed = false;
  var forfeitTimer = null;

  function disarmForfeit() {
    forfeitArmed = false;
    clearTimeout(forfeitTimer);
    var b = $('btn-forfeit');
    if (b) {
      b.classList.remove('arm');
      var lbl = b.querySelector('span');
      if (lbl) lbl.textContent = 'Forfeit';
    }
  }

  function onForfeit() {
    var b = $('btn-forfeit');
    if (!b || !B || B.over) return;
    if (!forfeitArmed) {
      forfeitArmed = true;
      b.classList.add('arm');
      var lbl = b.querySelector('span');
      if (lbl) lbl.textContent = 'Confirm?';
      clearTimeout(forfeitTimer);
      forfeitTimer = setTimeout(disarmForfeit, 4000);
      return;
    }
    disarmForfeit();
    stopClock();
    /* Tell the opponent first - if we tear down the channel before
       sending, they sit waiting for a move that will never come. */
    if (netCtl && netCtl.forfeit) netCtl.forfeit();
    B.over = true;
    B.winner = 'enemy';
    render();
    endBattle();
  }

  /* ---------------------------------------------------------
     PONDERING - the bot keeps thinking during the player's window
     -------------------------------------------------------------
     Stockfish-style pondering. A live decision is always made at
     depth 4 minimum, but while the player is deciding, the bot
     predicts the likeliest player actions (its own top heuristic
     picks, plus a pass - the only move when the player can't act, so
     that branch always lands), applies each one on a throwaway clone,
     and re-searches the resulting positions at growing depth, from
     PONDER_MIN_DEPTH up to PONDER_MAX_DEPTH. Breadth-first: every
     branch reaches a depth before any branch climbs higher, and each
     pass runs in its own macrotask so the board never freezes.

     A pondered move only counts when the position that actually
     arrives matches the position that was searched. rng-driven
     variance on the player's real action (crits, coin flips, burn
     ticks at a round rollover) can leave the states diverged - the
     state key comparison catches that, and the bot simply thinks
     live at depth 4 exactly as it always has. */
  var PONDER_MIN_DEPTH = 4;
  var PONDER_MAX_DEPTH = 8;
  var PONDER_BUDGET_MS = 1600; // total compute per player window
  var PONDER_GAP_MS = 90; // breathing room between deep passes
  var ponder = null; // live pondering session
  var ponderTimer = null;
  /* Diagnostics: how often the arriving position is one pondering
     searched. Exposed as EOL.battle.ponderStats() for tuning.
     misses are simply decisions - hits. */
  var ponderStats = { kicks: 0, decisions: 0, hits: 0, lastDepth: 0 };

  function ponderCancel() {
    if (ponderTimer) {
      clearTimeout(ponderTimer);
      ponderTimer = null;
    }
    if (ponder) ponder.cancelled = true;
    ponder = null;
  }

  /* A position fingerprint. Matches between the live battle and a
     pondered clone exactly when the player took the predicted action
     AND its outcome rolled no variance (cloneUnit preserves field
     order, so serialized buffs/pending align). */
  function stateKey(S) {
    var actedP = Object.keys(S.acted.player).sort().join(',');
    var actedE = Object.keys(S.acted.enemy).sort().join(',');
    var costM = ['player', 'enemy']
      .map(function (s) {
        return (S.costMods[s] || [])
          .map(function (m) {
            return (m.flat || 0) + '/' + (m.pct || 0) + '/' + m.turns;
          })
          .join(',');
      })
      .join('|');
    var units = S.units
      .map(function (u) {
        var bf = (u.buffs || [])
          .map(function (b) {
            return (
              (b.stat || '') +
              (b.amt != null ? b.amt : '') +
              ':' +
              b.turns +
              (b.tag ? '#' + b.tag : '')
            );
          })
          .sort()
          .join(',');
        var fl = [];
        for (var k in u.flags) if (u.flags[k]) fl.push(k + '=' + u.flags[k]);
        var pd = (u.pending || [])
          .map(function (p) {
            return p.tag + ':' + p.turns;
          })
          .join(',');
        return [
          u.uid,
          u.alive ? 1 : 0,
          Math.round(u.hp),
          Math.round(u.shield),
          bf,
          fl.sort().join(','),
          pd,
        ].join('|');
      })
      .join(';');
    return [
      S.round,
      S.turn,
      S.energy.player,
      S.energy.enemy,
      S.passed.player ? 1 : 0,
      S.passed.enemy ? 1 : 0,
      S.turnPassed.player ? 1 : 0,
      S.turnPassed.enemy ? 1 : 0,
      actedP,
      actedE,
      costM,
      units,
    ].join('#');
  }

  /* Map an action described against one battle onto its twin in a
     clone (units matched by uid) - mirrors the AI's own rebind. */
  function ponderRebind(C, act) {
    var byUid = {};
    C.units.forEach(function (u) {
      byUid[u.uid] = u;
    });
    var unit = byUid[act.unit.uid];
    if (!unit) return null;
    var ability = act.ability.basic ? E.roleAbility(unit) : unit.card.ability;
    var chosen = (act.chosen || [])
      .map(function (t) {
        return byUid[t.uid];
      })
      .filter(Boolean);
    if ((act.chosen || []).length !== chosen.length) return null;
    return { unit: unit, ability: ability, chosen: chosen, choose: act.choose };
  }

  /* Play the predicted player action on the clone and advance the
     clock until the enemy is to move. False when the branch leads
     somewhere the bot doesn't act next. */
  function ponderApply(C, p) {
    if (p.pass) {
      E.passTurn(C, 'player');
    } else {
      var bound = ponderRebind(C, p.act);
      if (!bound) return false;
      var r = E.useAbility(C, bound.unit, bound.ability, bound.chosen, bound.choose);
      if (!r.ok) return false;
    }
    var n = C.over ? null : E.advanceAction(C);
    var guard = 0;
    while (!C.over && !n && guard++ < 24) {
      E.nextRound(C);
      if (!C.over) n = E.advanceAction(C);
    }
    return n === 'enemy' && !C.over;
  }

  function ponderKick() {
    ponderCancel();
    if (!B || B.over || B.turn !== 'player') return;
    /* A Daily certificate is authored against the normal full depth-4
       response. Do not replace that exact opponent with the optional
       depth-5–8 ponder path or a proven line could change after publish. */
    if (B.puzzle) return;
    /* THE SCRIPTED MATCH: pondering is parked entirely. bestAction()
       draws a seed from B.rng, and one background search would knock
       the pre-computed line off its dice. */
    if (scriptActive()) return;
    /* Nothing to ponder in a match: the opponent is a person, and
       burning two cores guessing their move would only make the local
       board stutter while they type. */
    if (netCtl) return;

    var preds = [];
    if (!E.canAct(B, 'player')) {
      preds.push({ pass: true }); // the only move - a free hit
    } else {
      var cand = AI.candidates(B, 'player').sort(function (a, b) {
        return b.score - a.score;
      });
      var seen = {};
      for (var i = 0; i < cand.length && preds.length < 3; i++) {
        var c = cand[i];
        var id =
          c.unit.uid +
          '|' +
          c.ability.name +
          '|' +
          (c.chosen || [])
            .map(function (t) {
              return t.uid;
            })
            .join(',') +
          '|' +
          (c.choose || 0);
        if (seen[id]) continue;
        seen[id] = true;
        preds.push({ act: c });
      }
      preds.push({ pass: true }); // voluntary-pass hedge
    }

    var session = { t0: performance.now(), cancelled: false, branches: [] };
    preds.forEach(function (p) {
      var C = E.cloneBattle(B, Math.random);
      if (!ponderApply(C, p)) return;
      session.branches.push({ C: C, key: stateKey(C), depth: 0, move: null });
    });
    if (!session.branches.length) return;

    // predictions that land on the same position collapse into one
    var uniq = {};
    session.branches = session.branches.filter(function (b) {
      if (uniq[b.key]) return false;
      uniq[b.key] = true;
      return true;
    });

    ponder = session;
    ponderStats.kicks++;
    ponderTimer = setTimeout(function () {
      ponderStep(session, PONDER_MIN_DEPTH, 0);
    }, PONDER_GAP_MS);
  }

  function ponderOnce(br, d) {
    try {
      AI.setDepth(d);
      var act = AI.bestAction(br.C, 'enemy');
      AI.resetDepth();
      return act || true; // a null (pass) result needs no deeper passes
    } catch (e) {
      AI.resetDepth();
      return null; // scrap this branch
    }
  }

  function ponderStep(session, d, i) {
    if (!ponder || ponder !== session || session.cancelled) return;
    if (d > PONDER_MAX_DEPTH) return;
    if (performance.now() - session.t0 > PONDER_BUDGET_MS) return;

    var br = session.branches[i];
    var act = ponderOnce(br, d);
    if (act === null) {
      session.branches.splice(i, 1);
      if (!session.branches.length) {
        ponderCancel();
        return;
      }
      ponderSchedule(session, d, i); // same slot: the next branch
      return;
    }
    br.depth = d;
    if (act === true) {
      /* deeper search decided passing is best: honour that, but keep a
         move stored by an earlier pass - it stays the fallback plan
         for this very position (it was legal there by construction). */
      br.passed = true;
    } else {
      br.passed = false;
      br.move = {
        uid: act.unit.uid,
        basic: !!act.ability.basic,
        name: act.ability.name,
        chosen: (act.chosen || []).map(function (t) {
          return t.uid;
        }),
        choose: act.choose || 0,
      };
    }
    ponderSchedule(session, d, i + 1);
  }

  function ponderSchedule(session, d, i) {
    if (performance.now() - session.t0 > PONDER_BUDGET_MS) return;
    var nd = d,
      ni = i;
    if (ni >= session.branches.length) {
      nd = d + 1;
      ni = 0; // everyone has depth d - climb
      if (nd > PONDER_MAX_DEPTH) return;
    }
    ponderTimer = setTimeout(function () {
      ponderStep(session, nd, ni);
    }, PONDER_GAP_MS);
  }

  /* Pull a pondered move if the arriving position matches a searched
     one. Any irregularity and the caller falls back to the live
     depth-4 search - pondering can only ever upgrade a decision. */
  function ponderAction() {
    if (!ponder) return null;
    var key = stateKey(B);
    var br = null;
    for (var i = 0; i < ponder.branches.length; i++) {
      var b = ponder.branches[i];
      if (b.depth >= PONDER_MIN_DEPTH && b.key === key) {
        br = b;
        break;
      }
    }
    if (!br) return null;
    /* the search itself ruled passing best on this exact position -
       no need to burn the live search just to agree */
    if (!br.move) {
      if (br.passed) {
        ponderStats.hits++;
        return { pass: true };
      }
      return null;
    }

    var unit = null;
    B.units.forEach(function (u) {
      if (u.uid === br.move.uid) unit = u;
    });
    if (!unit || !unit.alive || unit.side !== 'enemy') return null;
    if (B.acted.enemy[unit.uid]) return null;

    var ability = br.move.basic ? E.roleAbility(unit) : unit.card.ability;
    if (!ability || ability.name !== br.move.name) return null;
    if (!E.canUse(B, unit, ability)) return null;

    var chosen = br.move.chosen
      .map(function (uid) {
        var t = null;
        B.units.forEach(function (u) {
          if (u.uid === uid) t = u;
        });
        return t;
      })
      .filter(Boolean);
    if (chosen.length !== br.move.chosen.length) return null;

    var need = E.pickCount(ability);
    if (need !== chosen.length) return null;
    if (need > 0) {
      var pool = E.legalTargets(B, unit, ability);
      var forced = E.forcedTarget(B, unit, ability);
      if (forced) pool = [forced];
      var legal = chosen.every(function (t) {
        return pool.some(function (p) {
          return p.uid === t.uid;
        });
      });
      if (!legal) return null;
    }
    ponderStats.hits++;
    ponderStats.lastDepth = br.depth;
    return {
      unit: unit,
      ability: ability,
      targets: chosen,
      chosen: chosen,
      choose: br.move.choose,
    };
  }

  /* A live opponent thinks at human speed, so the board says so
     explicitly rather than just sitting still with input disabled. */
  function setNetWait(on) {
    document.body.dataset.netwait = on ? '1' : '0';
    var tl = $('turn-label');
    if (tl && on) tl.textContent = 'Opponent is thinking...';
  }

  /* THE BATTLEFIELD PILL GROWS TO FIT ITS TEXT.
     -------------------------------------------------------------
     The expanded height was measured against a 320px box, but the
     body sits inside 15px of padding on each side, so it really
     wraps at 290px. Measuring 30px too wide under-counts the lines
     and the last rule of a wordy field (the Blood Battlefield, the
     Ancient Ruins) was clipped off the bottom.

     Measure at the REAL content width, and read the panel's own
     offsetTop instead of assuming the 34px header, so a future
     header change cannot silently reintroduce the clipping. */
  function sizeFieldChip() {
    var chip = $('bf-chip');
    var pop = $('bf-chip-pop');
    if (!chip || !pop || chip.hidden) return;
    var cs = getComputedStyle(pop);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    var inner = 320 - 15 - 15 - padL - padR; // panel width minus its insets
    var prev = pop.style.width;
    pop.style.width = inner + 'px';
    var h = pop.scrollHeight;
    pop.style.width = prev;
    var top = pop.offsetTop || 34;
    chip.style.setProperty('--bfh', Math.ceil(top + h + 8) + 'px');
  }

  /* ---------------------------------------------------------
     turn flow
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     ALTERNATING-ACTION FLOW
     -------------------------------------------------------------
     One ability = one action, then control passes. After the player
     acts we hand the clock to the engine: if it comes back 'enemy' the
     bot takes exactly one action and hands back; if the round is spent
     it rolls over.
     --------------------------------------------------------- */

  /* Called after the player resolves a single action. */
  /* ADVANCE, AND SAY WHAT HAPPENED.
     -------------------------------------------------------------
     `advanceAction` silently auto-passes any side with nothing legal
     left - most often because it cannot afford anything. That was
     invisible: the turn would jump back to you with no banner, or
     the enemy would appear to take two turns in a row, and the whole
     exchange read as broken rather than as a rule.

     This wraps the call so a forced pass is ANNOUNCED. It returns the
     side to act, exactly as advanceAction does. */
  /* Advance to the next actor, then IMMEDIATELY play whatever the
     handoff itself produced before the next side is allowed to act.
     Burn ticks resolve inside advanceAction (setTurn), and their log
     entries used to sit orphaned until some LATER flashRecent picked
     them up - so a burn's floating number either never appeared, or
     dumped a full action late inside someone else's replay, and a
     LETHAL tick skipped its damage text entirely as endBattle drew
     over the board ("Burn doesn't show any damage text, even when
     killing"). cb receives the next actor once every tick FX has run
     its course. */
  function advanceAndReport(cb) {
    var wasOut = { player: B.passed.player, enemy: B.passed.enemy };
    var nxt = E.advanceAction(B);
    var tickHold = flashRecent();
    ['player', 'enemy'].forEach(function (sd) {
      if (B.passed[sd] && !wasOut[sd]) {
        /* Newly locked out for the round. Name the reason, because
           "no targets" (an Untargetable straggler), "no Energy" and
           "nothing left to do" feel very different to a player deciding
           whether they misplayed. The engine diagnoses precisely. */
        var reason = E.whyCantAct(B, sd);
        cine(
          sd === 'player' ? 'NO ACTIONS LEFT' : 'ENEMY HAS NO ACTIONS',
          reason === 'energy'
            ? 'Not enough Energy'
            : reason === 'targets'
              ? 'No available targets'
              : reason === 'skills'
                ? 'No skills available'
                : 'Every legend has acted',
          sd,
          1100,
          true
        );
      }
    });
    if (!tickHold) return cb(nxt);
    busy = true;
    document.body.dataset.busy = '1';
    setTimeout(function () {
      busy = false;
      document.body.dataset.busy = '0';
      if (!B) return; // the player bailed mid-tick
      render();
      cb(nxt);
    }, tickHold);
  }

  function afterPlayerAction() {
    if (B.over) return endBattle();
    advanceAndReport(function (nxt) {
      /* The handoff's own tick can end the battle (a lethal Burn
         crossing) - its number and fall just played, now the result. */
      if (B.over) return endBattle();
      if (!nxt) {
        startNextRound();
        return;
      }
      if (nxt === 'enemy') {
        render();
        /* Announce the handover NOW, not when the opponent finally
           moves. Against a person that wait can be many seconds, and
           the board previously sat silent the whole time looking
           frozen. */
        announceTurn('enemy');
        startClock('enemy');
        runEnemyAction();
        return;
      }
      // still the player's action (the enemy passed or has no actions)
      clearSel();
      render();
      announceTurn('player');
      maybeAutoEndTurn();
    });
  }

  /* "Pass" skips ONLY this action (2026-07-30 ruling): the enemy may
     still act, and if they do, you get another window this same round.
     The round only ends when both sides pass back-to-back. */
  function endTurn() {
    if (busy || B.over) return;
    cineCutTurn(); // passing is also "doing stuff"
    /* THE SCRIPTED MATCH: pass only when the line passes. */
    var mvP = scriptMove();
    if (mvP && mvP.side === 'player') {
      if (!mvP.pass) {
        scriptDeny('The Recruiter shakes his head - the marked move first');
        return;
      }
      scriptAdvance();
    }
    stopClock();
    cancelAuto();
    clearSel();
    E.passTurn(B, 'player');
    if (window.EOL.audio) window.EOL.audio.battle('pass');
    /* CAMPAIGN reaction: an UNPROMPTED pass (not the scripted lesson) */
    if (!mvP && B.campaignStage && window.EOL.campaign && window.EOL.campaign.onPlayerAction) {
      try {
        window.EOL.campaign.onPlayerAction(B, { pass: true });
      } catch (e) {
        /* lore never breaks a fight */
      }
    }
    if (netCtl) netCtl.onLocal(null); // a pass is a move too - it must be sent
    cine('YOU PASS', '', 'player', 1000, true);
    afterPlayerAction();
  }

  /* Roll the round over and hand control to whoever opens it. */
  function startNextRound() {
    E.nextRound(B);
    render();
    /* The rollover itself can deal damage and kill heroes (Burn ticks,
       delayed strikes, battlefield relics). Let those animations play
       before the round banner or the result screen lands on top. */
    var rollHold = flashRecent();
    if (rollHold) {
      busy = true;
      document.body.dataset.busy = '1';
      setTimeout(function () {
        busy = false;
        document.body.dataset.busy = '0';
        render();
        continueRound();
      }, rollHold);
      return;
    }
    continueRound();
  }

  function continueRound() {
    if (B.over) {
      render();
      return endBattle();
    }
    announceRound();
    advanceAndReport(function (nxt) {
      if (B.over) {
        render();
        return endBattle();
      }
      if (!nxt) {
        startNextRound();
        return;
      }
      if (nxt === 'enemy') {
        announceTurn('enemy'); // banner up front, not when they finally move
        runEnemyAction();
        return;
      }
      maybeAutoEndTurn();
    });
  }

  /* The opponent takes exactly ONE action, then control returns.
     Against the bot that decision is computed locally; in a match it is
     awaited from the other player's client. */
  async function runEnemyAction() {
    busy = true;
    document.body.dataset.busy = '1';
    var act = null;
    if (netCtl) {
      /* A live opponent. Never think for them and never guess - block
         until their move actually lands. The board shows a waiting
         state so the wait reads as "their turn", not as a freeze. */
      ponderCancel();
      setNetWait(true);
      try {
        act = await netCtl.decide(B);
      } catch (e) {
        setNetWait(false);
        busy = false;
        document.body.dataset.busy = '0';
        return; // the adaptor has already handled the disconnect
      }
      setNetWait(false);
      stopClock(); // their move arrived - their clock is done
      if (!B || B.over) {
        busy = false;
        document.body.dataset.busy = '0';
        if (B && B.over) endBattle();
        return;
      }
    } else {
      /* THE SCRIPTED MATCH: the line drives the enemy, not the search.
         A mismatch aborts the script and falls through to the AI. */
      var mvE = scriptMove();
      if (mvE && mvE.side === 'enemy') {
        var scripted = scriptEnemyAct(mvE);
        if (!scripted) {
          scriptEnd('desync');
          act = AI.bestAction(B, 'enemy');
        } else if (scripted.pass) {
          act = null;
        } else {
          act = scripted.act;
          if (mvE.say && window.EOL.campaign && window.EOL.campaign.onScriptSay) {
            try {
              window.EOL.campaign.onScriptSay(B, mvE);
            } catch (e) {
              /* narration is optional */
            }
          }
        }
      } else if (mvE && mvE.side === 'player') {
        /* the line expected the player to act - reality disagrees */
        scriptEnd('desync');
        act = AI.bestAction(B, 'enemy');
      } else {
        /* Settle the decision while the position still exactly matches what
           pondering saw. A pondered move is depth 4-8; the live fallback is
           the usual depth 4. A pondered PASS is trusted outright. */
        ponderStats.decisions++;
        var decision = ponderAction(); // act | { pass: true } | null
        ponderCancel();
        if (decision && decision.pass) {
          act = null; // pondering's verdict: pass
        } else if (decision) {
          act = decision; // pondered move (depth 4-8)
        } else {
          act = AI.bestAction(B, 'enemy'); // live fallback at the usual depth 4
        }
      }
    }
    render();
    // hold until the announcements have played out - the player's
    // thinking time (pondering itself already ran during THEIR window)
    await cineGate();

    if (!act || !act.unit || !act.ability) {
      E.passTurn(B, 'enemy');
      if (window.EOL.audio) window.EOL.audio.battle('pass');
      cine('ENEMY PASSES', '', 'enemy', 1100, true);
      await sleep(cineMs(700));
    } else {
      // Stage 1 (The Recruiter): moderates power to measure rather than overwhelm
      // - only when the scripted line is NOT driving him (it authors his
      // restraint move-by-move already).
      if (act && act.ability && !act.ability.basic && B.campaignStage === 1 && !moveScript) {
        var usedSig = B._recruiterSigUsed === B.round;
        if (usedSig || Math.random() < 0.65) {
          var basic = E.roleAbility(act.unit);
          if (E.canUse(B, act.unit, basic)) {
            var pool = E.legalTargets(B, act.unit, basic);
            if (pool.length) {
              act = {
                unit: act.unit,
                ability: basic,
                chosen: [pool[0]],
                targets: [pool[0]],
                choose: 0,
              };
            }
          }
        } else {
          B._recruiterSigUsed = B.round;
        }
      }
      announceTurn('enemy');
      // brief highlight so the player can follow what the bot is doing
      var el = document.querySelector('.bcard[data-uid="' + act.unit.uid + '"]');
      if (el) el.classList.add('ai-acting');
      var _tgs = act.targets || act.chosen || [];
      (_tgs || []).forEach(function (t) {
        if (!t || !t.uid) return;
        var te = document.querySelector('.bcard[data-uid="' + t.uid + '"]');
        if (te) te.classList.add('ai-target');
      });
      // hold a beat so the acting/target highlights can be read before
      // the cast takes over
      await sleep(cineMs(800));

      var mark = B.log.length;
      E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);

      /* NO SPOILERS: the enemy's bargain flips over the PRE-cast board
         too - render() waits for the landing, exactly like the player
         path in commit(). This is also what makes the coin VISIBLE on
         enemy casts: it used to share the frame with the repaint. */
      var coin = B.log.slice(mark).filter(function (l) {
        return l.type === 'coin';
      })[0];
      if (coin)
        await sleep(
          playCoinFlip(
            coin.meta.coin,
            coin.meta.coin === 'heads'
              ? act.unit.name + ' returns to full HP and Energy'
              : act.unit.name + ' is reduced to 1 HP'
          )
        );
      render();

      await sleep(flashRecent() || 0);
      await sleep(cineMs(350));
    }

    /* The remote move is applied. This is the one instant both boards
       are meant to be identical, so it is the only honest moment to
       compare them. A mismatch stops the match rather than letting two
       different games play on. */
    if (netCtl && netCtl.verify && !netCtl.verify(B)) {
      busy = false;
      document.body.dataset.busy = '0';
      return;
    }

    busy = false;
    document.body.dataset.busy = '0';
    if (B.over) return endBattle();

    advanceAndReport(function (nxt) {
      if (B.over) return endBattle();
      if (!nxt) {
        startNextRound();
        return;
      }
      if (nxt === 'enemy') {
        runEnemyAction(); // already their streak - announceTurn dedupes
        return;
      } // player passed
      render();
      maybeAutoEndTurn();
    });
  }

  /* ---------------------------------------------------------
     Cinematic announcements
     -------------------------------------------------------------
     Replaces the old bottom toast ticker. Two tiers share one
     fixed, pointer-transparent overlay:

       tier 1  ROUND N (+ phase / ramp notes) - full cinematic with
               dim and a slow cycle
       tier 2  YOUR TURN / ENEMY TURN / passes - slim banner, no
               dim, quick cycle; deduped per unbroken streak so a
               side taking several actions in a row doesn't re-announce

     Announcements push into a small queue so a round reveal and its
     opening turn banner play one after another instead of stomping
     each other. Not used for skills - those read from the cast fx.
     --------------------------------------------------------- */
  var cineQ = [];
  var cineLive = false;
  var cineTimer = null;
  var cineCur = null;
  var turnBannerSide = null;

  /* Low-graphics mode shortens every cinematic to ~55%. These holds are
     JS timers rather than CSS, so the stylesheet cannot reach them -
     without this the banners would still eat the same wall-clock time
     on a machine the player has explicitly asked to go light. */
  function gfxLow() {
    return document.body.dataset.gfx === 'low';
  }
  function cineMs(ms) {
    return gfxLow() ? Math.round(ms * 0.55) : ms;
  }

  function cine(title, sub, tone, ms, slim) {
    cineQ.push({
      title: title,
      sub: sub || '',
      tone: tone || 'round',
      ms: cineMs(ms || 1350),
      slim: !!slim,
    });
    if (cineQ.length > 4) cineQ.shift(); // announcements never pile up
    cineDrain();
  }

  function cineDrain() {
    if (cineLive || !cineQ.length) return;
    var c = $('cine');
    if (!c) {
      cineQ.length = 0;
      return;
    }
    var it = cineQ.shift();
    cineLive = true;
    cineCur = it;
    $('cine-title').textContent = it.title;
    $('cine-sub').textContent = it.sub;
    c.className = 'cine tone-' + it.tone + (it.slim ? ' slim' : '');
    c.style.setProperty('--cd', it.ms / 1000 + 's');
    void c.offsetWidth; // restart the cycle animation
    c.classList.add('show');
    cineTimer = setTimeout(function () {
      c.classList.remove('show');
      cineLive = false;
      cineCur = null;
      cineDrain();
    }, it.ms);
  }

  /* The player acting IS the announcement: a YOUR TURN banner still on
     screen while the action plays out reads as a stale caption (user
     note 2026-08-09). The moment the player starts doing things, the
     slim turn banner is cut short and any queued one is dropped.
     Round cinematics are left alone - they carry phase information. */
  function cineCutTurn() {
    for (var i = cineQ.length - 1; i >= 0; i--) {
      if (cineQ[i].slim && cineQ[i].tone === 'player') cineQ.splice(i, 1);
    }
    if (!cineLive || !cineCur || !cineCur.slim || cineCur.tone !== 'player') return;
    clearTimeout(cineTimer);
    var c = $('cine');
    if (c) c.classList.remove('show');
    cineLive = false;
    cineCur = null;
    cineDrain();
  }

  function cineReset() {
    cineQ.length = 0;
    cineLive = false;
    cineCur = null;
    clearTimeout(cineTimer);
    var c = $('cine');
    if (c) c.classList.remove('show');
  }

  function announceRound() {
    turnBannerSide = null; // a fresh round re-announces its opener
    /* CAMPAIGN: let the road speak on round boundaries (the Recruiter's
       guided gate teaches basics/signatures/the ramp as they happen).
       Observational only - a bark can never touch the battle. */
    if (B && B.campaignStage && window.EOL.campaign && window.EOL.campaign.onBattleRound) {
      try {
        window.EOL.campaign.onBattleRound(B);
      } catch (e) {
        /* lore must never break a fight */
      }
    }
    var sub =
      B.round === 1
        ? 'Phase 1 - Basic Skills only'
        : B.round === 2
          ? 'Phase 2 - Signature Skills unlocked'
          : B.round === E.RAMP_FROM
            ? 'ATK ramp begins - +' + Math.round(E.RAMP_STEP * 100) + '% each round'
            : '';
    cine('ROUND ' + B.round, sub, 'round', 2100);
    if (window.EOL.audio) window.EOL.audio.battle('round', { phase: B.round >= 2 ? 2 : 1 });
  }

  function announceTurn(side) {
    var other = E.opposite ? E.opposite(side) : side === 'player' ? 'enemy' : 'player';
    var isOtherPassed = B && B.passed && B.passed[other];
    if (turnBannerSide === side && !isOtherPassed) return; // same streak - stay quiet unless other side is out
    turnBannerSide = side;
    var sub =
      side === 'enemy' && B.passed.player
        ? 'Finishing the round'
        : side === 'player' && B.passed.enemy
          ? 'The round is yours'
          : '';
    cine(side === 'player' ? 'YOUR TURN' : 'ENEMY TURN', sub, side, 1000, true);
    if (window.EOL.audio) window.EOL.audio.battle('turn', { side: side });
  }

  /* Let the announcements finish before the bot moves. The think time
     is the point: pondering already did its work during the player's
     own window, so this pause is purely breathing room for the player.
     Total wait = remaining overlay time + a readable beat after. */
  async function cineGate() {
    var guard = 0;
    while ((cineLive || cineQ.length) && guard++ < 80) await sleep(60);
    if (guard >= 80) return sleep(cineMs(700)); // wedged queue - floor beat
    return sleep(cineMs(1100)); // quiet beat after the last fade
  }

  /* ---------------------------------------------------------
     log / toast / end
     --------------------------------------------------------- */
  var lastLogLen = 0;

  /* ---------------------------------------------------------
     Attack effects
     A slash/bolt flies from the attacker to the target, the target
     flinches, and the board shakes on a big hit.
     --------------------------------------------------------- */
  var ELEMENT_FX = {
    Physical: {
      color: '#ff7575',
      style: 'slash',
      trail: '#ff4d4d',
      sigil: 'ra-axe',
      shape: 'blade',
    },
    Magic: {
      color: '#ff7cd5',
      style: 'orb',
      trail: '#ff4dd5',
      sigil: 'ra-rune-stone',
      shape: 'arcane',
    },
    Shadow: {
      color: '#d08cff',
      style: 'wisp',
      trail: '#a05cd8',
      sigil: 'ra-moon-sun',
      shape: 'void',
    },
    Light: {
      color: '#ffe9a8',
      style: 'beam',
      trail: '#ffd977',
      sigil: 'ra-sunbeams',
      shape: 'holy',
    },
    Lightning: {
      color: '#9fe8ff',
      style: 'bolt',
      trail: '#63d7ff',
      sigil: 'ra-lightning-bolt',
      shape: 'storm',
    },
    Fire: {
      color: '#ffb07a',
      style: 'flame',
      trail: '#ff7a4d',
      sigil: 'ra-fire-symbol',
      shape: 'ember',
    },
    Nature: {
      color: '#a6f0c2',
      style: 'thorn',
      trail: '#5fd48a',
      sigil: 'ra-pine-tree',
      shape: 'bloom',
    },
  };

  function fxLayer() {
    var l = $('fx');
    if (!l) {
      l = document.createElement('div');
      l.id = 'fx';
      l.className = 'fx-layer';
      $('board').appendChild(l);
    }
    return l;
  }

  function centreOf(uid) {
    var el = document.querySelector('.bcard[data-uid="' + uid + '"]');
    var layer = fxLayer();
    if (!el) return null;
    var z = uiS();
    var lr = layer.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    /* layer is inside the board; spawn coordinates are layout px */
    return {
      x: (r.left + r.width / 2 - lr.left) / z,
      y: (r.top + r.height / 2 - lr.top) / z,
      el: el,
    };
  }

  function spawn(cls, x, y, color, life) {
    var n = document.createElement('div');
    n.className = cls;
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    if (color) n.style.setProperty('--fx', color);
    fxLayer().appendChild(n);
    setTimeout(function () {
      n.remove();
    }, life);
    return n;
  }

  /* --------------------------------------------------------
     Cast tell - fires at the caster as an ability begins.
     A rotating rune ring plus an element sigil, so you can see
     *what* is being cast before the projectile even lands.
     -------------------------------------------------------- */
  function playCast(uid, element, signature) {
    var a = centreOf(uid);
    if (!a) return;
    var actor = B && B.uidMap ? B.uidMap[uid] : null;
    if (window.EOL.audio)
      window.EOL.audio.battle('cast', {
        role: actor ? actor.role : null,
        element: element,
        signature: !!signature,
      });
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Physical;

    var ring = spawn('fx-cast-ring' + (signature ? ' big' : ''), a.x, a.y, fx.color, 700);
    ring.innerHTML = '<span></span><span></span>';

    if (signature) {
      var sig = spawn('fx-cast-sigil', a.x, a.y, fx.color, 760);
      sig.innerHTML = '<i data-icon-domain="game" class="ra ' + fx.sigil + '"></i>';
    }

    // motes gathering inward before the release
    var n = signature ? 10 : 6;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      var d = 34 + Math.random() * 18;
      var m = spawn('fx-gather', a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, fx.color, 460);
      m.style.setProperty('--gx', -Math.cos(ang) * d + 'px');
      m.style.setProperty('--gy', -Math.sin(ang) * d + 'px');
      m.style.animationDelay = i * 22 + 'ms';
    }

    if (a.el) {
      a.el.classList.add('casting');
      a.el.style.setProperty('--cast', fx.color);
      setTimeout(function () {
        var n2 = document.querySelector('.bcard[data-uid="' + uid + '"]');
        if (n2) {
          n2.classList.remove('casting');
          n2.style.removeProperty('--cast');
        }
      }, 620);
    }
  }

  /* --------------------------------------------------------
     Single-target strike: charge -> travel -> impact
     Each element gets its own projectile treatment.
     -------------------------------------------------------- */
  function playStrike(srcUid, tgtUid, element, crit) {
    var a = centreOf(srcUid),
      t = centreOf(tgtUid);
    if (!a || !t) return;
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Physical;
    var dx = t.x - a.x,
      dy = t.y - a.y;
    var ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    var dist = Math.hypot(dx, dy);

    // 1. wind-up flare at the attacker
    var charge = spawn('fx-charge', a.x, a.y, fx.color, 260);
    charge.style.setProperty('--rot', ang + 'deg');
    if (a.el) {
      a.el.classList.add('lunge');
      a.el.style.setProperty('--lx', (dx > 0 ? 12 : -12) + 'px');
      setTimeout(function () {
        a.el.classList.remove('lunge');
        a.el.style.removeProperty('--lx');
      }, 320);
    }

    setTimeout(function () {
      // 2. projectile + trail
      var bolt = spawn('fx-bolt s-' + fx.style, a.x, a.y, fx.color, 320);
      bolt.style.setProperty('--dx', dx + 'px');
      bolt.style.setProperty('--dy', dy + 'px');
      bolt.style.setProperty('--rot', ang + 'deg');

      var beam = spawn('fx-beam', a.x, a.y, fx.trail, 340);
      beam.style.width = dist + 'px';
      beam.style.transform = 'rotate(' + ang + 'deg)';

      // sparks shed along the path
      for (var i = 0; i < 4; i++) {
        (function (k) {
          setTimeout(function () {
            var p = k / 4;
            var sp = spawn('fx-spark', a.x + dx * p, a.y + dy * p, fx.color, 420);
            sp.style.setProperty('--sx', Math.random() * 26 - 13 + 'px');
            sp.style.setProperty('--sy', Math.random() * 26 - 13 + 'px');
          }, k * 34);
        })(i);
      }

      // 3. impact
      setTimeout(function () {
        playImpact(t.x, t.y, fx, crit, element);
      }, 190);
    }, 130);
  }

  /* A critical gets its own sequence: the screen dims, a slashing X
     tears across the target, then a gold shockwave. The floating number
     owns the single, consistent CRITICAL label on every hit path. */
  function playCritImpact(x, y, fx) {
    var layer = fxLayer();
    var lr = layer.getBoundingClientRect();
    var z = uiS();

    var dim = spawn('fx-dim', lr.width / 2 / z, lr.height / 2 / z, null, 620);
    dim.style.left = '0';
    dim.style.top = '0';

    var slash = spawn('fx-crit-slash', x, y, '#ffd050', 700);
    slash.innerHTML = '<span></span><span></span>';

    spawn('fx-crit-ring', x, y, '#ffd050', 760);
    spawn('fx-ring slow', x, y, fx.color, 700);

    for (var i = 0; i < 14; i++) {
      var d = spawn('fx-dust', x, y, i % 2 ? '#ffd050' : fx.trail, 900);
      var ang = Math.random() * Math.PI * 2;
      var dist = 40 + Math.random() * 60;
      d.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
      d.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
      d.style.animationDelay = i * 16 + 'ms';
    }

    var bd = $('board');
    bd.classList.add('shake', 'crit-flash');
    setTimeout(function () {
      bd.classList.remove('shake', 'crit-flash');
    }, 520);
  }

  function playImpact(x, y, fx, crit, element, silentAudio) {
    if (!silentAudio && window.EOL.audio)
      window.EOL.audio.battle('impact', { element: element, crit: !!crit });
    if (crit) {
      playCritImpact(x, y, fx);
    }
    var burst = spawn('fx-burst' + (crit ? ' crit' : ''), x, y, fx.color, 620);
    var shards = crit ? 10 : 7;
    var html = '';
    for (var i = 0; i < shards; i++) {
      html +=
        '<span style="--a:' +
        i * (360 / shards) +
        'deg;--d:' +
        (16 + Math.random() * 14) +
        'px"></span>';
    }
    burst.innerHTML = html;

    spawn('fx-ring', x, y, fx.color, 520);

    // a flat shock disc that reads as the blow landing on a surface
    spawn('fx-shock-disc', x, y, fx.color, 460);

    // element-flavoured debris: embers rise, thorns scatter, etc.
    var shape = fx.shape || 'blade';
    for (var j = 0; j < 6; j++) {
      var d = spawn('fx-dust s-' + shape, x, y, fx.trail, 700);
      d.style.setProperty('--sx', Math.random() * 70 - 35 + 'px');
      d.style.setProperty('--sy', -18 - Math.random() * 40 + 'px');
      d.style.animationDelay = j * 22 + 'ms';
    }

    // a few heavier chunks thrown along the hit direction
    for (var q = 0; q < 4; q++) {
      var ch = spawn('fx-chunk', x, y, fx.color, 620);
      var ca = Math.random() * Math.PI * 2;
      var cd = 26 + Math.random() * 40;
      ch.style.setProperty('--sx', (Math.cos(ca) * cd).toFixed(1) + 'px');
      ch.style.setProperty('--sy', (Math.sin(ca) * cd - 12).toFixed(1) + 'px');
      ch.style.setProperty('--rot', Math.floor(Math.random() * 540 - 270) + 'deg');
      ch.style.animationDelay = q * 26 + 'ms';
    }
  }

  /* --------------------------------------------------------
     AoE: a shockwave from the caster, the board washed in the
     element's colour, then an element-character strike on every
     target before the impact bursts.
     -------------------------------------------------------- */
  function playAoe(srcUid, targetUids, element) {
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Magic;
    var el = element || 'Magic';
    if (window.EOL.audio) window.EOL.audio.battle('aoe', { element: el, delay: 120 });
    /* AoE DETONATION SUITE v2 (2026-08).
       The old center was two plain rings and a glow at the CASTER -
       playtesters read it as "lanky" because a thin expanding circle
       was the whole show, and it happened in the wrong place. The
       detonation now lands on the STRIKE ZONE (the victims' centroid)
       and is choreographed: ground flash, inscribed rune ring, twin
       shock rings, a white-hot core with an after-flash stutter,
       debris arcs with gravity sag, crackle sparks, lingering smoke,
       and a 240ms board shake for weight. The caster keeps only the
       wind-up flare. Same blast radius as before - more detail
       inside, nothing bigger. */
    var a = centreOf(srcUid);
    if (a) {
      spawn('fx-charge big', a.x, a.y, fx.color, 420);
    }

    /* strike-zone centroid across the victims */
    var pts = [];
    targetUids.forEach(function (uid) {
      var t = centreOf(uid);
      if (t) pts.push(t);
    });
    var cx = a ? a.x : 0,
      cy = a ? a.y : 0;
    if (pts.length) {
      var sx = 0,
        sy = 0;
      pts.forEach(function (p) {
        sx += p.x;
        sy += p.y;
      });
      cx = sx / pts.length;
      cy = sy / pts.length;
    }

    spawn('fx-blast-glow', cx, cy, fx.color, 820);
    spawn('fx-blast-ring', cx, cy, fx.color, 640);
    if (!gfxLow()) {
      spawn('fx-blast-rune', cx, cy, fx.trail, 580);
      spawn('fx-blast-ring d2', cx, cy, fx.trail, 720);
    }
    spawn('fx-blast-core', cx, cy, fx.color, 440);
    if (!gfxLow()) {
      /* debris: even fan of angles, jittered, each chunk with its own
         tumble and sag */
      for (var s = 0; s < 12; s++) {
        var ang = (s / 12) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
        var dist = 52 + Math.random() * 78;
        var sp = spawn('fx-blast-shard', cx, cy, s % 3 === 0 ? fx.trail : fx.color, 780);
        if (!sp) continue;
        sp.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
        sp.style.setProperty('--sy', Math.sin(ang) * dist * 0.72 + 'px'); /* slight ellipse */
        sp.style.setProperty('--rot', Math.floor(Math.random() * 360) + 'deg');
        sp.style.animationDelay = s * 16 + 'ms';
      }
      /* crackle: thin streaks thrown further than the debris */
      for (var k = 0; k < 10; k++) {
        var sa = (k / 10) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        var sk = spawn('fx-blast-spark', cx, cy, fx.color, 460);
        if (!sk) continue;
        sk.style.setProperty('--a', ((sa * 180) / Math.PI + 90).toFixed(1) + 'deg');
        sk.style.setProperty('--sd', Math.floor(96 + Math.random() * 70) + 'px');
        sk.style.animationDelay = k * 18 + 'ms';
      }
      /* the smoke arrives as the light dies - it is what makes the
         blast feel like it consumed something */
      for (var m = 0; m < 4; m++) {
        var sm = spawn('fx-blast-smoke', cx + (m - 1.5) * 16, cy, fx.trail, 980);
        if (!sm) continue;
        sm.style.setProperty('--sx', (m % 2 ? 18 : -14) + 'px');
        sm.style.animationDelay = 160 + m * 90 + 'ms';
      }
      /* board punch */
      var bd = $('board');
      if (bd) {
        bd.classList.remove('shake');
        void bd.offsetWidth; /* restart the CSS animation if back-to-back */
        bd.classList.add('shake');
        setTimeout(function () {
          bd.classList.remove('shake');
        }, 260);
      }
    }

    var bd2 = $('board');
    bd2.classList.add('flash-' + el.toLowerCase());
    setTimeout(function () {
      bd2.classList.remove('flash-' + el.toLowerCase());
    }, 460);

    targetUids.forEach(function (uid, i) {
      setTimeout(
        function () {
          var t = centreOf(uid);
          if (!t) return;
          playAoeStrike(t, fx, el);
          /* capstone pop so each VICTIM reads as an explosion node,
             not as the endpoint of a beam */
          spawn('fx-blast-mini', t.x, t.y, fx.color, 440);
          setTimeout(function () {
            /* The blast has one shared audio detonation; per-victim
               impacts stay visual so an AoE never becomes six bangs. */
            playImpact(t.x, t.y, fx, false, element, true);
          }, 170);
        },
        90 + i * 80
      );
    });
  }

  /* --------------------------------------------------------
     AoE STRIKE SUITE v3 (2026-08-04 overhaul).

     V2's sin: each element was one static prop on a slide -
     meteors trailed at a FIXED 26-48deg while actually
     falling almost straight down (Sekhmet's fire read as a
     stock graphic gliding sideways), and the moment each
     strike ended the board snapped back to clean, so nothing
     IMPACTED and nothing LINGERED.

     v3 law, every element gets four beats:
       anticipation  something gathers at the strike point a
                     beat before the hit (flash / gloom /
                     converging shards / falling motes)
       transit       the moving body itself, with its trail
                     computed from ITS OWN velocity vector
                     (atan2 - never a painted-on angle)
       impact        burst + the global detonation's mini-pop
       residual      a trace that outlives the hit by ~1s
                     (embers rising off scorched ground, ion
                     haze, a saint's halo, wisps, arcane
                     afterglow, dust)
     The extras ride behind !gfxLow(); the base strike is
     always shown. */
  function spawnMote(x, y, color, life, ox, oy, dx, dy, cls) {
    /* one parameterized particle: appears at (ox,oy) relative
       to (x,y) and travels to (dx,dy). Converge = spawn out,
       travel to 0,0; rise = spawn at 0,0, travel up. */
    var m = spawn('fx-mote' + (cls ? ' ' + cls : ''), x, y, color, life);
    if (!m) return null;
    m.style.setProperty('--ox', ox.toFixed(1) + 'px');
    m.style.setProperty('--oy', oy.toFixed(1) + 'px');
    m.style.setProperty('--dx', dx.toFixed(1) + 'px');
    m.style.setProperty('--dy', dy.toFixed(1) + 'px');
    return m;
  }

  function playAoeStrike(t, fx, element) {
    switch (element) {
      case 'Lightning': {
        /* the strike point ionizes a beat BEFORE the sky breaks */
        spawn('fx-strike-flash', t.x, t.y, fx.color, 300);
        /* twin forks crashing down, staggered; low mode keeps one */
        var forks = gfxLow() ? 1 : 2;
        for (var f = 0; f < forks; f++) {
          (function (k) {
            setTimeout(function () {
              var bx = t.x + (Math.random() * 36 - 18);
              var z = spawn('fx-zigzag', bx, 0, k ? fx.trail : fx.color, 560);
              if (!z) return;
              z.style.top = '0px';
              z.style.setProperty('--h', t.y + 44 + 'px');
              if (!gfxLow()) {
                /* branches fork off the trunk - jagged, short-lived,
                   angled OFF the trunk's own vertical */
                for (var b = 0; b < 2; b++) {
                  var br = spawn(
                    'fx-branch',
                    bx + (Math.random() * 14 - 7),
                    t.y * (0.3 + b * 0.24),
                    fx.color,
                    400
                  );
                  if (!br) continue;
                  br.style.setProperty(
                    '--rot',
                    (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 32) + 'deg'
                  );
                  br.style.setProperty('--bl', Math.floor(26 + Math.random() * 24) + 'px');
                  br.style.animationDelay = 80 + b * 80 + 'ms';
                }
                /* the moment of contact spits white sparks upward */
                setTimeout(function () {
                  for (var sp = 0; sp < 3; sp++) {
                    spawnMote(
                      t.x,
                      t.y,
                      '#ffffff',
                      460,
                      0,
                      0,
                      Math.random() * 80 - 40,
                      -(18 + Math.random() * 42),
                      null
                    );
                  }
                }, 120);
              }
            }, k * 120);
          })(f);
        }
        /* residual: the air stays ionized after the bolt is gone */
        if (!gfxLow()) {
          setTimeout(function () {
            spawn('fx-ion', t.x, t.y + 14, fx.trail, 760);
          }, 240);
        }
        break;
      }
      case 'Fire': {
        /* Meteor volley. THE LAW: the tail angle is derived from
           THIS meteor's own launch offset, so the flame streams
           exactly opposite the velocity no matter where it starts.
           (v2 hardcoded --ta=26-48deg: the meteor fell ~240px
           vertically while the tail lay mostly horizontal.) */
        for (var m = 0; m < 3; m++) {
          (function (k) {
            setTimeout(function () {
              var ox = 60 + Math.random() * 140; /* launch up-RIGHT */
              var oy = -(160 + Math.random() * 150);
              var me = spawn('fx-meteor', t.x, t.y, k === 2 ? '#ffd9a0' : fx.color, 740);
              if (!me) return;
              me.style.setProperty('--mx', ox.toFixed(0) + 'px');
              me.style.setProperty('--my', oy.toFixed(0) + 'px');
              /* tail points back along the displacement (behind the
                 body); scale its length with how much sky it crossed */
              me.style.setProperty(
                '--ta',
                (((Math.atan2(oy, ox) * 180) / Math.PI + 180) % 360).toFixed(1) + 'deg'
              );
              me.style.setProperty(
                '--tl',
                Math.min(150, Math.round(Math.hypot(ox, oy) * 0.55)) + 'px'
              );
              /* each landing kicks up a pair of hot sparks */
              if (!gfxLow()) {
                setTimeout(function () {
                  for (var e = 0; e < 2; e++) {
                    spawnMote(
                      t.x + (Math.random() * 20 - 10),
                      t.y + 6,
                      fx.trail,
                      620,
                      0,
                      0,
                      Math.random() * 44 - 22,
                      -(16 + Math.random() * 26),
                      null
                    );
                  }
                }, 420);
              }
            }, k * 100);
          })(m);
        }
        /* residual: the ground stays scarred and keeps breathing embers */
        if (!gfxLow()) {
          setTimeout(function () {
            spawn('fx-scorch', t.x, t.y + 20, null, 1250);
            for (var e2 = 0; e2 < 3; e2++) {
              (function (k) {
                setTimeout(function () {
                  spawnMote(
                    t.x + (Math.random() * 44 - 22),
                    t.y + 14,
                    fx.trail,
                    1150,
                    0,
                    0,
                    Math.random() * 26 - 13,
                    -(34 + Math.random() * 32),
                    'rise'
                  );
                }, 150 * k);
              })(e2);
            }
          }, 360);
        }
        break;
      }
      case 'Nature': {
        /* leaves and petals bloom out of the ground strike - the
           petals travel outward AND settle, motes keep rising after */
        var bl = spawn('fx-bloom', t.x, t.y, fx.color, 1050);
        if (bl) {
          var html = '';
          for (var p = 0; p < 8; p++) {
            html +=
              '<i data-icon-domain="game" class="ra ' +
              (p % 2 ? 'ra-leaf' : fx.sigil) +
              '" style="--a:' +
              p * 45 +
              'deg;animation-delay:' +
              p * 24 +
              'ms"></i>';
          }
          bl.innerHTML = html;
        }
        spawn('fx-ring slow', t.x, t.y, fx.trail, 700);
        if (!gfxLow()) {
          /* spores drift up where the bloom broke the soil */
          for (var n = 0; n < 4; n++) {
            (function (k) {
              setTimeout(
                function () {
                  spawnMote(
                    t.x + (Math.random() * 36 - 18),
                    t.y + 8,
                    fx.color,
                    1100,
                    0,
                    0,
                    Math.random() * 30 - 15,
                    -(30 + Math.random() * 34),
                    'rise'
                  );
                },
                200 + k * 130
              );
            })(n);
          }
        }
        break;
      }
      case 'Light': {
        /* anticipation: three motes fall INTO the point as the sky
           answers, then the beam lands behind its god-ray wheel */
        if (!gfxLow()) {
          for (var d = 0; d < 3; d++) {
            (function (k) {
              setTimeout(function () {
                spawnMote(
                  t.x + (Math.random() * 30 - 15),
                  t.y,
                  '#fff8dc',
                  330,
                  Math.random() * 24 - 12,
                  -(60 + Math.random() * 30),
                  0,
                  -6,
                  null
                );
              }, k * 60);
            })(d);
          }
        }
        var ry = spawn('fx-rays', t.x, t.y, fx.color, 640);
        if (ry) {
          var rh = '';
          for (var r = 0; r < 8; r++) {
            rh += '<span style="transform: rotate(' + r * 45 + 'deg)"></span>';
          }
          ry.innerHTML = rh;
        }
        var col = spawn('fx-column', t.x, 0, fx.color, 520);
        if (col) {
          col.style.top = '0px';
          col.style.setProperty('--h', t.y + 40 + 'px');
        }
        /* residual: a saint's halo sits where the beam touched ground */
        if (!gfxLow()) {
          setTimeout(function () {
            spawn('fx-halo', t.x, t.y + 18, fx.color, 1000);
          }, 200);
        }
        break;
      }
      case 'Magic': {
        /* anticipation: arcane shards converge on the point from a
           small ring - the rune answers where they meet */
        if (!gfxLow()) {
          for (var cv = 0; cv < 5; cv++) {
            (function (k) {
              var a2 = (k / 5) * Math.PI * 2 + 0.6;
              setTimeout(function () {
                spawnMote(
                  t.x,
                  t.y,
                  k % 2 ? fx.trail : fx.color,
                  320,
                  Math.cos(a2) * 46,
                  Math.sin(a2) * 30,
                  0,
                  0,
                  'in'
                );
              }, k * 26);
            })(cv);
          }
        }
        // a glowing rune stamps down over the target
        var st = spawn('fx-rune-stamp', t.x, t.y, fx.color, 620);
        if (st) st.innerHTML = '<i data-icon-domain="game" class="ra ' + fx.sigil + '"></i>';
        var col2 = spawn('fx-column', t.x, 0, fx.trail, 500);
        if (col2) {
          col2.style.top = '0px';
          col2.style.opacity = '.55';
          col2.style.setProperty('--h', t.y + 40 + 'px');
        }
        /* residual: a ghost of the seal keeps turning after it lands */
        if (!gfxLow()) {
          setTimeout(function () {
            var gh = spawn('fx-rune-ghost', t.x, t.y, fx.color, 1200);
            if (gh) gh.innerHTML = '<i data-icon-domain="game" class="ra ' + fx.sigil + '"></i>';
          }, 260);
        }
        break;
      }
      case 'Shadow': {
        /* anticipation: the light bends first - gloom swells, wisps
           get sucked INTO the tear (inward motion sells "the world
           is being pulled apart") */
        spawn('fx-gloom', t.x, t.y, null, 800);
        if (!gfxLow()) {
          for (var s0 = 0; s0 < 6; s0++) {
            (function (k) {
              var a3 = (k / 6) * Math.PI * 2 + 0.4;
              setTimeout(function () {
                spawnMote(
                  t.x,
                  t.y,
                  fx.trail,
                  380,
                  Math.cos(a3) * 52,
                  Math.sin(a3) * 34,
                  0,
                  0,
                  'in'
                );
              }, k * 30);
            })(s0);
          }
        }
        // two rifts tear across the card, one high, one low
        for (var s = 0; s < 2; s++) {
          (function (k) {
            setTimeout(function () {
              var ri = spawn('fx-rift', t.x, t.y + (k ? -14 : 10), fx.color, 700);
              if (ri) ri.style.setProperty('--ra', (k ? 24 : -30) + 'deg');
            }, k * 110);
          })(s);
        }
        /* residual: one wisp escapes and curls upward */
        if (!gfxLow()) {
          setTimeout(function () {
            spawnMote(t.x + 6, t.y + 4, fx.trail, 1080, 0, 0, 18, -44, 'rise');
          }, 420);
        }
        break;
      }
      default: {
        /* physical: shock rings pound out of the impact point, dust
           and chips make it read as WEIGHT not light */
        spawn('fx-quake', t.x, t.y, fx.color, 560);
        setTimeout(function () {
          spawn('fx-quake', t.x, t.y, fx.trail, 700);
        }, 110);
        if (!gfxLow()) {
          for (var d2 = 0; d2 < 3; d2++) {
            (function (k) {
              setTimeout(
                function () {
                  var du = spawn('fx-dust', t.x + (k - 1) * 18, t.y + 16, fx.trail, 900);
                  if (du) du.style.setProperty('--dx', (k - 1) * 14 + 'px');
                },
                60 + k * 70
              );
            })(d2);
          }
          for (var c2 = 0; c2 < 4; c2++) {
            (function (k) {
              var a4 = -Math.PI / 2 + (k - 1.5) * 0.5;
              var ch = spawn('fx-blast-shard', t.x, t.y, k % 2 ? fx.trail : fx.color, 700);
              if (!ch) return;
              ch.style.setProperty('--sx', Math.cos(a4) * (30 + k * 12) + 'px');
              ch.style.setProperty('--sy', Math.sin(a4) * (26 + k * 9) + 'px');
              ch.style.setProperty('--rot', Math.floor(Math.random() * 360) + 'deg');
            })(c2);
          }
        }
        break;
      }
    }
  }

  /* --------------------------------------------------------
     Revive (Sun Wukong's 72 Transformations)
     Smoke swallows the falling hero, a golden pillar erupts,
     rings snap outward and the card burns off its death pallor.
     -------------------------------------------------------- */
  /* Timeline. The engine resurrects synchronously, so the whole
     death-and-return has to be staged here:

       falling   340ms  hero drains to grey, stats blank out
       down      500ms  held grey while the smoke and pillar erupt
       restoring 700ms  colour and stats come back with the light

     `deadView` in unitCardHTML is on for the first two phases, so his HP,
     ATK/DEF and status chips stay dead until the light actually restores
     him rather than snapping live the instant the engine revives. */
  /* How long a floating combat number stays on screen after it is
     scheduled, and how long a card takes to fall when it dies. Both are
     read by flashRecent() so the caller can WAIT for the board to settle
     before it announces a round or the result. */
  var POP_MS = 1100;
  var DEATH_MS = 900;
  /* Combat feedback is "necessary" motion and is never removed, but in
     low-graphics mode it is tightened so the game plays faster without
     losing the information. */
  function popMs() {
    return gfxLow() ? 700 : POP_MS;
  }
  function deathMs() {
    return gfxLow() ? 560 : DEATH_MS;
  }
  var REVIVE_FALL_MS = 340;
  var REVIVE_DOWN_MS = 500;
  var REVIVE_RESTORE_MS = 700;
  var REVIVE_TOTAL_MS = REVIVE_FALL_MS + REVIVE_DOWN_MS + REVIVE_RESTORE_MS;
  var reviveFx = {}; // uid -> { phase, at } so render() can resume the anim

  /* true while the hero should still be drawn as a corpse */
  function isDownForRevive(uid) {
    var st = reviveFx[uid];
    return !!st && (st.phase === 'falling' || st.phase === 'down');
  }

  /* (Re)paint the current revive phase on a card, offset by however much of
     it has already played, so a mid-flight render() resumes instead of
     restarting or snapping. Called on spawn and after every render. */
  function applyReviveClass(uid) {
    var cell = document.querySelector('.bcell-wrap[data-uid="' + uid + '"]');
    if (!cell) return;
    var st = reviveFx[uid];
    cell.classList.remove('falling', 'down', 'restoring');
    cell.style.removeProperty('animation-delay');
    if (!st) return;
    cell.classList.add(st.phase);
    var elapsed = performance.now() - st.at;
    if (elapsed > 8) cell.style.animationDelay = '-' + Math.round(elapsed) + 'ms';
  }

  /* Step the revive state machine, re-rendering on each phase change so the
     stat block flips from corpse to living exactly when the light returns. */
  function reviveStep(uid, phase, next, ms) {
    if (phase) reviveFx[uid] = { phase: phase, at: performance.now() };
    else delete reviveFx[uid];
    render();
    if (next)
      setTimeout(function () {
        next();
      }, ms);
  }

  function playRevive(uid, label) {
    var c = centreOf(uid);
    if (!c) return 0;
    if (window.EOL.audio) {
      window.EOL.audio.duck(0.2, 1.3);
      window.EOL.audio.battle('revive');
    }
    var GOLD = '#ffd050';

    // the board holds its breath
    var dim = spawn('fx-dim', 0, 0, null, REVIVE_TOTAL_MS + 300);
    dim.style.left = '0';
    dim.style.top = '0';
    dim.style.animationDuration = REVIVE_TOTAL_MS + 300 + 'ms';

    // 0. the hero visibly falls, stays down, then is restored
    reviveStep(
      uid,
      'falling',
      function () {
        reviveStep(
          uid,
          'down',
          function () {
            reviveStep(
              uid,
              'restoring',
              function () {
                reviveStep(uid, null);
              },
              REVIVE_RESTORE_MS
            );
          },
          REVIVE_DOWN_MS
        );
      },
      REVIVE_FALL_MS
    );

    // 1. transformation smoke rolls over the card
    for (var s = 0; s < 9; s++) {
      var pf = spawn('fx-smoke', c.x, c.y, '#e8dcc0', 1100);
      var sa = (s / 9) * Math.PI * 2 + Math.random() * 0.4;
      var sd = 18 + Math.random() * 34;
      pf.style.setProperty('--sx', (Math.cos(sa) * sd).toFixed(1) + 'px');
      pf.style.setProperty('--sy', (Math.sin(sa) * sd - 10).toFixed(1) + 'px');
      pf.style.animationDelay = REVIVE_FALL_MS * 0.5 + s * 26 + 'ms';
    }

    // 2. pillar of golden light climbs out of the smoke
    setTimeout(function () {
      // pillar stands on the card and rises off the top of the board
      // (CSS pins it to top:0, so --h is the distance down to the hero)
      var col = spawn('fx-revive-pillar', c.x, c.y, GOLD, 1200);
      col.style.top = '0px'; // spawn() sets top inline
      col.style.setProperty('--h', c.y + 40 + 'px');
      spawn('fx-revive-flare', c.x, c.y, GOLD, 900);

      // 3. three rings snap outward, one behind the other
      [0, 130, 260].forEach(function (d) {
        setTimeout(function () {
          spawn('fx-revive-ring', c.x, c.y, GOLD, 820);
        }, d);
      });

      // 4. embers stream upward
      for (var i = 0; i < 18; i++) {
        var m = spawn('fx-revive-mote', c.x, c.y, i % 3 ? GOLD : '#fff3c4', 1200);
        m.style.setProperty('--sx', (Math.random() * 96 - 48).toFixed(1) + 'px');
        m.style.setProperty('--sy', (-46 - Math.random() * 82).toFixed(1) + 'px');
        m.style.animationDelay = i * 30 + 'ms';
      }

      // 5. the card pulses gold as it comes back. render() has rebuilt the
      //    DOM by now, so c.el is stale - re-query it.
      var live = document.querySelector('.bcard[data-uid="' + uid + '"]');
      if (live) {
        live.classList.add('reborn');
        setTimeout(function () {
          var n = document.querySelector('.bcard[data-uid="' + uid + '"]');
          if (n) n.classList.remove('reborn');
        }, REVIVE_RESTORE_MS + 200);
      }

      var bd = $('board');
      bd.classList.add('revive-flash');
      setTimeout(function () {
        bd.classList.remove('revive-flash');
      }, 700);

      // 6. callout
      var word = spawn('fx-revive-word', c.x, c.y, GOLD, 1400);
      word.textContent = label || 'REBORN';
    }, REVIVE_FALL_MS + REVIVE_DOWN_MS);

    return REVIVE_TOTAL_MS + 500;
  }

  /* --------------------------------------------------------
     Coin flip - a spinning coin that lands on a face
     -------------------------------------------------------- */
  function playCoinFlip(face, label) {
    var heads = face === 'heads';
    var reduced =
      document.body.dataset.gfx === 'low' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    /* IMPACT IS AT 1450ms, NOT 1510ms. The flight keyframes put the
       coin on the table at 96% of a 1.51s animation, and js/audio.js
       already rings its landing tone at t+1.45s. Firing the land pulse,
       sparks and result label at 1510 left them 60ms late - just enough
       to read as a separate event from the impact. */
    var landAt = reduced ? 360 : 1450;
    var fadeAt = reduced ? 1740 : 2780;
    var doneAt = reduced ? 1940 : 3000;
    if (window.EOL.audio) {
      window.EOL.audio.duck(0.18, 1.35);
      window.EOL.audio.battle('coin', { face: face });
    }
    var layer = fxLayer();
    var lr = layer.getBoundingClientRect();
    var z = uiS();
    var wrap = document.createElement('div');
    wrap.className = 'fx-coin-wrap ' + face;
    wrap.style.left = lr.width / 2 / z + 'px';
    wrap.style.top = (lr.height * 0.42) / z + 'px';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Rumpelstiltskin flips a coin');
    var sparks = '';
    for (var i = 0; i < 12; i++) {
      sparks += '<span class="fx-coin-spark" style="--a:' + i * 30 + '"></span>';
    }
    wrap.innerHTML =
      '<span class="fx-coin-aura" aria-hidden="true"></span>' +
      '<span class="fx-coin-shadow" aria-hidden="true"></span>' +
      '<span class="fx-coin-flight" aria-hidden="true"><span class="fx-coin-spin"><span class="fx-coin">' +
      '<span class="coin-edge"></span>' +
      '<span class="coin-face heads"><i data-icon-domain="game" class="ra ra-crown"></i><b>FULL</b></span>' +
      '<span class="coin-face tails"><i data-icon-domain="game" class="ra ra-moon-sun"></i><b>ONE</b></span>' +
      '</span></span></span>' +
      sparks +
      '<span class="fx-coin-label' +
      (heads ? '' : ' tails') +
      '" aria-live="polite" aria-hidden="true"><b>' +
      (heads ? 'HEADS' : 'TAILS') +
      '</b><span>' +
      esc(label || (heads ? 'Fortune restores the deal' : 'The bargain takes its due')) +
      '</span></span>';
    layer.appendChild(wrap);
    /* Do not expose the result text—even to assistive tech—until the
       modeled coin has landed. The board repaint remains held by the
       returned duration, preserving the existing no-spoiler contract. */
    setTimeout(function () {
      wrap.classList.add('landed');
      var t = wrap.querySelector('.fx-coin-label');
      if (t) t.setAttribute('aria-hidden', 'false');
    }, landAt);
    setTimeout(function () {
      wrap.classList.add('out');
    }, fadeAt);
    setTimeout(function () {
      wrap.remove();
    }, doneAt);
    return doneAt;
  }

  /* --------------------------------------------------------
     Buff / debuff visuals. Signature skills get a bigger,
     showier version than Basics.
     -------------------------------------------------------- */
  var STATUS_FX = {
    taunt: { color: '#ffd98a', icon: 'ra-shield', kind: 'buff' },
    untargetable: { color: '#a9e9ff', icon: 'ra-aura', kind: 'buff' },
    shield: { color: '#9fd8ff', icon: 'ra-round-shield', kind: 'buff' },
    silence: { color: '#e0a3ff', icon: 'ra-uncertainty', kind: 'debuff' },
    marked: { color: '#ffe066', icon: 'ra-lightning-storm', kind: 'debuff' },
    burn: { color: '#ff7a3c', icon: 'ra-burning-embers', kind: 'debuff' },
    exposed: { color: '#ff5f7e', icon: 'ra-broken-shield', kind: 'debuff' },
    healdown: { color: '#ff9d9d', icon: 'ra-broken-heart', kind: 'debuff' },
    costup: { color: '#ff9d9d', icon: 'ra-hourglass', kind: 'debuff' },
    costdown: { color: '#8fe3b0', icon: 'ra-hourglass', kind: 'buff' },
    atk: { color: '#ffb347', icon: 'ra-muscle-up', kind: 'buff' },
    def: { color: '#5fb2ff', icon: 'ra-heavy-shield', kind: 'buff' },
    crit: { color: '#ffd050', icon: 'ra-target-arrows', kind: 'buff' },
  };

  function playStatus(uid, key, positive, signature) {
    var t = centreOf(uid);
    if (!t) return;
    /* Shield formation already has its own material cue. All other
       status glyphs share one restrained up/down vocabulary. */
    if (key !== 'shield' && window.EOL.audio)
      window.EOL.audio.battle(positive ? 'buff' : 'debuff', { signature: !!signature });
    var def = STATUS_FX[key] || STATUS_FX.atk;
    var color = positive ? def.color : def.kind === 'buff' ? '#ff9d9d' : def.color;
    var big = signature ? ' big' : '';

    // rising or sinking glyph
    var g = spawn(
      'fx-status ' + (positive ? 'up' : 'down') + big,
      t.x,
      t.y + (positive ? 16 : -16),
      color,
      1000
    );
    g.innerHTML = '<i data-icon-domain="game" class="ra ' + def.icon + '"></i>';

    // ring sweeping the card
    spawn('fx-stat-ring ' + (positive ? 'up' : 'down') + big, t.x, t.y, color, 720);

    if (signature) {
      // signature skills also throw a rune circle and orbiting motes
      spawn('fx-rune ' + (positive ? 'up' : 'down'), t.x, t.y, color, 900);
      for (var i = 0; i < 6; i++) {
        var m = spawn('fx-mote', t.x, t.y, color, 860);
        m.style.setProperty('--a', i * 60 + 'deg');
        m.style.animationDelay = i * 45 + 'ms';
      }
    }
    var el = t.el;
    if (el) {
      var cls = positive ? 'buffed' : 'debuffed';
      el.classList.add(cls);
      setTimeout(function () {
        el.classList.remove(cls);
      }, 620);
    }
  }

  /* team-wide status (cost modifiers) pulses every unit on that side */
  function playTeamStatus(side, key, positive, signature) {
    E.unitsOf(B, side).forEach(function (u, i) {
      setTimeout(function () {
        playStatus(u.uid, key, positive, signature);
      }, i * 60);
    });
  }

  /* soft pulse for heals / buffs that have no attacker */
  /* Burn tick: a small pyre of flames rises off the card. */
  function playBurnTick(uid) {
    var t = centreOf(uid);
    if (!t) return;
    if (window.EOL.audio) window.EOL.audio.battle('burn');
    var C = '#ff7a3c';
    spawn('fx-burn-glow', t.x, t.y, C, 760);
    for (var i = 0; i < 9; i++) {
      var f = spawn('fx-burn-flame', t.x, t.y, i % 3 ? C : '#ffc46b', 820);
      f.style.setProperty('--sx', (Math.random() * 46 - 23).toFixed(1) + 'px');
      f.style.setProperty('--sy', (-30 - Math.random() * 44).toFixed(1) + 'px');
      f.style.animationDelay = i * 40 + 'ms';
    }
    if (t.el) {
      t.el.classList.add('burning-hit');
      setTimeout(function () {
        var n = document.querySelector('.bcard[data-uid="' + uid + '"]');
        if (n) n.classList.remove('burning-hit');
      }, 780);
    }
  }

  function playAura(uid, kind) {
    var t = centreOf(uid);
    if (!t) return;
    if (kind === 'heal' && window.EOL.audio) window.EOL.audio.battle('heal');
    spawn('fx-aura ' + kind, t.x, t.y, null, 640);
    if (kind === 'heal') {
      // a swelling ring of light under the hero
      spawn('fx-heal-ring', t.x, t.y, '#7ef0a8', 820);
      for (var i = 0; i < 5; i++) {
        var m = spawn('fx-plus', t.x + (Math.random() * 44 - 22), t.y + 14, '#7ef0a8', 900);
        m.style.animationDelay = i * 70 + 'ms';
      }
      // motes spiralling upward
      for (var k = 0; k < 8; k++) {
        var sp = spawn('fx-heal-mote', t.x, t.y + 18, '#9dffc4', 950);
        sp.style.setProperty('--sx', (Math.random() * 58 - 29).toFixed(1) + 'px');
        sp.style.setProperty('--sy', (-40 - Math.random() * 46).toFixed(1) + 'px');
        sp.style.animationDelay = k * 46 + 'ms';
      }
    }
  }

  /* A shield forming: a hexagonal barrier snaps into place. */
  function playShieldForm(uid) {
    var t = centreOf(uid);
    if (!t) return;
    if (window.EOL.audio) window.EOL.audio.battle('shield');
    spawn('fx-barrier', t.x, t.y, '#9fd8ff', 900);
    spawn('fx-barrier d2', t.x, t.y, '#cfe9ff', 900);
    for (var i = 0; i < 6; i++) {
      var sh = spawn('fx-barrier-shard', t.x, t.y, '#9fd8ff', 760);
      var a = (i / 6) * Math.PI * 2;
      sh.style.setProperty('--sx', (Math.cos(a) * 40).toFixed(1) + 'px');
      sh.style.setProperty('--sy', (Math.sin(a) * 40).toFixed(1) + 'px');
      sh.style.animationDelay = i * 30 + 'ms';
    }
  }

  /* Cleanse: debuffs shatter and lift away. */
  function playCleanse(uid) {
    var t = centreOf(uid);
    if (!t) return;
    if (window.EOL.audio) window.EOL.audio.battle('cleanse');
    spawn('fx-cleanse-ring', t.x, t.y, '#bfe9ff', 760);
    for (var i = 0; i < 7; i++) {
      var p = spawn('fx-cleanse-mote', t.x, t.y, '#e8f6ff', 820);
      p.style.setProperty('--sx', (Math.random() * 60 - 30).toFixed(1) + 'px');
      p.style.setProperty('--sy', (-34 - Math.random() * 40).toFixed(1) + 'px');
      p.style.animationDelay = i * 34 + 'ms';
    }
  }

  /* Energy gained / stolen: a chevron pulse at the hero. */
  function playEnergy(uid, positive) {
    var t = centreOf(uid);
    if (!t) return;
    if (window.EOL.audio) window.EOL.audio.battle('energy', { positive: !!positive });
    var c = positive ? '#7fe3ff' : '#ff9d9d';
    spawn('fx-energy-burst', t.x, t.y, c, 720);
    for (var i = 0; i < 5; i++) {
      var b = spawn('fx-energy-bit', t.x, t.y, c, 700);
      b.style.setProperty('--sx', (Math.random() * 50 - 25).toFixed(1) + 'px');
      b.style.setProperty(
        '--sy',
        ((positive ? -1 : 1) * (24 + Math.random() * 30)).toFixed(1) + 'px'
      );
      b.style.animationDelay = i * 40 + 'ms';
    }
  }

  /* Plays every FX for the log entries added since the last call.
     Returns how long the caller should wait before moving on. */
  function flashRecent() {
    var fresh = B.log.slice(lastLogLen);
    lastLogLen = B.log.length;
    var hold = 0;

    // group damage from the same attacker so multi-target hits read as AoE
    var groups = {};
    var order = [];
    fresh.forEach(function (l) {
      if (l.type !== 'damage' || !l.meta || !l.meta.src) return;
      var k = l.meta.src + '|' + (l.meta.element || '');
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(l);
    });

    order.forEach(function (k) {
      var hits = groups[k];
      // AoE only when several DISTINCT victims are struck. Abilities that
      // hit one target twice (Mulan's Aim, Nezha's follow-up) are not AoE.
      var uids = [];
      hits.forEach(function (h) {
        if (uids.indexOf(h.meta.uid) === -1) uids.push(h.meta.uid);
      });
      if (uids.length < 2) return;

      playAoe(hits[0].meta.src, uids, hits[0].meta.element);
      hits.forEach(function (h, i) {
        h.__aoe = true;
        popNumber(h, 260 + i * 70);
        // the number floats for ~1.1s after it is scheduled
        hold = Math.max(hold, 260 + i * 70 + popMs());
      });
    });

    var seq = {}; // per-target hit counter, so repeat hits stagger
    var absorbed = {}; // targets whose shield already played this blow
    var lastHit = {}; // uid -> offset of the most recent blow
    var revived = {}; // uid -> ms to hold back follow-up status pops
    fresh.forEach(function (l) {
      if (!l.meta) return;
      if (!l.meta.uid && !l.meta.side) return;

      if (l.type === 'coin') {
        // already played by commit() before the rest of the log released
        return;
      }
      if (l.type === 'action') {
        // the cast tell fires first, so you see what is being cast
        playCast(l.meta.uid, l.meta.element, l.meta.signature);
        return;
      }
      if (l.type === 'damage' && l.meta.src && !l.__aoe) {
        // multi-hit abilities land one blow at a time instead of stacking
        var seat = seq[l.meta.uid] || 0;
        var already = absorbed[l.meta.uid];
        if (already) {
          // the shield already played this blow's projectile
          popNumber(l, already.offset + 400);
          hold = Math.max(hold, already.offset + 400 + popMs());
          absorbed[l.meta.uid] = null;
          return;
        }
        seq[l.meta.uid] = seat + 1;
        var offset = seat * 720;
        lastHit[l.meta.uid] = offset;
        setTimeout(function () {
          playStrike(l.meta.src, l.meta.uid, l.meta.element, l.meta.crit);
        }, offset);
        popNumber(l, offset + 320);
        hold = Math.max(hold, offset + 320 + popMs());
        return;
      }
      if (l.type === 'revive') {
        // land the resurrection just after the blow that felled the hero
        var rdelay = (lastHit[l.meta.uid] || 0) + 420;
        revived[l.meta.uid] = rdelay + REVIVE_FALL_MS + REVIVE_DOWN_MS + REVIVE_RESTORE_MS;
        hold = Math.max(hold, rdelay + REVIVE_TOTAL_MS + 500);
        (function (uid, d) {
          setTimeout(function () {
            playRevive(uid, 'REBORN');
          }, d);
        })(l.meta.uid, rdelay);
        return;
      }
      if (l.type === 'burn') {
        // damage-over-time tick: flames lick up the card, then the number
        playBurnTick(l.meta.uid);
        popNumber(l, 160);
        hold = Math.max(hold, 160 + popMs());
        return;
      }
      if (l.type === 'heal') {
        playAura(l.meta.uid, 'heal');
        popNumber(l, 0);
        hold = Math.max(hold, popMs());
        return;
      }
      if (l.type === 'energy' && l.meta.uid) {
        playEnergy(l.meta.uid, (l.meta.amount || 0) >= 0);
        return;
      }
      if (l.type === 'cleanse') {
        playCleanse(l.meta.uid);
        return;
      }
      if (l.type === 'absorb') {
        // shield soaked the blow - show it in shield colour
        var aseat = seq[l.meta.uid] || 0;
        seq[l.meta.uid] = aseat + 1;
        var aoff = aseat * 720;
        absorbed[l.meta.uid] = { offset: aoff };
        if (l.meta.src) {
          setTimeout(function () {
            playStrike(
              l.meta.src,
              l.meta.uid,
              l.meta.element || 'Light',
              !!l.meta.crit
            );
          }, aoff);
        }
        popNumber(l, aoff + 320);
        hold = Math.max(hold, aoff + 320 + popMs());
        return;
      }
      if (l.type === 'shield' && l.meta.amount != null) {
        playShieldForm(l.meta.uid);
        playStatus(l.meta.uid, 'shield', true, l.meta.signature);
        popNumber(l, 0);
        hold = Math.max(hold, popMs());
        return;
      }
      if (l.type === 'buff' || l.type === 'debuff' || l.type === 'shield' || l.type === 'mark') {
        var key = l.meta.status || l.meta.stat;
        if (!key) return;
        var positive = l.type === 'buff' || l.type === 'shield';
        if (l.meta.amt != null) positive = l.meta.amt >= 0;
        // a hero mid-resurrection shows its new buffs once the light clears
        var wait = revived[l.meta.uid] || 0;
        if (wait) {
          (function (uid, k, pos, sig, d) {
            setTimeout(function () {
              playStatus(uid, k, pos, sig);
            }, d);
          })(l.meta.uid, key, positive, l.meta.signature, wait);
          return;
        }
        if (l.meta.side) playTeamStatus(l.meta.side, key, positive, l.meta.signature);
        else playStatus(l.meta.uid, key, positive, l.meta.signature);
        return;
      }
      if (l.type === 'damage' && !l.meta.src && !l.__aoe) {
        popNumber(l, 0);
        hold = Math.max(hold, popMs());
      }
    });
    /* A DEATH has to finish falling before anything reads the result.
       This is what made Victory/Defeat pop the instant you landed the
       killing blow: flashRecent only ever reported a hold for revives,
       so every other animation was still mid-flight when endBattle()
       ran. */
    var deaths = fresh.filter(function (l) {
      return l.type === 'death';
    });
    if (deaths.length && window.EOL.audio) window.EOL.audio.battle('death');
    if (deaths.length) hold = Math.max(hold, hold + deathMs());
    return hold;
  }

  /* floating damage / heal number, timed to land with the impact */
  /* Floating combat number. Rendered into the fx layer rather than the
     card so a dying card's grayscale filter can't wash it out. */
  function popNumber(l, delay) {
    if (l.meta.amount == null) return;
    var kind =
      l.type === 'heal'
        ? 'heal'
        : l.type === 'absorb'
          ? 'absorb'
          : l.type === 'shield'
            ? 'shieldgain'
            : l.type === 'burn'
              ? 'burn'
              : 'damage';
    var sign = kind === 'heal' || kind === 'shieldgain' ? '+' : '-';

    setTimeout(function () {
      var c = centreOf(l.meta.uid);
      if (!c) return;
      var pop = document.createElement('div');
      pop.className = 'pop ' + kind + (l.meta.crit ? ' crit' : '');
      var value = document.createElement('span');
      value.className = 'pop-value';
      value.textContent = sign + Number(l.meta.amount).toLocaleString();
      pop.appendChild(value);
      /* The gold number alone was too easy to miss, and AoE/shielded
         animation paths do not all run the large impact word. Attach the
         verdict to the number itself so every logged crit says CRITICAL. */
      if (l.meta.crit) {
        var verdict = document.createElement('span');
        verdict.className = 'pop-critical';
        verdict.textContent = 'CRITICAL';
        pop.appendChild(verdict);
      }
      // stack simultaneous numbers so they don't overlap
      var lane = popLane[l.meta.uid] || 0;
      popLane[l.meta.uid] = lane + 1;
      setTimeout(function () {
        popLane[l.meta.uid] = Math.max(0, (popLane[l.meta.uid] || 1) - 1);
      }, 900);
      pop.style.left = c.x + 'px';
      pop.style.top = c.y - lane * 26 + 'px';
      fxLayer().appendChild(pop);
      setTimeout(function () {
        pop.remove();
      }, 1100);

      if (l.meta.uid && c.el) {
        var cls = kind === 'heal' || kind === 'shieldgain' ? 'healed' : 'hit';
        c.el.classList.add(cls);
        setTimeout(function () {
          c.el.classList.remove('hit', 'healed');
        }, 1000);

        if (l.meta.hpAfter != null && l.meta.maxHp) {
          var wrap = c.el.closest('.bcell-wrap');
          if (wrap) {
            var fill = wrap.querySelector('.bbar-fill');
            var hpTxt = wrap.querySelector('.bhp-txt');
            var shieldFill = wrap.querySelector('.bbar-shield');
            if (fill) {
              fill.style.width = Math.max(0, (l.meta.hpAfter / l.meta.maxHp) * 100) + '%';
            }
            if (shieldFill) {
              shieldFill.style.width =
                Math.min(100, ((l.meta.shieldAfter || 0) / l.meta.maxHp) * 100) + '%';
            }
            if (hpTxt) {
              hpTxt.textContent = Math.ceil(
                l.meta.hpAfter + (l.meta.shieldAfter || 0)
              ).toLocaleString();
            }
          }
        }
      }
    }, delay);
  }
  var popLane = {};

  var toastTimer;
  /* THE ONE STATUS TOAST.
     -------------------------------------------------------------
     This used to be a second, independent implementation writing to
     a different element (<div id="toast">) than the rest of the game
     (<div id="toasts">), with its own CSS block. Two consequences:

       - the two `.toast` rules in style.css fought each other, since
         both elements carry the same class;
       - this copy took no icon, so battle.js:2445 was already calling
         toast('Out of time - passing', 'ri-timer-line') and silently
         dropping the icon.

     Now it delegates to the shared helper (js/play.js toast, reached
     through EOL.ui.toast, which app.js already routes for everyone
     else). Stacking, icons and timing come free and identical.
     Falls back to the old element only if play.js has not loaded -
     a fight can start before the menu layer in some entry paths. */
  function toast(msg, icon) {
    if (window.EOL.ui && typeof window.EOL.ui.toast === 'function' &&
        window.EOL.play && typeof window.EOL.play.toast === 'function') {
      window.EOL.ui.toast(msg, icon);
      return;
    }
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 2000);
  }

  function endBattle() {
    if (endingBattle) return;
    endingBattle = true;
    hideTip();
    stopClock();
    disarmForfeit();
    /* Tell the server the match is over, so an abandoned-looking row
       is not left `active` and neither player gets rejoined into a
       finished game. */
    /* The board is passed so the archive can record who won and how
       long it took; netplay owns the replay tape itself. */
    if (netCtl && netCtl.finish) netCtl.finish(B);
    var fb = $('btn-forfeit');
    if (fb) fb.hidden = true;
    cancelAuto();
    ponderCancel();
    clearSel();
    /* Let the final blow finish reading before the verdict lands. The
       board is already settled by the time we get here (flashRecent's
       hold is awaited by every caller), but a short beat keeps the kill
       and the result from sharing a frame. */
    busy = true;
    document.body.dataset.busy = '1';
    setTimeout(function () {
      cineReset();
      showResult();
      /* RELEASE THE BUSY CURSOR.
         `busy` blocks input while the board animates, and body[data-busy]
         paints the wait cursor. endBattle used to set it and never clear
         it, so after the last game of a session the pointer stayed stuck
         on the hourglass over the result screen and every menu behind it.
         The battle is over; there is nothing left to wait for. */
      busy = false;
      document.body.dataset.busy = '0';
      setNetWait(false);
    }, cineMs(RESULT_DELAY_MS));
  }
  var RESULT_DELAY_MS = 620;

  /* THE BATTLE REPORT (playtest 2026-08-10: 'this would help people
     learn which cards are good'). Per-legend lifetime numbers from the
     engine's own tally - damage dealt (shield soak included), healing,
     damage taken, kills. Shown at the end of single games and drafts;
     Unabridged holds it for the END OF THE SET and merges all games. */
  function gameTallySnapshot() {
    var out = { you: {}, foe: {} };
    (B.units || []).forEach(function (u) {
      var t = (B.tally || {})[u.uid];
      var side = u.side === 'player' ? 'you' : 'foe';
      var row =
        out[side][u.card.id] ||
        (out[side][u.card.id] = {
          name: u.name,
          role: u.role,
          dealt: 0,
          healed: 0,
          taken: 0,
          kills: 0,
        });
      if (!t) return;
      row.dealt += t.dealt;
      row.healed += t.healed;
      row.taken += t.taken;
      row.kills += t.kills;
    });
    return out;
  }

  function mergeReports(games) {
    var out = { you: {}, foe: {} };
    games.forEach(function (g) {
      ['you', 'foe'].forEach(function (side) {
        Object.keys(g[side] || {}).forEach(function (cid) {
          var s = g[side][cid];
          var row =
            out[side][cid] ||
            (out[side][cid] = {
              name: s.name,
              role: s.role,
              dealt: 0,
              healed: 0,
              taken: 0,
              kills: 0,
            });
          row.dealt += s.dealt;
          row.healed += s.healed;
          row.taken += s.taken;
          row.kills += s.kills;
        });
      });
    });
    return out;
  }

  function reportColHTML(label, cls, rows) {
    rows.sort(function (a, b) {
      return b.dealt + b.healed - (a.dealt + a.healed);
    });
    return (
      '<div class="rs-col"><b class="rs-side ' +
      cls +
      '">' +
      esc(label) +
      '</b>' +
      rows
        .map(function (r) {
          return (
            '<div class="rs-row">' +
            '<i data-icon-domain="game" class="ra ' +
            (ROLE_ICON[r.role] || 'ra-player') +
            '"></i>' +
            '<span class="rs-name">' +
            esc(r.name) +
            '</span>' +
            '<span class="rs-n" title="Damage dealt"><i data-icon-domain="game" class="ra ra-sword"></i>' +
            r.dealt.toLocaleString() +
            '</span>' +
            '<span class="rs-n heal" title="Healing done"><i data-icon-domain="game" class="ra ra-health"></i>' +
            r.healed.toLocaleString() +
            '</span>' +
            '<span class="rs-n taken" title="Damage taken"><i data-icon-domain="game" class="ra ra-broken-shield"></i>' +
            r.taken.toLocaleString() +
            '</span>' +
            '<span class="rs-n ko" title="Kills">' +
            (r.kills ? '<i data-icon-domain="game" class="ra ra-skull"></i>' + r.kills : '') +
            '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function paintBattleReport(sr) {
    var rs = $('result-stats');
    if (!rs) return;
    /* mid-set: the sideboard is next, the report waits for the war */
    if (sr && !sr.over) {
      rs.hidden = true;
      rs.innerHTML = '';
      return;
    }
    var agg = gameTallySnapshot();
    if (sr && sr.over && window.EOL.play && window.EOL.play._setReport) {
      var games = window.EOL.play._setReport();
      if (games && games.length) agg = mergeReports(games);
    }
    var toRows = function (side) {
      return Object.keys(agg[side]).map(function (cid) {
        return agg[side][cid];
      });
    };
    var foeName = rivalInfo && rivalInfo.name ? rivalInfo.name + "'s legends" : 'Enemy legends';
    rs.innerHTML =
      '<div class="rs-head"><i class="ri-bar-chart-2-line"></i><span>Battle report' +
      (sr && sr.over ? ' - full set' : '') +
      '</span><span class="rs-key"><i data-icon-domain="game" class="ra ra-sword"></i> dealt &middot; <i data-icon-domain="game" class="ra ra-health"></i> healed &middot; <i data-icon-domain="game" class="ra ra-broken-shield"></i> taken &middot; <i data-icon-domain="game" class="ra ra-skull"></i> kills</span></div>' +
      '<div class="rs-cols">' +
      reportColHTML('Your legends', 'you', toRows('you')) +
      reportColHTML(foeName, 'foe', toRows('foe')) +
      '</div>';
    rs.hidden = false;
  }

  function showResult() {
    var win = B.winner === 'player';
    if (window.EOL.audio) window.EOL.audio.result(win);
    var ov = $('result');
    ov.className = 'result show ' + (win ? 'win' : 'lose');
    ov.querySelector('.result-title').textContent = win ? 'Victory' : 'Defeat';
    ov.querySelector('.result-sub').textContent = win
      ? 'The enemy team has fallen.'
      : 'Your team has fallen.';
    ov.querySelector('.result-rounds').textContent =
      B.round === 1
        ? win
          ? 'Won in a single round'
          : 'Lost in a single round'
        : (win ? 'Won after ' : 'Fell after ') + B.round + ' rounds';
    var puzzleResult =
      B.puzzle && window.EOL.daily && window.EOL.daily.onResult
        ? window.EOL.daily.onResult(win, B)
        : null;
    if (puzzleResult) {
      ov.querySelector('.result-title').textContent = puzzleResult.title;
      ov.querySelector('.result-sub').textContent = puzzleResult.sub;
      ov.querySelector('.result-rounds').textContent =
        'Started in round ' + B.puzzle.startRound + ' · finished in round ' + B.round;
    }
    /* THE SET: play.js reframes the outcome as set progress (score
       line instead of epitaph, "Sideboard"/"New set" instead of
       "Rematch") and returns null when no set is live - a non-set
       match is untouched. */
    var sr =
      !B.puzzle && window.EOL.play && window.EOL.play.setGameResult
        ? window.EOL.play.setGameResult(win, gameTallySnapshot())
        : null;
    paintBattleReport(sr);
    /* MATCH PAY (owner ruling 2026-08-10): singleplayer 50/25, PvP
       75/50, per game. Campaign battles pay through their gates, not
       here. Paid exactly once per battle instance. */
    var coinsEl = $('result-coins');
    if (coinsEl) {
      coinsEl.hidden = true;
      coinsEl.classList.remove('campaign-rewards');
    }
    if (!B.campaignStage && !B.puzzle && window.EOL.econ && !B._coinsPaid) {
      B._coinsPaid = true;
      var P = window.EOL.econ.PAY;
      var pay = netCtl ? (win ? P.pvpWin : P.pvpLoss) : win ? P.spWin : P.spLoss;
      window.EOL.econ.addCoins(pay);
      if (coinsEl) {
        coinsEl.innerHTML = '<i class="ri-coin-fill coin-ico"></i>+' + pay + ' coins';
        coinsEl.hidden = false;
      }
    }
    if (sr) {
      ov.querySelector('.result-sub').textContent = sr.sub;
      var rm = $('btn-rematch');
      if (rm) rm.querySelector('span').textContent = sr.rematchLabel;
    }
    if (puzzleResult) {
      var puzzleRematch = $('btn-rematch');
      if (puzzleRematch && puzzleRematch.querySelector('span')) {
        puzzleRematch.querySelector('span').textContent = puzzleResult.rematchLabel;
      }
      var puzzleHome = $('btn-result-home');
      if (puzzleHome && puzzleHome.querySelector('span')) {
        puzzleHome.querySelector('span').textContent = puzzleResult.homeLabel;
      }
    }
    /* CAMPAIGN: the road frames its own result - Retry (fight the gate
       again) on the primary button, and a chapter-map exit on the home
       button that plays the stage epilogue after a win. Mid-set the
       campaign stands down (`midSet`): the sideboard framing above is
       the correct chrome between games, and stage progress must only
       commit when the WAR is decided, never on game 1 of 3. */
    var cam =
      window.EOL.campaign && window.EOL.campaign.onBattleResult
        ? window.EOL.campaign.onBattleResult(win, { midSet: !!(sr && !sr.over) })
        : null;
    if (cam && cam.campaign) {
      if (cam.sub) ov.querySelector('.result-sub').textContent = cam.sub;
      /* Campaign gates pay real rewards too. Put the exact receipt on
         the victory card instead of making the player infer it later
         from their wallet or collection. */
      if (coinsEl && cam.rewards) {
        coinsEl.innerHTML =
          '<i data-icon-domain="game" class="ra ra-open-treasure-chest"></i><span>' +
          esc(cam.rewards) +
          '</span>';
        coinsEl.classList.add('campaign-rewards');
        coinsEl.hidden = false;
      }
      var rm2 = $('btn-rematch');
      if (rm2) rm2.querySelector('span').textContent = cam.rematchLabel || 'Retry';
      var home2 = $('btn-result-home');
      if (home2) home2.querySelector('span').textContent = cam.homeLabel || 'Map';
    }
    if (!measurementComplete) {
      measurementComplete = true;
      if (window.EOL.telemetry && window.EOL.telemetry.battleCompleted) {
        window.EOL.telemetry.battleCompleted({
          won: !!win,
          rounds: B.round,
          set_over: sr ? !!sr.over : true,
        });
      }
    }
    /* Mid-set there is no walking away from the war: the result screen
       offers ONLY the sideboard (user law 2026-08-04). Home returns
       once the set is decided, and was never touched outside a set. */
    var home = $('btn-result-home');
    if (home) home.style.display = sr && !sr.over ? 'none' : '';
  }

  /* Flyouts are CSS-driven and live inside each card, so nothing to
     position here. Kept so callers can force-clear any stray node. */
  function hideTip() {
    document.querySelectorAll('.tip-wrap').forEach(function (t) {
      t.remove();
    });
    hideStatusPop();
    clearPreview();
    if (!sel || !sel.unit) {
      hoverUnit = null;
      paintDock();
    }
  }

  /* ---------------------------------------------------------
     FLOATING STATUS PANEL
     -------------------------------------------------------------
     A status chip's rules panel cannot live inside the card: three
     ancestors clip it (.bcard-inner overflow:hidden for the art mask,
     .board overflow:clip, .view overflow:hidden). Re-parenting the
     panel to <body> and positioning it manually is the only way it can
     escape all three, so both the battle chips and the hover card's
     status icons delegate to this one layer.
     --------------------------------------------------------- */
  var stpEl = null;

  function statusPopLayer() {
    if (!stpEl) {
      stpEl = document.createElement('div');
      stpEl.className = 'st-float';
      stpEl.setAttribute('role', 'tooltip');
      document.body.appendChild(stpEl);
    }
    return stpEl;
  }

  function hideStatusPop() {
    if (stpEl) stpEl.classList.remove('show');
  }

  /* Anchor above the chip, flipping below when there is no room, and
     clamped horizontally so it never leaves the viewport. */
  function showStatusPop(anchor, html, colour) {
    var el = statusPopLayer();
    el.innerHTML = html;
    el.style.setProperty('--sc', colour || '#fff');
    el.classList.add('show');

    /* root-zoom bridge: rects are zoomed px, style/offset px are not -
       the pop lives at body level, so its assignment space divides
       by uiS() exactly like the in-view consumers */
    var z = uiS();
    var a = anchor.getBoundingClientRect();
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var pad = 8;
    var gap = 9;

    var left = a.left / z + a.width / z / 2 - w / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth / z - w - pad));

    var top = a.top / z - h - gap;
    var below = false;
    if (top < pad) {
      top = a.bottom / z + gap;
      below = true;
    }
    top = Math.max(pad, Math.min(top, window.innerHeight / z - h - pad));

    el.classList.toggle('below', below);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  /* One delegated pair of listeners covers every chip that exists now or
     is rendered later, which matters because the board re-renders on
     every action. `.st-pop` / `.dk-spop` stay in the markup as the data
     source and are hidden by CSS. */
  function initStatusPops() {
    function panelFor(node) {
      var chip = node.closest && node.closest('.st-chip, .dk-sicon');
      if (!chip) return null;
      var src = chip.querySelector('.st-pop, .dk-spop');
      if (!src) return null;
      return { chip: chip, html: src.innerHTML, colour: chip.style.getPropertyValue('--sc') };
    }
    function onOver(e) {
      var p = panelFor(e.target);
      if (!p) return;
      showStatusPop(p.chip, p.html, p.colour);
    }
    function onOut(e) {
      if (!e.target.closest || !e.target.closest('.st-chip, .dk-sicon')) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest('.st-chip, .dk-sicon')) return;
      hideStatusPop();
    }
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onOver, true);
    document.addEventListener('focusout', onOut, true);
    document.addEventListener(
      'mousemove',
      function (e) {
        if (!e.target || !e.target.closest || !e.target.closest('.st-chip, .dk-sicon')) {
          hideStatusPop();
        }
      },
      true
    );
    window.addEventListener('scroll', hideStatusPop, true);
    window.addEventListener('resize', hideStatusPop);
  }

  /* ---------------------------------------------------------
     boot
     -------------------------------------------------------------
     start({ deck: [cardId x6] }) fields that deck on the player side;
     start() with no args fields random teams - or reuses the last deck,
     so Rematch keeps your squad and shuffles a fresh enemy. */
  /* boot
     -------------------------------------------------------------
     start({ teams: { player: [entry x6], enemy: [entry x6] } }) fields
     exactly those sixes from the preparation phase - the player array's
     order IS their formation; the enemy gets role-aware auto-formation.
     Bare start() keeps the legacy random-team path (tests, fallbacks). */
  /* ---------------------------------------------------------
     HUD COMMANDERS
     -------------------------------------------------------------
     Both name plates were hardcoded in index.html, so an online match
     still read "You" vs "Enemy Bot" no matter who was playing. The
     signed-in player's handle and avatar come from auth; the opponent's
     name rides on the netplay controller as `label`.
     --------------------------------------------------------- */
  function avatarHtml(url, fallbackIcon) {
    if (url) {
      return '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" />';
    }
    var isGameIcon = fallbackIcon.indexOf('ri-') !== 0;
    var iconClass = isGameIcon ? 'ra ' + fallbackIcon : fallbackIcon;
    return (
      '<i' + (isGameIcon ? ' data-icon-domain="game"' : '') + ' class="' + iconClass + '"></i>'
    );
  }

  function paintCommanders() {
    var me = null;
    try {
      me = window.EOL.auth && window.EOL.auth.user ? window.EOL.auth.user() : null;
    } catch (e) {
      me = null;
    }

    var youName = (me && me.name) || 'You';
    var pn = $('pf-name-player');
    if (pn) pn.textContent = youName;
    var pi = $('pf-player');
    if (pi) pi.innerHTML = avatarHtml(me && me.avatar, 'ri-user-3-line');

    /* Against the bot there is no opponent identity to show, so the
       skull and "Enemy Bot" stay - they are correct, not a placeholder.
       The `matches` table carries p1_name/p2_name but no avatar column,
       so a real opponent gets their handle and the generic player glyph
       rather than a broken image. A CAMPAIGN battle shows the rival:
       the character is the opponent, and the plate should say so. */
    var foeName =
      netCtl && netCtl.label
        ? netCtl.label
        : rivalInfo && rivalInfo.name
          ? rivalInfo.name
          : 'Enemy Bot';
    var en = $('pf-name-enemy');
    if (en) en.textContent = foeName;
    var ei = $('pf-enemy');
    if (ei)
      ei.innerHTML =
        rivalInfo && rivalInfo.img
          ? avatarHtml(rivalInfo.img, 'ra-skull')
          : avatarHtml(null, netCtl ? 'ri-user-3-line' : 'ra-skull');
  }

  /* A generated puzzle is already several rounds into a real engine
     battle. Accept that state only through this narrow, validated path,
     then restore the live-only pieces intentionally omitted by
     engine.cloneBattle (logging, tallies and non-silent presentation). */
  function preparePrebuiltBattle(source, opts) {
    if (!source || !Array.isArray(source.units) || source.units.length !== 12) {
      throw new Error('Invalid prebuilt battle: expected twelve units');
    }
    if (source.over || source.winner || source.round < 1) {
      throw new Error('Invalid prebuilt battle: position is already finished');
    }
    if (!source.passed || !source.turnPassed || !source.acted || !source.energy) {
      throw new Error('Invalid prebuilt battle: turn state is incomplete');
    }
    if (opts.puzzle && (source.round < 5 || source.round > 8 || source.turn !== 'player')) {
      throw new Error('Invalid puzzle checkpoint: expected a player turn in rounds 5–8');
    }

    source.rng = opts.rng || source.rng || Math.random;
    source.simulation = false;
    source.silent = false;
    source.log = [];
    source.tally = {};
    source.uidMap = {};
    source.units.forEach(function (u) {
      if (!u || (u.side !== 'player' && u.side !== 'enemy') || !u.uid) {
        throw new Error('Invalid prebuilt battle: malformed unit');
      }
      u.battle = source;
      source.uidMap[u.uid] = u;
    });
    if (opts.puzzle) source.puzzle = opts.puzzle;
    return source;
  }

  function start(opts) {
    E = window.EOL.engine;
    AI = window.EOL.ai;
    opts = opts || {};
    if (opts.puzzle) {
      /* Match the forge certificate exactly even if a simulation tool or
         draft evaluator previously borrowed the global AI settings. */
      AI.setDepth(4);
      if (AI.clearSimulationBudget) AI.clearSimulationBudget();
    }
    if (!opts.puzzle && window.EOL.daily && window.EOL.daily.deactivate) {
      window.EOL.daily.deactivate();
    }
    /* A multiplayer battle hands us an adaptor for the other player and
       a shared rng seed. Both clients run the identical engine over the
       identical action stream, so they only have to agree on luck. */
    netCtl = opts.net || null;
    endingBattle = false;
    measurementComplete = false;
    rivalInfo = opts.rival || null;
    /* THE SCRIPTED MATCH (campaign gate I): the whole line, both
       sides, pre-computed against this exact seed. */
    moveScript =
      campaignTutorialsEnabled(opts) && opts.moveScript && opts.moveScript.length
        ? { moves: opts.moveScript.slice(), i: 0 }
        : null;
    setNetWait(false);
    stopClock();
    disarmForfeit();
    /* Forfeit is available in every battle (user request 2026-08-04):
       online it concedes to a person, solo it is simply the honest way
       out of a lost game - same two-step arm/confirm either way. */
    var fbtn = $('btn-forfeit');
    if (fbtn) fbtn.hidden = false;
    if (opts.prebuilt) {
      playerDeck = null;
      B = preparePrebuiltBattle(opts.prebuilt, opts);
    } else if (opts.teams && opts.teams.player && opts.teams.enemy) {
      playerDeck = null; // mode flows own their rematch config
      B = E.createBattle(
        opts.teams.player,
        opts.enemyFormed ? opts.teams.enemy : E.optimizeFormation(opts.teams.enemy),
        {
          roleAware: false,
          field: opts.field || null,
          rng: opts.rng || null,
          oddFirst: opts.oddFirst || null,
          enemyStatBonus: opts.enemyStatBonus || 0,
        }
      );
    } else {
      if (opts.deck) playerDeck = opts.deck.slice();
      var teams = buildTeams(playerDeck);
      /* Decked formation is explicit - the player's array order is their
         placement; only the enemy gets the role-aware auto-formation. */
      B = teams.explicit
        ? E.createBattle(teams.player, E.optimizeFormation(teams.enemy), {
            roleAware: false,
            field: opts.field || null,
            rng: opts.rng || null,
            oddFirst: opts.oddFirst || null,
            enemyStatBonus: opts.enemyStatBonus || 0,
          })
        : E.createBattle(teams.player, teams.enemy, {
            roleAware: true,
            field: opts.field || null,
            rng: opts.rng || null,
            oddFirst: opts.oddFirst || null,
            enemyStatBonus: opts.enemyStatBonus || 0,
          });
    }
    /* Campaign personality changes evaluation priorities only. The rival
       still enters the exact normal depth-4 bestAction path below. */
    B.aiProfiles = opts.aiProfiles || null;
    B.campaignDifficulty = opts.campaignDifficulty || null;
    B.enemyStatBonus = Math.max(0, +opts.enemyStatBonus || 0);
    if (window.EOL.audio) {
      window.EOL.audio.setBattlefield(B.field ? B.field.id : 'colosseum');
      window.EOL.audio.scene('battle', { field: B.field ? B.field.id : 'colosseum' });
    }
    /* A forfeit can arrive while it is OUR turn, when no decide()
       promise exists to wake the battle loop. Register an explicit
       terminal callback so Victory is shown immediately in either turn
       state; endBattle's once-guard handles the waiting-promise path. */
    if (netCtl && netCtl.onForfeitWin) {
      netCtl.onForfeitWin(function () {
        if (!B || !B.over || B.winner !== 'player') return;
        busy = false;
        document.body.dataset.busy = '0';
        render();
        endBattle();
      });
    }
    sel = null;
    busy = false;
    hoverUnit = null;
    lastLogLen = 0;
    playerDone = false;
    enemyDone = false;
    reviveFx = {};
    document.body.dataset.busy = '0';
    hideTip();
    cancelAuto();
    ponderCancel();
    cineReset();
    turnBannerSide = null;
    $('result').className = 'result';
    var rematchLabel = $('btn-rematch');
    if (rematchLabel && rematchLabel.querySelector('span')) {
      rematchLabel.querySelector('span').textContent = 'Rematch';
    }
    var homeLabel = $('btn-result-home');
    if (homeLabel && homeLabel.querySelector('span')) {
      homeLabel.querySelector('span').textContent = 'Home';
    }

    /* Theme the whole arena to the active battlefield. The board carries
       data-field for the per-field particle character and accent colour,
       and css/style.css draws that board's pattern, palette and motion
       from the data-field selector. */
    var boardEl = $('board');
    if (boardEl) {
      if (B.field) {
        boardEl.dataset.field = B.field.id;
        boardEl.style.setProperty('--bf-1', B.field.colors.primary);
        boardEl.style.setProperty('--bf-2', B.field.colors.secondary);
        boardEl.style.setProperty('--bf-3', B.field.colors.glow);
        /* Painted backdrop, when this field has one. Driven from the data
           so a new board needs only its PNG and an `art` key - no CSS.
           Fields without art keep their procedural pattern. */
        if (B.field.art) {
          boardEl.classList.add('has-art');
          /* Resolve against the DOCUMENT, not the stylesheet. A bare
             relative url() inside a custom property is resolved relative
             to css/style.css, which turned this into /css/assets/... and
             404'd on every field. */
          boardEl.style.setProperty(
            '--bf-art',
            'url("' + new URL(B.field.art, document.baseURI).href + '")'
          );
        } else {
          boardEl.classList.remove('has-art');
          boardEl.style.removeProperty('--bf-art');
        }
      } else {
        delete boardEl.dataset.field;
        boardEl.classList.remove('has-art');
        boardEl.style.removeProperty('--bf-art');
      }
    }

    /* Battlefield chip - pinned to the board's top-left corner. It names
       the terrain at a glance; hovering or focusing it opens a panel with
       the tagline, every rule in force, and the drafting implication. */
    var bfb = $('bf-chip');
    if (bfb) {
      var fld = B.field;
      bfb.hidden = !fld;
      if (fld) {
        var ico = $('bf-chip-ico');
        if (ico) ico.className = 'ra ' + fld.icon; // icon-domain: game
        var nm = $('bf-chip-name');
        if (nm) nm.textContent = fld.name;
        var pico = $('bfp-ico');
        if (pico) pico.className = 'ra ' + fld.icon; // icon-domain: game
        var pnm = $('bfp-name');
        if (pnm) pnm.textContent = fld.name;
        var pd = $('bfp-desc');
        if (pd) pd.textContent = fld.tagline || '';
        var ul = $('bfp-rules');
        if (ul) {
          ul.innerHTML = '';
          (fld.rules || []).forEach(function (r) {
            var li = document.createElement('li');
            li.textContent = r;
            ul.appendChild(li);
          });
          /* The Colosseum's only "rule" is that it has none - say so
             plainly rather than showing an empty list. */
          if (!(fld.rules || []).length) {
            var li0 = document.createElement('li');
            li0.className = 'bfp-none';
            li0.textContent = 'No special conditions - pure drafting and play.';
            ul.appendChild(li0);
          }
          if (fld.draft) {
            var li2 = document.createElement('li');
            li2.className = 'bfp-draft';
            li2.textContent = fld.draft;
            ul.appendChild(li2);
          }
        }
        bfb.style.setProperty('--bf-1', fld.colors.primary);
        bfb.style.setProperty('--bf-3', fld.colors.glow);
        /* The chip grows into its own panel, so it needs to know how
           tall the expanded box should be. Measure the body once now
           (it is laid out but clipped) and hand the height to CSS. */
        sizeFieldChip();
      }
    }

    /* Keep only a quiet provenance label in the HUD. Generation details
       are implementation data, not information the player needs. */
    var puzzleChip = $('puzzle-chip');
    if (puzzleChip) puzzleChip.hidden = !B.puzzle;

    paintCommanders();

    render();
    if (opts.campaignStage) B.campaignStage = opts.campaignStage;
    measurementContext = {
      mode: B.puzzle
        ? 'daily'
        : B.campaignStage
          ? 'campaign'
          : netCtl
            ? 'online_' + (opts.mode || 'unknown')
            : 'solo_' + (opts.mode || 'battle'),
      format: opts.war || 'single',
      field: B.field ? B.field.id : 'none',
    };
    if (B.campaignStage) measurementContext.stage = B.campaignStage;
    if (B.puzzle) measurementContext.official = !!B.puzzle.official;
    if (window.EOL.telemetry && window.EOL.telemetry.battleStarted) {
      window.EOL.telemetry.battleStarted(measurementContext);
    }
    /* CAMPAIGN: hand the settled battle to the road so the rival can
       speak during the match (non-blocking barks - a blocking overlay
       mid-battle is wrong, design §6). No-op outside the campaign. */
    if (B.campaignStage && window.EOL.campaign && window.EOL.campaign.onBattleStart) {
      try {
        window.EOL.campaign.onBattleStart(B);
      } catch (e) {
        /* lore must never break a fight */
      }
    }
    if (moveScript) scriptNotify();

    /* Round 1 opens on whoever the engine says it does. Singleplayer is
       always the player; in a match the guest opens the even rounds, so
       they may well be watching first. */
    announceRound();
    if (B.turn === 'enemy') {
      announceTurn('enemy');
      startClock('enemy');
      runEnemyAction();
      return;
    }
    announceTurn('player');
    ponderKick();
    /* The opening turn needs a clock too. This path used to inline
       announce+ponder and skip maybeAutoEndTurn, so round 1 was the
       one turn a stalling opponent could sit on forever. */
    startClock('player');
    if (
      !B.puzzle &&
      campaignTutorialsEnabled(B) &&
      window.EOL.coach &&
      window.EOL.coach.show
    ) {
      window.EOL.coach.show(
        'battle',
        'ri-sword-line',
        'Your first battle',
        'The tall bar is your Energy - every Skill costs some. The round counter above ' +
          'shows whose turn it is, and Pass ends your move. Tap a legend to fight.'
      );
    }
  }

  window.EOL.battle = {
    start: start,
    endTurn: endTurn,
    getState: function () {
      return B;
    },
    ponderStats: function () {
      return {
        kicks: ponderStats.kicks,
        decisions: ponderStats.decisions,
        hits: ponderStats.hits,
        misses: Math.max(0, ponderStats.decisions - ponderStats.hits),
        lastDepth: ponderStats.lastDepth,
      };
    },
    clearSel: clearSel,
    fitAbilityNames: fitAbilityNames,
    hideTip: hideTip,
    playStrike: playStrike,
    playAura: playAura,
    playAoe: playAoe,
    playStatus: playStatus,
    playCritImpact: playCritImpact,
    playCoinFlip: playCoinFlip,
    playRevive: playRevive,
    playBurnTick: playBurnTick,
    playCast: playCast,
    playShieldForm: playShieldForm,
    playCleanse: playCleanse,
    playEnergy: playEnergy,
    render: render,
    /* test hooks for the bot's draft (harness only) */
    _draft: draftBotTeam,
    _draftValue: draftValue,
    _markSets: markSets,
    _popNumber: popNumber,
    /* test hook: the scripted-match line state (harness only) */
    _scriptState: function () {
      return moveScript;
    },
  };

  window.addEventListener('resize', function () {
    if (B) {
      sizeBoard();
      sizeFieldChip(); // wrap count changes with the box, so re-measure
    }
  });

  /* The gate closes before the view swap (app.js defers the swap ~560ms),
     so the FIRST render()/sizeBoard() runs while the battle view is still
     hidden - a hidden .view is not flex-laid-out, its grid rows collapse
     to 0 and --cardw floors to ~28px ("tiny cards"). Re-measure once the
     view is actually active so the board opens at full size. */
  document.addEventListener('eol:view', function (ev) {
    if (B && ev.detail === 'battle') {
      requestAnimationFrame(function () {
        sizeBoard();
        sizeFieldChip();
      });
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initStatusPops();
    var et = $('btn-endturn');
    if (et) et.addEventListener('click', endTurn);
    var ff = $('btn-forfeit');
    if (ff) ff.addEventListener('click', onForfeit);
    var rm = $('btn-rematch');
    if (rm)
      rm.addEventListener('click', function () {
        if (B && B.puzzle && window.EOL.daily && window.EOL.daily.start) {
          window.EOL.daily.start();
          return;
        }
        if (window.EOL.play && window.EOL.play.rematch) window.EOL.play.rematch();
        else start();
      });
    // clicking empty space cancels a pending selection
    var board = $('board');
    if (board)
      board.addEventListener('click', function (ev) {
        /* The forfeit button is a child of the board, so this handler
           fires on its clicks too - and disarmed the button on the
           very click that armed it, making it impossible to confirm.
           Clicks that originate on the button are its own business. */
        if (ev.target.closest && ev.target.closest('#btn-forfeit')) return;
        if (forfeitArmed) disarmForfeit();
        if (!busy) clearSel();
      });
  });
})();
