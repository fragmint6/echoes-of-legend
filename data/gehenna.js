/* Faction: Gehenna - Sin (the price is the point)
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   Seven sins, seven legends, and every one of them buys power with
   something real. Where Camelot pays Energy for Shields and Roma
   pays nothing at all (it is paid FOR kills), Gehenna's currency is
   its own well-being: HP, defence, healing, actions.

   THE COST IS NEVER A COSTUME. The guidelines warn against
   conditionals that are true by default - the same trap exists for
   drawbacks. "Loses DEF" on a card that never gets attacked is not a
   cost. So each sin's price is one the OPPONENT can press:

     Pride      cannot be healed for 2 rounds after casting - the
                enemy chooses whether to punish the window
     Wrath      sheds DEF as he grows; the more he casts the more a
                Sniper wants him
     Gluttony   heals himself but nobody else, so he is a Bruiser
                who makes the Medic's job harder
     Sloth      must SKIP a turn to bank his payoff - the purest
                tempo cost in the game
     Envy       borrows an enemy's ATK, so he is only as good as
                what he is facing
     Lust       turns an enemy into a wall for their OWN team
     Greed      the only one with no drawback, because his whole
                skill is a slow tax rather than a burst

   Named literally - Wrath, Greed, Sloth - so the seven-sins read is
   unmissable at a glance without borrowing anyone's branding.

   THE INTERNAL SHAPE
   -------------------------------------------------------------
   Greed's passive Energy tax is the engine: it pays for Pride's 50
   and Sloth's banked double-cast. Wrath's shed DEF wants Camelot
   Shields or Heimdall in front of him. Nothing here heals the team,
   deliberately - Gluttony heals only himself and Pride refuses help
   entirely, so a mono-Gehenna draft is missing a Medic on purpose.

   CROSS-FACTION
   -------------------------------------------------------------
     - Greed's tax feeds any expensive signature (Zeus, Caesar, Odin).
     - Lust's redirected Provoke turns an enemy Tank into the victim
       of its own team's AoE, which no other card in the game does.
     - Pride pairs badly with Medic-heavy decks BY DESIGN: he is the
       card that punishes autopilot drafting.
   ============================================================= */
window.EOL.registerFaction({
  id: 'gehenna',
  name: 'Gehenna',
  icon: 'ra-burning-meteor',
  tagline: 'Everything you want, and the bill.',
  colors: { primary: '#c2402a', secondary: '#2b1418', glow: '#ff7a4d' },
  cards: [
    {
      id: 'gehenna-pride',
      name: 'Pride',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Light',
      stats: { hp: 4750, atk: 2040, def: 15 },
      ability: {
        type: 'Active',
        name: 'Non Serviam',
        cost: 50,
        /* ONE ability, ONE trade. An earlier draft gave him a permanent
           no-heal clause AND +60% damage AND a self-cleanse each round -
           three cards in a trenchcoat, and a violation of the
           one-skill rule every shipped legend obeys.

           Light on a demon is deliberate: Pride is the angel who would
           not serve, not a devil. It also keeps him off the crowded
           Shadow axis this release already leans on.

           RESHAPED after the audit: he was a 200% single-target hit,
           which is a Sniper's job, not a Caster's (role guide: 50-130%
           to ALL/multiple). As an 85% board-wide sweep he is finally the
           faction's centrepiece rather than a mislabelled assassin -
           budget 0.72, in band and just under Odin, and the no-heal
           window now costs him something real because he is standing in
           front of everyone. (85% first tried, which audited at 1.02 -
           over the Zeus ceiling. Six targets multiply fast.) */
        text: 'Deal <b>60% ATK Light Damage</b> to all enemies. Pride refuses all aid: he <b>cannot be healed</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.6, element: 'Light' },
            /* -100% healing received IS "cannot be healed" - healMod
               already exists and clamps, so no new status is needed. */
            { k: 'healMod', pct: -100, turns: 2, to: 'self' },
          ],
        },
      },
      icon: 'ra-crown-of-thorns',
      art: null,
    },

    {
      id: 'gehenna-wrath',
      name: 'Wrath',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Fire',
      stats: { hp: 6100, atk: 1730, def: 24 },
      ability: {
        type: 'Active',
        name: 'Seeing Red',
        cost: 40,
        /* CAPPED AT 3. The first draft said "stacking, no cap", which is
           precisely the bug maxStacks was added for - Red Riding Hood
           once produced a 13,000 Shield the same way. Three stacks is
           +36% ATK and -24% DEF: a real curve with a real ceiling, and
           the DEF loss is what stops it being a free ramp. */
        text: 'Deal <b>165% ATK Fire Damage</b>. Wrath gains <b>12% ATK</b> and loses <b>8% DEF</b> for 3 rounds.',
        note: 'Max: 3 stacks.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 1.65, element: 'Fire' },
            {
              k: 'stat',
              stat: 'atk',
              amt: 12,
              turns: 3,
              to: 'self',
              stackTag: 'seeing-red-atk',
              maxStacks: 3,
            },
            {
              k: 'stat',
              stat: 'def',
              amt: -8,
              turns: 3,
              to: 'self',
              stackTag: 'seeing-red-def',
              maxStacks: 3,
            },
          ],
        },
      },
      icon: 'ra-muscle-up',
      art: null,
    },

    {
      id: 'gehenna-envy',
      name: 'Envy',
      rarity: 'epic',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4820, atk: 1880, def: 16 },
      ability: {
        type: 'Active',
        name: 'Nothing Is Yours',
        cost: 45,
        /* Differentiated from Dracula, who drains ATK from ALL enemies
           as a permanent-ish team debuff. Envy takes from ONE - the best
           one - and the theft is the point: he is weak against a weak
           board and terrifying against a strong one. The damage is
           deliberately small (90%) because the ATK swing is the payload. */
        text: 'Deal <b>90% ATK Shadow Damage</b> to the highest ATK enemy and steal <b>12% of their ATK</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'dmg',
              power: 0.9,
              element: 'Shadow',
              take: { n: 1, by: 'highestAtk' },
            },
            {
              k: 'stat',
              stat: 'atk',
              amt: -12,
              turns: 2,
              to: 'targets',
              take: { n: 1, by: 'highestAtk' },
            },
            { k: 'stat', stat: 'atk', amt: 12, turns: 2, to: 'self' },
          ],
        },
      },
      icon: 'ra-burning-eye',
      art: null,
    },

    {
      id: 'gehenna-greed',
      name: 'Greed',
      rarity: 'epic',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5200, atk: 1240, def: 18 },
      ability: {
        type: 'Passive',
        name: 'Hoard',
        cost: null,
        /* OWNER'S DESIGN, scaled down. The request was +10/-10 each
           round; that is a 20-point swing per round against a 60-100
           income, compounding to ~120 by round six - larger than any
           single card's cost. At 5/5 it is a 10-point swing, still the
           strongest sustained economy in the game (Zhuge Liang's
           one-shot drain is 15) and still enough to fund one extra
           signature over a fight, without rewriting the energy curve.

           No cap needed on the Energy: the game length bounds it.
           The ATK rider IS capped - see below. */
        text: 'At the start of each round, your team gains <b>5 Energy</b>, the enemy team loses <b>5 Energy</b>, and Greed gains <b>4% ATK</b> for the rest of the battle.',
        note: 'Max: 5 stacks.',
        passive: {
          trigger: 'roundStart',
          effects: [
            { k: 'gainEnergy', amt: 5 },
            /* `drainEnergy`, not `loseEnergy`: loseEnergy always debits
               the CASTER's pool and ignores `to:`, so the first draft
               silently taxed Gehenna itself. drainEnergy is the
               enemy-pool effect (Zhuge Liang uses it). Verified by
               stepping two rounds and reading both pools. */
            { k: 'drainEnergy', amt: 5 },
            /* The hoard itself, and the card's one upgradeable
               magnitude - a flat Energy swing scales with nothing, so
               Greed was among the five new legends an upgrade could not
               touch. Capped at 5 stacks (+20%) because a permanent
               per-round ATK gain is exactly the uncapped-growth bug
               maxStacks exists for. */
            {
              k: 'stat',
              stat: 'atk',
              amt: 4,
              turns: 99,
              to: 'self',
              stackTag: 'hoard-growth',
              maxStacks: 5,
            },
          ],
        },
      },
      icon: 'ra-mining-diamonds',
      art: null,
    },

    {
      id: 'gehenna-gluttony',
      name: 'Gluttony',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6400, atk: 1560, def: 22 },
      ability: {
        type: 'Active',
        name: 'Devour',
        cost: 40,
        /* The sin is that he feeds HIMSELF. Every other lifesteal card
           in the roster is a bonus; here it is the whole identity, and
           the drawback is what it implies about the rest of the team -
           he is a Bruiser who never contributes to keeping anyone else
           alive, in a faction with no Medic at all. */
        text: 'Deal <b>170% ATK Physical Damage</b> and heal Gluttony for <b>35%</b> of the damage dealt.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 1.7, element: 'Physical' },
            { k: 'lifesteal', pct: 35 },
          ],
        },
      },
      icon: 'ra-meat-hook',
      art: null,
    },

    {
      id: 'gehenna-sloth',
      name: 'Sloth',
      rarity: 'rare',
      role: 'Tank',
      element: 'Shadow',
      stats: { hp: 7250, atk: 980, def: 29 },
      ability: {
        type: 'Active',
        name: 'Not Yet',
        cost: 20,
        /* THE PUREST TEMPO COST IN THE GAME. Every other Tank spends
           Energy; Sloth spends the thing Energy buys. Built as a cheap
           Active rather than the pass-trigger passive first drafted,
           because "when he passes" is not an engine trigger and adding
           one for a single card is the wrong trade - this reads the
           same at the table (do nothing useful now, be worth more
           later) using only existing parts. */
        text: 'Sloth stirs for no one: gain a <b>20% Max HP Shield</b> and <b>12% DEF</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 20, to: 'self' },
            { k: 'stat', stat: 'def', amt: 12, turns: 2, to: 'self' },
          ],
        },
      },
      icon: 'ra-hourglass',
      art: null,
    },

    {
      id: 'gehenna-lust',
      name: 'Lust',
      rarity: 'rare',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5000, atk: 1300, def: 17 },
      ability: {
        type: 'Active',
        name: 'Covet',
        cost: 40,
        /* THE ONE GENUINELY NEW INTERACTION IN THIS FACTION, and it
           needs no new mechanic: Provoke already redirects single-target
           attacks to the provoker, and the engine already applies it to
           whoever holds the flag. Putting it on an ENEMY makes their own
           team's single-target damage collapse onto them.

           Zero damage, correct for a Controller, and it is the only
           card in the game that turns an opponent's board against
           itself. */
        text: 'One enemy is <b>Provoked into the open</b>, drawing their own allies\\u2019 single-target attacks for 1 round, and loses <b>15% DEF</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'taunt', turns: 1, to: 'targets' },
            { k: 'stat', stat: 'def', amt: -15, turns: 2, to: 'targets' },
          ],
        },
      },
      icon: 'ra-heartburn',
      art: null,
    },
  ],
});
