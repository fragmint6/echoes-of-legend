/* =============================================================
   Echoes of Legend - Play Flow (modes, preparation, draft)
   -------------------------------------------------------------
   Owns everything between "Play" and the battle board:

     Play menu     Classic / Draft / Campaign (placeholder)
     Classic       pick a saved deck of 12 (or a shuffle row), the bot
                   rolls a random legal 12 of its own
     Draft         snake-draft: packs of 3, you open odd packs and the
                   bot opens even ones (3 -> 1+1, one discard per pack);
                   12 packs = two legal decks of 12
     Preparation   shared by both modes: ban 2 enemy heroes (choices
                   hidden until you commit yours), then field 6 of your
                   surviving 10 and arrange front/back rows

   Bot brains (bans, six, draft picks) reuse the synergistic
   draft-scoring already shipped for team building in battle.js.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var BATTLE = function () {
    return window.EOL.battle;
  };
  var RULES = function () {
    return window.EOL.deckRules;
  };

  /* ---------------- shared roster helpers ---------------- */
  var FLAT = null,
    BY_ID = null;
  function flatten() {
    if (FLAT) return FLAT;
    FLAT = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        FLAT.push({ card: c, faction: f });
      });
    });
    return FLAT;
  }
  function byId() {
    if (!BY_ID) {
      BY_ID = {};
      flatten().forEach(function (e) {
        BY_ID[e.card.id] = e;
      });
    }
    return BY_ID;
  }
  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc(s) : String(s);
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  /* GUI-scale bridge (see the same note in battle.js): with scale =
     root-element zoom, rects come back in zoomed px while style
     assignments are layout px. Divide by uiS() at the glass. */
  function uiS() {
    return window.EOL && window.EOL.scale && window.EOL.scale.factor
      ? window.EOL.scale.factor()
      : 1;
  }

  /* ---------------- status toasts (non-blocking beats) ---------------- */
  function toast(msg, icon) {
    var host = $('toasts');
    if (!host) return;
    var cls = icon ? (icon.indexOf('ra-') === 0 ? 'ra ' : 'ri ') + icon : 'ri ri-information-line';
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<i class="' + cls + '"></i><span>' + esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
    }, 2100);
    setTimeout(function () {
      t.remove();
    }, 2450);
  }

  /* ---------------- coach overlays (what to do, once per context) ---------------- */
  var COACH_KEY = 'eol.coach.v1';
  function coachSeen() {
    try {
      return JSON.parse(localStorage.getItem(COACH_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function coachHide() {
    var c = $('coach');
    if (!c) return;
    c.classList.remove('show');
    c.setAttribute('aria-hidden', 'true');
  }
  function coachOpen() {
    var c = $('coach');
    return !!(c && c.classList.contains('show'));
  }
  /* Shows the overlay unless this context was already explained once.
     opts.force re-shows it anyway while still recording the key so a
     later normal match does not double-explain. */
  function coachShow(key, icon, title, body, opts) {
    opts = opts || {};
    var forcing = !!opts.force;
    if (!forcing && coachSeen().indexOf(key) >= 0) return false;
    var c = $('coach');
    if (!c) return true;
    $('coach-ico').className = 'ra ' + icon;
    $('coach-title').textContent = title;
    $('coach-body').textContent = body;
    c.classList.add('show');
    c.setAttribute('aria-hidden', 'false');
    try {
      var seen = coachSeen();
      if (seen.indexOf(key) < 0) seen.push(key);
      localStorage.setItem(COACH_KEY, JSON.stringify(seen));
    } catch (e) {
      /* private mode */
    }
    return true;
  }

  /* ---------------- preparation state ---------------- */
  var prep = null; // active preparation state
  var prepAnim = false; // entrance stagger runs on phase ENTRY only -
  // a re-render mid-phase must not replay it

  /* ---------------- bot brains ---------------- */
  /* All three roster decisions (draft pick, ban, field six) route through
     window.EOL.draftAI - see data/draft-ai.js. It scores measured hero
     power, a full keyword-synergy web, role structure from the comp data,
     and (for bans) how much a card threatens the bot's own plan.
     A small random roll keeps identical decks from drawing identical
     lines every game. */
  function DAI() {
    return window.EOL.draftAI;
  }

  /* The bot's two bans against a 12-hero deck.
     It bans what is strongest IN CONTEXT: raw power, what the rest of
     your deck would unlock with it, and what would punish its own six. */
  function chooseBans(deckEntries, myPool) {
    var ai = DAI();
    var scored = deckEntries.map(function (e, i) {
      return {
        i: i,
        v: ai.denyValue(deckEntries, e, myPool || []) + Math.random() * 1.2,
      };
    });
    scored.sort(function (a, b) {
      return b.v - a.v;
    });
    return scored.slice(0, RULES().BANS).map(function (x) {
      return deckEntries[x.i].card.id;
    });
  }

  /* CAMPAIGN BAN PERSONALITIES (design §9.11).
     -------------------------------------------------------------
     A rival's characterisation is fiction until its bans differ from
     the stock chooseBans. A profile bends the same denyValue scoring
     toward the rival's obsession instead of replacing it:

       ids:[..]    always-ban list, first priority (the Recruiter's
                   scripted strikes)
       roles:[..]  prefers striking these roles (the Oathkeeper takes
                   your back line; the Outlaw takes your protectors)
       stat:'atk'  prefers your hardest hitters
       power:true  prefers your highest-rated cards (Gilgamesh bans
                   what the scales weigh heaviest) */
  function personaBans(profile, deckEntries, myPool) {
    var ai = DAI();
    var out = [];
    (profile.ids || []).forEach(function (id) {
      if (out.length >= RULES().BANS || out.indexOf(id) >= 0) return;
      var owns = deckEntries.some(function (e) {
        return e.card.id === id;
      });
      if (owns) out.push(id);
    });
    if (out.length < RULES().BANS) {
      var atkMax = 1;
      deckEntries.forEach(function (e) {
        atkMax = Math.max(atkMax, e.card.stats.atk);
      });
      var scored = deckEntries
        .filter(function (e) {
          return out.indexOf(e.card.id) < 0;
        })
        .map(function (e) {
          var v = ai.denyValue(deckEntries, e, myPool || []) + Math.random() * 0.9;
          if (profile.roles && profile.roles.indexOf(e.card.role) >= 0) v += 3.5;
          if (profile.stat === 'atk') v += (e.card.stats.atk / atkMax) * 2.5;
          if (profile.power) v += ai.powerOf(e.card) * 3.0;
          return { id: e.card.id, v: v };
        });
      scored.sort(function (a, b) {
        return b.v - a.v;
      });
      scored.forEach(function (s) {
        if (out.length < RULES().BANS) out.push(s.id);
      });
    }
    return out.slice(0, RULES().BANS);
  }

  /* Greedy best battle six from the surviving pool, with hard rails so a
     six is never fielded without a Tank or Medic when one was available.
     The field carries NO role cap: the deck's max-4 is the only rule.
     `preSeed` (ids or entries) are MUST-KEEPS taken from the pool before
     the greedy walk fills the rest - the campaign's scripted sixes
     (stages 1-4) and Gilgamesh's `pinned` hardcode (R5) both ride it. */
  function chooseSix(pool, enemyPool, preSeed) {
    var ai = DAI();
    var team = [],
      rest = pool.slice();
    var FIELD = RULES().FIELD_SIZE;
    (preSeed || []).forEach(function (p) {
      var pid = p && p.card ? p.card.id : p;
      for (var s = 0; s < rest.length; s++) {
        if (rest[s].card.id === pid) {
          if (team.length < FIELD) team.push(rest.splice(s, 1)[0]);
          break;
        }
      }
    });

    while (team.length < FIELD && rest.length) {
      var counts = {};
      team.forEach(function (t) {
        counts[t.card.role] = (counts[t.card.role] || 0) + 1;
      });
      var slotsLeft = FIELD - team.length;

      /* rails: with few slots left, force the missing keystone role */
      var forced = null;
      var poolHas = function (role) {
        return rest.some(function (e) {
          return e.card.role === role;
        });
      };
      if (!counts.Tank && poolHas('Tank') && slotsLeft <= 2) forced = 'Tank';
      else if (!counts.Medic && poolHas('Medic') && slotsLeft <= 1) forced = 'Medic';

      var best = -1,
        bestScore = -Infinity;
      for (var pass = 0; pass < 2 && best < 0; pass++) {
        for (var i = 0; i < rest.length; i++) {
          if (forced && pass === 0 && rest[i].card.role !== forced) continue;
          var v = ai.value(team, rest[i], { size: FIELD }) + Math.random() * 1.5;
          /* answer what the opponent is actually bringing */
          if (enemyPool && enemyPool.length) {
            for (var k = 0; k < enemyPool.length; k++) {
              v += ai.pairSynergy(rest[i], enemyPool[k]) * 0.0; // no self-synergy with foes
              v += counterBonus(rest[i], enemyPool[k]);
            }
          }
          if (v > bestScore) {
            bestScore = v;
            best = i;
          }
        }
      }
      if (best < 0) best = 0;
      team.push(rest.splice(best, 1)[0]);
    }
    return team;
  }

  /* What six do we EXPECT the opponent to field from their surviving pool?
     The bot never sees the six you actually locked - this forecast is its
     only read on your plans, and it is symmetric with what you know about
     the bot (its bans are revealed before you field).

     Deliberately IMPERFECT. A deterministic forecast reproduced the
     opponent's real six 96% of the time, which is indistinguishable from
     peeking: the bot would always be correctly countered. `spread` keeps
     a genuine margin of error, so a player who drafts unusually - going
     tankless, stacking a role, building round an off-meta combo - gets
     misread, which is what makes bluffing possible at all. */
  function predictSix(pool, spread) {
    var jitter = spread == null ? 3.0 : spread;
    var ai = DAI();
    var team = [],
      rest = pool.slice();
    var FIELD = RULES().FIELD_SIZE;
    while (team.length < FIELD && rest.length) {
      var counts = {};
      team.forEach(function (t) {
        counts[t.card.role] = (counts[t.card.role] || 0) + 1;
      });
      var slotsLeft = FIELD - team.length;
      var forced = null;
      var poolHas = function (role) {
        return rest.some(function (e) {
          return e.card.role === role;
        });
      };
      if (!counts.Tank && poolHas('Tank') && slotsLeft <= 2) forced = 'Tank';
      else if (!counts.Medic && poolHas('Medic') && slotsLeft <= 1) forced = 'Medic';

      var best = -1,
        bestScore = -Infinity;
      for (var pass = 0; pass < 2 && best < 0; pass++) {
        for (var i = 0; i < rest.length; i++) {
          if (forced && pass === 0 && rest[i].card.role !== forced) continue;
          var v = ai.value(team, rest[i], { size: FIELD }) + Math.random() * jitter;
          if (v > bestScore) {
            bestScore = v;
            best = i;
          }
        }
      }
      if (best < 0) best = 0;
      team.push(rest.splice(best, 1)[0]);
    }
    return team;
  }

  /* Small bonus for fielding a hero that punishes what the enemy fields. */
  function counterBonus(mine, theirs) {
    var ai = DAI();
    var M = ai.tags(mine),
      T = ai.tags(theirs);
    var s = 0;
    if (M.wants.enemyBuff && (T.gives.shield || T.gives.buff)) s += 0.55;
    if (M.gives.cleanse && T.gives.debuff) s += 0.35;
    if (M.gives.denial && (theirs.card.ability.cost || 0) >= 45) s += 0.4;
    if (M.wants.debuff && T.gives.debuff) s += 0.15;
    return s;
  }

  /* Bot's draft pick from the on-table cards. Balances building its own
     squad against denying the strongest card to the opponent - a hate-pick
     is taken only when the card is far better for them than for us.

     CAMPAIGN PERSONAS (stages 6-8) bend the same scoring in character
     rather than replacing it:
       trickster    steals your synergy pieces and snipes energy payoffs
       strategist   counter-drafts your LIVE picks (the honest signal -
                    §4's correction) and values the cold, strong card
       chronicler   drafts the curve and hoards answers: burn, cleanse,
                    Silence and cost-denial. */
  var draftPersona = null;
  /* Campaign persona SLOPPINESS (soak-tuned, per stage): extra noise on
     the rival's pick scores. The personality keeps its shape - the
     Trickster still steals, the Chronicler still hoards - but the hand
     wobbles, which is the honest draft-difficulty dial when both sides
     draft from the same fixed pool. */
  var draftPersonaJitter = 0;
  function draftPick(team, offered, foeTeam) {
    var ai = DAI();
    var legal = offered.filter(function (e) {
      return !RULES().capBlocked(team, e.card);
    });
    if (!legal.length) legal = offered.slice(); // pool cornered the pile

    var best = legal[0],
      bestScore = -Infinity;
    legal.forEach(function (e) {
      var mine = ai.value(team, e, { size: RULES().DECK_SIZE });
      /* how much would the OPPONENT gain from this card? */
      var theirs = foeTeam ? ai.value(foeTeam, e, { size: RULES().DECK_SIZE }) : 0;
      /* take it for us, but weigh denial when it is a bomb for them */
      var v = mine + Math.max(0, theirs - mine) * 0.35 + ai.powerOf(e.card) * 0.8;
      if (draftPersona) {
        var T = ai.tags(e);
        if (draftPersona === 'trickster') {
          v += Math.max(0, theirs - mine) * 0.75;
          if (T.gives.energy || T.wants.energy) v += 1.1;
        } else if (draftPersona === 'strategist') {
          if (foeTeam) {
            for (var c = 0; c < foeTeam.length; c++) v += counterBonus(e, foeTeam[c]) * 0.6;
          }
          v += ai.powerOf(e.card) * 0.4;
        } else if (draftPersona === 'chronicler') {
          if (T.gives.burn) v += 1.2;
          if (T.gives.cleanse) v += 1.0;
          if (T.gives.denial) v += 0.9;
        }
        v += Math.random() * draftPersonaJitter;
      }
      v += Math.random() * 1.5;
      if (v > bestScore) {
        bestScore = v;
        best = e;
      }
    });
    return best;
  }

  /* The prep board speaks the battle board's language: cards look like
     the ones on the battlefield, and hovering one opens the same
     floating hero panel the fight uses (signature + role basic). */
  var SMAX = null;
  function statMax() {
    if (SMAX) return SMAX;
    SMAX = { hp: 1, atk: 1, def: 1 };
    flatten().forEach(function (e) {
      SMAX.hp = Math.max(SMAX.hp, e.card.stats.hp);
      SMAX.atk = Math.max(SMAX.atk, e.card.stats.atk);
      SMAX.def = Math.max(SMAX.def, e.card.stats.def);
    });
    return SMAX;
  }
  function rich(s) {
    return window.EOL.ui.rich(String(s));
  }
  function roleIc(role) {
    return window.EOL.ui.ROLE_ICON[role] || 'ra-player';
  }
  function elIc(el) {
    return window.EOL.ui.ELEMENT_ICON[el] || 'ra-player';
  }
  function elCol(el) {
    return window.EOL.ui.ELEMENT_COLOR[el] || '#fff';
  }

  function tipLine(icon, key, val, pct, color) {
    return (
      '<div class="dk-stat" style="--sc:' +
      color +
      '">' +
      '<i class="ra ' +
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
  function tipAbRow(a, tag, tagTxt) {
    return (
      '<div class="dk-ab ' +
      tag +
      '">' +
      '<div class="dk-ab-top">' +
      '<span class="dk-tag ' +
      tag +
      '">' +
      tagTxt +
      '</span>' +
      '<span class="dk-ab-name">' +
      esc(a.name) +
      '</span>' +
      (a.type === 'Active' && a.cost != null
        ? '<span class="dk-cost"><i class="ra ra-lightning-bolt"></i>' + a.cost + '</span>'
        : '') +
      '</div>' +
      '<div class="dk-ab-text">' +
      rich(a.text) +
      (a.note ? '<div class="dk-note">' + rich(a.note) + '</div>' : '') +
      '</div>' +
      '</div>'
    );
  }
  var lastTipId = null,
    tipSwapTimer = null;

  /* Place the hover panel BESIDE the card that opened it instead of pinning
     it to the far left/right of the view, where it used to sit on top of the
     grid. Preference order:
        1. immediately right of the card, top edges aligned
        2. immediately left of the card, top edges aligned
        3. whichever side has more room, clamped into the viewport
     Vertically the panel starts at the card's top; if it would overflow the
     bottom it is pulled up to bottom-align, and it never leaves the view. */
  var TIP_GAP = 12,
    TIP_EDGE = 10;
  /* Anchor the hero panel beside the hovered card.
     -------------------------------------------------------------
     THE BAN-STAMP RULE: the panel must never cover another card's BAN
     stamp. The stamp is a ::after inside a card, so it is trapped in
     that card's stacking context and z-index can never lift it above
     the panel. Placement is the only lever.

     Measured at 1600: your grid spans 137-733, the enemy grid 867-1463,
     leaving a 134px centre gap for a 268px panel. There is no position
     in the middle that clears both grids, so the panel is placed in the
     OUTER margin instead, on the far side of the hovered card's own
     grid:

        [ panel ][ your deck ]   gap   [ enemy deck ][ panel ]

     The outer margin is narrower than the panel at small viewports, so
     the panel is allowed to run off toward the screen edge (clamped to
     stay on-screen) rather than inward across the cards. That keeps
     every card in BOTH grids visible at all times. */
  /* EXPAND OUT OF THE CARD.
     -------------------------------------------------------------
     This used to open into the page margin beside the grid. That was
     the least-bad option at the time, but it only works when there
     IS a margin: it depends on viewport width, and the whole
     ban-stamp saga came from the panel and the cards competing for
     the same space.

     The panel now grows from the hovered card and layers over its
     neighbours, matching the battle board and the battlefield pill.
     The anchor is the card's own rectangle, so it is correct at
     every screen size instead of being tuned for one.

     Clamped to the viewport so it can never open off-screen. */
  /* BESIDE THE CARD, TOPS ALIGNED.
     -------------------------------------------------------------
     Default: immediately to the RIGHT of the hovered card, with the
     panel's top edge level with the card's top edge, so the two read
     as a pair rather than as a floating box.

     If the panel would run off the right edge, it flips to the LEFT
     of the same card. Only if neither side fits does it clamp - on a
     viewport that narrow there is no good answer, and staying
     on-screen beats being correctly placed but cut off.

     Vertically it is nudged back inside the viewport if the card sits
     near the bottom, which keeps the whole panel readable without
     abandoning the top alignment in the common case. */
  function placePrepTip(tip, anchor) {
    if (!anchor) return;
    var host = tip.offsetParent || document.body;
    var z = uiS();
    var hostBox = host.getBoundingClientRect();
    var card = anchor.getBoundingClientRect();
    /* rects come back in screen px under GUI scale. Convert once into
       host-relative LAYOUT px, then every rule below is layout-true. */
    var cardL = (card.left - hostBox.left) / z;
    var cardT = (card.top - hostBox.top) / z;
    var cardR = cardL + card.width / z;
    var tw = tip.offsetWidth || 268;
    var th = tip.offsetHeight || 320;
    var vw = host.clientWidth || document.documentElement.clientWidth / z;
    var vh = host.clientHeight || document.documentElement.clientHeight / z;

    var rightX = cardR + TIP_GAP;
    var leftX = cardL - TIP_GAP - tw;

    var placeLeft = rightX + tw > vw - TIP_EDGE && leftX >= TIP_EDGE;
    var vpLeft = placeLeft ? leftX : rightX;
    vpLeft = Math.max(TIP_EDGE, Math.min(vpLeft, vw - tw - TIP_EDGE));

    /* tops aligned, then pulled up if it would overflow the bottom */
    var vpTop = cardT;
    if (vpTop + th > vh - TIP_EDGE) vpTop = vh - th - TIP_EDGE;
    vpTop = Math.max(TIP_EDGE, vpTop);

    tip.style.left = vpLeft + 'px';
    tip.style.top = vpTop + 'px';
    tip.style.right = 'auto';
    /* grow from the edge nearest the card */
    tip.classList.toggle('from-right', placeLeft);
  }

  function showPrepTip(e, side, anchor, tipEl) {
    /* tipEl: an alternate flyout instance - the LEDGER carries its own
       so rival pages get the exact prep hover card (2026-08-10) */
    var tip = tipEl || $('prep-tip');
    if (!tip) return;
    if (!tipEl && !prep) return;
    var c = e.card,
      m = statMax();
    var sig = c.ability;
    var basic = window.EOL.engine.roleAbility({ role: c.role, element: c.element });
    var fresh = lastTipId !== c.id;
    lastTipId = c.id;
    tip.dataset.rarity = c.rarity;
    tip.innerHTML =
      '<div class="dk-head">' +
      '<div class="dk-portrait" data-rarity="' +
      c.rarity +
      '" style="--fc-primary:' +
      e.faction.colors.primary +
      '"><i class="ra ' +
      c.icon +
      '"></i></div>' +
      '<div class="dk-id">' +
      '<div class="dk-name">' +
      esc(c.name) +
      '</div>' +
      '<div class="dk-meta"><span>' +
      esc(c.role) +
      '</span>' +
      '<span style="color:' +
      elCol(c.element) +
      '">' +
      esc(c.element) +
      '</span></div>' +
      '<div class="dk-pos">' +
      esc(e.faction.name) +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dk-stats">' +
      tipLine(
        'ra-health',
        'HP',
        c.stats.hp.toLocaleString(),
        (c.stats.hp / m.hp) * 100,
        '#ff5f7e'
      ) +
      tipLine(
        'ra-sword',
        'ATK',
        c.stats.atk.toLocaleString(),
        (c.stats.atk / m.atk) * 100,
        '#ffb347'
      ) +
      tipLine('ra-shield', 'DEF', c.stats.def + '%', (c.stats.def / m.def) * 100, '#5fb2ff') +
      '</div>' +
      '<div class="dk-abs">' +
      tipAbRow(
        sig,
        sig.type === 'Passive' ? 'passive' : 'sig',
        sig.type === 'Passive' ? 'Passive' : 'Skill'
      ) +
      tipAbRow(basic, 'role', 'Basic') +
      '</div>';
    tip.classList.add('anchored');
    /* Show FIRST so the panel has real dimensions, then place it -
       measuring a hidden element returns 0 and anchors it wrong on
       the first hover of any card. */
    tip.classList.add('show');
    placePrepTip(tip, anchor);
    /* Keep each Skill name and its Energy cost on one line.
       Deferred a frame: the panel is mid grow-transform when this runs,
       and getBoundingClientRect reports the SCALED width, so measuring
       now under-sizes the available space and clips long names
       ("Divine Judgment" lost its final letter). One rAF is enough for
       the layout to settle at full size. */
    requestAnimationFrame(function () {
      if (window.EOL.battle && window.EOL.battle.fitAbilityNames)
        window.EOL.battle.fitAbilityNames(tip);
    });
    tip.setAttribute('aria-hidden', 'false');
    if (fresh) {
      tip.classList.remove('swap');
      void tip.offsetWidth;
      tip.classList.add('swap');
      clearTimeout(tipSwapTimer);
      tipSwapTimer = setTimeout(function () {
        tip.classList.remove('swap');
      }, 280);
    }
  }
  function hidePrepTip(tipEl) {
    /* also serves as a bare event handler, where the arg is an Event */
    var tip = tipEl && tipEl.nodeType === 1 ? tipEl : $('prep-tip');
    lastTipId = null;
    if (tip) {
      tip.classList.remove('show');
      tip.setAttribute('aria-hidden', 'true');
    }
  }

  function showDraftTip(e, anchor) {
    var tip = $('draft-tip') || $('prep-tip');
    if (!tip) return;
    var c = e.card,
      m = statMax();
    var sig = c.ability;
    var basic = window.EOL.engine.roleAbility({ role: c.role, element: c.element });
    var fresh = lastTipId !== c.id;
    lastTipId = c.id;
    tip.dataset.rarity = c.rarity;
    tip.innerHTML =
      '<div class="dk-head">' +
      '<div class="dk-portrait" data-rarity="' +
      c.rarity +
      '" style="--fc-primary:' +
      e.faction.colors.primary +
      '"><i class="ra ' +
      c.icon +
      '"></i></div>' +
      '<div class="dk-id">' +
      '<div class="dk-name">' +
      esc(c.name) +
      '</div>' +
      '<div class="dk-meta"><span>' +
      esc(c.role) +
      '</span>' +
      '<span style="color:' +
      elCol(c.element) +
      '">' +
      esc(c.element) +
      '</span></div>' +
      '<div class="dk-pos">' +
      esc(e.faction.name) +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dk-stats">' +
      tipLine(
        'ra-health',
        'HP',
        c.stats.hp.toLocaleString(),
        (c.stats.hp / m.hp) * 100,
        '#ff5f7e'
      ) +
      tipLine(
        'ra-sword',
        'ATK',
        c.stats.atk.toLocaleString(),
        (c.stats.atk / m.atk) * 100,
        '#ffb347'
      ) +
      tipLine('ra-shield', 'DEF', c.stats.def + '%', (c.stats.def / m.def) * 100, '#5fb2ff') +
      '</div>' +
      '<div class="dk-abs">' +
      tipAbRow(
        sig,
        sig.type === 'Passive' ? 'passive' : 'sig',
        sig.type === 'Passive' ? 'Passive' : 'Skill'
      ) +
      tipAbRow(basic, 'role', 'Basic') +
      '</div>';
    tip.classList.add('anchored');
    tip.classList.add('show');
    placePrepTip(tip, anchor);
    requestAnimationFrame(function () {
      if (window.EOL.battle && window.EOL.battle.fitAbilityNames)
        window.EOL.battle.fitAbilityNames(tip);
    });
    tip.setAttribute('aria-hidden', 'false');
    if (fresh) {
      tip.classList.remove('swap');
      void tip.offsetWidth;
      tip.classList.add('swap');
      clearTimeout(tipSwapTimer);
      tipSwapTimer = setTimeout(function () {
        tip.classList.remove('swap');
      }, 280);
    }
  }

  function hideDraftTip() {
    var tip = $('draft-tip') || $('prep-tip');
    lastTipId = null;
    if (tip) {
      tip.classList.remove('show');
      tip.setAttribute('aria-hidden', 'true');
    }
  }

  /* A battle-board card: HP bar + ATK/DEF above a squarer art tile,
     exactly the shape the fight itself uses. Hover opens the tooltip. */
  function boardCard(e, i, side) {
    var c = e.card;
    var wrap = document.createElement('div');
    wrap.className = 'pcard prep-c';
    wrap.dataset.rarity = c.rarity;
    /* The card id on the tile. Ban and formation state are tracked by
       id, so having it in the DOM keeps the markup self-describing and
       lets a test assert on identity instead of on displayed names. */
    wrap.dataset.cid = c.id;
    wrap.style.setProperty('--fc-primary', e.faction.colors.primary);
    /* The element orb reads var(--el); the battle board sets it per cell
       (battle.js) but prep never did, so every orb rendered white. */
    wrap.style.setProperty('--el', elCol(c.element));
    if (prepAnim) wrap.style.animationDelay = i * 30 + 'ms';
    /* No HP/ATK/DEF strip in preparation: the numbers live in the hover
       panel, and stripping them here keeps the ban/pick grids readable. */
    wrap.innerHTML =
      '<div class="bcard" data-rarity="' +
      c.rarity +
      '">' +
      '<div class="bcard-inner">' +
      '<div class="bcard-art' +
      (c.art ? ' has-art' : '') +
      '"><span class="bart-ring"></span>' +
      (c.art
        ? '<div class="bart-portrait"><img src="' +
          esc(c.art) +
          '" alt="" draggable="false" /></div>'
        : '<i class="ra ' + c.icon + '"></i>') +
      '</div>' +
      '<div class="bcard-vig"></div>' +
      '<div class="bcard-frame"></div>' +
      '<span class="bcorner tl"></span><span class="bcorner tr"></span>' +
      '<span class="bcorner bl"></span><span class="bcorner br"></span>' +
      '<div class="bcard-top"><span class="borb" title="' +
      esc(c.element) +
      '">' +
      '<i class="ra ' +
      elIc(c.element) +
      '"></i></span></div>' +
      '<div class="bcard-foot">' +
      '<div class="bcard-role"><i class="ra ' +
      roleIc(c.role) +
      '"></i>' +
      esc(c.role) +
      '</div>' +
      '<div class="bcard-name">' +
      esc(c.name) +
      '</div>' +
      '</div>' +
      '<div class="bcard-ring"></div>' +
      '</div>' +
      '</div>';
    wrap.addEventListener('mouseenter', function () {
      showPrepTip(e, side, wrap);
    });
    wrap.addEventListener('mouseleave', hidePrepTip);
    return wrap;
  }

  /* ---------------------------------------------------------
     Name fitting for prep / field / deck-slot tiles
     -------------------------------------------------------------
     Names wrap at spaces ("Constantine the Great" -> two lines), but a
     single long word must never be split mid-word - "Rumpelstiltskin"
     was rendering as "Rumpelstiltski" + "n". CSS alone cannot express
     "wrap at spaces, shrink otherwise", so each name is measured and any
     line that is still too wide gets an inline font-size that makes its
     LONGEST WORD fit. Multi-word names keep the full size and simply use
     more lines.
     --------------------------------------------------------- */
  var _mctx = null;
  function mctx() {
    if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
    return _mctx;
  }
  function fitNameNode(el, maxPx, minPx) {
    var text = (el.textContent || '').trim();
    if (!text) return;
    var avail = el.clientWidth;
    if (!avail) return;
    if (el.dataset.fitFor === text && el.dataset.fitW === String(avail)) return;

    var cs = getComputedStyle(el);
    var ctx = mctx();
    var family = cs.fontFamily;
    var weight = cs.fontWeight;
    // the widest single word decides whether we must shrink at all
    var words = text.split(/\s+/);
    var px = maxPx;
    ctx.font = weight + ' ' + px + 'px ' + family;
    var widest = 0;
    words.forEach(function (w) {
      widest = Math.max(widest, ctx.measureText(w).width);
    });
    if (widest > avail) {
      px = Math.max(minPx, Math.floor(px * (avail / widest) * 20) / 20);
      ctx.font = weight + ' ' + px + 'px ' + family;
      var guard = 0;
      while (px > minPx && guard++ < 60) {
        var w2 = 0;
        words.forEach(function (w) {
          w2 = Math.max(w2, ctx.measureText(w).width);
        });
        if (w2 <= avail) break;
        px -= 0.25;
        ctx.font = weight + ' ' + px + 'px ' + family;
      }
    }
    el.style.fontSize = px + 'px';
    el.dataset.fitFor = text;
    el.dataset.fitW = String(avail);
  }
  function fitPrepNames() {
    document.querySelectorAll('.prep-c .bcard-name').forEach(function (el) {
      fitNameNode(el, 10.5, 6.5);
    });
  }
  function fitSlotNames() {
    document.querySelectorAll('.field-slot .fs-name').forEach(function (el) {
      fitNameNode(el, 11, 7);
    });
  }

  /* ---------------------------------------------------------
     Battlefield reveal
     -------------------------------------------------------------
     Rolled at prep start, shown once the bans are locked. When the
     field ships painted art (its `art` key, all current boards do) the
     popup shows that backdrop full-bleed; the procedural CSS scene from
     fieldArt() stays as the fallback for art-less fields.
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     BATTLEFIELD ART PRELOADER
     -------------------------------------------------------------
     The boards are 100-230 KB JPEGs and the reveal popup paints one
     full-bleed the instant bans are locked. Previously the only
     warm-up was a throwaway `new Image()` in startPrep: a local that
     went out of scope immediately, so the decoded bitmap was
     collectible, and it warmed ONLY game 1's board - in Unabridged the
     other two arenas were cold every time. Either way the popup opened
     on a flat colour and the photo faded in a beat later, which is the
     "not rendered right away" the player sees.

     Three things fix it, and all three are needed:
       1. Keep a reference. `KEPT` holds the Image objects for the life
          of the page so nothing decoded is thrown away.
       2. decode(), not just load. `onload` means the bytes arrived;
          `decode()` means the bitmap is ready to paint this frame.
          Skipping it left a real decode on the critical path for a
          230 KB photo.
       3. Warm every board the MATCH can reach, not just the next one,
          during the ban phase - which is dead time measured in seconds.
     `warm()` is idempotent and returns the same promise per URL.
     --------------------------------------------------------- */
  var ART_CACHE = {};
  var KEPT = [];
  function artUrl(field) {
    return field && field.art ? new URL(field.art, document.baseURI).href : null;
  }
  function warm(field) {
    var url = artUrl(field);
    if (!url) return Promise.resolve(false);
    if (ART_CACHE[url]) return ART_CACHE[url];
    var img = new Image();
    KEPT.push(img);
    var p = new Promise(function (resolve) {
      var done = function (okay) {
        return function () {
          resolve(okay);
        };
      };
      img.onload = function () {
        /* decode() rejects on a broken image and is missing on older
           engines - either way the load alone is still a win, so the
           failure path resolves rather than propagating. */
        if (img.decode) img.decode().then(done(true), done(true));
        else resolve(true);
      };
      img.onerror = done(false);
      img.src = url;
    });
    ART_CACHE[url] = p;
    return p;
  }
  /* Warm a whole match's worth of boards: the one in play plus every
     slot on an Unabridged fight card. */
  function warmFields(list) {
    (list || []).forEach(function (f) {
      warm(f);
    });
  }
  /* Resolve when the art is painted-ready, or when `ms` is up - a slow
     or missing file must never hold the popup shut. */
  function warmOrTimeout(field, ms) {
    var url = artUrl(field);
    if (!url) return Promise.resolve(false);
    return Promise.race([
      warm(field),
      new Promise(function (r) {
        setTimeout(function () {
          r(false);
        }, ms);
      }),
    ]);
  }

  function revealBattlefield(field, onDone) {
    if (!field) return false;
    var host = $('bf-reveal');
    if (!host) return false;
    var artEl = $('bf-art');
    artEl.className = 'bf-art';
    artEl.dataset.field = field.id;
    if (field.art) {
      artEl.classList.add('has-art');
      /* Resolve against the DOCUMENT, not the stylesheet - the bare
         relative path once 404'd this same way on the battle board. */
      artEl.style.backgroundImage = 'url("' + artUrl(field) + '")';
      artEl.innerHTML = '';
    } else {
      artEl.classList.remove('has-art');
      artEl.style.removeProperty('background-image');
      artEl.innerHTML = fieldArt(field.id);
    }
    $('bf-name').textContent = field.name;
    $('bf-tag').textContent = field.tagline;
    $('bf-rules').innerHTML = (field.rules || [])
      .map(function (r) {
        return '<li>' + rich(esc(r)) + '</li>';
      })
      .join('');
    $('bf-draft').textContent = field.draft || '';
    var card = $('bf-card');
    card.style.setProperty('--bf-1', field.colors.primary);
    card.style.setProperty('--bf-2', field.colors.secondary);
    card.style.setProperty('--bf-3', field.colors.glow);

    var go = $('bf-go');
    go.onclick = function () {
      if (go.disabled) return;
      host.classList.remove('show');
      host.setAttribute('aria-hidden', 'true');
      if (onDone) setTimeout(onDone, 260); // let the card fade before the tip
    };

    /* HOLD THE CURTAIN until the backdrop can paint. The card's entrance
       (bf-in, 0.6s) is the moment the board is revealed, and starting it
       over an empty rectangle - then dropping the photo in mid-flight -
       is what read as unpolished. `warmFields` has almost always
       finished this during the ban phase, so the wait is normally zero
       frames; the 500ms cap means a cold cache or a missing file
       degrades to exactly the old behaviour instead of hanging. */
    var open = function () {
      host.classList.add('show');
      host.setAttribute('aria-hidden', 'false');
      /* "Field your six" stays locked until the battlefield card's
         entrance finishes (2026-08-05) - the reveal IS the battlefield
         selection animation in single games, and clicking through it
         mid-flight cut the moment short. bf-in runs 0.6s after a 0.12s
         delay; the timeout is a fallback if animationend never reaches
         us. */
      go.disabled = true;
      var unlock = function () {
        card.removeEventListener('animationend', unlock);
        clearTimeout(unlockT);
        /* the campaign tutor may be HOLDING this button through its
           arena + tips lessons (Gate I). Releasing it here would flash
           it enabled until the tutor's next 260ms poll re-held it -
           the flag makes the hold authoritative (user note 2026-08-09). */
        if (go.dataset.campaignHold === '1') return;
        go.disabled = false;
      };
      var unlockT = setTimeout(unlock, 900);
      card.addEventListener('animationend', unlock);
    };
    if (field.art) warmOrTimeout(field, 500).then(open);
    else open();
    return true;
  }

  /* Layered scene markup per battlefield - every layer is animated in CSS. */
  function fieldArt(id) {
    /* Each particle carries its OWN index as --i and a count as --n.
       Phasing used to be written as :nth-child rules, which count
       across every sibling in the layer - so adding one ring silently
       re-phased all the motes after it. Driving the delay from the
       element's own index makes each swarm independent, and lets the
       count be raised without touching a single selector. */
    var L = function (cls, n) {
      var out = '';
      var count = n || 1;
      for (var i = 0; i < count; i++) {
        out += '<span class="' + cls + '" style="--i:' + i + ';--n:' + count + '"></span>';
      }
      return out;
    };
    var common = '<span class="bf-sky"></span><span class="bf-glow"></span>';
    switch (id) {
      case 'narrow-pass':
        return (
          common +
          '<span class="bf-peak l"></span><span class="bf-peak r"></span>' +
          '<span class="bf-pass"></span>' +
          L('bf-dust', 7)
        );
      case 'open-plains':
        return common + '<span class="bf-sun"></span>' + L('bf-hill', 3) + L('bf-blade', 9);
      case 'mana-spring':
        return common + '<span class="bf-pool"></span>' + L('bf-bubble', 9) + L('bf-rune', 3);
      case 'energy-void':
        return common + '<span class="bf-void"></span>' + L('bf-ring', 3) + L('bf-mote', 8);
      case 'colosseum':
        return common + '<span class="bf-arena"></span>' + L('bf-arch', 5) + L('bf-ember', 6);
      case 'mirror-realm':
        return common + '<span class="bf-shard"></span>' + L('bf-pane', 5) + L('bf-echo', 3);
      case 'spirit-world':
        return common + '<span class="bf-gate"></span>' + L('bf-wisp', 9);
      case 'ancient-ruins':
        return common + L('bf-pillar', 4) + '<span class="bf-relic"></span>' + L('bf-leaf', 7);
      case 'heros-trial':
        return common + '<span class="bf-dais"></span>' + L('bf-beam', 4) + L('bf-spark', 8);
      case 'blood-battlefield':
        return common + '<span class="bf-field"></span>' + L('bf-banner', 3) + L('bf-drip', 8);
      default:
        return common;
    }
  }

  /* front/back slot of a fielded id -> {row, idx} | null */
  function slotOf(id) {
    var fi = prep.front.indexOf(id);
    if (fi >= 0) return { row: 'front', idx: fi };
    var bi = prep.back.indexOf(id);
    if (bi >= 0) return { row: 'back', idx: bi };
    return null;
  }

  function startPrep(cfg) {
    // cfg: { mode, deckId|null, player12:[entries], enemy12:[entries], mp }
    /* MULTIPLAYER. Against a person there are no bot bans - their two
       arrive over the wire, and neither side sees the other's until
       both have committed. `foeBans` therefore starts empty and is
       filled by the handshake in prepConfirm().

       The battlefield must also be the SAME on both machines, so the
       host rolls it from the shared match rng and it is derived, not
       re-rolled, on the guest. */
    var isMp = !!cfg.mp;
    /* THE SET: a fresh prep under warLength 'set' begins a new war
       (fight card drawn here, game 1's board pre-designated). ANY
       non-continuing prep kills a stale set, so quitting mid-set can
       never leak state. The kill is UNCONDITIONAL - it used to skip
       multiplayer, which left a live solo set attached to an online
       match and let setGameResult() reframe that match's result as
       war progress.

       `cfg.war` is the POSITIVE format control (design §9.1): the
       campaign forces 'single' on its lesson stages and 'set' on its
       exam stages regardless of the player's global Unabridged
       toggle. Without it, a toggled-on player would get stage 2 as a
       best-of-3 and a toggled-off player would get Gilgamesh as one
       game. Note the assignment is UNCONDITIONAL when a war begins -
       a pinned cfg.field must never short-circuit setBegin (§9.2),
       because a set with a pre-set field silently degrades into a
       single game. Set stages pin boards via cfg.fightCard instead. */
    if (!cfg.setContinues) {
      setKill();
      var wantSet = cfg.war ? cfg.war === 'set' && !isMp : canBeSet(cfg);
      if (wantSet) cfg.field = setBegin(cfg);
    }
    var foeBans;
    if (isMp) {
      foeBans = null;
    } else if (cfg.botBanProfile) {
      /* CAMPAIGN: the rival bans in character (§9.11). */
      foeBans = personaBans(cfg.botBanProfile, cfg.player12, cfg.enemy12);
    } else if (cfg.campaignStage === 1) {
      // Legacy fallback: The Recruiter bans Hansel & Gretel and Cinderella
      // (the data-driven profile normally covers this path).
      var hg = cfg.player12.find(function (e) {
        return e.card.id === 'grimmwood-hansel-gretel';
      });
      var cin = cfg.player12.find(function (e) {
        return e.card.id === 'grimmwood-cinderella';
      });
      foeBans = [];
      if (hg) foeBans.push(hg.card.id);
      if (cin) foeBans.push(cin.card.id);
      if (foeBans.length < RULES().BANS) {
        var normal = chooseBans(cfg.player12, cfg.enemy12);
        normal.forEach(function (id) {
          if (foeBans.length < RULES().BANS && foeBans.indexOf(id) === -1) {
            foeBans.push(id);
          }
        });
      }
    } else {
      foeBans = chooseBans(cfg.player12, cfg.enemy12);
    }
    prep = {
      mode: cfg.mode,
      mp: isMp,
      seed: cfg.seed != null ? cfg.seed : null,
      deckId: cfg.deckId || null,
      campaignStage: cfg.campaignStage || null,
      /* CAMPAIGN rival behaviour hooks (all optional, all inert
         outside the campaign):
           botSix       scripted fielded six (stages 1-4, §8 dial 2)
           pinnedEnemy  must-keep ids seeded into every enemy six (R5)
           unbannable   ids the ban grid refuses (R5)
           rival        {name, img} for the battle HUD + barks */
      botSix: cfg.botSix || null,
      pinnedEnemy: cfg.pinnedEnemy || null,
      unbannable: cfg.unbannable || null,
      rival: cfg.rival || null,
      /* CAMPAIGN: the Recruiter's ledger note on how this rival bans,
         surfaced during the ban phase so the first decision of the
         gate is played with open eyes (playtest note 2026-08-09). */
      banTell: cfg.banTell || null,
      /* the reveal can FALSIFY a role-claim tell - the ledger then
         corrects itself instead of hiding (playtester ruling
         2026-08-10: an absolute claim broken by one match is the
         match you remember) */
      banTellBroken: cfg.banTellBroken || null,
      botBanProfile: cfg.botBanProfile || null,
      /* THE ADVISED GATE (stage 2): silver counsel - suggested bans
         and a suggested six, computed from the real deny/greedy math,
         marked but never enforced. Gate 1 scripts, gate 2 advises,
         gate 3+ releases. */
      advisor: cfg.advisor || null,
      advice: null,
      adviceSix: null,
      /* GATE I SCRIPT (campaign): when present, the marked ban/six ids
         are the ONLY legal clicks - the tutorial narrates, this
         enforces. { bans:[ids], six:[ids], hintBan, hintSix } */
      script: cfg.script || null,
      oddFirst: cfg.oddFirst || null,
      /* The battlefield is rolled NOW but not revealed until bans are
         locked, so neither side can ban around the terrain. */
      field: cfg.field || window.EOL.rollBattlefield(),
      player12: cfg.player12,
      enemy12: cfg.enemy12,
      botBans: foeBans,
      youBans: [],
      revealed: false,
      waiting: false,
      phase: 'ban',
      front: [],
      back: [],
    };
    /* Warm the battlefield art the moment it is rolled: the reveal popup
       after the ban phase and then the battle board both paint the same
       image, so fetching AND DECODING it now, during the ban phase, keeps
       it off the critical path - both moments open fully painted instead
       of fading in a beat late.

       In Unabridged all three fight-card arenas are warmed, not just
       game 1's. Games 2 and 3 pick their board from that card, and the
       old one-image warm-up meant those two reveals were always cold -
       the exact place the pop-in was most visible, because by then the
       player knows what they are waiting for. Three JPEGs is ~500 KB
       against a ban phase that lasts seconds. */
    warmFields([prep.field].concat(setState ? setState.card : []));
    /* advised gate: compute the silver ban counsel up front (the six
       counsel waits for the reveal - it depends on what survives) */
    if (prep.advisor && !prep.script) {
      prep.advice = { bans: chooseBans(prep.enemy12, prep.player12) };
    }
    if (isMp) window.EOL.netplay.startBans(onFoeBans);
    prepAnim = true;
    renderPrep();
    window.EOL.ui.show('prep');
    coachShow(
      'prep-ban',
      'ra-interdiction',
      'Phase 1: Ban Two Legends',
      "Tap 2 of the enemy's 12 legends to ban them from the fight. The enemy bans 2 of " +
        'yours at the same time - their picks stay hidden until you lock yours in.'
    );
  }

  /* THE SCRIPT's golden marks: highlight exactly what the gate asks
     for next - the scripted bans, then the scripted six, then the
     confirm button once the asked-for set is complete. Pure paint;
     the enforcement lives in the click handlers. */
  function syncTutorMarks() {
    var p = prep;
    if (!p || !p.script) return;
    var mark = function (el, on) {
      if (el) el.classList.toggle('tutor-pick', !!on);
    };
    /* While a shielded tutor beat owns the screen, the shield swallows
       every tap - so the marks must not ASK for one. They park here
       and return the instant the Recruiter yields (campaign.js flips
       body[data-tutor-hold] and repaints). First outside playtest
       report, 2026-08-09: gold marks + a dead board read as a bug. */
    if (document.body.dataset.tutorHold === '1') {
      document
        .querySelectorAll('#prep-enemy .prep-c.tutor-pick, #prep-player .prep-c.tutor-pick')
        .forEach(function (el) {
          el.classList.remove('tutor-pick');
        });
      mark($('prep-confirm-main'), false);
      mark($('prep-confirm'), false);
      return;
    }
    if (p.phase === 'ban' && p.script.bans) {
      document.querySelectorAll('#prep-enemy .prep-c').forEach(function (el) {
        var id = el.dataset.cid;
        mark(el, !p.revealed && p.script.bans.indexOf(id) >= 0 && p.youBans.indexOf(id) < 0);
      });
      mark($('prep-confirm-main'), !p.revealed && p.youBans.length === RULES().BANS);
    }
    if (p.phase === 'pick' && p.script.six) {
      /* the quiet window after a scripted fielding click - see the
         flash fix in onSixClick */
      var quiet = p.markQuiet && Date.now() < p.markQuiet;
      var fielded = p.front.concat(p.back);
      /* one at a time, in the ledger's order: only the NEXT card pulses */
      var nextId = null;
      for (var si = 0; si < p.script.six.length; si++) {
        if (fielded.indexOf(p.script.six[si]) < 0) {
          nextId = p.script.six[si];
          break;
        }
      }
      document.querySelectorAll('#prep-player .prep-c').forEach(function (el) {
        mark(el, !quiet && el.dataset.cid === nextId);
      });
      mark($('prep-confirm'), !quiet && fielded.length === RULES().FIELD_SIZE);
    }
  }

  /* THE SILVER COUNSEL (advised gate). A categorically DIFFERENT mark
     from the script's gold: gold means 'the only legal click', silver
     means 'were it me' - dashed, quiet, and freely ignorable. Painted
     for un-taken suggestions only, so counsel disappears as it is
     either followed or overruled. */
  function syncAdviceMarks() {
    var p = prep;
    var on = !!(p && p.advisor && p.advice && !p.script);
    var mk = function (el, yes) {
      if (el) el.classList.toggle('advice-pick', !!yes);
    };
    document.querySelectorAll('#prep-enemy .prep-c').forEach(function (el) {
      mk(
        el,
        on &&
          p.phase === 'ban' &&
          !p.revealed &&
          p.advice.bans.indexOf(el.dataset.cid) >= 0 &&
          p.youBans.indexOf(el.dataset.cid) < 0
      );
    });
    if (on && p.phase === 'pick' && !p.adviceSix) {
      /* the six counsel exists only now: it is drawn from what SURVIVED */
      var gone = p.botBans || [];
      var pool = p.player12.filter(function (e) {
        return gone.indexOf(e.card.id) < 0;
      });
      var foePool = p.enemy12.filter(function (e) {
        return (p.youBans || []).indexOf(e.card.id) < 0;
      });
      p.adviceSix = chooseSix(pool, foePool).map(function (e) {
        return e.card.id;
      });
    }
    var fielded = p ? p.front.concat(p.back) : [];
    document.querySelectorAll('#prep-player .prep-c').forEach(function (el) {
      mk(
        el,
        on &&
          p.phase === 'pick' &&
          p.adviceSix &&
          p.adviceSix.indexOf(el.dataset.cid) >= 0 &&
          fielded.indexOf(el.dataset.cid) < 0
      );
    });
  }

  /* Light-touch refresh of everything AROUND the card grids - notes,
     step chips and confirm buttons - without touching the grid DOM.
     Ban/pick clicks patch their own tile and then call only this, so a
     second click can never restart an earlier tile's animation the way
     the old full renderPrep() rebuild did (re-created nodes replay
     their entrance/ban-mark CSS every single time). */
  function updatePrepChrome() {
    var p = prep;
    if (!p) return;
    var dict = byId();
    var foeBanList = p.botBans || [];
    var en = $('prep-enemy-note');
    if (en)
      en.textContent = p.revealed
        ? 'struck out - the enemy fields 6 of its remaining 10'
        : p.script && document.body.dataset.tutorHold === '1'
          ? 'the Recruiter is speaking - read his lesson first'
          : 'tap 2 to ban (' + p.youBans.length + '/' + RULES().BANS + ')';
    /* the Recruiter's ledger: the rival's banning reputation, read
       BEFORE committing your own bans. After the reveal the strip
       normally yields to the truth - UNLESS the truth broke the
       claim, in which case the ledger corrects itself out loud
       (playtester ruling 2026-08-10: 'never once' can be broken by
       one match, and that is the match you remember). */
    var tell = $('prep-ledger-tell');
    if (tell) {
      if (p.revealed && p.tellBreak === undefined) {
        p.tellBreak = null;
        var claim = (p.botBanProfile && p.botBanProfile.roles) || [];
        if (claim.length && p.banTellBroken) {
          var offeredClaim = p.player12.some(function (e) {
            return claim.indexOf(e.card.role) >= 0;
          });
          var struckClaim = (p.botBans || []).some(function (id) {
            var ce = dict[id];
            return ce && claim.indexOf(ce.card.role) >= 0;
          });
          if (offeredClaim && !struckClaim) {
            p.tellBreak = p.banTellBroken;
            /* the correction is HISTORY now - the ledger remembers */
            if (window.EOL.campaign && window.EOL.campaign.onTellBreak) {
              try {
                window.EOL.campaign.onTellBreak(p.campaignStage);
              } catch (e) {
                /* the record is flavour; prep never breaks on it */
              }
            }
          }
        }
      }
      var tellTxt = null;
      if (p.banTell && p.phase === 'ban' && !p.revealed) tellTxt = p.banTell;
      else if (p.tellBreak) tellTxt = p.tellBreak;
      tell.hidden = !tellTxt;
      tell.classList.toggle('broken', !!(tellTxt && tellTxt === p.tellBreak));
      if (tellTxt) {
        var tt = $('prep-ledger-tell-text');
        if (tt && tt.textContent !== tellTxt) tt.textContent = tellTxt;
      }
    }
    var cm = $('prep-confirm-main');
    cm.disabled = p.waiting || p.youBans.length !== RULES().BANS;
    cm.classList.toggle('ready', !cm.disabled);
    $('prep-confirm-main-txt').textContent = p.waiting ? 'Waiting for opponent...' : 'Confirm bans';
    var c = $('prep-confirm');
    var sixOk = p.front.length + p.back.length === RULES().FIELD_SIZE;
    /* THE SET rotation law, surfaced on the button itself: games 2+
       demand 1-2 fresh heroes, and a button that only fails AFTER the
       click reads as broken - it greys out and says why up front. */
    var needSubs = !!(setState && setState.lastSix && p.phase === 'pick');
    var swaps = needSubs ? setSwapCount() : 0;
    var lawOk = !needSubs || (swaps >= 1 && swaps <= 2);
    c.disabled = p.waiting || !sixOk || !lawOk;
    c.classList.toggle('ready', !c.disabled);
    $('prep-confirm-txt').textContent = p.waiting
      ? 'Waiting...'
      : !sixOk
        ? 'To battle'
        : needSubs && swaps < 1
          ? 'Swap in 1-2 fresh legends'
          : needSubs && swaps > 2
            ? 'Too many swaps (max 2)'
            : 'To battle';
    syncTutorMarks();
    syncAdviceMarks();
  }

  function renderPrep() {
    var p = prep,
      foeGrid = $('prep-enemy'),
      youGrid = $('prep-player');
    if (!p || !foeGrid || !youGrid) return;
    var dict = byId();
    hidePrepTip(); // the grid is about to be rebuilt, so stale hovers die

    $('prep-sub').textContent =
      p.phase === 'ban'
        ? "Phase 1 - ban 2 of the enemy's legends"
        : setState && p.setContinues
          ? setScoreLine() /* rotation law lives in the Field Six tip and on
                             the confirm button's disabled reason - a second
                             lecture in the header is noise (2026-08-05) */
          : 'Phase 2 - field 6 of your surviving legends';
    $('pstep-ban').classList.toggle('sel', p.phase === 'ban');
    $('pstep-pick').classList.toggle('sel', p.phase === 'pick');
    $('pstep-ban').classList.toggle('done', p.phase !== 'ban');

    /* the sides trade with the phase: bans show both decks, fielding
       folds theirs away and brings up the formation tray */
    $('prep-side-foe').hidden = p.phase === 'pick';
    $('prep-field').hidden = p.phase !== 'pick';
    $('prep-actions-main').hidden = p.phase === 'pick';
    $('prep-vs').hidden = p.phase === 'pick';
    if ($('prep-fields')) $('prep-fields').hidden = p.phase !== 'pick';

    /* entrance stagger only on phase entry; pick clicks stay snappy */
    youGrid.classList.toggle('quiet', !prepAnim);
    foeGrid.classList.toggle('quiet', !prepAnim);
    prepAnim = false;

    /* ---- your deck (left) ---- */
    youGrid.innerHTML = '';
    /* In a match the opponent's bans do not exist yet, so treat "not
       arrived" as "nothing banned" rather than reading a null. */
    var foeBanList = p.botBans || [];
    p.player12.forEach(function (e, i) {
      var el = boardCard(e, i, 'you');
      var foeBanned = foeBanList.indexOf(e.card.id) >= 0;
      /* THE SET: a hero subbed out of the six sits out the rest of the
         set - rendered exactly like a ban, and unslottable */
      var locked = p.lockouts && p.lockouts.indexOf(e.card.id) >= 0;
      if (p.revealed && (foeBanned || locked)) el.classList.add('banned');
      if (p.phase === 'pick' && !foeBanned && !locked) {
        var slot = slotOf(e.card.id);
        if (slot) {
          el.classList.add('picked');
          var chip = document.createElement('span');
          chip.className = 'mk-slot ' + (slot.row === 'front' ? 'f' : 'b');
          chip.textContent = (slot.row === 'front' ? 'F' : 'B') + (slot.idx + 1);
          el.appendChild(chip);
        }
        el.addEventListener('click', function () {
          toggleSix(e.card.id);
        });
      }
      youGrid.appendChild(el);
    });
    $('prep-player-note').textContent = p.waiting
      ? 'bans locked - waiting for your opponent to commit theirs...'
      : !p.revealed
        ? 'their 2 bans land here - hidden until you commit yours'
        : 'the enemy banned: ' +
          foeBanList
            .map(function (id) {
              return dict[id].card.name;
            })
            .join(', ');

    /* ---- enemy deck (right, ban phase only) ---- */
    if (p.phase === 'ban') {
      foeGrid.innerHTML = '';
      p.enemy12.forEach(function (e, i) {
        var el = boardCard(e, i, 'foe');
        var banned = p.youBans.indexOf(e.card.id) >= 0;
        var noBan = p.unbannable && p.unbannable.indexOf(e.card.id) >= 0;
        el.classList.toggle('banpick', banned);
        if (noBan) el.classList.add('unbannable');
        el.addEventListener('click', function () {
          /* R5 hardcode: the boss cannot be banned. The grid says so
             instead of silently ignoring the click. */
          if (noBan) {
            toast(e.card.name + ' cannot be banned - the judgement stands', 'ra-crown');
            flashNode('prep-enemy-note');
            return;
          }
          /* THE SCRIPT (gate I): only the marked bans may be added.
             Removing a placed ban stays legal, so a mis-click is
             always recoverable. */
          if (
            p.script &&
            p.script.bans &&
            p.youBans.indexOf(e.card.id) < 0 &&
            p.script.bans.indexOf(e.card.id) < 0
          ) {
            toast(p.script.hintBan || 'Follow the marked cards - this gate is scripted', 'ra-quill-ink');
            flashNode('prep-enemy-note');
            return;
          }
          var i2 = p.youBans.indexOf(e.card.id);
          if (i2 >= 0) p.youBans.splice(i2, 1);
          else {
            if (p.youBans.length >= RULES().BANS) {
              flashNode('prep-enemy-note');
              return;
            }
            p.youBans.push(e.card.id);
          }
          /* Patch, don't rebuild: a full grid rebuild re-creates every
             .banpick tile and replays its ban-mark flash, so the second
             ban used to "redo" the first. Toggling the live node means
             this click is the only thing that moves. */
          el.classList.toggle('banpick', i2 < 0);
          updatePrepChrome();
        });
        foeGrid.appendChild(el);
      });
      $('prep-enemy-note').textContent = p.revealed
        ? 'struck out - the enemy fields 6 of its remaining 10'
        : 'tap 2 to ban (' + p.youBans.length + '/' + RULES().BANS + ')';
    }

    if (p.phase === 'pick') renderField();

    updatePrepChrome();

    /* size long single-word names once the tiles have real widths */
    requestAnimationFrame(function () {
      fitPrepNames();
      fitSlotNames();
    });
  }

  function flashNode(id) {
    var n = $(id);
    if (!n) return;
    n.classList.remove('flash');
    void n.offsetWidth;
    n.classList.add('flash');
  }

  /* Free-slot suggestion for the field tray: frontline roles go front. */
  /* The live grid tile for one of YOUR heroes (null when not on
     screen - e.g. resolved bans rebuild the grid once, legitimately).
     Tiles are appended in player12 order and never re-ordered. */
  function allyTile(id) {
    var host = $('prep-player');
    if (!host || !prep) return null;
    var idx = -1;
    prep.player12.some(function (e, i) {
      if (e.card.id === id) {
        idx = i;
        return true;
      }
      return false;
    });
    return idx >= 0 ? host.children[idx] || null : null;
  }

  /* Push the current front/back seat into every ally tile's slot chip
     and picked glow WITHOUT re-creating any tile. A surviving chip
     only gets new text (never a second pop-in), and a removed id
     loses its chip - the two ways a full grid rebuild used to
     re-animate yesterday's picks on every further click. */
  function syncSixChips() {
    if (!prep || prep.phase !== 'pick') return;
    prep.player12.forEach(function (e) {
      var tile = allyTile(e.card.id);
      if (!tile) return;
      var slot = slotOf(e.card.id);
      tile.classList.toggle('picked', !!slot);
      var chip = tile.querySelector('.mk-slot');
      if (slot) {
        if (!chip) {
          chip = document.createElement('span');
          tile.appendChild(chip);
        }
        chip.className = 'mk-slot ' + (slot.row === 'front' ? 'f' : 'b');
        chip.textContent = (slot.row === 'front' ? 'F' : 'B') + (slot.idx + 1);
      } else if (chip) {
        chip.remove();
      }
    });
  }

  function toggleSix(id) {
    /* THE SET: locked-out heroes (subbed out earlier in the set) can
       never re-enter the six */
    if (prep.lockouts && prep.lockouts.indexOf(id) >= 0) return;
    var all = prep.front.concat(prep.back);
    var idx = all.indexOf(id);
    /* THE SCRIPT (gate I): the six is fielded ONE AT A TIME, in the
       ledger's order - the whole match line depends on the exact
       formation, so removals and shuffles are refused too. */
    if (prep.script && prep.script.six) {
      if (idx >= 0) {
        toast('The ledger placed that one - the formation stands', 'ra-quill-ink');
        flashNode('prep-player-note');
        return;
      }
      var nextId = null;
      for (var si = 0; si < prep.script.six.length; si++) {
        if (all.indexOf(prep.script.six[si]) < 0) {
          nextId = prep.script.six[si];
          break;
        }
      }
      if (id !== nextId) {
        toast(prep.script.hintSix || 'Field the marked card - this gate is scripted', 'ra-quill-ink');
        flashNode('prep-player-note');
        return;
      }
      /* THE FLASH FIX (user report 2026-08-09): the role lesson for
         this card arrives on the tutor's next poll (up to 260ms away),
         and its shield will park the marks. Painting the NEXT card's
         gold outline inside that gap made it blink for a split second
         and vanish. Quiet the marks for a beat: either the lesson's
         hold takes over seamlessly, or the scheduled repaint below
         restores them for a card with no lesson to give. */
      prep.markQuiet = Date.now() + 600;
      window.setTimeout(function () {
        if (prep) updatePrepChrome();
      }, 640);
    }
    if (idx >= 0) {
      var fi = prep.front.indexOf(id);
      if (fi >= 0) prep.front.splice(fi, 1);
      else prep.back.splice(prep.back.indexOf(id), 1);
    } else {
      if (all.length >= RULES().FIELD_SIZE) {
        flashNode('prep-player-note');
        return;
      }
      var role = byId()[id].card.role;
      var wantFront = role === 'Tank' || role === 'Bruiser';
      if (wantFront && prep.front.length < 3) prep.front.push(id);
      else if (prep.back.length < 3) prep.back.push(id);
      else if (prep.front.length < 3) prep.front.push(id);
      else return;
    }
    syncSixChips();
    renderField();
    updatePrepChrome();
  }

  function renderField() {
    var dict = byId();
    $('field-n').textContent = prep.front.length + prep.back.length;
    [
      ['field-front', prep.front, 'F', 'front'],
      ['field-back', prep.back, 'B', 'back'],
    ].forEach(function (pair) {
      var host = $(pair[0]);
      if (!host) return;
      var ids = pair[1];
      for (var s = 0; s < 3; s++) {
        var id = ids[s];
        var key = id ? id : 'empty-' + s;
        var cell = host.children[s];
        /* Unchanged slot: keep the live node so its slot-in entrance
           never replays. Only a genuinely new occupant gets built. */
        if (cell && cell.dataset.slotkey === key) continue;
        var fresh = document.createElement('button');
        fresh.type = 'button';
        fresh.dataset.slotkey = key;
        if (id) {
          var e = dict[id];
          fresh.className = 'field-slot filled rarity-' + e.card.rarity;
          fresh.style.setProperty('--fc-primary', e.faction.colors.primary);
          fresh.innerHTML =
            '<span class="fs-order">' +
            pair[2] +
            (s + 1) +
            '</span>' +
            '<i class="fs-glyph ra ' +
            e.card.icon +
            '"></i>' +
            '<span class="fs-name">' +
            esc(e.card.name) +
            '</span>' +
            '<span class="fs-role"><i class="ra ' +
            roleIc(e.card.role) +
            '"></i>' +
            esc(e.card.role) +
            '</span>' +
            '<span class="fs-x" title="Swap rows"><i class="ri-arrow-up-down-line"></i></span>';
          /* Seat shuffle (hero moved rows or list shifted after a
             removal): rebuild silently - slot-in is a NEW-occupant
             celebration, not a "things moved" siren. */
          if (cell && !cell.dataset.slotkey.match(/^empty-/)) fresh.classList.add('no-enter');
          (function (idCopy, row, entry, cellRef) {
            fresh.addEventListener('click', function () {
              swapRow(idCopy, row);
            });
            fresh.addEventListener('mouseenter', function () {
              showPrepTip(entry, 'you', cellRef);
            });
            fresh.addEventListener('mouseleave', hidePrepTip);
          })(id, pair[3], e, fresh);
        } else {
          fresh.className = 'field-slot empty';
          fresh.innerHTML = '<span class="fs-num">' + pair[2] + (s + 1) + '</span>';
          fresh.disabled = true;
        }
        if (cell) host.replaceChild(fresh, cell);
        else host.appendChild(fresh);
      }
    });
  }

  function swapRow(id, from) {
    /* THE SCRIPT (gate I): the ledger set the rows; the match line
       depends on them. */
    if (prep && prep.script && prep.script.six) {
      toast('The ledger set the rows - they stand', 'ra-quill-ink');
      flashNode('prep-sub');
      return;
    }
    var src = from === 'front' ? prep.front : prep.back;
    var dst = from === 'front' ? prep.back : prep.front;
    if (dst.length >= 3) {
      flashNode('prep-sub');
      return;
    }
    src.splice(src.indexOf(id), 1);
    dst.push(id);
    syncSixChips();
    renderField();
    updatePrepChrome();
  }

  /* The opponent's two bans arrived. In a match this is what unblocks
     the reveal - it fires whether we committed first or they did. */
  function onFoeBans(ids) {
    if (!prep || !prep.mp) return;
    prep.botBans = (ids || []).slice();
    prep.waiting = false;
    revealBansAndAdvance();
  }

  /* Confirm: bans -> reveal + advance; six -> battle. */
  async function prepConfirm() {
    if (!prep) return;
    if (prep.phase === 'ban') {
      if (prep.youBans.length !== RULES().BANS) return;
      /* MULTIPLAYER. Commit ours and stop. The reveal happens only once
         BOTH sets have landed, so committing first can never leak your
         choices or let you react to theirs. onFoeBans() resumes. */
      if (prep.mp) {
        if (prep.waiting) return; // already committed
        prep.waiting = true;
        renderPrep();
        $('prep-sub').textContent = 'Bans locked - waiting for your opponent...';
        /* Same re-entrancy rule as commitSix: submitBans() can
           complete the handshake synchronously and advance the phase,
           so `prep` may be gone the instant it returns. Snapshot
           first, submit last. */
        var myBans = prep.youBans.slice();
        window.EOL.mp.saveState({ phase: 'ban', bans: myBans });
        window.EOL.netplay.submitBans(myBans);
        return;
      }
      revealBansAndAdvance();
      return;
    }
    commitSix();
  }

  /* Both sides' bans are known: stamp them, then move to fielding. */
  async function revealBansAndAdvance() {
    if (!prep || prep.phase !== 'ban') return;
    {
      prep.revealed = true;
      renderPrep();
      $('prep-sub').textContent = 'Bans locked - both sides revealed';
      toast('Bans locked - both sides revealed', 'ri-eye-line');
      // stamped, seen, then their side folds away for the fielding.
      // The scripted gate holds the stamps LONGER: the Recruiter is
      // narrating whose names just got struck out, and a split-second
      // glimpse taught nothing (user note 2026-08-08).
      await sleep(prep.script ? 3400 : 1150);
      if (!prep) return;
      prep.phase = 'pick';
      prepAnim = true;
      renderPrep();
      /* The battlefield reveal owns the screen first; the Phase-2 coach tip
         only appears once the player dismisses it, or immediately if the
         reveal is unavailable. Otherwise the two modals stack. */
      var afterReveal = function () {
        coachShow(
          'prep-pick',
          'ra-crossed-swords',
          'Phase 2: Field Your Six',
          'Pick 6 of your surviving legends and mind the formation: the front row soaks the ' +
            'hits while the back row supports. Tap a slotted legend to swap its row.'
        );
      };
      /* THE SET: the FIGHT CARD replaces the single-board reveal here
         (post-bans, pre-fielding - user law 2026-08-04): all three
         boards go public the moment both sides' bans are locked, so
         fielding happens with full knowledge of the whole card. Single
         games keep the classic one-board reveal. */
      if (setState) {
        showFightCard(afterReveal);
      } else if (!revealBattlefield(prep.field, afterReveal)) afterReveal();
    }
  }

  /* Phase 2 confirm. Singleplayer goes straight to the board; a match
     sends the six and waits for the opponent's, exactly like the bans. */
  function commitSix() {
    var dict = byId();
    var sixIds = prep.front.concat(prep.back);
    if (sixIds.length !== RULES().FIELD_SIZE) return;
    /* THE SET substitution law: games 2+ must field 1-2 heroes that
       were not in last game's public six. Broken combos rotate. */
    if (setState && setState.lastSix) {
      var swaps = setSwapCount();
      if (swaps < 1 || swaps > 2) {
        toast(
          swaps < 1
            ? 'Unabridged demands rotation: swap in at least 1 fresh legend'
            : 'Too many changes - swap at most 2 legends of your six',
          'ri-repeat-line'
        );
        return;
      }
    }

    if (prep.mp) {
      if (prep.waiting) return; // already committed
      prep.waiting = true;
      $('prep-sub').textContent = 'Formation locked - waiting for your opponent...';
      var c = $('prep-confirm');
      if (c) {
        c.disabled = true;
        c.classList.remove('ready');
      }
      $('prep-confirm-txt').textContent = 'Waiting...';

      /* READ EVERYTHING OFF `prep` BEFORE SUBMITTING.
         submitSix() can complete the handshake SYNCHRONOUSLY when the
         opponent's six already arrived - onFoeSix() then starts the
         battle and sets `prep = null` before submitSix even returns.
         Any use of `prep` after this point is a null dereference, and
         it crashed the second player to confirm in every match. */
      var fieldId = prep.field && prep.field.id;
      window.EOL.netplay.startSix(onFoeSix);
      window.EOL.mp.saveState({
        phase: 'field',
        six: sixIds.slice(),
        field: fieldId,
      });
      window.EOL.netplay.submitSix(sixIds.slice());
      return;
    }

    var playerSix = sixIds.map(function (id) {
      return dict[id];
    });
    var survive = prep.enemy12.filter(function (e) {
      if (prep.youBans.indexOf(e.card.id) >= 0) return false;
      /* THE SET: heroes the bot subbed out sit out the rest of the set */
      if (setState && setState.botLockedOut.indexOf(e.card.id) >= 0) return false;
      return true;
    });
    /* FAIR INFORMATION: the bot must NOT see the six you actually locked -
       that is a peek, not a read. Instead it PREDICTS the six it expects
       from your surviving 12 (the same information you have about it) and
       fields against that forecast. If its prediction is wrong, it is
       wrong, exactly like a human guessing at your build. */
    var yourSurvivors = prep.player12.filter(function (e) {
      return (prep.botBans || []).indexOf(e.card.id) < 0;
    });
    var predictedSix = predictSix(yourSurvivors);
    /* CAMPAIGN must-keeps for the enemy six:
         - a SCRIPTED six (stages 1-4) seeds every surviving member of
           the authored list; if the player banned into it, chooseSix
           fills the holes from the rest of the deck;
         - the `pinned` boss (R5) is seeded ahead of the greedy walk so
           the AI can never bench him as "weakest". */
    var mustKeep = null;
    if (!setState && prep.botSix && prep.botSix.length) mustKeep = prep.botSix;
    else if (prep.pinnedEnemy && prep.pinnedEnemy.length) mustKeep = prep.pinnedEnemy;
    else if (setState && setState.pinnedEnemy && setState.pinnedEnemy.length)
      mustKeep = setState.pinnedEnemy;
    /* THE SET: the bot sideboards against your PUBLIC six (last game is
       fair information for both sides) and obeys the same swap law */
    var enemySix = null;
    if (!setState && prep.botSix && prep.botSix.length) {
      /* SCRIPTED SIX (§8 dial 2): authored AND deterministic, including
         its refills. When the player bans into the script, the hole is
         filled from the deck list IN ORDER - never by chooseSix's "best
         of bench", which quietly UPGRADED the six (soak-found 2026-08-09:
         banning the Outlaw's Little John summoned Guy of Gisborne). The
         enemy12 arrays are therefore ordered six-first, bench
         weakest-first. */
      enemySix = [];
      var takeScripted = function (id) {
        if (enemySix.length >= RULES().FIELD_SIZE) return;
        if (
          enemySix.some(function (e) {
            return e.card.id === id;
          })
        )
          return;
        for (var s2 = 0; s2 < survive.length; s2++) {
          if (survive[s2].card.id === id) {
            enemySix.push(survive[s2]);
            return;
          }
        }
      };
      prep.botSix.forEach(takeScripted);
      prep.enemy12.forEach(function (e) {
        takeScripted(e.card.id);
      });
      if (enemySix.length < RULES().FIELD_SIZE) enemySix = null; // degenerate deck: fall back
    }
    if (!enemySix) {
      enemySix =
        setState && setState.lastBotIds.length
          ? setBotSix(survive, predictedSix)
          : chooseSix(survive, predictedSix, mustKeep);
    }
    if (setState) {
      /* heroes leaving the six become locked out for the rest of the
         set (BEFORE lastSix is overwritten with the new six) */
      if (setState.lastSix) {
        setState.lastSix.front.concat(setState.lastSix.back).forEach(function (id) {
          if (sixIds.indexOf(id) < 0 && setState.lockedOut.indexOf(id) < 0)
            setState.lockedOut.push(id);
        });
        setState.lastBotIds.forEach(function (id) {
          if (
            !enemySix.some(function (e) {
              return e.card.id === id;
            }) &&
            setState.botLockedOut.indexOf(id) < 0
          )
            setState.botLockedOut.push(id);
        });
      }
      setState.youBans = prep.youBans.slice();
      setState.botBans = (prep.botBans || []).slice();
      setState.lastSix = { front: prep.front.slice(), back: prep.back.slice() };
      setState.lastBotIds = enemySix.map(function (e) {
        return e.card.id;
      });
    }
    var cfg = prep;
    prep = null;
    window.EOL.ui.show('battle');
    /* THE SCRIPTED MATCH (gate I): the pre-computed line replays only
       on its own dice, so the battle takes the script's seeded rng.
       Same mulberry32 as mp.rngFrom - inlined so the campaign never
       depends on the multiplayer module being healthy. */
    var mulberry = function (seed) {
      var a = seed >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    var match = cfg.script && cfg.script.match ? cfg.script.match : null;
    BATTLE().start({
      teams: { player: playerSix, enemy: enemySix },
      field: cfg.field,
      campaignStage: cfg.campaignStage,
      rival: cfg.rival || null,
      rng: match ? mulberry(match.seed | 0) : null,
      moveScript: match ? match.moves : null,
      oddFirst: cfg.oddFirst || null,
    });
    lastConfig =
      cfg.mode === 'classic'
        ? {
            mode: 'classic',
            deckId: cfg.deckId,
            random: !cfg.deckId,
            campaignStage: cfg.campaignStage || null,
          }
        : { mode: 'draft', campaignStage: cfg.campaignStage || null };
  }

  /* Their six arrived. Both formations are known, so the battle starts.
     -------------------------------------------------------------
     Their array is FRONT-then-BACK in their own order, which is
     precisely the formation, so it is passed through untouched -
     `enemyFormed` stops the auto-formation from rearranging a human's
     deliberate placement. Both clients also seed the engine rng from
     the match seed and agree on who opens the odd rounds, so the two
     simulations roll identical dice in identical order. */
  function onFoeSix(ids) {
    if (!prep || !prep.mp) return;
    var dict = byId();
    var NP = window.EOL.netplay;
    var playerSix = prep.front.concat(prep.back).map(function (id) {
      return dict[id];
    });
    var enemySix = (ids || []).map(function (id) {
      return dict[id];
    });
    if (
      enemySix.length !== RULES().FIELD_SIZE ||
      enemySix.some(function (e) {
        return !e;
      })
    ) {
      toast('The opponent sent an unreadable formation', 'ri-error-warning-line');
      leaveMatch();
      return;
    }
    var cfg = prep;
    prep = null;
    /* Mark the battle as started. A reconnect during the fight cannot
       be rebuilt (the action log is not stored), so the rejoin path
       needs to know to concede rather than restore a stale board. */
    window.EOL.mp.saveState({ phase: 'battle', field: cfg.field && cfg.field.id });
    window.EOL.ui.show('battle');
    BATTLE().start({
      teams: { player: playerSix, enemy: enemySix },
      enemyFormed: true,
      field: cfg.field,
      /* One shared luck stream. Offset from the draft seed so the
         battle does not replay the pack shuffle's numbers. */
      rng: NP.rngFrom((cfg.seed | 0) + 0x5f37),
      /* Each client calls itself 'player', so without this both would
         open round 1 and the boards would disagree instantly. */
      oddFirst: NP.isHost() ? 'player' : 'enemy',
      net: NP.controller(onMatchBroken),
    });
    lastConfig = null; // no rematch button into a match that has ended
  }

  /* A desync or a disconnect. Say what happened plainly and get out -
     never let two different boards keep playing. */
  /* =============================================================
     LEAVING AN ONLINE MATCH
     -------------------------------------------------------------
     A real opponent is sitting there waiting, so walking away has to
     cost something and has to be acknowledged. Two exits exist and
     they need different treatment:

       CLOSING THE TAB - the browser owns this dialog. We can only
         request it (beforeunload) and, if they go anyway, fire a
         best-effort forfeit on the way out. A normal Realtime send
         will not survive teardown, so the forfeit rides
         sendBeacon(), which browsers are required to finish after
         the page is gone.

       IN-APP EXIT - our own modal, which can say plainly what it
         costs instead of the browser's generic wording.

     Both funnel through forfeitNow() so there is exactly one
     definition of what leaving does.
     ============================================================= */
  function inRankedMatch() {
    return !!(window.EOL.netplay && window.EOL.netplay.active());
  }
  /* Exposed for tests. A synthetic beforeunload cannot be observed
     (its returnValue is not the settable BeforeUnloadEvent property)
     and a real one destroys the page, so the guard's DECISION is
     what gets asserted. */
  window.EOL.__wouldForfeitOnExit = inRankedMatch;

  function forfeitNow() {
    if (!inRankedMatch()) return;
    var NP = window.EOL.netplay;
    try {
      NP.forfeitOut(); // tells the opponent, closes the row
    } catch (e) {
      /* leaving must never throw */
    }
    NP.end();
    if (window.EOL.mp && window.EOL.mp.leave) window.EOL.mp.leave();
    draft = null;
    prep = null;
    mpState = null;
    clearDraftMarks();
  }

  /* The in-app confirmation. `onLeave` runs only if they confirm. */
  function confirmQuit(onLeave) {
    var m = $('quit-modal');
    if (!m || !inRankedMatch()) {
      onLeave();
      return;
    }
    var stay = $('quit-stay'),
      go = $('quit-go'),
      scrim = $('quit-scrim');
    var close = function () {
      m.hidden = true;
      stay.onclick = null;
      go.onclick = null;
      scrim.onclick = null;
      document.removeEventListener('keydown', onKey);
    };
    var onKey = function (ev) {
      if (ev.key === 'Escape') close();
    };
    m.hidden = false;
    stay.onclick = close;
    scrim.onclick = close;
    go.onclick = function () {
      close();
      forfeitNow();
      onLeave();
    };
    document.addEventListener('keydown', onKey);
    go.focus();
  }

  /* Ask the browser to confirm a tab close, and forfeit if it goes
     ahead anyway. `pagehide` is the reliable teardown hook - unlike
     `unload` it also fires on mobile and on bfcache eviction. */
  function initQuitGuard() {
    window.addEventListener('beforeunload', function (ev) {
      if (!inRankedMatch()) return undefined;
      /* Modern browsers ignore custom text and show their own
         wording; returnValue is still required to trigger it. */
      ev.preventDefault();
      ev.returnValue = 'Leaving forfeits your online match.';
      return ev.returnValue;
    });
    window.addEventListener('pagehide', function () {
      if (!inRankedMatch()) return;
      try {
        window.EOL.netplay.forfeitOut(true); // beacon path
      } catch (e) {
        /* nothing useful to do while the page is being destroyed */
      }
    });
  }

  /* =============================================================
     REJOIN AN IN-PROGRESS MATCH
     -------------------------------------------------------------
     Rebuilds the board from the state persisted by migration 03.
     Returns true if it could; false means the caller should concede.

     WHAT RESTORES AND WHAT DOES NOT
       draft  - both pick lists are stored, so the squads rebuild and
                the draft resumes at the right pack
       ban    - your squad is known; bans reopen (or reveal, if both
                sides had already committed)
       field  - bans are known, fielding reopens
       battle - NOT restorable. The per-action log is deliberately not
                stored: that is a much bigger write volume and only
                worth doing when it also powers server-side result
                verification. Rejoining mid-battle still forfeits, and
                saying so plainly beats a board that silently
                disagrees with the opponent's.
     ============================================================= */
  function resumeMatch(m) {
    var st = m.state || {};
    var dict = byId();
    var mine = (st.picks || {})[st.mySlot] || [];
    var theirs = (st.picks || {})[st.foeSlot] || [];
    var toEntries = function (ids) {
      return (ids || [])
        .map(function (id) {
          return dict[id];
        })
        .filter(Boolean);
    };

    /* A battle already under way cannot be reconstructed. */
    if (st.phase === 'battle' || st.phase === 'done') return false;

    /* Classic: the twelves were exchanged up front. */
    if (m.mode === 'classic') {
      var myDeck = toEntries((st.decks || {})[st.mySlot]);
      var foeDeck = toEntries((st.decks || {})[st.foeSlot]);
      if (myDeck.length !== 12 || foeDeck.length !== 12) return false;
      window.EOL.netplay.begin(m);
      startPrep({
        mode: 'classic',
        mp: true,
        seed: m.seed,
        player12: myDeck,
        enemy12: foeDeck,
        field: st.field ? window.EOL.battlefieldById(st.field) : null,
      });
      restorePrep(st);
      toast('Rejoined your match', 'ri-links-line');
      return true;
    }

    /* Draft mid-flight: not worth reconstructing pack-by-pack, and a
       half-drafted board is the one state where the two clients are
       most likely to disagree. Only a COMPLETE draft resumes. */
    if (mine.length !== RULES().DECK_SIZE || theirs.length !== RULES().DECK_SIZE) return false;

    window.EOL.netplay.begin(m);
    startPrep({
      mode: 'draft',
      mp: true,
      seed: m.seed,
      player12: toEntries(mine),
      enemy12: toEntries(theirs),
      field: st.field ? window.EOL.battlefieldById(st.field) : null,
    });
    restorePrep(st);
    toast('Rejoined your match', 'ri-links-line');
    return true;
  }

  /* Re-apply whichever preparation decisions were already committed,
     so a reconnecting player is not asked to ban twice. */
  function restorePrep(st) {
    if (!prep) return;
    var myBans = (st.bans || {})[st.mySlot];
    var foeBans = (st.bans || {})[st.foeSlot];
    if (myBans && myBans.length) {
      prep.youBans = myBans.slice();
      prep.waiting = true; // ours are in; wait on theirs
    }
    if (foeBans && foeBans.length) {
      prep.botBans = foeBans.slice();
    }
    /* Both sides banned before the drop: go straight to fielding. */
    if (prep.youBans.length && prep.botBans && prep.botBans.length) {
      prep.waiting = false;
      revealBansAndAdvance();
      return;
    }
    renderPrep();
  }

  /* Rejoining a battle we cannot rebuild. Concede it honestly rather
     than resume onto a board the opponent does not share. */
  function concedeAbandoned(m) {
    if (window.EOL.netplay) {
      window.EOL.netplay.begin(m);
      var c = window.EOL.netplay.controller(function () {});
      if (c && c.forfeit) c.forfeit();
      window.EOL.netplay.end();
    }
    if (window.EOL.mp.endMatch) window.EOL.mp.endMatch();
    window.EOL.mp.leave();
    toast('You left a match in progress - it has been conceded', 'ri-error-warning-line');
    window.EOL.ui.show('play');
  }

  /* The battle finished. Close the row so neither player is later
     rejoined into a game that has already been decided. */
  function finishMatch() {
    if (window.EOL.mp && window.EOL.mp.endMatch) window.EOL.mp.endMatch();
    window.EOL.netplay.end();
  }

  function onMatchBroken(text) {
    toast(text, 'ri-error-warning-line');
    window.EOL.netplay.end('remote');
    prep = null;
    draft = null;
    mpState = null;
    clearDraftMarks();
    window.EOL.ui.show('play');
  }

  function leaveMatch() {
    window.EOL.netplay.end();
    if (window.EOL.mp) window.EOL.mp.leave();
    prep = null;
    draft = null;
    mpState = null;
    clearDraftMarks();
    window.EOL.ui.show('play');
  }

  /* =====================================================
     CLASSIC - deck picker modal
     ===================================================== */
  function modalShow(on) {
    var m = $('deck-modal');
    if (!m) return;
    m.classList.toggle('show', on);
    m.setAttribute('aria-hidden', String(!on));
  }

  function startClassicDeck(deckId) {
    var deck = deckId ? window.EOL.decks.get(deckId) : null;
    var player12 = deck
      ? window.EOL.decks.entriesOf(deck)
      : RULES().randomDeck(flatten(), Math.random); // the shuffle row
    if (!player12) return;
    modalShow(false);
    startPrep({
      mode: 'classic',
      deckId: deck ? deck.id : null,
      player12: player12,
      enemy12: RULES().randomDeck(flatten(), Math.random),
    });
  }

  function openClassicModal(onPick, opts) {
    opts = opts || {};
    var isCampaign = !!opts.isCampaign;
    var choose = typeof onPick === 'function' ? onPick : startClassicDeck;
    var wl = $('war-length');
    if (wl) wl.hidden = isCampaign || typeof onPick === 'function';
    paintWarLength();

    var titleEl = document.querySelector('.dm-title');
    var subEl = document.querySelector('.dm-sub');
    if (isCampaign) {
      if (titleEl) titleEl.textContent = opts.title || 'Choose your deck';
      if (subEl)
        subEl.textContent = opts.sub || 'Select your squad of 12 for the battle ahead.';
    } else {
      if (titleEl) titleEl.textContent = 'Choose your deck';
      if (subEl)
        subEl.textContent = 'The enemy builds a squad of 12 - max 4 of a role, like yours.';
    }

    var host = $('dm-list');
    host.innerHTML = '';

    /* Shuffle row only in non-campaign modes */
    if (!isCampaign && !opts.hideRandom) {
      var r = document.createElement('button');
      r.className = 'dm-row random';
      r.type = 'button';
      r.innerHTML =
        '<span class="dm-ico"><i class="ri-shuffle-line"></i></span>' +
        '<span class="dm-body"><span class="dm-name">Surprise me</span>' +
        '<span class="dm-meta">A random legal squad of 12 - just this game</span></span>' +
        '<i class="dm-go ri-arrow-right-line"></i>';
      r.addEventListener('click', function () {
        choose(null);
      });
      host.appendChild(r);
    }

    var decks = window.EOL.decks.list();
    if (!decks.length) {
      var none = document.createElement('p');
      none.className = 'dm-empty';
      none.innerHTML = 'No saved decks yet - forge one from <b>New deck</b> below.';
      host.appendChild(none);
    }
    decks
      .slice()
      .sort(function (a, b) {
        return b.ts - a.ts;
      })
      .forEach(function (d) {
        var ok = window.EOL.decks.isComplete(d);
        var row = document.createElement('button');
        row.className = 'dm-row' + (ok ? '' : ' disabled');
        row.type = 'button';
        if (!ok) row.disabled = true;
        row.innerHTML =
          '<span class="dm-ico"><i class="ri-stack-line"></i></span>' +
          '<span class="dm-body"><span class="dm-name">' +
          esc(d.name) +
          '</span>' +
          '<span class="dm-meta">' +
          d.ids.length +
          '/12 legends' +
          (ok ? '' : ' - needs 12 to battle (edit it)') +
          '</span></span>' +
          (ok ? '<i class="dm-go ri-arrow-right-line"></i>' : '');
        if (ok)
          row.addEventListener('click', function () {
            choose(d.id);
          });
        host.appendChild(row);
      });
    modalShow(true);
  }

  /* =====================================================
     DRAFT - snake draft, packs of 3
     -------------------------------------------------------------
     The pack is dealt ONCE and stays on the table: picks mark the
     card in place (greyed + a colored claim stamp), piles update
     the instant each hero is chosen, and only a brand-new pack gets
     the entrance deal.
     ===================================================== */
  var draft = null;
  var BOT_OPEN_MS = 1150; // the bot studies a pack it opened
  var BOT_ANSWER_MS = 1050; // the bot weighs its answer to yours
  var SETTLE_MS = 850; // beat to read the picks before the next pack

  /* wipe per-draft bookkeeping off the shared entry objects */
  function clearDraftMarks() {
    flatten().forEach(function (e) {
      if (e._wrap) e._wrap = null;
      if (e._taken) e._taken = null; // also covers the 'burn' marker
    });
  }

  function packStarter(i) {
    /* Singleplayer: you always open the even packs.
       Multiplayer: the HOST opens the even packs, so the two clients
       assign opposite roles for the same pack index and the snake
       alternates correctly on both screens. */
    if (mpState) {
      var hostOpens = i % 2 === 0;
      return hostOpens === mpState.host ? 'you' : 'foe';
    }
    return i % 2 === 0 ? 'you' : 'foe';
  }

  /* ---------------------------------------------------------
     MULTIPLAYER DRAFT
     -------------------------------------------------------------
     The same snake draft, with two changes:
       - the pack order comes from the match SEED, so both clients
         build an identical sequence without transmitting the pool
       - the "foe" pick arrives over the wire instead of from the bot
     `mpState` is null in singleplayer and everything behaves as before.
     --------------------------------------------------------- */
  var mpState = null;
  /* Campaign draft launch config (stages 6-8): carried from startDraft
     to the startPrep that follows the final pack. */
  var draftCampaign = null;
  /* What we are queueing for, and (Classic only) with which deck. */
  var mpQueueMode = 'draft';
  var mpDeckId = null;

  function startDraft(opts) {
    /* flatten() hands back ONE shared entry object per hero, cached for the
       life of the page, and the draft stamps per-game state (_taken and
       _wrap) straight onto those objects. Without this scrub a second
       draft inherits the first one's stamps: cards render pre-greyed as
       "already taken" and the piles look pre-filled. Clear every marker
       before building a new draft. */
    opts = opts || {};
    clearDraftMarks();
    /* CAMPAIGN (stages 6-8): a curated pool, a rival persona for the
       picks, and a launch config that advancePack hands to startPrep so
       the fight lands on the stage's pinned board with the stage's ban
       profile. All null outside the campaign. */
    draftPersona = opts.persona || null;
    draftPersonaJitter = opts.personaJitter || 0;
    draftCampaign = opts.campaign || null;
    /* A multiplayer draft is driven by the match seed so both clients
       shuffle to the identical pack order. Singleplayer keeps using
       Math.random. */
    var rnd = opts.seed != null ? window.EOL.mp.rngFrom(opts.seed) : Math.random;
    mpState = opts.seed != null ? { host: !!opts.host, seed: opts.seed, waiting: false } : null;
    var pool =
      opts.pool && opts.pool.length ? opts.pool.slice() : RULES().draftPool(flatten(), rnd);
    var shuffled = pool.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = t;
    }
    var packs = [];
    for (var k = 0; k < shuffled.length; k += 3) packs.push(shuffled.slice(k, k + 3));
    draft = {
      packs: packs,
      packNo: 0,
      offered: packs[0].slice(),
      picks: { you: [], foe: [] },
      busy: false,
    };
    /* Pack 0 has an opener too. Singleplayer always let YOU open it, but
       in multiplayer only the host does, so the guest must start locked
       and waiting or both players would pick from the same pack. */
    draft.busy = packStarter(0) === 'foe';
    renderPack();
    renderDraftHead();
    /* Repaint both squad strips from the NEW (empty) picks. Without this the
       previous draft's 12 pips and its "12/12" counters stay on screen -
       the draft state was already reset, but the DOM was never cleared. */
    paintPiles(null);
    window.EOL.ui.show('draft');
    if (draft.busy) foeOpens();
    coachShow(
      'draft',
      'ra-clovers-card',
      'The Snake Draft',
      'Packs of three, 12 packs. You open the odd packs, the enemy opens the even ones. ' +
        'One pick each per pack, the third card burns - both squads build to 12, then preparation begins.'
    );
  }

  /* header text + order chips - cheap enough to refresh on every beat */
  function renderDraftHead() {
    var d = draft;
    if (!d) return;
    document.querySelector('.view.draft').classList.toggle('busy', !!d.busy);
    var total = d.packs.length;
    var starter = packStarter(d.packNo);
    $('draft-sub').textContent =
      'Pack ' +
      (d.packNo + 1) +
      ' of ' +
      total +
      (d.busy
        ? ' - the enemy weighs its pick...'
        : starter === 'you'
          ? ' - your pick'
          : ' - your pick (the enemy opened this pack)');
    $('draft-order').innerHTML =
      '<span class="dorder-chip' +
      (starter === 'you' ? ' on' : '') +
      '">' +
      (starter === 'you' ? 'You open this pack' : 'Enemy opened this pack') +
      '</span>' +
      '<span class="dorder-chip">' +
      (d.packNo % 2 ? 'Snake order: the enemy picks first' : 'Snake order: you pick first') +
      '</span>';
  }

  /* deal a fresh pack: the only time pack cards are (re)built */
  function renderPack() {
    var d = draft;
    var packHost = $('draft-pack');
    packHost.innerHTML = '';
    d.offered.forEach(function (e, i) {
      e._taken = null;
      var wrap = document.createElement('div');
      wrap.className = 'dpack-card';
      wrap.style.animationDelay = i * 90 + 'ms';
      var card = window.EOL.ui.buildCard(e.card, e.faction, i);
      var hint = card.querySelector('.hint-txt');
      if (hint) hint.textContent = 'draft this legend';
      wrap.appendChild(card);
      wrap.addEventListener('click', function () {
        youPick(e);
      });
      e._wrap = wrap;
      packHost.appendChild(wrap);
    });
    updateCaps();
  }

  /* re-check the max-4 law against your squad after every pick, in place */
  function updateCaps() {
    var d = draft;
    if (!d) return;
    d.offered.forEach(function (e) {
      if (e._taken || !e._wrap) return;
      var blocked = RULES().capBlocked(d.picks.you, e.card);
      e._wrap.classList.toggle('capped', blocked);
      e._wrap.title = blocked ? 'Role capped - your squad already runs 4 ' + e.card.role + 's' : '';
    });
  }

  /* a claimed card greys down, gains its owner's border and claim stamp */
  function markTaken(e, who) {
    e._taken = who;
    if (!e._wrap) return;
    e._wrap.classList.add('taken', who === 'you' ? 'taken-you' : 'taken-foe');
    e._wrap.classList.remove('capped');
    e._wrap.title = '';
    var stamp = document.createElement('span');
    stamp.className = 'dtake';
    stamp.textContent = who === 'you' ? 'Yours' : 'Enemy';
    e._wrap.appendChild(stamp);
  }

  /* the leftover third of a pack burns away before the next deal */
  function burnCard(e) {
    e._taken = 'burn';
    if (e._wrap) {
      e._wrap.classList.add('burnout');
      e._wrap.classList.remove('capped');
    }
  }

  /* Both squads fill in live - freshSide's newest pip is the only one
     that pops, so a repaint never replays the whole strip. */
  function paintPiles(freshSide) {
    var d = draft;
    [
      ['dpile-you', 'dp-you-n', d.picks.you, 'you'],
      ['dpile-foe', 'dp-foe-n', d.picks.foe, 'foe'],
    ].forEach(function (cfg) {
      var host = $(cfg[0]);
      host.innerHTML = '';
      cfg[2].forEach(function (e, idx) {
        var pip = document.createElement('span');
        pip.className =
          'dc-pip rarity-' +
          e.card.rarity +
          (cfg[3] === freshSide && idx === cfg[2].length - 1 ? ' fresh' : '');
        pip.title = e.card.name;
        pip.innerHTML = '<i class="ra ' + e.card.icon + '"></i>';
        pip.addEventListener('mouseenter', function () {
          showDraftTip(e, pip);
        });
        pip.addEventListener('mouseleave', hideDraftTip);
        host.appendChild(pip);
      });
      var left = RULES().DECK_SIZE - cfg[2].length;
      for (var i = 0; i < left; i++) {
        var e2 = document.createElement('span');
        e2.className = 'dc-pip empty';
        host.appendChild(e2);
      }
      $(cfg[1]).textContent = cfg[2].length;
    });
  }

  /* Any untaken card your squad can still legally hold? The 4-cap is
     waived when the pack corners you, exactly like the bot's fallback. */
  function anyLegalForYou(d) {
    return d.offered.some(function (e) {
      return !e._taken && !RULES().capBlocked(d.picks.you, e.card);
    });
  }

  /* your click: mark yours now, pile updates instantly, the bot thinks */
  function youPick(e) {
    var d = draft;
    if (!d || d.busy || e._taken) return;
    if (RULES().capBlocked(d.picks.you, e.card)) {
      if (anyLegalForYou(d)) {
        flashNode('draft-sub');
        return;
      }
      /* cornered: the pack holds only capped roles - the cap waives */
      toast('Role cap waived - no legal pick remained', 'ri-error-warning-line');
    }
    var idx = d.offered.indexOf(e);
    markTaken(e, 'you');
    d.picks.you.push(e);
    paintPiles('you');
    /* Tell the opponent WHICH SLOT of the current pack we took. Both
       clients built the same pack from the seed, so an index is all the
       information the other side needs. */
    if (mpState) {
      window.EOL.mp.send('pick', { pack: d.packNo, idx: idx });
      /* Persist the running pick list so a reconnect can rebuild the
         squad. Cheap - it is one small array per pick. */
      window.EOL.mp.saveState({
        phase: 'draft',
        picks: d.picks.you.map(function (x) {
          return x.card.id;
        }),
      });
    }

    var remaining = d.offered.filter(function (x) {
      return !x._taken;
    });
    if (remaining.length === 1) {
      // you answered an opponent-opened pack: the last card burns
      burnCard(remaining[0]);
      renderDraftHead();
      setTimeout(advancePack, SETTLE_MS);
      return;
    }
    // you opened: the other side answers from the two you left
    d.busy = true;
    updateCaps();
    renderDraftHead();
    if (mpState) {
      // a real opponent answers; applyRemotePick() resumes the flow
      mpState.waiting = true;
      setDraftWait(true);
      return;
    }
    setTimeout(function () {
      if (!draft) return;
      var foePick = draftPick(draft.picks.foe, remaining, draft.picks.you);
      markTaken(foePick, 'foe');
      draft.picks.foe.push(foePick);
      paintPiles('foe');
      draft.offered
        .filter(function (x) {
          return !x._taken;
        })
        .forEach(burnCard);
      setTimeout(advancePack, SETTLE_MS);
    }, BOT_ANSWER_MS);
  }

  /* The opponent's pick arrived. Mirror it locally. */
  function applyRemotePick(payload) {
    var d = draft;
    if (!d || !mpState) return;
    if (payload.pack !== d.packNo) return; // stale message, ignore
    var e = d.offered[payload.idx];
    if (!e || e._taken) return;
    mpState.waiting = false;
    setDraftWait(false);
    markTaken(e, 'foe');
    d.picks.foe.push(e);
    paintPiles('foe');
    var left = d.offered.filter(function (x) {
      return !x._taken;
    });
    if (left.length === 1) {
      // they answered OUR pack: burn the last and move on
      burnCard(left[0]);
      renderDraftHead();
      setTimeout(advancePack, SETTLE_MS);
    } else {
      // they opened: our turn to answer from what is left
      d.busy = false;
      updateCaps();
      renderDraftHead();
    }
  }

  /* a small "their turn" state so the board never looks frozen */
  function setDraftWait(on) {
    var host = $('draft-pack');
    if (host) host.classList.toggle('mp-waiting', !!on);
    var sub = $('draft-sub');
    if (sub && on) sub.textContent = 'Waiting for your opponent...';
  }

  /* Foe-opened packs: the bot takes one of three, you answer from two.
     In multiplayer we simply wait for their broadcast instead. */
  function foeOpens() {
    if (mpState) {
      mpState.waiting = true;
      setDraftWait(true);
      return;
    }
    setTimeout(function () {
      if (!draft) return;
      var foePick = draftPick(draft.picks.foe, draft.offered, draft.picks.you);
      markTaken(foePick, 'foe');
      draft.picks.foe.push(foePick);
      paintPiles('foe');
      draft.busy = false;
      updateCaps();
      renderDraftHead();
    }, BOT_OPEN_MS);
  }

  function advancePack() {
    var d = draft;
    if (!d) return;
    d.packNo += 1;
    if (d.packNo >= d.packs.length) {
      // two legal twelves - settle the piles, then Preparation takes over
      var you12 = d.picks.you.slice();
      var foe12 = d.picks.foe.slice();
      paintPiles(null);
      draft = null;
      var wasMp = !!mpState;
      var seed = mpState ? mpState.seed : null;
      mpState = null;
      var camp = draftCampaign;
      draftCampaign = null;
      draftPersona = null;
      startPrep({
        mode: 'draft',
        player12: you12,
        enemy12: foe12,
        mp: wasMp,
        seed: seed,
        /* Both machines must fight on the SAME terrain, so it is
           derived from the shared seed rather than rolled twice. A
           campaign draft instead lands on the stage's PINNED board. */
        field: wasMp
          ? window.EOL.rollBattlefield(window.EOL.netplay.rngFrom((seed | 0) + 0x1b7))
          : camp
            ? camp.field || null
            : null,
        campaignStage: camp ? camp.stage : null,
        botBanProfile: camp ? camp.banProfile : null,
        banTell: camp ? camp.banTell || null : null,
        rival: camp ? camp.rival : null,
        war: camp ? 'single' : null,
      });
      return;
    }
    d.offered = d.packs[d.packNo].slice();
    d.busy = packStarter(d.packNo) === 'foe';
    renderPack();
    renderDraftHead();
    if (d.busy) foeOpens();
  }

  /* =====================================================
     THE SET (best-of-3) - 2026-08-04, roadmap Phase 1
     -------------------------------------------------------------
     Laws (docs/ROADMAP.md Phase 1):
       - Open info always: decks shown, you ban 2 of THEIR cards,
         only the six is hidden until each battle starts.
       - Fight card: 3 battlefields revealed at prep start; game 1's
         board pre-designated; loser of each game picks the next
         board from the remaining slots; the unpicked leftover is
         the decider's board.
       - Substitutions MANDATORY between games: exactly 1-2 swaps
         per window, formation re-picks are free. The identical six
         may never be fielded twice in a row (combo rotation).
       - SOLO ONLY for now (MP wiring = Phase 1b). All set state is
         seeded-board compatible; nothing here is solo-engine-tied.
     ===================================================== */
  var WAR_KEY = 'eol.war.length';
  function warLength() {
    try {
      return localStorage.getItem(WAR_KEY) === 'set' ? 'set' : 'single';
    } catch (e) {
      return 'single';
    }
  }
  function setWarLength(v) {
    try {
      localStorage.setItem(WAR_KEY, v === 'set' ? 'set' : 'single');
    } catch (e) {
      /* private mode */
    }
    paintWarLength();
  }
  function paintWarLength() {
    var w = $('war-length');
    if (!w) return;
    var on = warLength();
    w.querySelectorAll('.wl-opt').forEach(function (b) {
      var sel = b.dataset.len === on;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
  }

  /* WHICH MATCHES CAN BE A WAR (user law, 2026-08-05).
     -------------------------------------------------------------
     Unabridged is a CLASSIC format and nothing else. A draft is a
     single game: you build a twelve out of packs instead of bringing
     a saved one, and then you play exactly one Classic-shaped game.

     This used to be decided by `warLength()` alone, and that toggle is
     a persisted global (`eol.war.length`) written by the Classic deck
     popup. A draft never opens that popup, so it could not turn the
     setting off - it just inherited whatever the last Classic launch
     left behind. Anyone who had played one Unabridged Classic got
     three-battlefield wars out of every draft from then on, with no
     control anywhere in the UI. Reading the MODE here is what makes it
     impossible rather than merely unlikely, and it also covers
     multiplayer, where the format is the room's to decide. */
  function canBeSet(cfg) {
    if (!cfg || cfg.mp) return false;
    if (cfg.mode !== 'classic') return false;
    return warLength() === 'set';
  }

  var setState = null; /* see setBegin */
  function setBegin(cfg) {
    var card = [];
    /* CAMPAIGN: exam stages pin an AUTHORED fight card (three named
       boards - §2's terrain table) instead of rolling one. L1 holds:
       these are existing, symmetric battlefields, only the selection
       is authored. */
    if (cfg && cfg.fightCard && cfg.fightCard.length === 3) {
      card = cfg.fightCard.slice();
    } else {
      var guard = 0;
      while (card.length < 3 && guard++ < 50) {
        var f = window.EOL.rollBattlefield();
        if (
          !card.some(function (x) {
            return x.id === f.id;
          })
        )
          card.push(f);
      }
    }
    /* WHICH arena hosts game 1 is itself the first roulette of the
       war: rolled here (so prep can be built around the board) but
       only revealed by the fight-card spin after bans - the marker
       settling on slot 0 every time made the spin a lie. */
    var g1 = Math.floor(Math.random() * card.length);
    setState = {
      game: 1,
      wins: { you: 0, foe: 0 },
      card: card,
      game1Slot: g1,
      usedSlots: [g1],
      /* per-game battle-report snapshots (side -> cid -> totals),
         merged into one set-wide report on the final result screen */
      report: [],
      lastSix: null, // {front:[ids], back:[ids]} - the player's public six
      lastBotIds: [], // the bot's public six
      /* ROTATION law, extended: a hero subbed OUT of a six sits out the
         rest of the set (rendered like a banned card; cannot re-enter).
         Tracked for both sides so the bot plays the same game. */
      lockedOut: [],
      botLockedOut: [],
      youBans: [], // bans the player issued (persist set-wide)
      botBans: [], // bans issued AGAINST the player
      player12: cfg.player12,
      enemy12: cfg.enemy12,
      /* CAMPAIGN carry: the set spans three preps, so everything the
         later games need survives here. */
      campaignStage: cfg.campaignStage || null,
      rival: cfg.rival || null,
      pinnedEnemy: cfg.pinnedEnemy ? cfg.pinnedEnemy.slice() : [],
      unbannable: cfg.unbannable ? cfg.unbannable.slice() : [],
      pending: null, // 'sideboard' | 'over' after a game ends
      lastWinner: null, // 'you' | 'foe'
    };
    return card[g1];
  }
  function setKill() {
    setState = null;
    var pill = $('set-pill');
    if (pill) {
      pill.hidden = true;
      delete pill.dataset.k;
    }
  }

  /* --- fight card + board pick modals --- */
  function setmArt(field) {
    return field && field.art
      ? ' style="background-image:url(\'' + new URL(field.art, document.baseURI).href + '\')"'
      : '';
  }
  /* One plate = one battlefield WITH the rules it plays by. Name +
     tagline alone made the fight card a pretty but empty promise:
     players shape their six around the terrain, so the terrain's law
     belongs on the card. `--i` phases the entrance stagger. */
  function setmPlateInner(f, slotLabel) {
    return (
      '<div class="setm-art"' +
      setmArt(f) +
      '>' +
      '<span class="setm-slot">' +
      esc(slotLabel) +
      '</span>' +
      '<span class="setm-stamp" aria-hidden="true"><i class="ra ra-crossed-swords"></i>CALLED</span>' +
      '</div>' +
      '<div class="setm-body">' +
      '<span class="setm-name">' +
      esc(f.name) +
      '</span>' +
      '<span class="setm-tag">' +
      esc(f.tagline || '') +
      '</span>' +
      '<ul class="setm-rules">' +
      (f.rules || [])
        .map(function (r) {
          return '<li>' + rich(esc(r)) + '</li>';
        })
        .join('') +
      '</ul>' +
      '</div>'
    );
  }
  function setmPlateHTML(f, slotLabel, i) {
    return (
      '<div class="setm-plate" style="--i:' + i + '">' + setmPlateInner(f, slotLabel) + '</div>'
    );
  }
  function fightTitle(icon, text, tip) {
    var t = $('set-fightcard-title');
    if (t)
      t.innerHTML =
        '<i class="ra ' +
        icon +
        '" aria-hidden="true"></i> ' +
        text +
        (tip
          ? ' <button type="button" class="tipdot" data-tip="' +
            esc(tip) +
            '" aria-label="Tip"><i class="ri-question-line"></i></button>'
          : '');
  }
  function openSlots() {
    return setState.card
      .map(function (f, i) {
        return i;
      })
      .filter(function (i) {
        return setState.usedSlots.indexOf(i) < 0;
      });
  }

  /* ---------------------------------------------------------
     THE CALL ROULETTE
     A choice between arenas should feel won, not dealt: the marker
     races the plates, tires, and settles on the chosen board with a
     stamp. Pure theatre - the outcome was picked before the first hop;
     the spin only reveals it. Any click past it skips it, and reduced
     motion (gfx low) jumps straight to the landing.
     --------------------------------------------------------- */
  var ROUL_DELAYS = [70, 70, 75, 80, 90, 100, 115, 130, 155, 185, 225, 280];
  function motionOk() {
    return document.body.dataset.gfx !== 'low';
  }
  /* Decelerating marker across `host`'s .setm-plate children, landing
     on finalIdx. Returns skip(): jump to the landing immediately. */
  function spinPlates(host, finalIdx, onLand) {
    var plates = host ? Array.prototype.slice.call(host.querySelectorAll('.setm-plate')) : [];
    var n = plates.length;
    var landed = false;
    var timer = null;
    function land() {
      if (landed) return;
      landed = true;
      clearTimeout(timer);
      plates.forEach(function (pl, j) {
        pl.classList.remove('hot');
        pl.classList.toggle('called', j === finalIdx);
        pl.classList.toggle('dim', j !== finalIdx);
      });
      if (host) host.classList.remove('spinning');
      if (onLand) onLand();
    }
    if (!n || n === 1 || !motionOk()) {
      land();
      return land;
    }
    host.classList.add('spinning');
    /* start index chosen so hop (hops-1) sits exactly on finalIdx */
    var hops = ROUL_DELAYS.length;
    var start = (((finalIdx - (hops - 1)) % n) + n) % n;
    var k = 0;
    var tick = function () {
      if (landed) return;
      var cur = (start + k) % n;
      plates.forEach(function (pl, j) {
        pl.classList.toggle('hot', j === cur);
      });
      var d = ROUL_DELAYS[k];
      k++;
      timer = setTimeout(k >= hops ? land : tick, d);
    };
    tick();
    return land;
  }

  function showFightCard(cb) {
    var m = $('set-fightcard');
    if (!m || !setState) return cb && cb();
    fightTitle(
      'ra-scroll-unfurled',
      'UNABRIDGED - FIGHT CARD',
      'All three arenas are open information right away. The spin decides which one hosts game 1 - after that, the loser of each game picks the next arena.'
    );
    /* every plate starts an open slot - WHICH one hosts game 1 is the
       spin's whole point (rolled at setBegin, revealed here) */
    $('set-fightcard-plates').innerHTML = setState.card
      .map(function (f, i) {
        return setmPlateHTML(f, 'Open slot', i);
      })
      .join('');
    $('set-fightcard-sub').textContent =
      'All three boards are public from the first click of the set. The loser of each game calls the next one from the open slots.';
    var btn = $('set-fightcard-go');
    btn.querySelector('span').textContent = 'Field your six';
    /* Locked until the roulette lands (2026-08-05): clicking "Field your
       six" mid-spin skipped the reveal AND raced the plates' own
       animation. The button wakes the moment the marker settles -
       including the reduced-motion path, where spinPlates lands
       instantly and this same callback fires. */
    btn.disabled = true;
    var skip = spinPlates($('set-fightcard-plates'), setState.game1Slot, function () {
      if (!setState) return;
      btn.disabled = false;
      var plates = $('set-fightcard-plates').querySelectorAll('.setm-plate');
      var landed = plates[setState.game1Slot];
      if (landed) {
        var s = landed.querySelector('.setm-slot');
        if (s) s.textContent = 'Game 1';
      }
      $('set-fightcard-sub').textContent =
        'Game 1 is fought on ' +
        setState.card[setState.game1Slot].name +
        '. The loser of each game calls the next board from the open slots.';
    });
    var done = function () {
      btn.removeEventListener('click', done);
      skip();
      m.hidden = true;
      cb && cb();
    };
    btn.addEventListener('click', done);
    m.hidden = false;
  }
  /* Loser-of-game picks the next battlefield. Called with the losing
     side ('you' | 'foe'). The bot picks at random for v1 (roadmap: a
     real board-read heuristic is Phase-1b polish). */
  function setPickBoard(loser, cb) {
    var remaining = openSlots();
    if (remaining.length === 1) return cb(remaining[0]);
    if (loser === 'foe' || !remaining.length)
      return cb(remaining[Math.floor(Math.random() * remaining.length)]);
    var m = $('set-boardpick');
    if (!m) return cb(remaining[0]);
    $('set-boardpick-plates').innerHTML = remaining
      .map(function (i, k) {
        return (
          '<button type="button" class="setm-plate pick" style="--i:' +
          k +
          '" data-slot="' +
          i +
          '">' +
          setmPlateInner(setState.card[i], 'Your call') +
          '</button>'
        );
      })
      .join('');
    $('set-boardpick-sub').textContent =
      'You lost game ' +
      (setState.game - 1) +
      ' - so the call is yours. The slot you leave becomes the decider board if the set goes the distance.';
    m.querySelectorAll('.setm-plate.pick').forEach(function (b) {
      b.addEventListener('click', function () {
        /* let the stamp land before the modal folds away */
        m.querySelectorAll('.setm-plate.pick').forEach(function (x) {
          x.classList.toggle('called', x === b);
          x.classList.toggle('dim', x !== b);
          x.disabled = true;
        });
        setTimeout(
          function () {
            m.hidden = true;
            setState.usedSlots.push(+b.dataset.slot);
            cb(+b.dataset.slot);
          },
          motionOk() ? 430 : 0
        );
      });
    });
    m.hidden = false;
  }
  /* bot lost and calls - the call is THEATRE, not instant info: the
     open slots spin and land on its pick, then the war advances by
     itself (the button only skips the pause). cb(slot, spun): `spun`
     tells the caller the roulette already revealed the board. */
  function setBotCall(cb) {
    var remaining = openSlots();
    if (!remaining.length) return cb(0, false);
    if (remaining.length === 1) return cb(remaining[0], false);
    var pick = remaining[Math.floor(Math.random() * remaining.length)];
    var m = $('set-fightcard');
    if (!m) return cb(pick, false);
    fightTitle(
      'ra-crowned-heart',
      'THE ENEMY CALLS THE NEXT BATTLEFIELD',
      'The loser of the last game picks the next arena. The arena left over hosts the final game if the set goes there.'
    );
    $('set-fightcard-plates').innerHTML = remaining
      .map(function (slot, i) {
        return setmPlateHTML(setState.card[slot], 'Open slot', i);
      })
      .join('');
    $('set-fightcard-sub').textContent =
      'You won game ' +
      (setState.game - 1) +
      ', so the call is theirs. The slot they leave becomes the decider if the set goes the distance.';
    var btn = $('set-fightcard-go');
    btn.querySelector('span').textContent = 'To the sideboard';
    btn.disabled = true; // wake when the enemy's call lands
    var auto = null;
    var done = function () {
      btn.removeEventListener('click', done);
      skip();
      clearTimeout(auto);
      m.hidden = true;
      cb(pick, true);
    };
    var skip = spinPlates($('set-fightcard-plates'), remaining.indexOf(pick), function () {
      if (!setState) return;
      btn.disabled = false;
      $('set-fightcard-sub').textContent = 'The enemy calls ' + setState.card[pick].name + '.';
      auto = setTimeout(done, 1700);
    });
    btn.addEventListener('click', done);
    m.hidden = false;
  }

  /* Read-only re-open of the fight card from the field-six screen:
     no spin, no gate - every plate already tells its story, the current
     host is lit, the played ones dimmed. */
  function showFightCardViewer() {
    var m = $('set-fightcard');
    if (!m || !setState) return false;
    fightTitle(
      'ra-scroll-unfurled',
      'UNABRIDGED - FIGHT CARD',
      'All three arenas are open information. The loser of each game calls the next arena.'
    );
    $('set-fightcard-plates').innerHTML = setState.card
      .map(function (f, i) {
        var usedAt = setState.usedSlots.indexOf(i);
        return setmPlateHTML(f, usedAt >= 0 ? 'Game ' + (usedAt + 1) : 'Open slot', i);
      })
      .join('');
    var cur = setState.usedSlots[setState.usedSlots.length - 1];
    Array.prototype.forEach.call(
      $('set-fightcard-plates').querySelectorAll('.setm-plate'),
      function (pl, i) {
        var usedAt = setState.usedSlots.indexOf(i);
        pl.classList.toggle('called', i === cur);
        pl.classList.toggle('dim', usedAt >= 0 && i !== cur);
      }
    );
    $('set-fightcard-sub').textContent =
      'Game ' +
      setState.game +
      ' is being fought on ' +
      setState.card[cur].name +
      '. First to 2 wins takes the set.';
    var btn = $('set-fightcard-go');
    btn.querySelector('span').textContent = 'Back to fielding';
    btn.disabled = false;
    var done = function () {
      btn.removeEventListener('click', done);
      m.hidden = true;
    };
    btn.addEventListener('click', done);
    m.hidden = false;
    return true;
  }

  /* Score line, everywhere it is needed */
  function setScoreLine() {
    var w = setState.wins;
    return (
      'Unabridged - Game ' +
      setState.game +
      ' of 3 - You ' +
      w.you +
      ' - ' +
      w.foe +
      (w.you > w.foe ? ' - you lead' : w.you < w.foe ? ' - you trail' : ' - level')
    );
  }
  /* The in-battle war score. battle.js's render() asks for this on
     every paint and swaps its (redundant) action pill for the set pill
     while a set is live - user law 2026-08-04: the old fixed
     top-centre chip floated over the round counter and read as HUD
     clutter. Outside the battle the sideboard's own header line
     (setScoreLine above) carries the score. */
  function setPillInfo() {
    if (!setState) return null;
    return { game: setState.game, you: setState.wins.you, foe: setState.wins.foe };
  }

  /* How many of the CURRENT fielded six differ from last game's public
     six? The substitution law counts composition only; row moves are
     free. */
  function setSwapCount() {
    if (!setState || !setState.lastSix) return 0;
    var before = setState.lastSix.front.concat(setState.lastSix.back);
    var now = prep ? prep.front.concat(prep.back) : [];
    return now.filter(function (id) {
      return before.indexOf(id) < 0;
    }).length;
  }

  /* The bot's sideboard: it re-runs chooseSix against your PUBLIC six
     (last game is fair information), then enforces the same 1-2 swap
     law it holds you to. The `pinned` boss (R5) is untouchable in the
     swap path: he is seeded first, never counted droppable, and since
     he was in last game's public six keeping him never costs a swap. */
  function setBotSix(survive, forecast) {
    var pinnedIds = (setState && setState.pinnedEnemy) || [];
    var pinnedIn = function (list) {
      return list.filter(function (e) {
        return pinnedIds.indexOf(e.card.id) >= 0;
      });
    };
    var chosen = chooseSix(survive, forecast, pinnedIds);
    var old = setState.lastBotIds || [];
    if (!old.length) return chosen;
    var fresh = chosen.filter(function (e) {
      return old.indexOf(e.card.id) < 0;
    }).length;
    var ai = DAI();
    if (fresh >= 1 && fresh <= 2) return chosen;
    var oldKeep = chosen.filter(function (e) {
      return old.indexOf(e.card.id) >= 0;
    });
    var bench = survive.filter(function (e) {
      return (
        old.indexOf(e.card.id) < 0 &&
        !chosen.some(function (c) {
          return c.card.id === e.card.id;
        })
      );
    });
    /* score bench heroes, best first */
    bench.sort(function (a, b) {
      return ai.value(chosen, b, { size: 6 }) - ai.value(chosen, a, { size: 6 });
    });
    var need = fresh < 1 ? 1 : 2 - fresh;
    /* rebuild the six from the old public six + exactly `need` swaps,
       then let chooseSix's shape pass keep rows sane via auto-form */
    var base = survive.filter(function (e) {
      return old.indexOf(e.card.id) >= 0;
    });
    /* drop the weakest old-timers until `need` bench heroes fit with
       role caps respected: chooseSix over the reduced pool keeps the
       rails (Tank/Medic forces) identical to side one. The pinned boss
       is exempt from the drop by construction. */
    var droppable = base.filter(function (e) {
      return pinnedIds.indexOf(e.card.id) < 0;
    });
    var half = pinnedIn(base).concat(
      droppable
        .slice()
        .sort(function (a, b) {
          return ai.value(base, a, { size: 6 }) - ai.value(base, b, { size: 6 });
        })
        .slice(need)
    );
    var pool = half.concat(bench.slice(0, need * 2));
    oldKeep = chooseSix(pool, forecast, pinnedIds);
    return oldKeep;
  }

  window.EOL.play = window.EOL.play || {};

  /* =====================================================
     rematch routing
     ===================================================== */
  var lastConfig = null;

  function rematch() {
    var ov = $('result');
    if (ov) ov.className = 'result';
    /* THE SET: rematch means "advance the war" while the set is live
       and "a fresh war, same configuration" once it is over. */
    if (setState) {
      if (setState.pending === 'sideboard') {
        setState.pending = null;
        setAdvance();
        return;
      }
      if (setState.pending === 'over') setKill(); // fall through: fresh war
    }
    if (!lastConfig) {
      window.EOL.ui.show('battle');
      BATTLE().start();
      return;
    }
    /* CAMPAIGN: the fight card leads back into the same gate, not into a
       generic classic battle. §9.7 - the campaign owns the retry so the
       Recruiter's dialogue + starter flow run again. */
    if (lastConfig.campaignStage) {
      if (window.EOL.campaign && window.EOL.campaign.retry)
        window.EOL.campaign.retry(lastConfig.campaignStage);
      return;
    }
    if (lastConfig.mode === 'classic') {
      var d = lastConfig.deckId ? window.EOL.decks.get(lastConfig.deckId) : null;
      if (lastConfig.random || !d || !window.EOL.decks.isComplete(d)) {
        // random rows re-shuffle; a deleted/unfinished deck falls back to the picker
        if (lastConfig.random) startClassicDeck(null);
        else openClassicModal();
        return;
      }
      startClassicDeck(d.id);
      return;
    }
    startDraft();
  }

  /* =====================================================
     THE SET - flow between games
     ===================================================== */
  /* battle.js's showResult asks us for set framing every game; null
     from a non-set match means "behave exactly as before". */
  function setGameResult(playerWon, tallySnap) {
    if (!setState) return null;
    if (tallySnap) setState.report.push(tallySnap);
    setState.lastWinner = playerWon ? 'you' : 'foe';
    if (playerWon) setState.wins.you++;
    else setState.wins.foe++;
    var w = setState.wins;
    var over = w.you === 2 || w.foe === 2;
    setState.pending = over ? 'over' : 'sideboard';
    return {
      over: over,
      sub: over
        ? playerWon
          ? 'UNABRIDGED IS YOURS, ' + w.you + ' - ' + w.foe + '.'
          : 'Unabridged is lost, ' + w.you + ' - ' + w.foe + '.'
        : 'Game ' +
          setState.game +
          (playerWon ? ' to you' : ' to the enemy') +
          '  -  ' +
          w.you +
          ' - ' +
          w.foe +
          '  -  next stop: the sideboard',
      rematchLabel: over ? 'New Unabridged' : 'Sideboard',
    };
  }

  /* A game is done, the set is not: the LOSER calls the next board
     from the open fight-card slots, then both sides sideboard. */
  function setAdvance() {
    setState.game += 1;
    var loser = setState.lastWinner === 'you' ? 'foe' : 'you';
    var go = function (slot, opts) {
      if (setState.usedSlots.indexOf(slot) < 0) setState.usedSlots.push(slot);
      beginSetGame(setState.card[slot], opts);
    };
    if (loser === 'you') setPickBoard('you', go);
    else
      setBotCall(function (slot, spun) {
        /* the roulette already revealed the board - the single-board
           popup right after would show the same arena twice */
        go(slot, { skipReveal: !!spun });
      });
  }

  /* The sideboard IS the pick phase with last game's six pre-slot. Bans
     persist set-wide, composition swaps 1-2 are mandatory (enforced in
     commitSix), row moves are free. */
  function beginSetGame(field, opts) {
    prep = {
      mode: lastConfig ? lastConfig.mode : 'classic',
      mp: false,
      seed: null,
      deckId: lastConfig && lastConfig.deckId ? lastConfig.deckId : null,
      field: field,
      player12: setState.player12,
      enemy12: setState.enemy12,
      /* CAMPAIGN carry-through: games 2 and 3 keep the rival's face on
         the HUD, the boss pinned, and the stage id on the battle. */
      campaignStage: setState.campaignStage || null,
      rival: setState.rival || null,
      pinnedEnemy: setState.pinnedEnemy && setState.pinnedEnemy.length ? setState.pinnedEnemy : null,
      unbannable: setState.unbannable && setState.unbannable.length ? setState.unbannable : null,
      botBans: setState.botBans.slice(),
      youBans: setState.youBans.slice(),
      revealed: true,
      waiting: false,
      phase: 'pick',
      front: setState.lastSix.front.slice(),
      back: setState.lastSix.back.slice(),
      lockouts: setState.lockedOut.slice(),
      setContinues: true,
    };
    prepAnim = true;
    window.EOL.ui.show('prep');
    renderPrep();
    if (!(opts && opts.skipReveal)) revealBattlefield(field, null);
  }

  /* The chip and the war die the moment the player leaves the set's
     two views (home-press, mid-set quit) - the next startPrep would
     also guard, but the chip must not linger over the menu. */
  document.addEventListener('eol:view', function (e) {
    if (!setState) return;
    /* `eol:view` carries the view NAME as its detail, not an object -
       see ui.show() in js/app.js and every other listener in the
       client. Reading `.view` off a string is always undefined, so the
       guard below could never fire and a war outlived every exit from
       it. The set pill then hung over the main menu and the next
       Classic result was still scored as war progress. */
    var v = typeof e.detail === 'string' ? e.detail : e.detail && e.detail.view;
    if (v && v !== 'prep' && v !== 'battle' && v !== 'draft') setKill();
  });

  /* =====================================================
     wiring
     ===================================================== */
  /* =====================================================
     multiplayer wiring
     ===================================================== */
  function mmShow(on) {
    var m = $('mm-modal');
    if (m) m.hidden = !on;
  }
  function mmSay(title, sub) {
    var t = $('mm-title'),
      s2 = $('mm-sub');
    if (t && title) t.textContent = title;
    if (s2 && sub != null) s2.textContent = sub;
  }

  /* Park the sliding highlight exactly over the selected tab.
     The two tabs are different widths (Multiplayer carries the
     "account" badge, which vanishes on sign-in), so the thumb is
     measured rather than assumed to be half the bar. */
  function moveTabThumb() {
    var bar = $('play-tabs');
    if (!bar) return;
    var sel = bar.querySelector('.play-tab.sel');
    if (!sel) return;
    var z = uiS();
    var b = bar.getBoundingClientRect();
    var t = sel.getBoundingClientRect();
    if (!t.width) return; // laid out but hidden - nothing to measure yet
    bar.style.setProperty('--thumb-x', Math.round((t.left - b.left) / z) + 'px');
    bar.style.setProperty('--thumb-w', Math.round(t.width / z) + 'px');
  }

  function initMultiplayer() {
    var MP = window.EOL.mp;
    if (!MP) return;

    /* tab switching */
    var tabs = document.querySelectorAll('.play-tab');
    var gridAnimT = 0;
    function setArena(which) {
      document.querySelectorAll('.play-tab').forEach(function (t) {
        var on = t.dataset.arena === which;
        t.classList.toggle('sel', on);
        t.setAttribute('aria-selected', String(on));
      });
      var tabsEl = $('play-tabs');
      if (tabsEl) tabsEl.dataset.arena = which;
      moveTabThumb();
      var solo = $('mode-grid-solo'),
        mp = $('mode-grid-mp');
      if (!solo || !mp) return;
      /* Directional swap (session 24): the outgoing grid slides out the
         way the thumb travels, the incoming one rises in from the other
         side with a small card stagger. gfx-low swaps instantly. */
      var showEl = which === 'solo' ? solo : mp,
        hideEl = which === 'solo' ? mp : solo,
        dir = which === 'mp' ? '' : '-r';
      clearTimeout(gridAnimT);
      solo.classList.remove('mg-out', 'mg-out-r', 'mg-in', 'mg-in-r');
      mp.classList.remove('mg-out', 'mg-out-r', 'mg-in', 'mg-in-r');
      if (document.body.dataset.gfx === 'low' || hideEl.hidden || hideEl === showEl) {
        hideEl.hidden = true;
        showEl.hidden = false;
        return;
      }
      hideEl.classList.add('mg-out' + dir);
      gridAnimT = setTimeout(function () {
        hideEl.hidden = true;
        hideEl.classList.remove('mg-out' + dir);
        showEl.hidden = false;
        showEl.classList.add('mg-in' + dir);
        gridAnimT = setTimeout(function () {
          showEl.classList.remove('mg-in' + dir);
        }, 620);
      }, 185);
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        setArena(t.dataset.arena);
      });
    });
    setArena('solo');

    /* The lock badge disappears once signed in, which CHANGES THE TAB
       WIDTH - so the highlight has to be re-measured or it is left
       overhanging the tab it belongs to. */
    function refreshLock() {
      var lock = $('mp-lock');
      if (lock) lock.hidden = MP.available();
      moveTabThumb();
    }
    if (window.EOL.auth && window.EOL.auth.onChange) window.EOL.auth.onChange(refreshLock);
    refreshLock();
    window.addEventListener('resize', moveTabThumb);
    /* The play view is hidden at boot, so the tabs have no width to
       measure yet. Re-measure the first time it is actually shown. */
    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'play') moveTabThumb();
    });

    /* Which online mode we are queueing for. Draft builds its squad
       in-game; Classic brings a saved deck, so it has to pick one
       first and carry it into the match. */
    function queueFor(mode, deckId) {
      if (!MP.available()) {
        mmShow(true);
        mmSay('Account required', 'Sign in from the main menu to play multiplayer.');
        return;
      }
      mpQueueMode = mode;
      mpDeckId = deckId || null;
      mmShow(true);
      mmSay('Finding an opponent', 'Searching the queue...');
      var vs = $('mm-vs');
      if (vs) vs.hidden = true;
      MP.findMatch(mode).catch(function () {
        /* status handler already reported it */
      });
    }

    var btn = $('mode-mp-draft');
    if (btn)
      btn.addEventListener('click', function () {
        queueFor('draft');
      });

    var btnC = $('mode-mp-classic');
    if (btnC)
      btnC.addEventListener('click', function () {
        if (!MP.available()) {
          mmShow(true);
          mmSay('Account required', 'Sign in from the main menu to play multiplayer.');
          return;
        }
        /* Reuse the singleplayer deck picker. `onPick` diverts the
           chosen deck into matchmaking instead of straight to a
           board, so there is one deck-selection UI rather than two
           that can drift apart. */
        openClassicModal(function (deckId) {
          modalShow(false);
          queueFor('classic', deckId);
        });
      });

    var cancel = $('mm-cancel');
    if (cancel)
      cancel.addEventListener('click', function () {
        MP.cancel();
        mmShow(false);
      });
    var scrim = $('mm-scrim');
    if (scrim)
      scrim.addEventListener('click', function () {
        MP.cancel();
        mmShow(false);
      });

    MP.on('status', function (st) {
      if (st.state === 'error' || st.state === 'timeout') mmSay('Matchmaking', st.text);
      else mmSay(null, st.text);
    });

    MP.on('matched', function (m) {
      /* REJOINING AN IN-PROGRESS MATCH.
         Draft picks, bans and formations are now persisted, so a
         reconnect can rebuild the board rather than concede it.
         resumeMatch() returns false only for a battle already in
         progress - the per-action log is deliberately NOT stored, so
         that one case still forfeits. */
      if (m.resumed) {
        mmShow(false);
        if (resumeMatch(m)) return;
        concedeAbandoned(m);
        return;
      }
      var vs = $('mm-vs');
      var youEl = $('mm-you'),
        oppEl = $('mm-opp');
      var u = window.EOL.auth.user();
      if (youEl) youEl.textContent = (u && u.name) || 'You';
      if (oppEl) oppEl.textContent = m.oppName;
      if (vs) vs.hidden = false;
      var isClassic = (m.mode || mpQueueMode) === 'classic';
      mmSay('Opponent found', isClassic ? 'Exchanging decks...' : 'Starting the draft...');
      /* Open the ordered/checksummed session for everything after the
         pairing - decks, bans, formations and every battle action
         ride it. */
      window.EOL.netplay.begin(m);

      if (isClassic) {
        /* Both players send their twelve, then preparation begins the
           moment BOTH have landed - the same latch used for bans, so
           whoever is slower does not strand the other. */
        var deck = mpDeckId ? window.EOL.decks.get(mpDeckId) : null;
        var mine =
          deck && window.EOL.decks.isComplete(deck)
            ? window.EOL.decks.entriesOf(deck)
            : RULES().randomDeck(flatten(), Math.random);
        var myIds = mine.map(function (e) {
          return e.card.id;
        });
        window.EOL.netplay.startDecks(function (foeIds) {
          var dict = byId();
          var foe12 = (foeIds || [])
            .map(function (id) {
              return dict[id];
            })
            .filter(Boolean);
          if (foe12.length !== RULES().DECK_SIZE) {
            toast('The opponent sent an unreadable deck', 'ri-error-warning-line');
            leaveMatch();
            return;
          }
          mmShow(false);
          startPrep({
            mode: 'classic',
            mp: true,
            seed: m.seed,
            deckId: mpDeckId,
            player12: mine,
            enemy12: foe12,
            field: window.EOL.rollBattlefield(window.EOL.netplay.rngFrom((m.seed | 0) + 0x1b7)),
          });
        });
        /* submitDeck() can start preparation synchronously if their
           deck already arrived, so persist before handing over. */
        window.EOL.mp.saveState({ phase: 'ban', deck: myIds });
        window.EOL.netplay.submitDeck(myIds);
        return;
      }

      setTimeout(function () {
        mmShow(false);
        startDraft({ seed: m.seed, host: m.host });
      }, 1200);
    });

    /* AUTO-REJOIN.
       If a live match is still waiting for us - we crashed, closed
       the tab, lost wifi - drop straight back into it. Runs whenever
       auth settles, because at first paint we usually do not know yet
       whether anyone is signed in. */
    var resumed = false;
    function tryResume() {
      if (resumed || !MP.available() || !MP.resume) return;
      resumed = true;
      MP.resume().catch(function () {
        resumed = false; // a failed attempt may retry on the next change
      });
    }
    if (window.EOL.auth && window.EOL.auth.onChange) window.EOL.auth.onChange(tryResume);
    tryResume();

    MP.on('pick', applyRemotePick);
    MP.on('net', function (msg) {
      window.EOL.netplay.receive(msg);
    });

    MP.on('opponentLeft', function () {
      if (!draft && !prep && !window.EOL.netplay.active()) return;
      toast('Your opponent left the match', 'ri-error-warning-line');
      window.EOL.netplay.end('remote');
      draft = null;
      prep = null;
      mpState = null;
      clearDraftMarks();
      window.EOL.ui.show('play');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initQuitGuard();
    initMultiplayer();
    /* Rate the roster while the player is still on the menu.
       -------------------------------------------------------------
       The draft brain works out how strong a hero is by PLAYING it -
       a controlled duel per card against a squad of average bodies -
       instead of reading a hand-maintained table that goes stale
       (see data/draft-ai.js §2). That costs a few seconds of CPU the
       first time a roster version is seen, so it is started here, at
       the menu, on idle callbacks only, and the result is cached in
       localStorage under a fingerprint of every card's stats and
       ability. It never runs while a battle is on screen, and until it
       lands the AI answers from its analytic estimate - so this is
       purely a head start, never a dependency. */
    try {
      if (DAI() && DAI().warm) DAI().warm();
    } catch (e) {
      /* a rating that cannot start must never stop the menu loading */
    }
    /* THE SET: the war-length toggle's listeners. Bound HERE with the
       other main wiring (not in the set module, whose own DCL listener
       registered too late in the script order to fire). */
    paintWarLength();
    document.querySelectorAll('#war-length .wl-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        setWarLength(b.dataset.len);
      });
    });
    var mc = $('mode-classic'),
      md = $('mode-draft'),
      mcmp = $('mode-campaign');
    if (mc)
      mc.addEventListener('click', function () {
        openClassicModal();
      });
    if (md)
      md.addEventListener('click', function () {
        startDraft();
      });
    /* CAMPAIGN (2026-08-06). The route is still a presentation slice:
       the chapter plate opens its ten-rival map, but no stage writes
       progress or starts a battle. Keeping this navigation real lets the
       map, locks and Chapter 1 art be judged before campaign logic lands. */
    if (mcmp)
      mcmp.addEventListener('click', function () {
        window.EOL.ui.show('campaign');
      });
    var cback = $('btn-campaign-back');
    if (cback)
      cback.addEventListener('click', function () {
        if (window.EOL.ui && window.EOL.ui.goBack) window.EOL.ui.goBack();
        else window.EOL.ui.show('play');
      });
    var ch1 = $('chapter-1');
    if (ch1)
      ch1.addEventListener('click', function () {
        window.EOL.ui.show('chapter');
      });
    var chback = $('btn-chapter-back');
    if (chback)
      chback.addEventListener('click', function () {
        if (window.EOL.ui && window.EOL.ui.goBack) window.EOL.ui.goBack();
        else window.EOL.ui.show('campaign');
      });
    /* Stage cards are bound by js/campaign.js, which owns the whole
       gate flow (dialogue -> deck/draft -> battle -> grants). */

    var bp = $('btn-play-back');
    if (bp)
      bp.addEventListener('click', function () {
        modalShow(false);
        if (window.EOL.ui && window.EOL.ui.goBack) window.EOL.ui.goBack();
        else window.EOL.ui.show('home');
      });
    var bprep = $('btn-prep-back');
    if (bprep)
      bprep.addEventListener('click', function () {
        confirmQuit(function () {
          prep = null;
          if (window.EOL.ui && window.EOL.ui.goBack) window.EOL.ui.goBack();
          else window.EOL.ui.show('play');
        });
      });
    var bd = $('btn-draft-back');
    if (bd)
      bd.addEventListener('click', function () {
        confirmQuit(function () {
          draft = null;
          clearDraftMarks();
          if (window.EOL.ui && window.EOL.ui.goBack) window.EOL.ui.goBack();
          else window.EOL.ui.show('play');
        });
      });

    var dc = $('dm-cancel');
    if (dc)
      dc.addEventListener('click', function () {
        modalShow(false);
      });
    var dn = $('dm-new');
    if (dn)
      dn.addEventListener('click', function () {
        modalShow(false);
        window.EOL.decks.openEditor();
      });
    var dm = $('deck-modal');
    if (dm)
      dm.addEventListener('click', function (e) {
        if (e.target === dm) modalShow(false);
      });

    var pc = $('prep-confirm');
    if (pc) pc.addEventListener('click', prepConfirm);
    var pcm = $('prep-confirm-main');
    if (pcm) pcm.addEventListener('click', prepConfirm);
    /* "See battlefields" (2026-08-05): re-opens the arena popup mid-
       fielding. In an Unabridged set that is the fight card (all three
       arenas, current game marked); a single game re-shows its one
       battlefield reveal. */
    var pf = $('prep-fields');
    if (pf)
      pf.addEventListener('click', function () {
        if (setState && showFightCardViewer()) return;
        if (prep && prep.field) revealBattlefield(prep.field, null);
      });

    var ck = $('coach-ok');
    if (ck) ck.addEventListener('click', coachHide);
    var cov = $('coach');
    if (cov)
      cov.addEventListener('click', function (e) {
        if (e.target === cov) coachHide();
      });

    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape') return;
        if (coachOpen()) {
          e.stopPropagation();
          coachHide();
          return;
        }
        if ($('deck-modal').classList.contains('show')) {
          e.stopPropagation();
          modalShow(false);
        }
      },
      true
    );
  });

  /* card widths are viewport-driven, so names must be re-fitted on resize */
  var _fitRaf = null;
  window.addEventListener('resize', function () {
    if (_fitRaf) cancelAnimationFrame(_fitRaf);
    _fitRaf = requestAnimationFrame(function () {
      document.querySelectorAll('.prep-c .bcard-name, .field-slot .fs-name').forEach(function (el) {
        delete el.dataset.fitFor; // force a re-measure at the new width
      });
      fitPrepNames();
      fitSlotNames();
    });
  });

  window.EOL.play = {
    rematch: rematch,
    openClassicModal: openClassicModal,
    startDraft: startDraft,
    /* THE SET */
    warLength: warLength,
    setWarLength: setWarLength,
    setGameResult: setGameResult, // battle.js calls this from showResult
    setPillInfo: setPillInfo, // battle.js paints the war score pill from this
    _setState: function () {
      return setState;
    },
    /* the set-wide battle report (per-game snapshots, merged by battle.js) */
    _setReport: function () {
      return setState ? setState.report : null;
    },
    /* test hook: re-bind multiplayer handlers (harness only) */
    _initMp: initMultiplayer,
    startPrep: startPrep,
    /* campaign.js repaints the prep chrome the instant the tutor's
       shield goes up or down, so the golden marks never invite a tap
       the shield would swallow */
    repaintPrep: updatePrepChrome,
    /* THE LEDGER borrows the prep tile + hover flyout wholesale: the
       same little battle card, the same hover panel, rebound onto the
       ledger's own flyout instance (cloning drops the prep-tip hover). */
    tileFor: function (entry, tipEl) {
      var wrap = boardCard(entry, 0, 'foe');
      if (!tipEl) return wrap;
      var tile = wrap.cloneNode(true);
      tile.style.animationDelay = '';
      tile.addEventListener('mouseenter', function () {
        showPrepTip(entry, 'foe', tile, tipEl);
      });
      tile.addEventListener('mouseleave', function () {
        hidePrepTip(tipEl);
      });
      return tile;
    },
    fitTileNames: fitPrepNames,
    /* test hooks */
    _chooseBans: chooseBans,
    _chooseSix: chooseSix,
    _draftPick: draftPick,
    _prepState: function () {
      return prep;
    },
    _flat: flatten /* test hook: the shared entry pool */,
    _draftState: function () {
      return draft;
    },
    _lastConfig: function () {
      return lastConfig;
    },
    _packStarter: packStarter,
  };

  /* The coach overlay is shared across every module that teaches a step
     of the game (battle.js for the in-fight beats). design §9.5
     explicitly wants this exported. */
  window.EOL.coach = {
    show: coachShow,
    hide: coachHide,
    open: coachOpen,
    seen: coachSeen,
  };
})();
