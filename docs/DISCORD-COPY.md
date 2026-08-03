# Discord Copy - First Demo Release

Three ready-to-paste messages, one per channel. Discord markdown throughout
(`**bold**`, `#`/`##` headers, `>` quotes, `-#` subtext). No em dashes.

Everything factual below was checked against the shipping build: 57 heroes,
9 factions, 6 roles, 10 battlefields, 2 bans, teams of 6 from decks of 12.

---

## #about

```
# Echoes of Legend

A browser-based tactical card battler. Six heroes a side, drawn from world folklore, on a battlefield that changes the rules.

**How a match works**
- Bring a deck of **12 heroes**, or draft one from nothing pick-by-pick
- **Ban 2** of your opponent's heroes once you see their deck
- Field **6** of your remaining 10 across a front and back row
- Fight it out in energy-gated rounds until one side is wiped

**The roster**
57 heroes across 9 factions. Camelot, Olympus, Sherwood, Grimmwood, Yamato, Huaxia, Roma, Takamagahara and Duat. King Arthur, Zeus, Robin Hood, Red Riding Hood, Susanoo, Nezha, Spartacus, Izanagi, Ma'at and 48 more.

Every hero has one **Signature Skill** that is theirs alone, plus a **Basic Skill** from their role. Six roles: Tank, Bruiser, Sniper, Caster, Controller and Medic. Skills cost Energy, Energy grows each round, so round 1 and round 6 are different games.

**Where the depth is**
Placement matters. Front row eats what the back row would have taken, and a Tank that Provokes drags shots away from the people you actually need alive. Ten battlefields bend the numbers: The Mana Spring pours in extra Energy, The Energy Void starves it, The Colosseum stays neutral. Shields, Marks, Exposed and stacking buffs chain across heroes, so the right pair is worth more than the sum of two good cards.

**Modes**
- **Classic** and **Draft** against the AI
- **Ranked Draft** and **Ranked Classic** against real players
- Campaign is planned, not built

Free, no install, no download. Runs in the browser on desktop or phone.

**Play:** https://fragmint6.web.app/echoes-of-legend/
```

---

## #announcements

```
# First demo release is live

https://fragmint6.web.app/echoes-of-legend/

Echoes of Legend is playable in your browser right now. No download, no install, free.

**What's in it**
- 57 heroes, 9 factions, 6 roles
- **Classic** and **Draft** vs the AI
- **Ranked Draft** and **Ranked Classic** vs real players (needs a free account)
- 10 battlefields that each change how a match plays

**What I actually need from you**

**Balancing.** This is the big one. I've fixed some genuinely broken stuff already, including a shield stack that a playtester grew to **13,000** before it stopped, but the roster has not been fully re-measured since. If a hero feels unbeatable, or feels like a wasted pick, tell me. Screenshots and "here's the team I lost to" are gold. So are ban patterns: if you ban the same hero every single game, that hero is a problem.

**Bugs.** Anything visually broken, any softlock, anything that reads wrong. Tell me your browser and whether you're on desktop or phone.

**Anything else.** Confusing UI, unclear Skill text, a mode you wish existed, a hero you want in the game. All of it welcome.

**Known rough edges, so you don't have to report them**
- Refreshing mid-battle forfeits the match. Draft and ban phases rejoin fine, the battle itself does not.
- No trophies or ladder yet. Ranked is ranked in name only for now.
- Campaign is a placeholder button.
- Multiplayer has only been tested on good connections. Bad wifi is genuinely uncharted.

Drop feedback in this server. Every report gets read.
```

---

## #planned

```
# Planned

Roughly in the order I intend to build it. Nothing here is promised, and community feedback moves things around.

## Next up
- **Trophies and a real ladder.** The table exists, nothing writes to it yet. Needs server-side verification first, otherwise players can hand themselves rank.
- **Balance pass on measured data.** I have a simulator that plays thousands of games with bans and draft AI. The demo build has not been through a full run. First one goes out as public notes with actual win rates, not vibes.
- **Rejoin mid-battle.** Right now a refresh during combat forfeits. Same work as the anti-cheat above.

## After that
- **Faction Trials.** Short gauntlets, one per faction, with a fixed deck so you're forced to learn how that faction actually works. Ends by granting you the deck.
- **Daily Puzzle.** One fixed board, one solution, same for everyone, one attempt a day.
- **Sound.** There is currently none.
- **Disconnect and reconnect handling** that isn't just a forfeit.

## Further out
- **Campaign.** Deliberately parked. Hand-authored fights get solved once and then never replayed, so it competes for time with the part of the game that has replay value. It comes back only if there's a version worth playing twice.
- **Packs, currency, unlockable heroes.** Deliberately parked too. Locking the roster behind a grind on a demo with a small player base makes matchmaking worse, not better. Everyone gets all 57 heroes for now.
- **More factions.**

## Not planned
- Paid anything. It's free.

Want something moved up this list? Say so. A demo this early is exactly when priorities are cheap to change.
```

---

## Notes for posting

- Discord renders `#` and `##` as headers only at the **start of a line**, so
  paste each block whole and don't indent it.
- The three blocks are 1,650 / 1,720 / 1,660 characters, all comfortably under
  the 2,000-character message limit. No splitting needed.
- If you turn `#about` into the channel description instead of a message, the
  short version is: *"A free browser card battler. Six folklore heroes a side,
  57 to choose from, ban your opponent's best two, then fight."*
