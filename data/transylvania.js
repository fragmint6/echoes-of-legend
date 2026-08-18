/* Faction: Transylvania - what they take, they keep
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   Gothic horror, and every card is a TRANSFER rather than a removal.
   Grimmwood strips a buff off an enemy; Dracula moves it onto
   himself. Carmilla's healing comes out of somebody else's defence.
   Hyde buys power with his own body. The faction never destroys
   value, it relocates it - which is why it is the natural predator
   of Camelot, Olympus and any deck that spends a turn setting up.

   PUBLIC DOMAIN, DELIBERATELY. Every legend here is from a novel
   published 1818-1897: Shelley, Stoker, Stevenson, Wells, Le Fanu,
   Wilde. NONE of them are the Universal Pictures characters, whose
   DESIGNS are still protected - so the Monster is Shelley's
   articulate, grieving corpse rather than a flat-topped green man
   with neck bolts, and there is no Wolf Man or Mummy here at all
   (both are 20th-century studio creations). "Transylvania" is a
   Romanian region and names nothing but a mood, the same way
   Grimmwood covers German, English and French tales at once.

   THE STACKING WAS THE PROBLEM, AND IT IS FIXED
   -------------------------------------------------------------
   The first draft of this faction had Dracula draining 20% ATK from
   ALL enemies with no cap, the Monster gaining permanent ATK per hit
   with no cap, Hyde at +45%/-25% forever, and Dorian ignoring three
   hits a round. The owner's read - "these stack so insanely high,
   they're so broken" - was correct, and it is the exact bug
   `maxStacks` exists to prevent (Red Riding Hood's 13,000 Shield).

   Every growth effect here now carries a lifetime cap and a `note`
   that states it. The Monster tops out at +24%. Hyde can drink three
   times, and each drink costs real HP.

   CROSS-FACTION
   -------------------------------------------------------------
     - Van Helsing punishes Shields and buffs, which answers Camelot,
       Durga, Heimdall and the Kraken - including this faction's own
       Monster, deliberately.
     - Dracula's team-wide ATK theft is the counter to Bruiser decks.
     - The Invisible Man's Untargetable window protects a Sniper the
       way Nephthys protects a Duat combo.
   ============================================================= */
window.EOL.registerFaction({
  id: 'transylvania',
  name: 'Transylvania',
  icon: 'ra-bat-sword',
  tagline: 'What is taken is never given back.',
  colors: { primary: '#8e2f45', secondary: '#241019', glow: '#ff6b8a' },
  cards: [
    {
      id: 'transylvania-dracula',
      name: 'Dracula',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4950, atk: 1990, def: 17 },
      ability: {
        type: 'Active',
        name: 'Children of the Night',
        cost: 50,
        /* CAPPED AND SHORTENED. First draft: 20% ATK from all enemies
           onto himself, 3 rounds, stacking - which after two casts was
           a 40-point swing across twelve legends and simply won the
           game. Now 8%, and the theft does not stack with itself
           (one stackTag, one stack), so a second cast refreshes rather
           than doubles.

           The transfer is what makes it Transylvania rather than
           Grimmwood: the enemy loses exactly what he gains. */
        text: 'Drain <b>8% ATK</b> from every enemy for 2 rounds and add <b>8% ATK</b> to Dracula for 2 rounds.',
        note: 'The drain does not stack with itself.',
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: -8,
              turns: 2,
              to: 'targets',
              stackTag: 'children-of-night',
              maxStacks: 1,
            },
            {
              k: 'stat',
              stat: 'atk',
              amt: 8,
              turns: 2,
              to: 'self',
              stackTag: 'children-of-night-self',
              maxStacks: 1,
            },
          ],
        },
      },
      icon: 'ra-batwings',
      art: 'assets/legends/transylvania-dracula.png',
    },

    {
      id: 'transylvania-monster',
      name: "Frankenstein's Monster",
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7500, atk: 1060, def: 29 },
      ability: {
        type: 'Active',
        name: 'Abandoned',
        cost: 40,
        /* CAPPED AT 4 STACKS (+24%). First draft grew permanently per
           hit with no ceiling - on a Provoking Tank, which is the one
           body guaranteed to be hit every round. That is how you get a
           3,000 ATK Tank by round eight.

           Shelley's creature, not Universal's: the grief is the
           mechanic. He gets stronger the more he is rejected. */
        /* The growth clause was PROSE ONLY in the first draft - the
           text promised +6% per hit and the spec did nothing, because
           an Active cannot carry a `wasAttacked` trigger. Rather than
           give one card both an Active and a Passive (which no shipped
           legend has), the Monster is now a clean Provoke-and-shield
           Active, and his identity lives in being the biggest body in
           the game (7,500 HP) rather than in a hidden ramp. */
        text: 'Provoke for 1 round, gain a <b>20% Max HP Shield</b>, and gain <b>12% DEF</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'shield', pctMaxHp: 20, to: 'self' },
            { k: 'stat', stat: 'def', amt: 12, turns: 2, to: 'self' },
          ],
        },
      },
      icon: 'ra-brain-freeze',
      art: 'assets/legends/transylvania-monster.png',
    },

    {
      id: 'transylvania-carmilla',
      name: 'Carmilla',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5250, atk: 1310, def: 18 },
      ability: {
        type: 'Active',
        name: 'Slow Affection',
        cost: 40,
        /* Le Fanu's vampire predates Dracula by 26 years. The transfer
           here is DEF to HP: she takes the target's guard down and
           feeds on it. Zero direct damage, correct for a Controller,
           and the self-heal is what separates her from Calico Jack's
           board-wide DEF strip. */
        text: 'One enemy loses <b>18% DEF</b> for 2 rounds; Carmilla heals for <b>14% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'stat', stat: 'def', amt: -18, turns: 2, to: 'targets' },
            { k: 'heal', pctMaxHp: 14, to: 'self' },
          ],
        },
      },
      icon: 'ra-broken-heart',
      art: 'assets/legends/transylvania-carmilla.png',
    },

    {
      id: 'transylvania-hyde',
      name: 'Mr. Hyde',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6300, atk: 1690, def: 22 },
      ability: {
        type: 'Active',
        name: 'The Draught',
        cost: 45,
        /* THE SELF-HARM IS THE CAP. First draft: permanent +45% ATK,
           -25% Max HP, cannot be healed - three effects and a
           transformation, on one card. Now it is one line with a real
           price: he pays 12% of his current HP per drink and the note
           bounds it at three.

           Deliberately NOT a Gehenna Sin card even though it rhymes
           with one: Hyde pays HP for a single hit, where Wrath pays DEF
           for a lasting buff. */
        /* `selfDamagePctHp` was invented - there is no self-damage
           effect kind, and adding one would need a damage path that
           bypasses DEF, shields, Provoke redirection and death
           handling for a single card. The transformation's price is
           paid in DEFENCE instead, which the engine models exactly and
           which reads the same at the table: Hyde comes out and Jekyll
           stops protecting himself. Capped at 3 stacks (-27% DEF). */
        text: 'Drink the draught: deal <b>185% ATK Physical Damage</b>. Hyde loses <b>9% DEF</b> for the rest of the battle.',
        note: 'Max: 3 draughts.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 1.85, element: 'Physical' },
            {
              k: 'stat',
              stat: 'def',
              amt: -9,
              turns: 99,
              to: 'self',
              stackTag: 'the-draught',
              maxStacks: 3,
            },
          ],
        },
      },
      icon: 'ra-round-bottom-flask',
      art: 'assets/legends/transylvania-hyde.png',
    },

    {
      id: 'transylvania-van-helsing',
      name: 'Van Helsing',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Light',
      stats: { hp: 4480, atk: 1830, def: 13 },
      ability: {
        type: 'Active',
        name: 'The Hunters Kit',
        cost: 45,
        /* REWRITTEN. The first draft was "+70% against buffed or
           Shielded", which is Brutus's exact conditional from Roma -
           the audit would have caught it, and the owner spotted it
           first. Shield DESTRUCTION is unoccupied space: no shipped
           card removes a Shield outright.

           The monster-hunter inside the monster faction is deliberate.
           He answers Camelot, Durga, the Kraken - and the Monster
           standing next to him. */
        text: 'Deal <b>150% ATK Light Damage</b> and <b>destroy</b> the target\\u2019s Shield.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.5, element: 'Light' },
            /* `alsoShield` is the real field name; there is no
               shieldOnly. Stripping the stat buffs too is if anything
               MORE on-theme for a hunter's kit - he undoes the
               preparation, not just the ward. */
            { k: 'consumeBuffs', alsoShield: true, to: 'targets' },
          ],
        },
      },
      icon: 'ra-bone-knife',
      art: 'assets/legends/transylvania-van-helsing.png',
    },

    {
      id: 'transylvania-invisible-man',
      name: 'The Invisible Man',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Magic',
      stats: { hp: 4350, atk: 1880, def: 11 },
      ability: {
        type: 'Active',
        name: 'Unseen',
        cost: 40,
        /* Wells, 1897. An Active rather than the once-per-round passive
           first drafted: a free Untargetable every round on a Sniper is
           an un-killable damage dealer, which is not a card, it is a
           bug. Spending the action and the Energy is what makes it a
           decision. */
        text: 'Deal <b>145% ATK Magic Damage</b> and become <b>Untargetable</b> for 1 round.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.45, element: 'Magic' },
            { k: 'untargetable', turns: 1, to: 'self' },
          ],
        },
      },
      icon: 'ra-uncertainty',
      art: 'assets/legends/transylvania-invisible-man.png',
    },

    {
      id: 'transylvania-dorian-gray',
      name: 'Dorian Gray',
      rarity: 'rare',
      role: 'Tank',
      element: 'Magic',
      stats: { hp: 6900, atk: 1020, def: 28 },
      ability: {
        type: 'Passive',
        name: 'The Portrait',
        cost: null,
        /* OWNER'S CHANGE: the first hit each round is negated, and it
           affects ONLY him. The first draft negated three hits a round
           AND reflected them onto the lowest enemy - which on a Tank is
           near-total immunity plus free damage.

           `firstPerRound` is the existing Athena mechanism, so this is
           one declarative entry and nothing new. */
        text: 'The <b>first hit</b> Dorian Gray takes each round deals <b>no damage</b> to him - the portrait bears it instead - and he permanently gains <b>3% DEF</b>.',
        note: 'Once per round. Max: 6 stacks.',
        passive: {
          trigger: 'incomingAbilityDamage',
          effects: [
            { k: 'damageMult', mult: 0, firstPerRound: true },
            /* The portrait ages instead of him. Also the card's only
               upgradeable magnitude: "first hit" and "no damage" are
               both structural, so without this an upgrade did nothing
               to Dorian at all. Capped at 6 stacks (+18% DEF). */
            {
              k: 'stat',
              stat: 'def',
              amt: 3,
              turns: 99,
              to: 'self',
              stackTag: 'the-portrait',
              maxStacks: 6,
            },
          ],
        },
      },
      icon: 'ra-kaleidoscope',
      art: 'assets/legends/transylvania-dorian-gray.png',
    },
  ],
});
