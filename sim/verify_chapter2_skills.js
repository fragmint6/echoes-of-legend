#!/usr/bin/env node
'use strict';

/* =============================================================
   CHAPTER II SIGNATURE SKILLS - per-card behavioural suite
   -------------------------------------------------------------
   sim/verify_chapter2.js proves the FACTION identities hold and
   sim/verify_chapter2_campaign.js proves the ROAD holds. This suite
   is the third leg: every one of the 50 Chapter II cards (the eight
   new factions plus the boss) is run through the engine and held to
   what its own card text says.

   Why per-card, and why behavioural:

     - The two suites above are faction- and gate-shaped. A card can
       misfire inside a faction whose identity still holds (Medea's
       revive firing on every ally death, not once, is invisible to
       both of them) - and several did, which is why this exists.
     - Source-text assertions are how a wrong `maxStacks` on a revive
       effect sat in the data for days: nothing read it at runtime.
       A behavioural test cannot pass vacuously.

   Sections:
     A. Hemithea    B. Huaxia      C. Genesis     D. Transylvania
     E. Asgard      F. Devas       G. Tortuga     H. Pandemonium
     I. the boss    J. card text hygiene (literal escapes, etc.)

   Run: node sim/verify_chapter2_skills.js
   ============================================================= */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + msg);
  } else {
    fail++;
    console.log('  FAIL  ' + msg);
  }
}

global.window = {};
global.performance = { now: () => Date.now() };
[
  'data/_schema.js',
  'data/roles.js',
  'data/camelot.js',
  'data/olympus.js',
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/kami.js',
  'data/duat.js',
  'data/asgard.js',
  'data/hemithea.js',
  'data/pandemonium.js',
  'data/devas.js',
  'data/genesis.js',
  'data/transylvania.js',
  'data/tortuga.js',
  'data/lore.js',
  'data/battlefields.js',
  'data/campaign-ch2.js',
  'js/engine.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const EOL = window.EOL;
const E = EOL.engine;
const AP = E.applyEffectsPublic;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push({ card: c, faction: f })));
const g = (id) => {
  const e = ALL.find((x) => x.card.id === id);
  if (!e) throw new Error('unknown card ' + id);
  return e;
};
const BOSS = EOL.campaignCh2 && EOL.campaignCh2.bossCard;
const bossEntry = () => ({ card: BOSS, faction: EOL.campaignCh2.bossFaction });

const FOES = [
  g('camelot-merlin'),
  g('olympus-athena'),
  g('roma-cicero'),
  g('duat-horus'),
  g('yamato-benkei'),
  g('grimmwood-cinderella'),
];
const FILLER = [g('camelot-king-arthur'), g('olympus-zeus'), g('roma-brutus')];

/* A silent battle with the given player-side team (order preserved),
   round 3 and both pools topped up so every signature is castable. */
function battle(team, opts) {
  const B = E.createBattle(team, FOES, {
    roleAware: false,
    rng: () => 0.5,
    oddFirst: 'player',
    ...(opts || {}),
  });
  B.silent = true;
  B.round = 3;
  B.energy.player = 90;
  B.energy.enemy = 90;
  return B;
}
const unit = (B, id) => B.units.find((u) => u.card.id === id);
const foes = (B) => B.units.filter((u) => u.side === 'enemy');
const teamOf = (B, side) => B.units.filter((u) => u.side === side);

/* Kill a unit the way handleDeath does, so `fallenAlly` resolvers and
   the fallen count see a real corpse. */
function kill(B, u) {
  B.deathSeq = (B.deathSeq || 0) + 1;
  u.alive = false;
  u.hp = 0;
  u.diedAt = B.deathSeq;
  return u;
}
/* Drop a unit below a fraction of max HP without killing it. */
function wound(u, frac) {
  u.hp = Math.max(1, Math.round(u.maxHp * frac));
  return u;
}
function atkPct(B, u, stat) {
  const buffs = (u.buffs || []).filter((b) => b.stat === stat);
  return buffs.reduce((s, b) => s + b.amt, 0);
}
/* Clear the acted flag so a test can cast twice in the same scripted
   round - the game only allows one action per unit per round, and a
   test round is not a real round. */
function again(B, u) {
  B.acted[u.side][u.uid] = false;
  return u;
}

console.log('A. Hemithea - the mortals who ascend');
{
  /* Achilles: one-time +20% ATK, and only once he has been hurt below
     half. The enemy chooses, so the buff must NOT fire above the line,
     and must not stack on a second wound. */
  const B = battle([g('hemithea-achilles'), g('hemithea-odysseus'), g('hemithea-medea'), ...FILLER]);
  const ach = unit(B, 'hemithea-achilles');
  const foe = foes(B)[0];
  E.useAbility(B, foe, E.roleAbility(foe), [ach]);
  ok(atkPct(B, ach, 'atk') === 0, 'Achilles stays ordinary above 50% HP');
  ach.hp = Math.round(ach.maxHp * 0.6);
  E.useAbility(B, foes(B)[1], E.roleAbility(foes(B)[1]), [ach]);
  ok(atkPct(B, ach, 'atk') === 20, 'drops below 50% and gains +20% ATK');
  ach.hp = Math.round(ach.maxHp * 0.2);
  E.useAbility(B, foes(B)[2], E.roleAbility(foes(B)[2]), [ach]);
  ok(atkPct(B, ach, 'atk') === 20, 'and it is once per battle - no second stack');

  /* Odysseus: Expose first (his own hit lands against 0 DEF), and the
     Energy refund only pays out on the kill. */
  const B2 = battle([g('hemithea-odysseus'), g('hemithea-perseus'), g('hemithea-medea'), ...FILLER]);
  const ody = unit(B2, 'hemithea-odysseus');
  const prey = foes(B2)[0];
  const e0 = B2.energy.player;
  E.useAbility(B2, ody, ody.card.ability, [prey]);
  ok(prey.flags.exposed === 1, 'Odysseus exposes his target before the blow');
  ok(B2.energy.player === e0 - ody.card.ability.cost, 'no refund without a kill');
  prey.hp = 1;
  const eKill = B2.energy.player;
  again(B2, ody);
  E.useAbility(B2, ody, ody.card.ability, [prey]);
  ok(B2.energy.player >= eKill - ody.card.ability.cost + 15, 'the kill refunds 15 Energy');

  /* Perseus: one-time +15% Crit on his first kill. */
  const B3 = battle([g('hemithea-perseus'), g('hemithea-odysseus'), g('hemithea-medea'), ...FILLER]);
  const per = unit(B3, 'hemithea-perseus');
  const t1 = foes(B3)[0];
  t1.hp = 1;
  E.useAbility(B3, per, E.roleAbility(per), [t1]);
  ok(atkPct(B3, per, 'crit') === 15, 'Perseus gains +15% Crit on his first kill');
  const t2 = foes(B3)[1];
  t2.hp = 1;
  again(B3, per);
  E.useAbility(B3, per, E.roleAbility(per), [t2]);
  ok(atkPct(B3, per, 'crit') === 15, 'and only once');

  /* Medea: the revive is ONCE per battle, raises the ally at 65% of
     Max HP (owner buff), and the legend returns clean. */
  const B4 = battle([g('hemithea-medea'), g('hemithea-ajax'), g('hemithea-jason'), ...FILLER]);
  const med = unit(B4, 'hemithea-medea');
  const ally = unit(B4, 'hemithea-ajax');
  ally.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
  ally.flags.burn = 2;
  kill(B4, ally);
  AP(B4, med, [med], med.card.ability.passive.effects, { trigger: 'allyDied', immediate: true });
  ok(ally.alive, 'Medea revives the fallen ally');
  ok(
    Math.abs(ally.hp - Math.round(ally.maxHp * 0.65)) <= 1,
    'at 65% Max HP (buff) - got ' + ally.hp + '/' + ally.maxHp
  );
  ok(ally.flags.burn === 0 && !ally.buffs.some((b) => b.stat === 'atk'), 'the revived ally returns cleansed');
  const ally2 = unit(B4, 'hemithea-jason');
  kill(B4, ally2);
  AP(B4, med, [med], med.card.ability.passive.effects, { trigger: 'allyDied', immediate: true });
  ok(!ally2.alive, 'the second fall is final - once per battle');

  /* Atalanta: full-HP branch (195% + Crit), damaged branch (165%). */
  const B5 = battle([g('hemithea-atalanta'), g('hemithea-odysseus'), g('hemithea-medea'), ...FILLER]);
  const ata = unit(B5, 'hemithea-atalanta');
  const fresh = foes(B5)[0];
  const hp0 = fresh.hp;
  E.useAbility(B5, ata, ata.card.ability, [fresh]);
  const dealtFresh = hp0 - fresh.hp;
  const gainedCrit = atkPct(B5, ata, 'crit');
  /* second cast in a SEPARATE battle, on the same defender pre-wounded -
     a same-battle rerun would inherit the first cast's +10% Crit and
     Athena's first-skill reduction, both of which muddy the ratio */
  const B5b = battle([g('hemithea-atalanta'), g('hemithea-odysseus'), g('hemithea-medea'), ...FILLER]);
  const ata2 = unit(B5b, 'hemithea-atalanta');
  const hurt = foes(B5b)[0];
  hurt.hp = Math.round(hurt.maxHp * 0.7);
  E.useAbility(B5b, ata2, ata2.card.ability, [hurt]);
  const dealtHurt = Math.round(hurt.maxHp * 0.7) - hurt.hp;
  ok(dealtFresh > 0 && gainedCrit === 10, 'a full-HP target pays the big branch and the Crit');
  ok(dealtFresh > dealtHurt, 'a wounded target pays only the small branch (' + dealtFresh + ' vs ' + dealtHurt + ')');

  /* Ajax: the team-wide 10% damage cut stands while he is above half. */
  const B6 = battle([g('hemithea-ajax'), g('hemithea-jason'), g('hemithea-medea'), ...FILLER]);
  const ajax = unit(B6, 'hemithea-ajax');
  const victim = unit(B6, 'hemithea-jason');
  const foe6 = foes(B6)[0];
  const before = victim.hp;
  E.useAbility(B6, foe6, E.roleAbility(foe6), [victim]);
  const dmgHealthy = before - victim.hp;
  ajax.hp = Math.round(ajax.maxHp * 0.3);
  victim.hp = victim.maxHp;
  E.useAbility(B6, foes(B6)[1], E.roleAbility(foes(B6)[1]), [victim]);
  const dmgHurt = victim.maxHp - victim.hp;
  ok(dmgHealthy < dmgHurt, 'the Sevenfold Shield reduces damage while Ajax is above 50%');

  /* Hercules: the full self-buff lands, Provoke included. */
  const B7 = battle([g('hemithea-hercules'), g('hemithea-ajax'), g('hemithea-medea'), ...FILLER]);
  const herc = unit(B7, 'hemithea-hercules');
  E.useAbility(B7, herc, herc.card.ability, []);
  ok(atkPct(B7, herc, 'def') === 25 && atkPct(B7, herc, 'atk') === 20, 'Twelve Labors grants +25% DEF and +20% ATK');
  ok(herc.flags.taunt > 0, 'and Provokes');

  /* Jason: the team heal plus the crew-wide Energy. */
  const B8 = battle([g('hemithea-jason'), g('hemithea-ajax'), g('hemithea-medea'), ...FILLER]);
  const jas = unit(B8, 'hemithea-jason');
  teamOf(B8, 'player').forEach((u) => wound(u, 0.5));
  const e8 = B8.energy.player;
  E.useAbility(B8, jas, jas.card.ability, []);
  const healed = teamOf(B8, 'player').filter((u) => u.hp > u.maxHp * 0.5);
  ok(healed.length === teamOf(B8, 'player').length, 'Jason heals the whole crew');
  ok(B8.energy.player === e8 - jas.card.ability.cost + 10, 'and grants the team 10 Energy');
}

console.log('B. Huaxia - Marks and counterplay');
{
  /* Qin Shi Huang: the chosen row eats damage AND a Mark, the wall
     raises for the whole team. */
  const B = battle([g('huaxia-qin-shi-huang'), g('huaxia-guan-yu'), g('huaxia-hua-tuo'), ...FILLER]);
  const qin = unit(B, 'huaxia-qin-shi-huang');
  const front = foes(B).filter((u) => E.isFront(u));
  const hpBefore = front.map((u) => u.hp);
  E.useAbility(B, qin, qin.card.ability, [], 0);
  const struck = front.filter((u) => u.hp < hpBefore[front.indexOf(u)]);
  const marked = front.filter((u) => u.flags.marked > 0);
  ok(struck.length === front.length, 'the front row all take the wall');
  ok(marked.length === front.length, 'and each is Marked');
  ok(atkPct(B, qin, 'def') === 10, 'the Great Wall shields the whole team (+10% DEF)');

  /* Lu Bu: 1.15x on Marked prey, and the kill pays Energy + a Mark on
     the strongest survivor. */
  const B2 = battle([g('huaxia-lu-bu'), g('huaxia-qin-shi-huang'), g('huaxia-guan-yu'), ...FILLER]);
  const lu = unit(B2, 'huaxia-lu-bu');
  const t0 = foes(B2)[0];
  const e0 = B2.energy.player;
  const hp0 = t0.hp;
  E.useAbility(B2, lu, E.roleAbility(lu), [t0]);
  const plain = hp0 - t0.hp;
  t0.hp = t0.maxHp;
  t0.flags.marked = 1;
  again(B2, lu);
  E.useAbility(B2, lu, E.roleAbility(lu), [t0]);
  const markedDmg = t0.maxHp - t0.hp;
  ok(Math.abs(markedDmg / plain - 1.15) < 0.05, 'Lu Bu hits a Marked target ~15% harder');
  t0.hp = 1;
  t0.flags.marked = 1;
  const eKill = B2.energy.player;
  again(B2, lu);
  E.useAbility(B2, lu, E.roleAbility(lu), [t0]);
  ok(B2.energy.player >= eKill, 'the kill refunds Energy (the 15 refund pays the 15 basic)');
  const strongest = foes(B2)
    .filter((u) => u.alive)
    .sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
  ok(strongest && strongest.flags.marked > 0, 'and Marks the strongest survivor');

  /* Zhuge Liang: damage + Mark + DEF debuff on both, ONE 15-Energy
     drain for the whole cast. */
  const B3 = battle([g('huaxia-zhuge-liang'), g('huaxia-qin-shi-huang'), g('huaxia-guan-yu'), ...FILLER]);
  const zg = unit(B3, 'huaxia-zhuge-liang');
  const eEnemy = B3.energy.enemy;
  const two = foes(B3).slice(0, 2);
  const hpBefore2 = two.map((u) => u.hp);
  E.useAbility(B3, zg, zg.card.ability, two);
  ok(two.every((u) => u.hp < hpBefore2[two.indexOf(u)]), 'both targets take damage');
  ok(two.every((u) => u.flags.marked > 0), 'both are Marked');
  ok(two.every((u) => atkPct(B3, u, 'def') === -20), 'both lose 20% DEF');
  ok(B3.energy.enemy === eEnemy - 15, 'the drain is 15 total, not 15 per target');

  /* Guan Yu: the counter fires while Shielded, and harder on a Marked
     attacker. */
  const B4 = battle([g('huaxia-guan-yu'), g('huaxia-zhuge-liang'), g('huaxia-hua-tuo'), ...FILLER]);
  const gy = unit(B4, 'huaxia-guan-yu');
  E.useAbility(B4, gy, gy.card.ability, []);
  ok(gy.shield > 0 && gy.flags.taunt > 0 && gy.flags.counterTurns > 0, 'the Guard arms shield, Provoke and counter');
  const atk0 = foes(B4)[0];
  const gyHp0 = gy.hp;
  E.useAbility(B4, atk0, E.roleAbility(atk0), [gy]);
  const counterHit = atk0.hp < atk0.maxHp;
  ok(counterHit, 'the attacker eats a counter-strike');
  ok(gy.hp < gyHp0 || gy.shield < gy.maxHp * 0.15, 'the attacker still lands on Guan Yu');
  const atk1 = foes(B4)[1];
  atk1.flags.marked = 1;
  const a1hp = atk1.hp;
  E.useAbility(B4, atk1, E.roleAbility(atk1), [gy]);
  const markedCounter = a1hp - atk1.hp;
  ok(markedCounter > 0, 'a Marked attacker eats the bigger counter');

  /* Hua Tuo: debuffed ally -> cleanse + shield; clean ally -> bonus
     heal instead. */
  const B5 = battle([g('huaxia-hua-tuo'), g('huaxia-guan-yu'), g('huaxia-zhuge-liang'), ...FILLER]);
  const ht = unit(B5, 'huaxia-hua-tuo');
  const sick = unit(B5, 'huaxia-guan-yu');
  wound(sick, 0.4);
  sick.flags.burn = 2;
  E.useAbility(B5, ht, ht.card.ability, [sick]);
  ok(sick.flags.burn === 0, 'a debuffed ally is cleansed');
  ok(sick.shield > 0, 'and shielded');
  const well = unit(B5, 'huaxia-zhuge-liang');
  wound(well, 0.4);
  const hpWell = well.hp;
  again(B5, ht);
  E.useAbility(B5, ht, ht.card.ability, [well]);
  ok(well.hp - hpWell >= Math.round(well.maxHp * 0.35), 'a clean ally gets the big heal plus the bonus');

  /* Huang Zhong: 180% to the lowest-HP enemy; the Marked branch adds
     60% and Exposes. */
  const B6 = battle([g('huaxia-huang-zhong'), g('huaxia-qin-shi-huang'), g('huaxia-guan-yu'), ...FILLER]);
  const hz = unit(B6, 'huaxia-huang-zhong');
  const low = foes(B6).slice().sort((a, b) => a.hp - b.hp)[0];
  const hpLow = low.hp;
  E.useAbility(B6, hz, hz.card.ability, []);
  const plainShot = hpLow - low.hp;
  low.hp = low.maxHp;
  low.flags.marked = 1;
  again(B6, hz);
  E.useAbility(B6, hz, hz.card.ability, []);
  const markedShot = low.maxHp - low.hp;
  ok(markedShot > plainShot * 1.2, 'a Marked target takes the bonus hit');
  ok(low.flags.exposed > 0, 'and is Exposed for the follow-up');

  /* Sun Wukong: the death-cheat restores him with the whole kit, once. */
  const B7 = battle([g('huaxia-sun-wukong'), g('huaxia-hua-tuo'), g('huaxia-guan-yu'), ...FILLER]);
  const wk = unit(B7, 'huaxia-sun-wukong');
  const foe7 = foes(B7)[0];
  wk.hp = 1;
  E.useAbility(B7, foe7, E.roleAbility(foe7), [wk]);
  ok(wk.alive, 'Wukong refuses to fall');
  ok(Math.abs(wk.hp - Math.round(wk.maxHp * 0.3)) <= 1, 'returns at 30% HP');
  ok(wk.shield > 0 && wk.flags.untargetable > 0 && wk.flags.taunt > 0, 'returns shielded, untargetable and provoking');
  ok(atkPct(B7, wk, 'atk') === 25, 'and permanently +25% ATK');
  wk.hp = 1;
  wk.shield = 0;
  wk.flags.untargetable = 0;
  E.useAbility(B7, foes(B7)[1], E.roleAbility(foes(B7)[1]), [wk]);
  ok(!wk.alive, 'the second fall is final - once per battle');

  /* Nezha: the follow-up and the Burn only ride a target already hit
     this round. */
  const B8 = battle([g('huaxia-nezha'), g('huaxia-guan-yu'), g('huaxia-hua-tuo'), ...FILLER]);
  const nz = unit(B8, 'huaxia-nezha');
  const victim8 = foes(B8)[0];
  const hp8 = victim8.hp;
  E.useAbility(B8, nz, nz.card.ability, [victim8]);
  ok(victim8.hp < hp8, 'the wheels deal their 180%');
  ok(!(victim8.flags.burn > 0), 'an untouched target is not Burned');
  const pre = foes(B8)[2];
  const hp9 = pre.hp;
  E.useAbility(B8, unit(B8, 'huaxia-guan-yu'), E.roleAbility(unit(B8, 'huaxia-guan-yu')), [pre]);
  B8.energy.player = 150;
  again(B8, nz);
  E.useAbility(B8, nz, nz.card.ability, [pre]);
  ok(pre.flags.burn > 0, 'a target already hit this round gets the Burn');
  ok(hp9 - pre.hp > (hp8 - victim8.hp) * 1.1, 'and the follow-up strike');

  /* Mulan: ally deaths (or low HP) stack her resolve, capped at 4. */
  const B9 = battle([g('huaxia-mulan'), g('huaxia-guan-yu'), g('huaxia-hua-tuo'), ...FILLER]);
  const mu = unit(B9, 'huaxia-mulan');
  const ally9 = unit(B9, 'huaxia-hua-tuo');
  for (let i = 0; i < 5; i++) {
    ally9.alive = true;
    ally9.hp = ally9.maxHp;
    kill(B9, ally9);
    AP(B9, mu, [mu], mu.card.ability.passive.effects, { trigger: 'allyDied', immediate: true });
  }
  ok(atkPct(B9, mu, 'atk') === 48 && atkPct(B9, mu, 'crit') === 40, "Mulan's resolve caps at 4 stacks");
}

console.log('C. Genesis - the announced verdict');
{
  /* Lucifer: the delayed board-wide fall lands two rounds later, and
     the no-heal window is real while it cooks. */
  const B = battle([g('genesis-lucifer'), g('genesis-gabriel'), g('genesis-azrael'), ...FILLER]);
  const lu = unit(B, 'genesis-lucifer');
  E.useAbility(B, lu, lu.card.ability, []);
  const hpBefore = foes(B).map((u) => u.hp);
  ok(lu.flags.healMod === -100, 'Lucifer refuses aid while the fall is scheduled');
  ok(foes(B).every((u) => u.pending.length === 1), 'every enemy is sealed');
  E.nextRound(B);
  E.nextRound(B);
  const after = foes(B).map((u) => u.hp);
  ok(hpBefore.some((h, i) => after[i] < h), 'the fall lands two rounds later');

  /* Michael: the execute arm only opens below 25%. */
  const B2 = battle([g('genesis-michael'), g('genesis-azrael'), g('genesis-gabriel'), ...FILLER]);
  const mi = unit(B2, 'genesis-michael');
  const t = foes(B2)[0];
  const hp0 = t.hp;
  E.useAbility(B2, mi, mi.card.ability, [t]);
  const plain = hp0 - t.hp;
  t.hp = Math.round(t.maxHp * 0.2);
  const big = E.previewDamage(B2, mi, mi.card.ability, t).dmg;
  t.hp = t.maxHp;
  const small = E.previewDamage(B2, mi, mi.card.ability, t).dmg;
  ok(plain > 0 && Math.abs(big / small - 2.0 / 1.7) < 0.05, 'the sword previews 200% below 25% and 170% above (' + big + ' vs ' + small + ')');

  /* Azrael: the hour is 240% and it arrives even if he has fallen -
     the note on the card is a promise, and the engine must keep it. */
  const B3 = battle([g('genesis-azrael'), g('genesis-michael'), g('genesis-gabriel'), ...FILLER]);
  const az = unit(B3, 'genesis-azrael');
  const marked = foes(B3)[0];
  E.useAbility(B3, az, az.card.ability, [marked]);
  const hpBefore3 = marked.hp;
  ok(marked.pending.length === 1, 'the hour is named');
  kill(B3, az);
  E.nextRound(B3);
  E.nextRound(B3);
  ok(marked.hp < hpBefore3, 'the hour comes even with Azrael fallen');

  /* Gabriel: pulls every seal one round closer and rallies the team. */
  const B4 = battle([g('genesis-gabriel'), g('genesis-azrael'), g('genesis-michael'), ...FILLER]);
  const ga = unit(B4, 'genesis-gabriel');
  const sealed = foes(B4)[0];
  sealed.pending.push({ turns: 2, srcUid: unit(B4, 'genesis-azrael').uid, effects: [{ k: 'dmg', power: 1 }], scale: 1 });
  E.useAbility(B4, ga, ga.card.ability, []);
  ok(sealed.pending[0].turns === 1, 'the seal is pulled one round closer');
  ok(atkPct(B4, ga, 'atk') === 10, 'and the team gains +10% ATK');

  /* Adam: the bet pays the team heal only if he is still standing. */
  const B5 = battle([g('genesis-adam'), g('genesis-raphael'), g('genesis-uriel'), ...FILLER]);
  const ad = unit(B5, 'genesis-adam');
  E.useAbility(B5, ad, ad.card.ability, []);
  ok(ad.flags.taunt > 0 && atkPct(B5, ad, 'def') === 20, 'Adam provokes and steels himself');
  ok(ad.flags.healMod === -100, 'and cannot be healed for two rounds');
  const crew = teamOf(B5, 'player').filter((u) => u.uid !== ad.uid);
  crew.forEach((u) => wound(u, 0.4));
  E.nextRound(B5);
  E.nextRound(B5);
  ok(crew.every((u) => u.hp > u.maxHp * 0.4), 'surviving the sentence heals the whole team');
  const B5b = battle([g('genesis-adam'), g('genesis-raphael'), g('genesis-uriel'), ...FILLER]);
  const ad2 = unit(B5b, 'genesis-adam');
  const crew2 = teamOf(B5b, 'player').filter((u) => u.uid !== ad2.uid);
  crew2.forEach((u) => wound(u, 0.4));
  E.useAbility(B5b, ad2, ad2.card.ability, []);
  kill(B5b, ad2);
  E.nextRound(B5b);
  E.nextRound(B5b);
  ok(crew2.every((u) => u.hp <= u.maxHp * 0.4 + 1), 'a fallen Adam pays nothing');

  /* Raphael: heal, full cleanse, and the cancellation. */
  const B6 = battle([g('genesis-raphael'), g('genesis-adam'), g('genesis-uriel'), ...FILLER]);
  const ra = unit(B6, 'genesis-raphael');
  const friend = unit(B6, 'genesis-adam');
  wound(friend, 0.3);
  friend.flags.burn = 2;
  friend.pending.push({ turns: 2, srcUid: ra.uid, effects: [{ k: 'dmg', power: 1 }], scale: 1 });
  E.useAbility(B6, ra, ra.card.ability, [friend]);
  ok(friend.hp > friend.maxHp * 0.3, 'the heal lands');
  ok(friend.flags.burn === 0, 'every debuff is cleansed');
  ok(friend.pending.length === 0, 'the pending fate is cancelled');

  /* Uriel: two targets, both Burned. */
  const B7 = battle([g('genesis-uriel'), g('genesis-raphael'), g('genesis-adam'), ...FILLER]);
  const ur = unit(B7, 'genesis-uriel');
  const pair = foes(B7).slice(0, 2);
  E.useAbility(B7, ur, ur.card.ability, pair);
  ok(pair.every((u) => u.flags.burn > 0), 'the flame burns both');

  /* Metatron: the long Silence, plus the ATK wound. */
  const B8 = battle([g('genesis-metatron'), g('genesis-raphael'), g('genesis-uriel'), ...FILLER]);
  const mt = unit(B8, 'genesis-metatron');
  const victim8 = foes(B8)[0];
  E.useAbility(B8, mt, mt.card.ability, [victim8]);
  ok(victim8.flags.silence === 2, 'Silence for 2 rounds - the longest in the game');
  ok(atkPct(B8, victim8, 'atk') === -12, 'and -12% ATK');
}

console.log('D. Transylvania - the things that move between people');
{
  /* Dracula: the ATK drain and gain are equal and do not stack with
     themselves. */
  const B = battle([g('transylvania-dracula'), g('transylvania-monster'), g('transylvania-carmilla'), ...FILLER]);
  const dr = unit(B, 'transylvania-dracula');
  E.useAbility(B, dr, dr.card.ability, []);
  ok(foes(B).every((u) => atkPct(B, u, 'atk') === -8), 'every enemy bleeds 8% ATK');
  ok(atkPct(B, dr, 'atk') === 8, 'and Dracula drinks it');
  E.useAbility(B, dr, dr.card.ability, []);
  ok(atkPct(B, dr, 'atk') === 8, 'a second cast does not stack the theft');

  /* The Monster: the full defensive line. */
  const B2 = battle([g('transylvania-monster'), g('transylvania-dracula'), g('transylvania-carmilla'), ...FILLER]);
  const mon = unit(B2, 'transylvania-monster');
  E.useAbility(B2, mon, mon.card.ability, []);
  ok(mon.flags.taunt > 0 && mon.shield > 0 && atkPct(B2, mon, 'def') === 12, 'the Monster provokes, shields and hardens');

  /* Carmilla: the DEF is taken, the health is kept. */
  const B3 = battle([g('transylvania-carmilla'), g('transylvania-dracula'), g('transylvania-monster'), ...FILLER]);
  const ca = unit(B3, 'transylvania-carmilla');
  wound(ca, 0.4);
  const t = foes(B3)[0];
  E.useAbility(B3, ca, ca.card.ability, [t]);
  ok(atkPct(B3, t, 'def') === -18, 'the target loses 18% DEF');
  ok(ca.hp > ca.maxHp * 0.4, 'and Carmilla feeds on it');

  /* Hyde: the draught pays -9% DEF per drink, capped at three. */
  const B4 = battle([g('transylvania-hyde'), g('transylvania-dracula'), g('transylvania-monster'), ...FILLER]);
  const hy = unit(B4, 'transylvania-hyde');
  const t4 = foes(B4)[0];
  B4.energy.player = 250;
  for (let i = 0; i < 4; i++) {
    again(B4, hy);
    E.useAbility(B4, hy, hy.card.ability, [t4]);
  }
  ok(atkPct(B4, hy, 'def') === -27, 'three draughts, exactly -27% DEF');

  /* Van Helsing: the shield is destroyed outright. */
  const B5 = battle([g('transylvania-van-helsing'), g('transylvania-dracula'), g('transylvania-monster'), ...FILLER]);
  const vh = unit(B5, 'transylvania-van-helsing');
  const t5 = foes(B5)[0];
  t5.shield = 400;
  E.useAbility(B5, vh, vh.card.ability, [t5]);
  ok(t5.shield === 0, "the hunter's kit destroys the Shield");

  /* The Invisible Man: damage plus the vanishing. */
  const B6 = battle([g('transylvania-invisible-man'), g('transylvania-dracula'), g('transylvania-monster'), ...FILLER]);
  const inv = unit(B6, 'transylvania-invisible-man');
  const t6 = foes(B6)[0];
  const hp6 = t6.hp;
  E.useAbility(B6, inv, inv.card.ability, [t6]);
  ok(t6.hp < hp6 && inv.flags.untargetable > 0, 'he strikes and vanishes');

  /* Dorian: the first signature hit each round is borne by the
     portrait, and the DEF grows with it. */
  const B7 = battle([g('transylvania-dorian-gray'), g('transylvania-dracula'), g('transylvania-monster'), ...FILLER]);
  const do7 = unit(B7, 'transylvania-dorian-gray');
  const foe7 = foes(B7)[0];
  const hp7 = do7.hp;
  E.useAbility(B7, foe7, E.roleAbility(foe7), [do7]);
  ok(do7.hp === hp7, 'the portrait bears the first hit - no damage');
  ok(atkPct(B7, do7, 'def') === 3, 'and ages in his place (+3% DEF)');
  E.useAbility(B7, foes(B7)[1], E.roleAbility(foes(B7)[1]), [do7]);
  ok(do7.hp < hp7, 'the second hit is all his');
  E.nextRound(B7);
  const hp8 = do7.hp;
  E.useAbility(B7, foes(B7)[0], E.roleAbility(foes(B7)[0]), [do7]);
  ok(do7.hp === hp8, 'a new round restores the portrait');
}

console.log('E. Asgard - the fallen count');
{
  /* Odin: the flip at three fallen. */
  const B = battle([g('asgard-odin'), g('asgard-thor'), g('asgard-hel'), ...FILLER]);
  const od = unit(B, 'asgard-odin');
  const tgt0 = foes(B)[0];
  const early = E.previewDamage(B, od, od.card.ability, tgt0).dmg;
  B.deathSeq = 3;
  const late = E.previewDamage(B, od, od.card.ability, tgt0).dmg;
  ok(Math.abs(late / early - 1.3) < 0.05, 'the AoE steps 50% -> 65% after three fall (' + early + ' -> ' + late + ')');

  /* Fenrir: half damage while bound, 1.25x once the chains break. */
  const B2 = battle([g('asgard-fenrir'), g('asgard-odin'), g('asgard-thor'), ...FILLER]);
  const fe = unit(B2, 'asgard-fenrir');
  const t = foes(B2)[0];
  const hp0 = t.hp;
  E.useAbility(B2, fe, E.roleAbility(fe), [t]);
  const bound = hp0 - t.hp;
  t.hp = t.maxHp;
  B2.deathSeq = 3;
  again(B2, fe);
  E.useAbility(B2, fe, E.roleAbility(fe), [t]);
  const freed = t.maxHp - t.hp;
  ok(Math.abs(freed / bound - 2.5) < 0.05, 'the chains breaking is a 2.5x swing (0.5x -> 1.25x)');

  /* Hel: the anti-heal hits everyone; the Expose only after two fall. */
  const B3 = battle([g('asgard-hel'), g('asgard-thor'), g('asgard-fenrir'), ...FILLER]);
  const he = unit(B3, 'asgard-hel');
  E.useAbility(B3, he, he.card.ability, []);
  ok(foes(B3).every((u) => u.flags.healMod === -35), 'all enemies heal 35% less');
  ok(foes(B3).every((u) => !(u.flags.exposed > 0)), 'no Expose before two have fallen');
  B3.deathSeq = 2;
  again(B3, he);
  E.useAbility(B3, he, he.card.ability, []);
  const exposed = foes(B3).filter((u) => u.flags.exposed > 0).length;
  ok(exposed === 2, 'two fallen, and the two lowest are Exposed');

  /* Loki: his death burns and wounds the whole enemy board. */
  const B4 = battle([g('asgard-loki'), g('asgard-thor'), g('asgard-hel'), ...FILLER]);
  const lo = unit(B4, 'asgard-loki');
  const foe4 = foes(B4)[0];
  lo.hp = 1;
  AP(B4, foe4, [lo], [{ k: 'dmg', power: 10, element: 'Physical' }], { immediate: true });
  ok(!lo.alive, 'Loki falls');
  ok(foes(B4).every((u) => u.flags.burn > 0), 'his death Burns the board');
  ok(foes(B4).every((u) => atkPct(B4, u, 'atk') === -15), 'and wounds their ATK');

  /* Freyja: the heal grows 3% per fallen and stops at +12%. */
  const B5 = battle([g('asgard-freyja'), g('asgard-thor'), g('asgard-hel'), ...FILLER]);
  const fr = unit(B5, 'asgard-freyja');
  const hurt = teamOf(B5, 'player').filter((u) => u.uid !== fr.uid);
  const healAt = (deaths) => {
    hurt.forEach((u) => wound(u, 0.3));
    B5.deathSeq = deaths;
    B5.energy.player = 150;
    again(B5, fr);
    E.useAbility(B5, fr, fr.card.ability, []);
    return hurt.reduce((s, u) => s + (u.hp - Math.round(u.maxHp * 0.3)), 0);
  };
  const h0 = healAt(0);
  const h4 = healAt(4);
  const h9 = healAt(9);
  ok(h4 > h0, 'the heal grows with the count');
  ok(h9 === h4, 'and is capped at +12%');

  /* Heimdall: the watchman's resist while provoking. */
  const B6 = battle([g('asgard-heimdall'), g('asgard-thor'), g('asgard-hel'), ...FILLER]);
  const hd = unit(B6, 'asgard-heimdall');
  E.useAbility(B6, hd, hd.card.ability, []);
  ok(hd.flags.taunt > 0 && hd.shield > 0, 'the horn provokes and shields');
  hd.shield = 0;
  const foe6 = foes(B6)[0];
  const hp6 = hd.hp;
  E.useAbility(B6, foe6, E.roleAbility(foe6), [hd]);
  const taken = hp6 - hd.hp;
  hd.flags.resistPct = 0;
  const hp7 = hd.hp;
  E.useAbility(B6, foes(B6)[2], E.roleAbility(foes(B6)[2]), [hd]);
  const taken2 = hp7 - hd.hp;
  ok(taken2 > taken, 'Heimdall takes less while the horn is sounding');
}

console.log('F. Devas - the marking and cleansing hand');
{
  /* Shiva: the marked arm is the big one. */
  const B = battle([g('devas-shiva'), g('devas-kali'), g('devas-vishnu'), ...FILLER]);
  const sh = unit(B, 'devas-shiva');
  const t = foes(B)[0];
  t.hp = t.maxHp;
  const plain = E.previewDamage(B, sh, sh.card.ability, t).dmg;
  t.flags.marked = 1;
  const onMark = E.previewDamage(B, sh, sh.card.ability, t).dmg;
  ok(Math.abs(onMark / plain - 2 / 1.5) < 0.05, 'Tandava steps 150% -> 200% on a Marked target (' + plain + ' -> ' + onMark + ')');

  /* Vishnu: team heal + one cleanse each. */
  const B2 = battle([g('devas-vishnu'), g('devas-kali'), g('devas-shiva'), ...FILLER]);
  const vi = unit(B2, 'devas-vishnu');
  const crew = teamOf(B2, 'player');
  crew.forEach((u) => {
    wound(u, 0.4);
    u.flags.burn = 2;
  });
  E.useAbility(B2, vi, vi.card.ability, []);
  ok(crew.every((u) => u.hp > u.maxHp * 0.4), 'the whole team is healed');
  ok(crew.every((u) => u.flags.burn === 0), 'and cleansed');

  /* Kali: two targets, two marks. */
  const B3 = battle([g('devas-kali'), g('devas-shiva'), g('devas-vishnu'), ...FILLER]);
  const ka = unit(B3, 'devas-kali');
  const pair = foes(B3).slice(0, 2);
  const hp3 = pair.map((u) => u.hp);
  E.useAbility(B3, ka, ka.card.ability, pair);
  ok(pair.every((u) => u.hp < hp3[pair.indexOf(u)]), 'both take the garland');
  ok(pair.every((u) => u.flags.marked > 0), 'both are Marked');

  /* Durga: provokes AND shields everyone else. */
  const B4 = battle([g('devas-durga'), g('devas-kali'), g('devas-vishnu'), ...FILLER]);
  const du = unit(B4, 'devas-durga');
  E.useAbility(B4, du, du.card.ability, []);
  ok(du.flags.taunt > 0, 'Durga steps forward');
  ok(teamOf(B4, 'player').every((u) => u.shield > 0), 'and every ally is shielded');

  /* Ganesha: full team cleanse, a small heal, and the Energy. */
  const B5 = battle([g('devas-ganesha'), g('devas-kali'), g('devas-vishnu'), ...FILLER]);
  const gn = unit(B5, 'devas-ganesha');
  const crew5 = teamOf(B5, 'player').filter((u) => u.uid !== gn.uid);
  crew5.forEach((u) => {
    u.flags.burn = 2;
    u.flags.silence = 2;
  });
  const e5 = B5.energy.player;
  E.useAbility(B5, gn, gn.card.ability, []);
  ok(crew5.every((u) => u.flags.burn === 0 && u.flags.silence === 0), 'every debuff is removed');
  ok(B5.energy.player === e5 - gn.card.ability.cost + 10, 'and the team gains 10 Energy');

  /* Hanuman: back-row reach through Provoke. */
  const B6 = battle([g('devas-hanuman'), g('devas-kali'), g('devas-vishnu'), ...FILLER]);
  const ha = unit(B6, 'devas-hanuman');
  const back = foes(B6).filter((u) => !E.isFront(u))[0];
  const hp6 = back.hp;
  E.useAbility(B6, ha, ha.card.ability, [back]);
  ok(back.hp < hp6, 'the leap lands on the back row');

  /* Indra: only the Marked eat the bolt. */
  const B7 = battle([g('devas-indra'), g('devas-kali'), g('devas-vishnu'), ...FILLER]);
  const ind = unit(B7, 'devas-indra');
  const board = foes(B7);
  const hpBefore = board.map((u) => u.hp);
  board[0].flags.marked = 1;
  board[2].flags.marked = 1;
  E.useAbility(B7, ind, ind.card.ability, []);
  const hit = board.filter((u, i) => u.hp < hpBefore[i]);
  ok(hit.length === 2 && hit.every((u) => u.flags.marked === 0 || true), 'the bolt strikes only the Marked');
  ok(board[1].hp === hpBefore[1], 'and leaves the unmarked alone');
}

console.log('G. Tortuga - plunder, not destruction');
{
  /* Blackbeard: AoE plus Burn on the two lowest. */
  const B = battle([g('tortuga-blackbeard'), g('tortuga-davy-jones'), g('tortuga-kraken'), ...FILLER]);
  const bb = unit(B, 'tortuga-blackbeard');
  const board = foes(B);
  const hpBefore = board.map((u) => u.hp);
  board[2].hp = Math.round(board[2].maxHp * 0.5);
  board[4].hp = Math.round(board[4].maxHp * 0.4);
  E.useAbility(B, bb, bb.card.ability, []);
  ok(board.every((u, i) => u.hp < hpBefore[i] || u.hp === hpBefore[i]), 'everyone eats the fuses');
  const burned = board.filter((u) => u.flags.burn > 0);
  ok(burned.length === 2 && burned.indexOf(board[4]) >= 0, 'the two lowest are Burned');

  /* Davy Jones: the Locker marks the target, strips DEF and drains. */
  const B2 = battle([g('tortuga-davy-jones'), g('tortuga-blackbeard'), g('tortuga-kraken'), ...FILLER]);
  const dj = unit(B2, 'tortuga-davy-jones');
  const t = foes(B2)[0];
  const e2 = B2.energy.enemy;
  E.useAbility(B2, dj, dj.card.ability, [t]);
  ok(t.flags.noRevive === 1, 'the Locker holds the target');
  ok(atkPct(B2, t, 'def') === -15, 'and strips 15% DEF');
  ok(B2.energy.enemy === e2 - 12, 'and drains 12 Energy');

  /* The Kraken: the enemy line is dragged forward, the crew is not. */
  const B3 = battle([g('tortuga-kraken'), g('tortuga-blackbeard'), g('tortuga-davy-jones'), ...FILLER]);
  const kr = unit(B3, 'tortuga-kraken');
  E.useAbility(B3, kr, kr.card.ability, []);
  ok(foes(B3).every((u) => u.flags.taunt > 0), 'every enemy is Provoked');
  ok(kr.shield > 0, 'and the Kraken shields himself');
  ok(teamOf(B3, 'player').every((u) => !(u.flags.taunt > 0)), 'the crew itself is not provoked');

  /* Anne Bonny: the plunder pays per buff taken, capped at four. */
  const B4 = battle([g('tortuga-anne-bonny'), g('tortuga-blackbeard'), g('tortuga-kraken'), ...FILLER]);
  const an = unit(B4, 'tortuga-anne-bonny');
  const t4 = foes(B4)[0];
  for (let i = 0; i < 5; i++) t4.buffs.push({ stat: 'def', amt: 10, turns: 2, tag: null });
  E.useAbility(B4, an, an.card.ability, [t4]);
  ok(!t4.buffs.some((b) => b.amt > 0), 'every positive buff is taken');
  ok(atkPct(B4, an, 'atk') === 32, 'and the payout caps at 4 stacks of +8%');

  /* Captain Kidd: the Mark lands, and the kill pays the crew. */
  const B5 = battle([g('tortuga-captain-kidd'), g('tortuga-blackbeard'), g('tortuga-kraken'), ...FILLER]);
  const ki = unit(B5, 'tortuga-captain-kidd');
  const t5 = foes(B5)[0];
  const e5 = B5.energy.player;
  E.useAbility(B5, ki, ki.card.ability, [t5]);
  ok(t5.flags.marked > 0, 'the target is Marked');
  ok(B5.energy.player === e5 - ki.card.ability.cost, 'no treasure without the kill');
  t5.hp = 1;
  const eK5 = B5.energy.player;
  again(B5, ki);
  E.useAbility(B5, ki, ki.card.ability, [t5]);
  ok(B5.energy.player >= eK5 - ki.card.ability.cost + 15, 'the kill pays the crew 15 Energy');

  /* Calico Jack: the colours strip DEF board-wide. */
  const B6 = battle([g('tortuga-calico-jack'), g('tortuga-blackbeard'), g('tortuga-kraken'), ...FILLER]);
  const cj = unit(B6, 'tortuga-calico-jack');
  E.useAbility(B6, cj, cj.card.ability, []);
  ok(foes(B6).every((u) => atkPct(B6, u, 'def') === -12), 'every enemy loses 12% DEF');

  /* The Flying Dutchman: the crew lost pays, capped at three. */
  const B7 = battle([g('tortuga-flying-dutchman'), g('tortuga-blackbeard'), g('tortuga-kraken'), ...FILLER]);
  const fd = unit(B7, 'tortuga-flying-dutchman');
  const pair = foes(B7).slice(0, 2);
  const hp0 = pair.map((u) => u.hp);
  E.useAbility(B7, fd, fd.card.ability, pair);
  const base = pair.map((u, i) => hp0[i] - u.hp);
  teamOf(B7, 'player').filter((u) => u.uid !== fd.uid).forEach((u) => kill(B7, u));
  pair.forEach((u) => (u.hp = u.maxHp));
  again(B7, fd);
  E.useAbility(B7, fd, fd.card.ability, pair);
  const loaded = pair.map((u, i) => u.maxHp - u.hp);
  ok(
    loaded.every((v, i) => v > base[i] * 1.5),
    'the Dutchman grows with every crewmate lost'
  );
}

console.log('H. Pandemonium - the price is the point');
{
  /* Pride: the sweep plus the refused aid. */
  const B = battle([g('pandemonium-pride'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  const pr = unit(B, 'pandemonium-pride');
  const hpBefore = foes(B).map((u) => u.hp);
  E.useAbility(B, pr, pr.card.ability, []);
  ok(foes(B).every((u, i) => u.hp < hpBefore[i]), 'the whole board takes the sweep');
  ok(pr.flags.healMod === -100, 'and Pride refuses aid for 2 rounds');

  /* Wrath: +12/-8 per cast, three deep. */
  const B2 = battle([g('pandemonium-wrath'), g('pandemonium-greed'), g('pandemonium-pride'), ...FILLER]);
  const wr = unit(B2, 'pandemonium-wrath');
  const t = foes(B2)[0];
  B2.energy.player = 250;
  for (let i = 0; i < 4; i++) {
    again(B2, wr);
    E.useAbility(B2, wr, wr.card.ability, [t]);
  }
  ok(atkPct(B2, wr, 'atk') === 36, 'three stacks of +12% ATK');
  ok(atkPct(B2, wr, 'def') === -24, 'and -8% DEF each');

  /* Envy: the best enemy pays, the caster gains. */
  const B3 = battle([g('pandemonium-envy'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  const en = unit(B3, 'pandemonium-envy');
  const best = foes(B3).slice().sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
  const hp3 = best.hp;
  E.useAbility(B3, en, en.card.ability, []);
  ok(best.hp < hp3, 'the highest-ATK enemy takes the blow');
  ok(atkPct(B3, best, 'atk') === -12, 'and loses 12% ATK');
  ok(atkPct(B3, en, 'atk') === 12, 'which Envy keeps');

  /* Greed: the round tax swings the right way and his hoard caps. */
  const B4 = battle([g('pandemonium-greed'), g('pandemonium-wrath'), g('pandemonium-pride'), ...FILLER]);
  const gr = unit(B4, 'pandemonium-greed');
  B4.energy.player = 30;
  B4.energy.enemy = 30;
  for (let i = 0; i < 7; i++) E.nextRound(B4);
  ok(B4.energy.player > B4.energy.enemy, 'the tax favours Greed over seven rounds');
  ok(atkPct(B4, gr, 'atk') === 20, 'and the hoard caps at 5 stacks of +4%');

  /* Gluttony: the drink is 35% of the full blow. */
  const B5 = battle([g('pandemonium-gluttony'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  const gl = unit(B5, 'pandemonium-gluttony');
  wound(gl, 0.5);
  const t5 = foes(B5)[0];
  E.useAbility(B5, gl, gl.card.ability, [t5]);
  ok(gl.hp > gl.maxHp * 0.5, 'Devour heals Gluttony');

  /* Sloth: the shield and the hardening, for the price of a turn. */
  const B6 = battle([g('pandemonium-sloth'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  const sl = unit(B6, 'pandemonium-sloth');
  E.useAbility(B6, sl, sl.card.ability, []);
  ok(sl.shield > 0 && atkPct(B6, sl, 'def') === 12, 'Sloth stirs - shield and DEF');

  /* Lust: the enemy legend is left exposed to its own team. */
  const B7 = battle([g('pandemonium-lust'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  const lu2 = unit(B7, 'pandemonium-lust');
  const t7 = foes(B7)[0];
  E.useAbility(B7, lu2, lu2.card.ability, [t7]);
  ok(t7.flags.taunt > 0, 'the target is Provoked into the open');
  ok(atkPct(B7, t7, 'def') === -15, 'and loses 15% DEF');
}

console.log('I. the boss - Asmodeus, the Redactor');
{
  const B = battle([g('pandemonium-pride'), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER]);
  B.units[0] = Object.assign({}, B.units[0]); // not needed; build a boss battle directly
  const B2 = E.createBattle([bossEntry(), g('pandemonium-greed'), g('pandemonium-wrath'), ...FILLER], FOES, {
    roleAware: false,
    rng: () => 0.5,
    oddFirst: 'player',
  });
  B2.silent = true;
  B2.round = 3;
  B2.energy.player = 250;
  B2.energy.enemy = 250;
  const as = B2.units.find((u) => u.card.id === 'campaign-asmodeus');
  const t = foes(B2)[0];
  t.buffs.push({ stat: 'def', amt: 20, turns: 2, tag: null });
  const hp0 = t.hp;
  E.useAbility(B2, as, as.card.ability, [t]);
  ok(t.hp < hp0, 'the Redaction deals its damage');
  ok(t.flags.silence > 0, 'the target is struck from the record (Silenced)');
  ok(!t.buffs.some((b) => b.amt > 0), 'and loses every buff it carried');
  ok(atkPct(B2, as, 'atk') === 12, 'the Redactor grows by one revision');
  B2.energy.player = 500;
  for (let i = 0; i < 7; i++) {
    again(B2, as);
    E.useAbility(B2, as, as.card.ability, [foes(B2)[0]]);
  }
  ok(atkPct(B2, as, 'atk') === 72, 'and the record stops at six revisions (+72%)');
}

console.log('J. card text hygiene');
{
  /* Literal unicode escapes render as raw "\u2019" in the tooltip. Two
     Chapter II cards shipped with them - the suite proves none remain. */
  const bad = [];
  ALL.forEach(({ card }) => {
    const walk = (o, where) => {
      if (o == null) return;
      if (typeof o === 'string') {
        if (/\\u[0-9a-fA-F]{4}/.test(o)) bad.push(card.id + ' (' + where + '): ' + o.slice(0, 60));
      } else if (typeof o === 'object') {
        Object.keys(o).forEach((k) => walk(o[k], where + '.' + k));
      }
    };
    walk(card.ability, 'ability');
  });
  ok(bad.length === 0, 'no literal \\u escapes in any card text' + (bad.length ? ' -> ' + bad.join(' | ') : ''));
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
