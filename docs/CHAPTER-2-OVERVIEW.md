# Chapter II — The Hundred-Year Truce: Complete Overview

*The chapter bible: premise, the ten bouts, the plot beats in order,
difficulty design, rewards, and what each rival teaches. Written
2026-08-18. Companion doc: `LORE-Campaign-Chapter2.md` (the full
narrative prose, which is the source of truth for anything that
disagrees with this page).*

> **Status: DESIGN ONLY.** Chapter One's overview was written *against
> the shipped implementation*. This one is not. There is no
> `data/campaign-ch2.js`, no stage recipes, no scripted lines, no rival
> decks in code, and nothing here has been through `sim/campaign_soak.js`.
> Every win-rate figure below is **authored intent**. Chapter One's
> equivalents moved substantially during tuning and these will too.

---

## 1. The Frame

**Same Wayfarer. New story. No prerequisites.**

The player is still the Wayfarer — still an Echo, still nameless, still
collecting legends. That identity is why this is Chapter Two and not a
different game. The *plot* does not carry: no Road, no gates, no
Recruiter, no Quiet, no Gilgamesh. Chapter One was a closed story and it
stays closed.

One carried fact, stated once and never leaned on:

> The Wayfarer walks out of one story and into the next with no name of
> their own, and a habit of collecting people who have one.

**Deliberately a different shape:**

| | Chapter One | Chapter Two |
|---|---|---|
| Structure | a pilgrimage — ten gates, forward, alone | a **tournament** — one city, one week |
| Question | does my story deserve to last? | **who owns a story once it lasts?** |
| Tone | elegiac, quiet, sad | loud, political, funny, then not |
| Antagonist | grief with teeth | **an institution, and the decent people inside it** |
| The Wayfarer is | a blank being tested | a **nobody who files paperwork** |
| Stages | ten gates, I–X | ten bouts, XI–XX |
| Exams | two (V, IX) | one (XV) |

---

## 2. The Premise

Every hundred years, in a city that exists for one week and is
dismantled afterwards, the dead hold **the Concord** — a tournament that
settles the only thing the dead still genuinely disagree about: *whose
version is true.*

Stories drift. The living retell them and every retelling edits. A
century ago that argument was settled with knives in the street; now it
is settled in an arena. One week, one ruling. The winner holds **the
Canon** for a hundred years — the authority to say how every contested
legend is remembered.

**It has worked. That is the problem.**

### The petitioner

**Sargon** — no relation to the king, and that is the joke of his whole
afterlife — was a mercenary captain. Four hundred years ago a careless
scribe attached his name to another man's victories, and the Canon has
said ever since that he was a hero.

He has petitioned **eleven times** to have it corrected. He has lost
eleven times, because the question is *embarrassing*: nobody wants to
open how many other entries are wrong.

He is also going **thin** — what happens to an Echo whose true story
nobody carries. Within the year there will be a hero in the Canon and
nobody behind it. A petitioner must fight his own bout, and he can no
longer lift a sword.

So he goes looking for someone whose entire nature is carrying other
people's stories.

> "You've no name of your own. I've a name that isn't mine. Between us
> that's almost one honest man. Fight my twelfth."

---

## 3. The Plot, in order

The chapter runs as one week in one city. Beats, not stages:

1. **Arrival (before XI).** The Wayfarer files the twelfth petition with
   no name, no patron and no standing. It is accepted because nobody can
   find a rule saying it cannot be.
2. **Days one to four (XI–XIV).** Four bouts, four opponents with four
   different reasons to be in the way — none of whom is a villain. The
   only crack appears at **XIII**, where the incumbent's own herald is
   handed a ruling that would win his bout and *refuses it*, without
   explanation. Nobody understands why yet.
3. **XIV pays out the record.** The Collector's vault holds the original,
   unedited account of Sargon's war. Beating her is how you get it.
4. **XV — THE TURN.** The record says **he did it.** Not the Canon's
   version, but the load-bearing fact is true: he held a bridge for two
   days with forty people, eleven hundred civilians crossed behind him,
   and he died on the second afternoon in a way that was neither noble
   nor quick.

   The Canon did not invent his heroism. It **tidied** it. It removed the
   forty names. It removed the vomiting, the sergeant he held at
   knifepoint to keep the line, and the fact that he was on that bridge
   at all because he had misjudged the retreat and was too proud to say
   so.

   **The eleven petitions look different now.** He was never correcting a
   record. He was **refusing a compliment**, for four centuries, because
   accepting it meant accepting the forty men his pride killed.

   He withdraws the petition. He is entitled to. The Wayfarer takes it
   over — which, by Concord procedure, means fighting **the version of
   him that is in the book**. See bout XV.
5. **Days five to seven (XVI–XVIII).** Three bouts that are really three
   arguments about what you should do with the truth you now have:
   burn the institution (XVI), reform it on a schedule (XVII), or steal
   it outright (XVIII). Two of them are reachable **bad endings**.
6. **XIX — the audit.** An auditor nobody has needed in four hundred
   years opens the book. The holders **did not forge the entry** — a
   scribe did, carelessly, exactly as Sargon has always said. But they
   **found the error two centuries ago and buried it**, because admitting
   the Canon contains errors would collapse the impartiality their whole
   claim rests on. The herald's refusal on day three now makes sense: he
   was never told why, and he declined to win anyway.
7. **XX — the final.** The Redactor, who knew for two hundred years and
   suppressed it, and who will tell you to your face exactly why.
8. **The ruling.** You hold the Canon. Three doors. See §6.

---

## 4. The Ten Bouts

Every rival is **a person with a trade**, not a faction — Chapter One's
law. What they field is a consequence of how they fight. The lore never
names a faction as a faction; §7 of the lore doc is the implementation
note that maps them.

Every rival also **demonstrates the faction they hand over**, legendary
first, exactly as the Outlaw sells Sherwood with Robin Hood.

### XI — THE UNDERSTUDY · *day one, the opening bout*
- **Who.** A fixer's fighter with no patron and no purse, who takes money
  to lose the opening bout convincingly. Honest work; she is very good at
  it; she has done it at three Concords.
- **Why she fights properly anyway.** She has read all eleven petitions —
  the only person alive or dead who has. She thinks he is right, and she
  was paid for a loss, **not for an insult**.
- **Gimmick — nothing on her board is finished yet.** Mortals, no god
  among them, every one *ascending* mid-fight: a permanent one-time
  upgrade that fires when the fight gives it a reason. **Achilles** is an
  ordinary Bruiser until something hurts him, and permanently better
  after.
- **Lesson.** Do not evaluate her board on turn one. The legends you
  ignored are the ones that kill you.
- **Bans** your two most expensive cards. **Unlocks** Achaea.
- **Reward.** Odysseus + Atalanta, coin, and the first person in four
  hundred years to take the petition seriously.

### XII — THE BOOKMAKER · *day two, the fixer*
- **Who.** The Concord's bookmaker, running the betting openly from a
  table nobody has asked him to move, chalking every price where the
  crowd can read it. A tax farmer in life. Being owed is the only form of
  being needed he has ever managed.
- **Why.** He offers to *fund* the petition — filing costs, witnesses,
  the whole week — for a debt payable later, terms unspecified.
  **Accepting is available**, wins the easiest run, and is one of the two
  bad endings.
- **Gimmick — everything has a price tag.** Seven appetites, each buying
  its power with a stated, visible cost. **Pride** casts the largest
  sweep in the chapter and cannot be healed for two rounds after.
- **Lesson.** Every one of those costs is *information*. A board that has
  told you what each card is spending is a board you can plan around — if
  you read it, which is his whole point about bettors.
- **Bans** your cheapest card. **Unlocks** Gehenna.
- **Reward.** Greed + Envy, coin.

### XIII — THE HERALD · *day three, the incumbent's second*
- **Who.** The Canon's holders don't fight their own early bouts; they
  send the man who walks out first and reads what is about to happen,
  then does it. Honest, unimaginative, wholly sincere. He believes four
  hundred years of rulings have been fair and has never checked, because
  it has never occurred to him that checking is a thing one does.
- **Why.** Instructed to make the petition go away quickly. Given no
  reason. **Did not ask** — and that incuriosity is the entire character.
- **The seam.** Mid-bout an official hands him a ruling that would win
  it. He refuses, offers no explanation, fights on, and loses. This is
  the chapter's first crack and it is not explained until XIX.
- **Gimmick — he tells you exactly what is coming and it still lands.**
  Damage is *scheduled* a round or two out, in the open. **Lucifer**
  pronounces a board-wide sentence two rounds early, paid for out of his
  own ability to be healed.
- **Lesson**, and nobody expects it: **you beat this by cancelling, not
  by racing.** Out-damaging a scheduled hit loses; removing the caster or
  clearing the pending effect means you never take it.
- **Bans** your fastest card. **Unlocks** Empyrean.
- **Reward.** Azrael + Raphael, coin, and a question that cannot be
  un-asked.

### XIV — THE COLLECTOR · *day four, the archive*
- **Who.** She keeps things — not her things, *everyone's*. Nine
  traditions have collapsed since she started and she has the whole of
  each, catalogued, in a vault under a city that is dismantled every
  hundred years and rebuilt around her. She is genuinely the reason half
  the dead still exist.
- **Why.** The original account of Sargon's war is in her vault. She will
  not lend, sell or copy it, because everything she has was saved by
  refusing exactly those three requests from more sympathetic people than
  a nameless Echo with a petition.
- **Gimmick — she does not remove your advantages, she keeps them.**
  Every buff, shield and stat swing she strips **reappears on her side**.
  **Dracula** drains ATK off your whole team and wears it.
- **Lesson.** Against her, **setup is a liability**. Opening with a big
  buff turn hands her the fight; commit late, or commit to something she
  cannot carry.
- **Bans** your cleansers. **Unlocks** Transylvania.
- **Reward.** Carmilla + Dorian Gray, coin, **and the record**.

### XV — THE HERO OF THE BRIDGE · *day four at night · **the exam***
- **What happens first.** The record scene (§3, beat 4). Sargon
  withdraws the petition.
- **Who you fight.** Concord procedure: a claimant may take over an
  abandoned petition by defeating **the version of the petitioner that is
  in the book**. Not the man — the *entry*. The Canon's Sargon walks out:
  the speech, the banner, the last stand, forty men who are not named
  because the entry does not name them. It is a very good fighter,
  because it was written to be. The real Sargon watches from the rail.
- **Gimmick — there is nothing to exploit.** The one bout with no trick
  in it, because it is the exam. Every card is *tidied*: no seam, no
  cost, no tell, nothing overstated and nothing left ragged. All four
  habits the week has taught you apply and **none of them wins alone**,
  because there is no exaggeration to punish.
- **Format.** Authored 3/3/3/3 across the four decks taught so far,
  adaptive fielding, best-of-three on ground already walked. Chapter
  One's Warden shape.
- **Lesson.** The Warden lesson restated: not whether you can win once,
  but **whether you can change between games.** The entry sideboards.
- **Bans** nothing in game one, then your winning card in games two and
  three — the record adjusting to what you have shown it.
- **Unlocks** no faction (it is the exam). **Reward:** choice of two
  echoes from the four decks taught so far, larger purse, and the record
  notarised and admissible.
- **Afterwards.** Sargon does not thank the Wayfarer. He says the forty
  names out loud, in order, for the first time since the bridge. It takes
  some minutes. He gets two of them wrong and has to check.

### XVI — THE UNDERTAKER · *day five, the abolitionist* · **ELITE**
- **Who.** An undertaker as a profession, not a figure of speech: he
  buried a world once, a proper ending, prophesied and attended, with a
  field growing back afterwards. He has never forgiven the Concord for
  what it does instead — legends propped up past their natural death,
  retold, re-edited, never permitted to *finish*.
- **Why.** He has read the record too. He thinks the honest answer is a
  bonfire, not a correction, and will not back a petitioner asking for
  one tidy line in a book that should not exist.
- **Gimmick — his deck gets better as the board empties.** Every card
  reads the number of legends that have fallen *on either side* and
  scales off it; he is deliberately below curve while the board is full.
  **Odin's** sweep is ordinary until three have fallen. Fenrir is chained
  to half damage until the third death, then permanently off the leash.
- **Lesson**, the nastiest reframe in the chapter: **trading evenly is
  the losing line.** Every exchange you win makes his board stronger.
  Close before the third death or refuse the trade entirely.
- **Bans** your healers, so you cannot outlast the ramp. **Unlocks**
  Jotunheim.
- **Reward.** Odin + Fenrir, coin, **and the objection the ending has to
  answer**.

### XVII — THE MASON · *day six, the reformer*
- **Who.** A mason from back when that was the whole of her — she built
  the retaining wall the Concord's floor sits on, one course at a time,
  and has never seen the point of laying a stone before the bed under it
  is true. She has come to every Concord for eleven centuries with the
  same proposal: the Canon should expire **yearly**. Obviously fairer,
  completely unworkable, never once reached a vote.
- **Why.** She offers her influence behind your petition in exchange for
  your public backing of annual revision — a policy you think would wreck
  the thing you are trying to fix. The cleanest bad bargain of the week.
- **Gimmick — nothing on her board kills anything by itself.** Strictly
  two-part: one card marks, another spends the mark, neither half worth a
  turn alone. **Shiva** does ordinary damage to an unmarked target and
  the biggest hit in her twelve to a marked one.
- **Lesson.** **Kill the setup, not the threat.** Every instinct says
  answer the scariest card; against her that is exactly wrong.
- **Bans** your finishers, so you cannot skip the lesson with a bigger
  hammer than she has a combo. **Unlocks** Devaloka.
- **Reward.** Ganesha + Kali, coin.

### XVIII — THE WRECKER · *day seven at night, the theft*
- **Who.** A wrecker in the trade sense: she works the coast where things
  go down and takes off what floats before the sea gets it, and has never
  considered that stealing. Her position has always been the honest one —
  the Canon is loot, and the only reason nobody has taken it in a hundred
  years is that everyone agreed not to. Tonight she stops agreeing.
- **Why.** Not over the theft — she *offers* you the book, genuinely, no
  trick. A stolen Canon is worthless to someone nobody will trade with,
  and she has worked out its value was never the object. She wants you to
  **use** it before the ruling. That wins the correction by theft, in
  front of everyone: the second bad ending, and the more tempting one.
- **Gimmick — she steals tempo rather than removing it.** Buffs, energy,
  shields, a revive you were counting on: none destroyed, all changing
  hands. **Blackbeard** headlines with a board-wide burn worth more the
  more of your team is already committed.
- **Lesson.** The opening turn you spend preparing is the one she profits
  from. She is the direct counter to every habit the Mason just taught
  you, which is why she is scheduled the night after.
- **Bans** your buff support. **Unlocks** Tortuga.
- **Reward.** Anne Bonny + Davy Jones, coin, **and a decision**.

### XIX — THE AUDITOR · *morning of the final, unscheduled* · **ELITE**
- **Who.** A functionary of an empire that no longer exists. When it
  dissolved its bureaucracy left exactly one office standing: an auditor
  with the standing to examine the Canon's provenance, and no petitioner
  in four hundred years to ask him to. He has kept the office. He has
  kept the *hours*. Four thousand mornings in a room nobody enters.
- **Why.** Because somebody finally files — and because a petition
  granted without proof of competence is overturned within a century, so
  he tests the petitioner before opening the book. *"I will not have my
  first audit in four hundred years thrown out on procedure."*
- **What the audit finds.** §3, beat 6 — the burial, and the explanation
  for the herald's refusal.
- **Gimmick — he does not start anything.** The entire twelve is built to
  *answer*, with a reply to each of the eight things the chapter has
  taught you. Provoke a wall and **Guan Yu** counter-hits; commit a combo
  and **Zhuge Liang** drains the energy paying for it; hide behind a
  front line and **Sun Wukong** goes over it.
- **Lesson**, and it is the exam's harder sibling: **you cannot win this
  on a plan.** Every plan has a counter on his side, so the fight is
  decided by which of your habits you are willing to abandon.
- **Bans nothing** — the only rival in the week who doesn't. *"Bring your
  best. I have been bored for four thousand years."* **Unlocks Huaxia**,
  the withheld faction.
- **Reward.** Guan Yu + Zhuge Liang, coin, **and standing to be heard**.

### XX — THE REDACTOR · *the Concord floor, everyone watching* · **BOSS**
- **Who.** The voice that has read every ruling for four hundred years —
  and, quieter, the hand that decided which lines were read at all.
- **Why he is hard: he is not a hypocrite.** He knew for two centuries.
  He suppressed it. He will say why to your face: an institution that
  admits fallibility stops being obeyed, an unobeyed Canon means the
  knives come back to the street, and he *watched* that century.

  > "You want one line. I am protecting a hundred years of peace from one
  > line. Tell me which of us is being selfish, and be honest about the
  > answer."
- **Playstyle.** A bespoke boss card, unbannable and pinned into every
  fielded six. His signature deals no damage — it **overrules**: one of
  your legends is declared to have acted differently, its last action
  undone and replayed as the *official version*, his choice. The
  chapter's theme as a mechanic.
- **Bans** your two strongest cards — *"the record will reflect that you
  were never permitted them."*
- His twelve is the court plus four hundred years of legends whose
  entries were also quietly wrong.

---

## 5. Difficulty Design

**Owner ruling: no freebies.** Chapter One opened at ~95% and ramped to
Gilgamesh at ~20-30%. Chapter Two does not. The player arrives with a
finished collection and a full understanding of the loop; an opening
bout they cannot lose wastes the week.

| Bout | Target player WR | Notes |
|---|---|---|
| XI The Understudy | ~45% | the easiest fight is still a real fight |
| XII The Bookmaker | ~42% | |
| XIII The Herald | ~42% | |
| XIV The Collector | ~40% | |
| **XV The Hero of the Bridge** | **~35%** | **exam** — best-of-3, no faction unlock |
| **XVI The Undertaker** | **~30%** | **elite** |
| XVII The Mason | ~40% | |
| XVIII The Wrecker | ~42% | |
| **XIX The Auditor** | **~30%** | **elite** — Huaxia, bans nothing |
| **XX The Redactor** | **~25%** | **boss** — at Gilgamesh |

### How the difficulty is produced

Inherits Chapter One's **five laws**; **L2 is the one that matters** —
*difficulty comes from decks, never from the AI.* Search depth measured
non-monotonic (a deeper enemy made the player win *more*); turn order
worth ~0-10pp. Both stay banned.

1. **Fielded-six power** — the primary dial. Every rival fields near the
   top of their authored twelve.
2. **Adaptive fielding from bout one.** Chapter One scripted sixes for
   stages 1-4 because a first-ever fight opening with a ban phase teaches
   nothing. Nobody here is learning the loop, so **every rival
   sideboards live**. No scripted sixes anywhere.
3. **Bans that hurt from bout one.** Aimed at the answer, not at a role.
4. **Terrain built against you.** Symmetric per L1, but each rival's
   twelve is built for its pinned board and yours may not be.

### Two elites, opposite reasons

- **XVI** is the *attrition* elite: the only deck that gets stronger as
  the board empties, so the usual plan (trade evenly, win on remainder)
  is precisely the losing line. Healers banned, so you cannot stall.
- **XIX** is the *mastery* elite and the harder of the two. Banning
  nothing is the flex — he does not need your best cards gone because his
  board punishes whatever you do with them. He is also the Huaxia unlock,
  so the hardest ordinary fight pays out the withheld faction.

### Why one exam, not two

Chapter One examines at V and IX because it is *teaching the game* and
has to check twice. Nobody here is learning the loop, so the chapter
checks once at the midpoint on the four decks taught by then — and the
second check is bout XIX, an exam wearing an elite's difficulty.

---

## 6. The Ending — three doors

You win, you hold the Canon for a century, and you must use it in front
of everyone.

1. **Correct the line.** The forty are named; the Canon keeps its
   authority intact — which means the suppression *worked*, the next
   scribe's error gets buried too, and somebody four hundred years from
   now files their twelfth petition.
2. **Publish the audit.** The holders' credibility burns, the Canon is
   proven fallible, the argument goes back to the street. The Undertaker
   gets his bonfire. The forty stay unnamed, because nobody is keeping
   records any more.
3. **Both, then give it away.** Correct the line, publish the audit, and
   **abolish the century** — the Canon passes not every hundred years but
   whenever a petition is *proven*, by audit, by anyone. No holder, no
   tenure, no incumbent with four centuries to protect. The Mason's
   reform at a workable interval, and the only thing that could ever have
   bought it is a Canon-holder giving it up on his first morning.

The Wayfarer holds it for a day and a half — the shortest tenure in
Concord history. The Auditor files the paperwork and, for the first time
in four thousand years, has a successor to train.

**The cost.** The corrected entry is not the heroic one. It has the
misjudgement in it, and the knifepoint, and the vomiting, and the forty
names. Crowds do not cheer it. Within thirty years nobody performs
Sargon's story at all, because it is not *performable*. He goes thin
anyway — slower, on his own terms, with somebody reading the true
version aloud to him.

The forty do not. Their names are in the book, forty separate entries,
each one true and dull and permanent, and no scribe can tidy them
because the audit that made them is attached.

**Two bad endings are reachable**: the Bookmaker's debt (XII) and the
Wrecker's theft (XVIII).

---

## 7. Rewards and where the cards come from

| Bout | Fields | Unlocks | Legendary |
|---|---|---|---|
| XI The Understudy | Achaea | Achaea | **Achilles** |
| XII The Bookmaker | Gehenna | Gehenna | **Pride** |
| XIII The Herald | Empyrean | Empyrean | **Lucifer** |
| XIV The Collector | Transylvania | Transylvania | **Dracula** |
| XV Hero of the Bridge | the four taught decks, 3/3/3/3 | — (exam) | — |
| XVI The Undertaker | Jotunheim | Jotunheim | **Odin** |
| XVII The Mason | Devaloka | Devaloka | **Shiva** |
| XVIII The Wrecker | Tortuga | Tortuga | **Blackbeard** |
| XIX The Auditor | Huaxia | **Huaxia** | **Sun Wukong** |
| XX The Redactor | bespoke boss + the court | — | (bespoke) |

**One legendary per faction**, matching the roster law — asserted by
`sim/verify_chapter2.js`.

**The other 42 cards are in packs** as of 2026-08-18: commons, rares and
epics from all seven new factions are buyable like any other card and
count toward the collection total. The **legendaries are not**, because
the Crown Law says legendaries are never sold anywhere — they come from
the Road. So each faction's legendary is the campaign reward for the
bout that introduces it: you can buy your way toward Sherwood, but Robin
Hood comes from beating the Outlaw.

**Huaxia is the exception** and stays entirely unbuyable, because the
story spends it as the reveal at XIX. Selling it beforehand would spend
that reveal for coins.

---

## 8. Open work

Tracked honestly, because none of this is built:

- **No `data/campaign-ch2.js`.** No stage recipes, scripted lines, rival
  twelves, or bespoke cards in code.
- **Boards are unassigned.** Chapter One pins a board per gate; this
  chapter has not picked any.
- **Nothing is simmed.** Every WR above is authored. Chapter One's
  numbers moved substantially under `sim/campaign_soak.js`.
- **The Redactor's "overrule" is unproven** — undoing and replaying an
  action is not something the engine currently does.
- **Sargon, the Concord officials and the rivals have no cards.**
- **XV's "no exploitable seam" is a design claim, not a measurement.** A
  deck with no hook is harder to author than one with a hook.
- **Balance is paper-only.** 49 cards tuned against each other and never
  played.
