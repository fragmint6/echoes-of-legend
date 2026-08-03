# Reddit Posts That Ask A Real Question

Companion to `REDDIT-PLAN.md`. You're right that this framing beats "play my
game," so this file replaces the promo drafts for the discussion subs.

---

## Why this works, mechanically

"Play my game" asks a stranger for **20 minutes on spec**. Almost nobody pays
that to an unknown dev.

"Here's a design problem, what do you think" asks for **an opinion**, which
costs 30 seconds and which Reddit hands out for free constantly. Some
fraction of people who answer will click the link to check whether their own
answer was right. That click is voluntary and warm rather than solicited and
cold.

Three rules that keep it honest, because a fake question reads as a fake
question:

1. **The question must be one you cannot answer yourself.** If you already
   know the answer, people smell the ad.
2. **Post the actual numbers.** Specifics are the entire reason a thread gets
   replies. Vague questions get vague non-answers.
3. **The link goes at the bottom, framed as optional.** If the post only
   makes sense after clicking, it's an ad wearing a costume.

The good news: you have a genuinely unresolved question sitting in your data.

---

## The finding to build on

Measured against the live roster just now:

- **9 of 57 heroes are `common`** (15.8%)
- **7 of those 9 commons are Passives** (no Energy cost, always on)
- In the last balance run, **3 of the 4 most-banned heroes were commons**:
  Maid Marian (97.6%), Spartacus (96.6%), Snow White (93.0%). Susanoo, 4th at
  92.2%, is `rare`.
- Every one of the four is a **Tank or a Medic**. None is a damage dealer.
- Legendaries average the highest ATK on the roster (1,711 vs 1,274 for
  commons) and are **not** the ones getting banned.

So: the cheapest, plainest cards in the game are the ones players refuse to
let their opponent keep, and the flashy expensive ones aren't.

**Important caveat you must include in the post:** those ban rates come from
a run that predates several balance fixes, and the numbers have not been
re-measured on the current build. Say so. Someone will ask, and pre-empting
it is worth more than the tidier claim.

### Why this is a real question

There are at least three explanations and I can't tell you which is true:

1. **Passives are undercosted by construction.** An Active competes for
   Energy every round. A Passive costs nothing forever. 7 of 9 commons are
   Passive, so "commons are overtuned" may really be "Passives are
   overtuned."
2. **Sustain beats damage in a 6v6 with no clock.** All four are Tanks or
   Medics. If nothing forces the game to end, the team that refuses to die
   wins, and damage is the loser's stat.
3. **Bans are cheap so they go to the safest target.** You only get 2 bans.
   Maybe banning a reliable always-on Passive is simply lower variance than
   banning a big Active that might never get cast, and this says nothing
   about raw power.

That's a genuine three-way fork. Post it.

---

## Post 1 - the main one

**Where:** r/gamedev, then r/BoardgameDesign or r/tabletopgamedesign a few
days later (the question is system design, not code, so it travels).

> **Title:** In my card game, the three most-banned characters are all commons, and the legendaries are safe. I can't tell if that's a bug or the correct outcome.

```
Solo dev on a 6v6 team battler. 57 characters, four rarities. Both players see each other's roster and ban 2 before the match.

I ran a few thousand simulated matches with an AI doing the banning, and the ban rates came out like this:

- Maid Marian (common) - 97.6%
- Spartacus (common) - 96.6%
- Snow White (common) - 93.0%
- Susanoo (rare) - 92.2%

Not one legendary in the top tier. My legendaries have the highest attack on the roster by a wide margin (1,711 average vs 1,274 for commons) and nobody wants to ban them.

Some structure that might explain it: only 9 of my 57 characters are common, and 7 of those 9 have passive skills - no cost, always on, no button to press. Everything else costs energy and competes with the rest of your turn. Also, every single one of the four above is a tank or a healer. Zero damage dealers.

I can think of three explanations and I genuinely don't know which one it is:

1. Passives are structurally undercosted. A passive is free forever, an active is a real opportunity cost every round. "Commons are too strong" might actually be "passives are too strong" and rarity is a red herring.

2. Sustain beats damage when there's no clock. My matches end when one team is wiped, with no turn limit and no fatigue. If nothing forces an ending, maybe the team that won't die always wins and damage is just the losing stat.

3. Bans go to the safest target, not the strongest. You only get 2. An always-on passive is guaranteed value, a big expensive active might never get cast. Low variance beats high ceiling when you're only allowed two picks - and if that's it, then the ban data isn't measuring power at all and I've been reading it wrong.

If it's #1 I need to price passives. If it's #2 I need a clock. If it's #3 I need to stop treating ban rate as a power metric. These are very different amounts of work and I'd rather not guess.

Has anyone dealt with the passive-vs-active costing problem specifically? Every solution I can think of (give passives a activation cost, cap them per team, make them scale down over rounds) feels like it kills what makes a passive feel good, which is that it just works.

Also happy to be told the honest answer is "your healers are overtuned and the rarity thing is a coincidence."

Fair warning on the data: those numbers are from a run that predates a few balance fixes and I haven't re-measured on the current build yet. Take them as directional.

If it helps to see it, the game is free in a browser, no download: https://fragmint6.web.app/echoes-of-legend/
```

**Why this one will do work:** the passive-vs-active costing problem is a
thing designers argue about, so people with no interest in your game still
have a take. And it flatters the reader by handing them a puzzle rather than
a pitch.

---

## Post 2 - the sampling problem

**Where:** r/gamedev, or r/statistics if you strip the game framing entirely.
Space it 1 to 2 weeks from Post 1.

> **Title:** I wanted to know which pairs of characters are too strong together. The math says random sampling can never tell me.

```
57 characters, 6 per team. I wanted pair-level balance data - which two characters are broken when drafted together.

Obvious approach: run a lot of randomised matches, look at win rate per pair.

57 characters is 1,596 possible pairs. Each match only shows you 30 of them (6 choose 2 per side, times 2 sides). So coverage is thin, but I figured volume would fix it.

It does not. At 1,200 games I measured:
- median 21 games per pair
- best-covered pair: 39 games
- pairs with 40+ games: zero

To get a usable confidence interval on a pair you want a few hundred games of it. Scaling up doesn't save you either, because every game you add spreads across all 1,596 pairs at once. The coverage stays flat while the runtime doesn't.

What I switched to: a forced-inclusion phase that pins a specific character into a deck and guarantees it gets fielded, then measures directly. Sampling answers "how is the meta doing," forcing answers "is this specific thing broken." They're different questions and I'd been using the wrong tool for the second one.

One trap worth flagging if you build something similar: my parallel runner was silently dropping command-line flags. Three separate times I had runs that looked configured and weren't - it reported the settings I asked for while running the defaults. Any harness that forwards arguments to workers should echo back what it actually ran and assert it matches the request. I now throw if they differ.

Second trap: forcing a character into the deck wasn't enough, because fielding is a second decision the draft AI makes. 17 of my 57 forced characters never played a single game. The pin has to reach the board, not just the deck.

The game is a free browser thing if the context helps: https://fragmint6.web.app/echoes-of-legend/
```

---

## Post 3 - the short one for player subs

r/WebGames and the indie subs still want the game itself, not an essay. But
the same framing works in miniature: lead with the interesting decision, ask
a question, and let the link be the answer.

> **Title:** Both players see each other's full roster and delete two characters before the match starts. Is the ban phase the best part of drafting or the most frustrating?

```
Free in a browser, no download: https://fragmint6.web.app/echoes-of-legend/

You bring 12 characters, your opponent brings 12, you both see everything, and you each ban 2 of theirs. Then you field 6 across a front and back row and fight.

Building it, the ban phase turned out to be my favourite part - it's the only moment where you're reasoning about what they'll do rather than what you want. But I've also watched a playtester get their whole plan deleted by two bans and visibly deflate, and I'm not sure whether that's good tension or just bad feelings.

So the actual question: in games you've played with a ban phase, does it make drafting better or does it mostly feel like being told no?

57 characters across 9 folklore factions, AI opponent, and real-time PvP if you want it. First demo, so balance takes and bug reports are extremely welcome.
```

---

## What to do in the comments

This is where the Discord joins actually come from, not the post body.

- **Answer every reply, including the harsh ones.** Especially the harsh
  ones. Visible willingness to take criticism is the single most persuasive
  thing in a feedback thread.
- **When someone gives a good answer, say what you're going to do about it.**
  "That's #2 and you're probably right, I'm going to test a round cap this
  week" converts a commenter into someone with a stake.
- **Only then mention the Discord**, and only as a place to continue: "I'm
  posting the results of that test here if you want to see whether you were
  right: [link]". That's an invitation to see the payoff, not a plug.
- **Do not link the Discord in the post body** on r/WebGames - their rules
  require the post link to be the game itself.

---

## Honest expectations

Post 1 is the strongest thing you have, but "strong" for a solo dev on
r/gamedev means maybe 30 to 80 upvotes and 15 to 40 comments on a good day.
The value isn't the traffic, it's that the people who comment are
self-selected for caring about balance design - which is precisely the
feedback you said you need and precisely the person worth having in a Discord
of 5 people.

Also worth saying plainly: **the answer you get back might make you change the
game.** If three separate people tell you the real problem is no round limit,
that's a real finding, and it's worth more than any number of installs.
