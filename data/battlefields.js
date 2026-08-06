/* =============================================================
   Echoes of Legend - Battlefields
   -------------------------------------------------------------
   A battlefield is a match-wide rule set rolled AFTER the ban phase and
   revealed at the start of Field Six, so neither side can ban around it.

   Every field is pure data. The engine reads these keys:

     basicsFrontRowOnly  bool   back row may not use role Basics (Narrow Pass)
     backRowAtk          %      additive ATK for back-row heroes
     frontRowDef         %      additive DEF for front-row heroes (negative = worse)
     energyPerRound      flat   added to (or removed from) each round's grant
     energyCap           flat   raises the 150 ceiling
     echoFirstAbility    bool   first ability each round repeats free
     echoScale           0-1    effectiveness of that echo
     deathEnergy         flat   energy to the DYING hero's own side
     woundedAtk          %      ATK bonus below `woundedBelow` HP
     woundedBelow        0-1    the wounded threshold (default 0.5)
     championAtk         %      ATK for the priciest signature on each side
     championHp          %      Max HP for that same hero (applied at start)
     roundBuffs          []     random relic pool, one fires per round

   Presentation-only keys:

     art                 path   optional 512x284 pixel-art backdrop. When
                                present the board renders it beneath every
                                effect layer; when absent the field falls
                                back to its CSS pattern. See
                                docs/BATTLEFIELD-ART-SPEC.md.

   Balance note: every effect is SYMMETRIC. Both sides play under the same
   rules, so a field changes what drafts well without handing either player
   an advantage. The sim runs exclusively in the Colosseum (no effects) so
   that hero win rates stay comparable across balance passes.
   ============================================================= */
window.EOL = window.EOL || {};

window.EOL.battlefields = [
  {
    id: 'narrow-pass',
    art: 'assets/boards/narrow-pass.jpg',
    name: 'The Narrow Pass',
    icon: 'ra-mountains',
    tagline: 'A mountain choke point where armies collide head-on.',
    colors: { primary: '#8d7a63', secondary: '#4a5568', glow: '#c9b8a0' },
    rules: [
      'Only front-row legends may use Basic Skills.',
      'Back-row legends must spend Signature Skills.',
    ],
    draft: 'Tanks and Bruisers gain value; Snipers need utility to justify a slot.',
    basicsFrontRowOnly: true,
  },
  {
    id: 'open-plains',
    art: 'assets/boards/open-plains.jpg',
    name: 'The Open Plains',
    icon: 'ra-grass',
    tagline: 'A vast field where armies have room to manoeuvre.',
    colors: { primary: '#7bb661', secondary: '#e3c567', glow: '#c8f08f' },
    rules: ['Back-row legends deal +15% damage.', 'Front-row legends have -15% DEF.'],
    draft: 'Snipers and Casters are terrifying; turtling is punished.',
    backRowAtk: 15,
    frontRowDef: -15,
  },
  {
    id: 'mana-spring',
    art: 'assets/boards/mana-spring.jpg',
    name: 'The Mana Spring',
    icon: 'ra-droplets',
    tagline: 'An ancient battlefield overflowing with magical energy.',
    colors: { primary: '#4aa3e0', secondary: '#8be0ff', glow: '#a8ecff' },
    rules: ['+20 Energy every round.', 'Maximum stored Energy raised by 20.'],
    draft: 'Expensive legendaries become playable; cheap efficiency loses its edge.',
    energyPerRound: 20,
    energyCap: 20,
  },
  {
    id: 'energy-void',
    art: 'assets/boards/energy-void.jpg',
    name: 'The Energy Void',
    icon: 'ra-battery-black',
    tagline: 'A cursed land that drains the power of legends.',
    colors: { primary: '#5b4b8a', secondary: '#2d2a4a', glow: '#9b8bd0' },
    rules: ['-10 Energy every round.', 'Skill costs are unchanged.'],
    draft: 'Cheap legends shine; expensive signatures become a liability.',
    energyPerRound: -10,
  },
  {
    id: 'colosseum',
    art: 'assets/boards/colosseum.jpg',
    name: 'The Colosseum',
    icon: 'ra-arena',
    tagline: 'A proving ground where only skill decides.',
    colors: { primary: '#d4af37', secondary: '#8a6d3b', glow: '#ffe9a8' },
    rules: ['No special conditions.'],
    draft: 'Pure drafting and play skill. The balance benchmark.',
    /* deliberately no modifiers - this is the neutral field the simulation
       uses so hero win rates are never contaminated by terrain */
  },
  {
    id: 'mirror-realm',
    art: 'assets/boards/mirror-realm.jpg',
    name: 'The Mirror Realm',
    icon: 'ra-crystals',
    tagline: 'A mystic realm where actions echo across reality.',
    colors: { primary: '#b18cd9', secondary: '#6fd3e8', glow: '#e2c9ff' },
    rules: [
      'The first Signature Skill for each player each round repeats at 50% effectiveness.',
      'The echo costs no Energy.',
    ],
    draft: 'Signature-centric legends spike; opening timing becomes a mind game.',
    echoFirstSignature: true,
    echoFirstAbility: true,
    echoScale: 0.5,
  },
  {
    id: 'spirit-world',
    art: 'assets/boards/spirit-world.jpg',
    name: 'The Spirit World',
    icon: 'ra-death-skull',
    tagline: 'An arena where the dying are held at the threshold.',
    colors: { primary: '#6fd3e8', secondary: '#3f9b8c', glow: '#b6f5ff' },
    rules: [
      'A lethal blow leaves the legend on 1 HP instead of killing them.',
      'Once per legend. The next blow finishes the job.',
    ],
    draft: 'Every legend effectively survives one extra hit, so burst loses to sustained pressure.',
    spiritReprieve: true,
  },
  {
    id: 'ancient-ruins',
    art: 'assets/boards/ancient-ruins.jpg',
    name: 'The Ancient Ruins',
    icon: 'ra-dead-tree',
    tagline: 'A forgotten battlefield littered with lost relics.',
    colors: { primary: '#c2a878', secondary: '#6b8f71', glow: '#f0dcb0' },
    rules: [
      'Each round both sides receive one boon: +5% ATK, +5% DEF or a 5% Max HP heal. The stat boons are permanent.',
    ],
    draft:
      'Every comp scales with time here; stall plans gain the most, so bring an answer for them.',
    roundBuffs: [
      /* user law 2026-08-04: exactly three relics - +5% ATK for the rest
         of the battle, +5% DEF for the rest of the battle, or a 5% Max
         HP heal. One pick applies to both sides (the hook's standing
         symmetric rule), so the ramp mirrors on both teams. */
      {
        id: 'sharp',
        label: 'the relics whet every blade',
        effects: [{ k: 'stat', stat: 'atk', amt: 5, turns: 99, to: 'self' }],
      },
      {
        id: 'guard',
        label: 'the stones lend their endurance',
        effects: [{ k: 'stat', stat: 'def', amt: 5, turns: 99, to: 'self' }],
      },
      {
        id: 'mend',
        label: 'the stones mend all wounds',
        effects: [{ k: 'heal', pctMaxHp: 5, to: 'self' }],
      },
    ],
  },
  {
    id: 'heros-trial',
    art: 'assets/boards/heros-trial.jpg',
    name: "The Legend's Trial",
    icon: 'ra-trophy',
    tagline: 'A battlefield that measures the mightiest warrior.',
    colors: { primary: '#e0a93b', secondary: '#b3541e', glow: '#ffd88a' },
    rules: ['Each side\u2019s costliest Skill-holder gains +30% Max HP and +20% ATK.'],
    draft: 'Hypercarry lines become real; spreading power evenly is weaker.',
    championHp: 30,
    championAtk: 20,
  },
  {
    id: 'blood-battlefield',
    art: 'assets/boards/blood-battlefield.jpg',
    name: 'The Blood Battlefield',
    icon: 'ra-broken-heart',
    tagline: 'Cursed ground where wounded legends grow stronger.',
    colors: { primary: '#b03a3a', secondary: '#5c1a1a', glow: '#ff8a8a' },
    rules: ['Legends below 50% HP deal +25% damage.'],
    draft: 'Bruisers and Tanks get scarier; burst is less reliable and healing is a real choice.',
    woundedAtk: 25,
    woundedBelow: 0.5,
  },
];

/* Roll a battlefield. Called after bans are locked so it cannot be played
   around during the ban phase. */
window.EOL.rollBattlefield = function (rng) {
  var list = window.EOL.battlefields;
  var r = rng || Math.random;
  return list[Math.floor(r() * list.length)];
};

window.EOL.battlefieldById = function (id) {
  return (
    window.EOL.battlefields.filter(function (f) {
      return f.id === id;
    })[0] || null
  );
};
