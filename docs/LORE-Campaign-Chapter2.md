# Echoes of Legend
## Chapter Two: The Hundred-Year Truce

*Campaign narrative draft — written to be delivered in scenes, rival
encounters, battle barks, codex entries, and post-battle memories. It is
prose first: the mechanics are the shape beneath the story, not the story
itself.*

*Revised 2026-08-18 (c) — **the structure now matches Chapter One's, measured
rather than assumed.** Owner: "Look at how chapter 1 is done, there's 2 elites
and the rest of the 8 gates all introduce one." Correct, and my previous count
was wrong: I had assumed Chapter One's boss and opener introduced nothing. In
fact `data/campaign-ch1.js` grants a `legendPack` at II, III, IV, VI, VII, VIII
and **X (Gilgamesh -> Duat)**; the only two gates that introduce nothing are
the **exams at V and IX**, and Gate I is empty only because Grimmwood is the
starter deck. So Chapter One introduces **eight factions across ten gates**.
Chapter Two now does exactly the same: the two elites ARE the two exams, they
unlock nothing, and the other eight gates each hand over one faction —
including the boss. See §0.3.*

*Revised 2026-08-18 (b) — **XV is now a gate, not a cutscene.** Owner:
"Aren't there supposed to be 10 gates?" Correct, and the draft had nine:
XV was written as a read-the-record scene with no fight, which quietly made
Chapter Two a nine-stage chapter against Chapter One's ten gates. It is now
**the exam** — you fight the Canon's version of Sargon for the right to take
over his abandoned petition — which fixes the count and puts the chapter's
biggest story beat inside a match instead of beside one. See §3.5.*

*Revised 2026-08-18 — rivals renamed. Owner ruling: "These rivals don't
sound like actual names but like things like what is the long game bruh."
Correct, and the diagnosis is in §0.2: five of the nine were named after
**events or tactics** (The Long Game, The Last Stand, The Heralded Blow,
The Price-Setter, The Revision) where every Chapter One rival is named
after **a person's trade or standing** (the Outlaw, the Chronicler, the
Warden, the Strategist). Renamed to agent nouns; playstyle still readable
off the name.*

---

## 0. How this relates to Chapter One

**Same Wayfarer. New story. No prerequisites.**

The player is still the Wayfarer, still an Echo, still walking through the
afterlife collecting legends. That identity carries over and is the reason
this is Chapter Two and not a different game.

What does **not** carry over is the plot. No Road, no ten gates, no
Recruiter, no Quiet, no Gilgamesh, no Uruk. Chapter One was a closed story
and it stays closed.

One carried fact, stated once and never leaned on:

> The Wayfarer walks out of one story and into the next with no name of their
> own, and a habit of collecting people who have one.

If you played Chapter One you know how that happened. If you did not, it is
simply who this person is.

---

## 0.1 A rule this draft follows

**Factions are decks, not characters.**

An earlier draft made each of the seven new factions a "house" competing in
the tournament, and it read wrong for a reason worth writing down: Chapter
One never does this. The word *house* appears zero times in it. Its rivals
are **people with jobs** — a bookshop daughter with a rifle, an ascetic
priestess with an astrolabe, a gambler in a vermilion jacket — and the
faction is simply what they happen to field. Nobody in Chapter One *is*
Sherwood. The Outlaw fights *with* Sherwood because focus fire is how a
sniper thinks.

Same rule here. Every rival below is a person with a trade, a grudge and a
reason to be in this city. What they field is a consequence of how they
fight, not a tribal affiliation, and the lore never names a faction as a
faction. A player who never opens the deck list should still understand
every character completely.

**Deliberately a different shape from Chapter One:**

| | Chapter One | Chapter Two |
|---|---|---|
| Structure | a pilgrimage — ten gates, forward, alone | a **tournament** — one city, one week |
| Question | does my story deserve to last? | **who owns a story once it lasts?** |
| Tone | elegiac, quiet, sad | loud, political, funny, then not |
| Antagonist | grief with teeth | **an institution, and the decent people inside it** |
| The Wayfarer is | a blank being tested | a **nobody who files paperwork** |

---

## 0.2 How rivals are named

**A rival's name is a job, not a manoeuvre.**

The first pass of this chapter failed that. Half the roster was named for
the thing that happens in the fight rather than for the person having it:
*The Long Game*, *The Last Stand*, *The Heralded Blow*, *The Price-Setter*,
*The Revision*. Read as a list they are tactics, or chapter titles, or
sports commentary — not people you are about to meet.

Chapter One never slips: the **Recruiter**, the **Oathkeeper**, the
**Outlaw**, the **Anointed**, the **Warden**, the **Trickster**, the
**Strategist**, the **Chronicler**, the **Last Guardian**. Every one is an
*agent noun* — somebody who does a thing for a living or a calling. The
playstyle is still legible (an Outlaw shoots the big name, a Strategist
counter-drafts) but you meet a **person** first and learn their habit
second.

The rename, and what each one keeps:

| Was | Is | The trade | Still says the playstyle |
|---|---|---|---|
| The Understudy | **The Understudy** | a paid stand-in | an understudy is someone not finished becoming the part |
| The Price-Setter | **The Bookmaker** | he runs the betting | a bookmaker's whole job is publishing the price |
| The Heralded Blow | **The Herald** | he announces the court's rulings | a herald says what is coming before it arrives |
| The Collector | **The Collector** | she keeps the vault | a collector takes and *keeps* |
| The Last Stand | **The Undertaker** | he buries worlds | an undertaker is at his best once things start dying |
| The Long Game | **The Mason** | eleven centuries of the same proposal | a mason lays the course before the course above it |
| The Taker | **The Wrecker** | she salvages what others abandon | a wrecker takes the cargo, it doesn't sink with the ship |
| The Answer | **The Auditor** | the last office of a dead empire | an auditor never initiates; he *checks what you did* |
| The Revision | **The Redactor** | he reads out the rulings | a redactor removes lines from a record — the boss mechanic exactly |

Two survived unchanged because they were already trades: the Understudy
and the Collector.

**The Undertaker and the Redactor are the two that improved most.** "The
Last Stand" was the *name of his fight*; "The Undertaker" is the man who
buried a world, thinks the Concord's crime is refusing to let anything
finish, and fields the only deck that improves as the board empties — the
job, the grievance and the gimmick in one word. "The Revision" was the
mechanic wearing a hat; "The Redactor" is a person who does that mechanic
for a living, which is more frightening.

---

## 0.3 The shape, taken from Chapter One

**Measured, not remembered.** The table below is read out of
`data/campaign-ch1.js`, because the first draft of this chapter was built on
a guess about Chapter One and the guess was wrong in a way that changed the
whole structure.

| Gate | Rival | Grant | Introduces |
|---|---|---|---|
| I | Recruiter | coins only | — *(Grimmwood is the starter deck)* |
| II | Oathkeeper | legendPack Arthur | Camelot |
| III | Outlaw | legendPack Robin Hood | Sherwood |
| IV | Anointed | legendPack Zeus | Olympus |
| **V** | **Warden — exam** | **choice x2** | **none** |
| VI | Trickster | legendPack Abe no Seimei | Yamato |
| VII | Strategist | legendPack Constantine | Roma |
| VIII | Chronicler | legendPack Amaterasu | Kami |
| **IX** | **Last Guardian — exam** | **choice x2** | **none** |
| X | **Gilgamesh — boss** | legendPack Anubis | **Duat** |

Three laws fall out of it, and Chapter Two follows all three:

1. **Exactly two gates introduce nothing, and they are the exams.** Not the
   boss, not the opener.
2. **The boss introduces a faction.** Duat arrives *with* Gilgamesh — the
   hardest fight in the chapter hands over the deck you have never seen.
3. **Eight factions across ten gates.**

Chapter Two therefore introduces its eight — Hemithea, Transylvania,
Genesis, Devas, Asgard, Tortuga, Huaxia, Pandemonium — at every gate except
the two elites, which are its exams.

---

## 1. The premise

Every hundred years, in a city that exists for one week and is dismantled
afterwards, the dead hold **the Concord**.

It settles the only thing the dead still genuinely disagree about: *whose
version is true*. Stories drift — the living retell them and every retelling
edits — and a century ago the argument was being settled with knives in the
street. Now it is settled in an arena. One week, one ruling.

The winner holds **the Canon** for a hundred years: the authority to say how
every contested legend is remembered.

It has worked. That is the problem.

**The Wayfarer arrives with a petition and no standing.**

No name, no patron, no century of precedent. What they have is twelve legends
and a grievance belonging to somebody else.

**Sargon** — no relation to the king, and that is the joke of his whole
afterlife — was a mercenary captain. Four hundred years ago a careless scribe
attached his name to another man's victories, and the Canon has said ever
since that he was a hero.

He has petitioned eleven times to have it corrected. He has lost eleven
times, because the question is *embarrassing*: nobody wants to open how many
other entries are wrong.

He is also going **thin** — what happens to an Echo whose true story nobody
carries. Within the year there will be a hero in the Canon and nobody behind
it. And a petitioner must fight his own gate, and he can no longer lift a
sword.

So he goes looking for someone whose entire nature is carrying other people's
stories.

> "You've no name of your own. I've a name that isn't mine. Between us that's
> almost one honest man. Fight my twelfth."

---

## 2. The ten people in the way

**Ten gates, XI through XX**, matching Chapter One's ten gates exactly:
**eight introduce a faction, and the two elites — XV and XIX — introduce
nothing, because they are this chapter's exams.** Each rival is a person, a
trade and a reason.

---

### XI — THE UNDERSTUDY

**Day one · the opening gate**

**Who she is.** A fixer's fighter. She has no patron and no purse, so she
takes money to lose the opening gate convincingly — a soft start for whoever
is paying that year. It is honest work, she is very good at it, and she has
done it at three Concords.

**Why she fights properly anyway.** She has read all eleven of Sargon's
petitions. She is the only person alive or dead who has. She thinks he is
right, and she was paid for a loss, not for an insult.

**The gimmick: nothing on her board is finished yet.** She fields mortals
with no god among them, and every one of them *ascends* mid-fight — a
permanent, one-time upgrade that fires when the fight gives it a reason.
**Achilles** is the centrepiece and the argument: he is an ordinary Bruiser
until something hurts him, and permanently better afterwards. Her whole
thesis is that a person is not a fixed quantity, and her deck is that
sentence.

The lesson she teaches: **do not evaluate her board on turn one.** The
legends you chose to ignore are the ones that will kill you.

**Bans your two most expensive cards** — "no shortcuts on day one."

**Line.** "Everyone here is bought. The trick is knowing what for. I went for
eleven silver and a fair opinion of a dead mercenary, and I intend to deliver
both."

**Reward.** Odysseus + Atalanta. Coin. And the first person in four hundred
years to take the petition seriously.

---

### XII — THE BOOKMAKER

**Day two · the fixer**

**Who he is.** The Concord's bookmaker. He runs the betting openly, from a
table nobody has ever asked him to move, and he chalks every price where the
crowd can read it. He was a tax farmer for an empire that no longer exists —
he outlived it, kept the ledgers, and privately regards the Concord as a
smaller and less competent operation than the one he used to audit. Being
owed is the only form of being needed he has ever managed.

**Why he fights you.** He offers to *fund* the twelfth petition — pay the
filing costs, buy the witnesses, hand you the week — in exchange for a debt
payable later, terms unspecified. "That is what a debt *is*. If you knew the
price you would call it a purchase."

Accepting is available. It wins the chapter's easiest run and one of its two
bad endings.

**The gimmick: he takes the other side of your bet.** A bookmaker does not
pick a winner — he prices whatever *you* do and profits from the difference,
and his board is built the same way. Nothing on it opens; everything on it
covers. Commit a combo and **Zhuge Liang** drains the energy that pays for
it; provoke a wall and **Guan Yu** counter-hits; hide behind a front line and
**Sun Wukong** goes over it. He fields an empire's court and plays it like a
ledger: every one of your actions has a matching entry on his side.

The lesson, and it is the earliest hard one in the chapter: **the first
player to commit is the one being priced.** Against him a turn spent doing
nothing is often worth more than a turn spent doing something, which is not a
lesson any Chapter One gate teaches.

**Bans your cheapest card** — he sets prices.

**Line.** "I have never lied to a bettor. I have simply noticed nobody reads
the back of the tablet, and I stopped considering that my failing."

**Reward.** Guan Yu + Zhuge Liang. Coin.

---

### XIII — THE HERALD

**Day three · the incumbent's second**

**Who he is.** The Canon's holders do not fight their own early gates. They
send their herald — the man who walks out first and reads what is about to
happen to the crowd, then does it. An honest, unimaginative, wholly sincere man who
believes the last four hundred years of rulings have been fair, and who has
never checked, because it has never occurred to him that checking is a thing
one does.

**Why he fights you.** He was instructed to make the twelfth petition go away
quickly. He was given no reason. He did not ask for one — and that
incuriosity is the entire character.

**The seam.** Mid-gate, one of his own officials hands him a ruling that
would win it. He refuses it. He offers no explanation, fights on, and loses.

**The gimmick: he tells you exactly what is coming, and it still lands.**
His court deals almost nothing on the turn it acts; the damage is *scheduled*
a round or two out, in the open, where you can see it. **Lucifer** is the
headline — a board-wide sentence pronounced two rounds early, at a cost paid
out of his own ability to be healed.

The lesson, and it is the one nobody expects: **you beat this by cancelling,
not by racing.** A player who tries to out-damage a scheduled hit loses to
it; a player who removes the caster or clears the pending effect never takes
it at all.

**Bans your fastest card** — "the court will not be hurried."

**Line.** "I am told the petitioner is a liar. I am also told not to ask who
told me. Only one of those instructions I intend to keep."

**Reward.** Azrael + Raphael. Coin. And a question that cannot be un-asked.

---

### XIV — THE COLLECTOR

**Day four · the archive**

**Who she is.** She keeps things. Not her things — *everyone's*. Nine
traditions have collapsed since she started and she has the whole of each of
them, catalogued, intact, in a vault under the city that gets dismantled
every hundred years and rebuilt around her. She is genuinely the reason half
the dead still exist.

**Why she fights you.** The original account of Sargon's war is in her vault.
She will not lend it, sell it or copy it, because everything she has was
saved by refusing exactly those three requests from more sympathetic people
than a nameless Echo with a petition.

**The gimmick: she does not remove your advantages, she keeps them.**
Every buff, shield and stat swing her board strips off you *reappears on her
side of the table* — which is the mechanical version of her entire argument
about who owns a thing. **Dracula** is the centrepiece: he drains ATK off
your whole team and wears it.

The lesson: **against her, setup is a liability.** The player who opens with
a big buff turn is handing her the fight, and the counter is to commit late
or commit to something she cannot carry.

**Bans your cleansers**, so what she takes stays taken.

**Line.** "Nine of them have burned since I started keeping. Every one asked
me to be reasonable first."

**Reward.** Carmilla + Dorian Gray. Coin. And the record.

---

### XV — THE HERO OF THE BRIDGE  *(the exam)*

**Day four, that night · the turn**

**The record first.** The account is intact, unedited, four hundred years
old. The Wayfarer reads it aloud to Sargon, because he can no longer hold a
tablet steady.

**He did it.**

Not the Canon's version — there was no speech, no banner, no last stand. But
the load-bearing fact is true. He held a bridge for two days with forty
people, eleven hundred civilians crossed the river behind him, and he died on
the second afternoon in a way that was neither noble nor quick.

The Canon did not invent his heroism. It **tidied** it. It removed the forty
names. It removed the vomiting, the sergeant he held at knifepoint to keep
the line, and the fact that he was on that bridge at all because he had
misjudged the retreat and was too proud to say so out loud.

Four hundred years insisting he was nobody — and the truth is he was somebody
he cannot stand.

**The eleven petitions look different now.** He was never correcting a
record. He was **refusing a compliment**, for four centuries, because
accepting it meant accepting the forty men his pride killed.

He tells the Wayfarer to withdraw.

**And he can.** A petition belongs to its petitioner; he has held this one
for four hundred years and he may strike it in a sentence. He goes to do
exactly that.

**Who you fight.** The Concord has one procedure for a petition its
petitioner abandons: a claimant may take it over, and to take it over the
claimant must defeat **the version of the petitioner that is in the book.**
Not the man. The entry. The Canon's Sargon walks out onto the floor — the
speech, the banner, the last stand, forty men who are not named because the
entry does not name them — and it is a very good fighter, because it was
written to be.

The real Sargon watches from the rail, being asked to sit still while a
stranger beats a lie about him out of the air, which is the closest thing to
mercy anyone has offered him in four centuries.

**The gimmick: there is nothing to exploit.** This is the exam, so it is the
one gate in the chapter with no trick in it. Every card the entry fields is
*tidied* — no seam, no cost, no tell, no wind-up, nothing overstated and
nothing left ragged. The four habits the week has taught you (do not judge
turn one, read the price, cancel the schedule, commit late) all still apply
and **none of them wins on its own**, because there is no exaggeration here
to punish. It is an authored 3/3/3/3 across the four decks you have already
been taught, fielded adaptively, over three games on ground you have already
walked.

The lesson is Chapter One's Warden lesson, restated: **not whether you can
win once, but whether you can change between games.** The entry sideboards.
So must you.

**Bans nothing in game one**, then bans your winning card in games two and
three — the record adjusting to what you have shown it.

**Line.** *(the entry, in Sargon's voice, which is the cruelty of it)*
"They crossed behind me and I did not look back once. Say it with me.
It sounds better when there are two of us saying it."

**Reward.** **Choice of two** echoes from the four decks taught so far, a
larger purse — and the record, notarised, admissible. **No new faction:** XV
is the first of the chapter's two exams, and exams unlock nothing, exactly as
at Chapter One's Warden and Last Guardian.

**Afterwards.** Sargon does not thank the Wayfarer. He says the forty names
out loud, in order, for the first time since the bridge, and it takes some
minutes, and he gets two of them wrong and has to check.

The Wayfarer does not withdraw.

---

### XVI — THE UNDERTAKER

**Day five · the abolitionist**

**Who he is.** An undertaker, and he means it as a profession rather than a
figure of speech: he buried a world once — a proper ending, prophesied and
attended, with a field growing back afterwards. He has never forgiven the
Concord for what it does instead: legends propped up past their natural
death, retold, re-edited, revised, never permitted to *finish*. He is here to
argue the whole institution should be dismantled.

**Why he fights you.** He has read the record too. He thinks the honest
answer is a bonfire, not a correction, and he will not back a petitioner
asking for one tidy line in a book that should not exist.

**The gimmick: his deck gets better as the board empties.** Every card he
fields reads the number of legends that have fallen — *on either side* — and
scales off it. He is deliberately below curve while the board is full.
**Odin** is the centrepiece and the clearest statement of it: his sweep is
ordinary until three legends have fallen, and then it is not. Fenrir behind
him is the same idea taken to its extreme — chained to half damage until the
third death, then permanently off the leash.

The lesson, and it is the nastiest reframe in the chapter: **trading evenly
is the losing line.** Every exchange you win makes his board stronger. You
have to either close it out before the third death or refuse the trade
entirely.

**Bans your healers**, so you cannot simply outlast the ramp.

**Line.** "Every one of his forty is still stood on that bridge because he
will not let them off it. Ask yourself who the Canon is serving now."

**Reward.** Odin + Fenrir. Coin. And the objection the ending has to answer.

---

### XVII — THE MASON

**Day six · the reformer**

**Who she is.** A mason, from back when that was the whole of her — she
built the retaining wall the Concord's own floor sits on, one course at a
time, and she has never once seen the point of laying a stone before the bed
under it is true. She has come to every Concord for eleven centuries with the
same proposal: the Canon should expire *yearly*, not once a century. It is
obviously fairer and completely unworkable — everyone would campaign every
year and nobody would ever govern — and it has never once reached a vote.

**Why she fights you.** She offers a trade: her considerable influence behind
your petition, in exchange for your public backing of annual revision — a
policy you think would wreck the thing you are trying to fix. The cleanest
bad bargain of the week.

**The gimmick: nothing on her board kills anything by itself.** Her deck is
strictly two-part — one card marks, another spends the mark — and neither
half is worth a turn alone. **Shiva** is the payoff: ordinary damage against
an unmarked target, and the biggest hit in her twelve against a marked one.

The lesson: **kill the setup, not the threat.** Every player's instinct is to
answer the scariest card on the board, and against her that is exactly
wrong — the enabler is the one that has to die.

**Bans your finishers**, so you cannot skip the lesson by simply having a
bigger hammer than she has a combo.

**Line.** "You want one line changed. I want the whole book rewritten every
spring. We are the same complaint at different volumes, and only one of us
has been polite about it."

**Reward.** Ganesha + Kali. Coin.

---

### XVIII — THE WRECKER

**Day seven, at night · the theft**

**Who she is.** A wrecker, in the trade sense: she works the coast where
things go down and takes off what floats before the sea gets it, and she has
never in her life considered that stealing. Her position has always been the
honest one: the
Canon is loot, and the only reason nobody has taken it in a hundred years is
that everyone agreed not to. On the last night before the final, she stops
agreeing.

**Why she fights you.** Not over the theft — she *offers* you the book,
genuinely, no trick. A stolen Canon is worthless to someone nobody will trade
with, and she has worked out that its value was never the object. She wants
you to use it before the ruling.

Which would win the correction by theft, before any vote, in front of
everyone. The second bad ending, and the more tempting one.

**The gimmick: she steals tempo rather than removing it.** Buffs, energy,
shields, a revive you were counting on — none of it is destroyed, all of it
changes hands. **Blackbeard** headlines: a board-wide burn that is worth more
the more of your team is already committed.

The lesson: **the opening turn you spend preparing is the one she profits
from.** She is the direct counter to every habit the Mason just taught you,
which is why she is scheduled the night after.

**Bans your buff support**, so the theft cannot be replaced.

**Line.** "Everyone in this city says *the Canon* like it's a mountain. It
weighs four pounds. I've carried heavier by accident."

**Reward.** Anne Bonny + Davy Jones. Coin. And a decision.

---

### XIX — THE AUDITOR  *(the second exam)*

**The morning of the final · unscheduled**

**Who he is.** A functionary of an empire that no longer exists — **the same
empire the Bookmaker farmed taxes for**, and the two of them have not spoken
in four hundred years. When it dissolved, its bureaucracy left exactly one
office standing: an auditor with the standing to examine the Canon's
provenance, and no petitioner in four hundred years to ask him to. He has
kept the office. He has kept the *hours*. Four thousand mornings in a room
nobody enters.

The Bookmaker took the empire's methods to the betting table and got rich.
The Auditor kept its procedures and got nothing. Neither of them thinks the
other made the wrong choice, which is worse than a grudge.

**Why he fights you.** Because somebody finally files. And because a petition
granted without proof of competence gets overturned within a century, so he
tests the petitioner himself before he opens the book: "I will not have my
first audit in four hundred years thrown out on procedure."

**What the audit finds.** The Canon's holders did not forge the entry. A
scribe did, carelessly, exactly as Sargon has said for four hundred years.

But they **found the error two centuries ago and buried it** — because
admitting the Canon contains errors would collapse the impartiality their
whole claim to hold it rests on.

The sword-bearer's refusal on day three makes sense now. He was never told
why. He declined to win anyway.

**The gimmick: he audits you with your own week.** This is the chapter's
second exam, so like Chapter One's Last Guardian he introduces **no new
faction** — he fields an authored spread drawn from the decks you have
already been handed, and every one of them is pointed back at the habit that
deck taught you. The Herald's schedule, the Collector's theft, the
Undertaker's ramp, the Mason's two-card kill: all of it, on his side of the
table, in one twelve.

The lesson is the examination itself: **you cannot win this on a plan.** Each
answer you learned is now the thing being answered, so the fight is decided
by which of your habits you are willing to abandon. Chapter One's Warden
asked whether you could change *between games*; the Auditor asks whether you
can change *between rounds*.

**Bans nothing** — the only rival in the week who does not. "Bring your
best. I have been bored for four thousand years."

**Line.** "Four thousand years is not devotion. Devotion gets tired. Four
thousand years is procedure."

**Reward.** **Choice of two** echoes from any faction taught so far, the
chapter's largest ordinary purse — and standing to be heard. No new deck: an
audit does not hand you anything you did not already own.

---

## 3. XX — THE FINAL: ASMODEUS, THE REDACTOR

**The Concord floor · everyone watching**

**"The Redactor" is a title, not a name** — the office that decides which
lines of a ruling are read aloud. The man holding it is **Asmodeus**, and the
chapter uses him the way Chapter One uses Gilgamesh: the boss is a named
figure out of real myth who has been doing this job so long that the job and
the person are no longer separable.

He has read every ruling for four hundred years, and, quieter, chosen which
lines were read at all. If anyone can make a cover-up sound like continuity,
it is the mouth that announced them all.

**Who he is.** A king of the older hierarchy, from back when his kind kept
courts and the courts kept records. He has outlived the hierarchy, the
courts and everyone who could confirm any of it, and he did not come to the
Concord to rule it — he came because it was the only institution left that
still filed things properly. Four centuries later he runs its archive and
regards the arrangement as a retirement.

**He is not a hypocrite**, which is what makes him hard. He knew about the
error for two centuries. He suppressed it. He will say why to your face: an
institution that admits fallibility stops being obeyed, an unobeyed Canon
means the knives come back to the street, and he *watched* that century.

> "You want one line. I am protecting a hundred years of peace from one line.
> Tell me which of us is being selfish, and be honest about the answer."

**The gimmick: every edit is paid for, in public.** Asmodeus fields the sins,
and they are the chapter's closing argument about the Canon itself — power
bought at a stated, visible cost, which is exactly what four hundred years of
tidy history has been. **Pride** anchors the twelve: the largest sweep in the
chapter, and he cannot be healed for two rounds after casting it. Every card
beside him buys its power the same way — ATK for DEF, healing for damage, an
action skipped now for a bigger one later.

The lesson is the chapter's thesis arriving as a mechanic: **the costs are
written down, and reading them is the whole fight.** He has never hidden a
price in his life. He simply relies on nobody turning the tablet over.

**Playstyle.** A bespoke boss card, unbannable and pinned. His signature deals
no damage — it **overrules**: one of your legends is declared to have acted
differently, its last action undone and replayed as the *official version*,
his choice. A boss that edits your history mid-fight, which is the chapter's
theme expressed as a mechanic.

**Bans your two strongest cards** — "the record will reflect that you were
never permitted them."

**Reward.** Pandemonium — the last deck in the game, handed over by the
hardest fight in it, exactly as Gilgamesh hands over Duat.

---

---

## 3.5 Difficulty — no freebies

**Owner ruling.** Chapter One opened at ~95% and ramped to Gilgamesh at
~20-30%. Chapter Two does not do that. The player arrives with a finished
collection, eight chapters of habits and a full understanding of the loop;
an opening gate they cannot lose is a waste of everyone's week.

**The floor for every ordinary gate is *a bit below Gilgamesh*.** The two
elites and the final are *at* him.

**The two elites are the two exams** (owner ruling 2026-08-18), which is
Chapter One's arrangement exactly: its hardest non-boss fights are the Warden
at V and the Last Guardian at IX, and neither hands over a faction. An exam
tests what you already own, so paying it out in a new deck would be the wrong
reward for the thing being measured — both give **choice of two** instead.

| | Chapter I | Chapter II |
|---|---|---|
| Stages | **ten gates, I-X** | **ten gates, XI-XX** |
| Factions introduced | **8** | **8** |
| Gates introducing nothing | **2 — the exams (V, IX)** | **2 — the exams (XV, XIX)** |
| Boss introduces a faction | **yes — Duat** | **yes — Pandemonium** |
| Opening stage | ~95% | **~45%** |
| Ordinary stages | 90% → 55% | **40-45%, flat** |
| Elites | 40% (IX) | **~30-35%** |
| Boss | 20-30% (X) | **~25%** |

| Gate | Target player WR | Notes |
|---|---|---|
| XI The Understudy | ~45% | the easiest fight in the chapter is still a real fight |
| XII The Bookmaker | ~42% | |
| XIII The Herald | ~42% | |
| XIV The Collector | ~40% | |
| **XV The Hero of the Bridge** | **~35%** | **elite / first exam** — best-of-3, unlocks nothing |
| XVI The Undertaker | ~40% | |
| XVII The Mason | ~40% | |
| XVIII The Wrecker | ~42% | |
| **XIX The Auditor** | **~30%** | **elite / second exam** — unlocks nothing, bans nothing |
| **XX Asmodeus, the Redactor** | **~25%** | **boss** — at Gilgamesh, hands over Pandemonium |

**Two exams, at the same beats as Chapter One.** V and IX there; XV and XIX
here. The first examines the four decks taught by the midpoint; the second
examines everything, on the morning of the final. Both are best-of-three,
both pay **choice of two**, and neither hands over a faction.

### How the difficulty is produced

This chapter inherits Chapter One's **five laws**, and L2 is the one that
matters here: *difficulty comes from decks, never from the AI.* Search depth
is measured non-monotonic (a deeper enemy made the player win *more*) and
turn order is worth ~0-10pp. Both stay banned. So:

1. **Fielded-six power.** The primary dial, as in Chapter One. Every rival
   in this chapter fields near the top of their authored twelve.
2. **Adaptive fielding from gate one.** Chapter One scripted the sixes for
   stages 1-4 because a first-ever fight that opens with a ban phase teaches
   nothing. Nobody here is learning the loop, so **every rival sideboards
   live** from their twelve. No scripted sixes anywhere in the chapter.
3. **Bans that hurt from gate one.** Chapter One's early gates banned
   gently. Here the opening gate already takes your two most expensive
   cards, and the bans are aimed at the answer rather than at a role.
4. **Terrain built against you.** Symmetric per L1, but each rival's twelve
   is built for its pinned board and yours may not be.

### The elites, which are the exams

Two, and they are elites for opposite reasons. **Neither introduces a
faction** — that is what makes them exams rather than gates, and it is
Chapter One's rule, not a deviation from it.

**XV The Hero of the Bridge** is the *discipline* exam. The Canon's version
of Sargon fields an authored 3/3/3/3 across the four decks taught so far,
and it is the only board in the chapter with no exploitable seam: nothing
overstated, nothing ragged, no gimmick to punish. It examines whether you can
win a fair fight against your own tools.

**XIX The Auditor** is the *mastery* exam and the harder of the two. He bans
nothing, which is the flex: he does not need to take your best cards because
his board is built out of the seven decks you were handed, each one pointed
back at the habit it taught you. Every answer you learned is now the thing
being answered.

Between them sits the reason the chapter can afford two elites in five gates:
they are scheduled either side of the Undertaker, the Mason and the Wrecker,
so the run reads hard-easy-easy-easy-hard rather than a ramp.

### One honesty note

These are **bot-vs-bot targets at the collection floor**, the same vocabulary
Chapter One's curve table uses, and they are *authored intent, not measured
results*. Chapter One's numbers were tuned with `sim/campaign_soak.js` over
hundreds of games per stage and moved substantially during tuning. Nothing in
this chapter has been simmed, because none of it is built yet. Treat every
figure above as the target to tune toward, and expect it to move.

The maintenance duty from Chapter One applies double: ten authored matchups
against a 112-card roster is a standing balance liability, and every card
patch is a potential campaign regression. The campaign soak belongs on the
balance-patch checklist.

## 4. The ending

You win, you hold the Canon for a century, and you have to use it in front of
everyone. Three doors:

**1. Correct the line.** The forty are named. The Canon keeps its authority
intact — which means the suppression *worked*, the next scribe's error gets
buried too, and somebody four hundred years from now files their twelfth
petition.

**2. Publish the audit.** The holders' credibility burns, the Canon is proven
fallible, and the argument goes back to the street. The Undertaker gets his
bonfire. The forty stay unnamed, because nobody is keeping records any more.

**3. Both, then give it away.** Correct the line, publish the audit, and
**abolish the century** — rule that the Canon passes not every hundred years
but whenever a petition is *proven*, by audit, by anyone. No holder, no
tenure, no incumbent with four centuries to protect.

It is the Pilgrim's reform at a workable interval, and the only thing that
could ever have bought it is a Canon-holder giving up the Canon on his first
morning.

The Wayfarer holds it for a day and a half — the shortest tenure in the
history of the Concord. The Auditor files the paperwork and, for the first
time in four thousand years, has a successor to train.

**The cost.** The corrected entry is not the heroic one. It has the
misjudgement in it, and the knifepoint, and the vomiting, and the forty
names. Crowds do not cheer it. Within thirty years nobody performs Sargon's
story at all, because it is not *performable*.

He goes thin anyway — slower, on his own terms, and with somebody reading the
true version aloud to him.

The forty do not. Their names are in the book, forty separate entries, each
one true and dull and permanent, and no scribe can tidy them because the
audit that made them is attached.

That was always the trade. He needed four hundred years to be able to say it
out loud, and somebody else's hands to file it.

---

## 5. Epilogue — The Next Blank Line

The Wayfarer leaves with twelve legends, a coin purse, and no more claim to a
name than they arrived with.

The Auditor stops them at the gate and hands over a blank tablet, which is
either a formality or a joke, and with him it is impossible to tell.

"Petition form," he says. "For when you want your own line looked at."

"I don't have a line."

"No," he agrees. "That is generally the point at which people begin one."

Ahead, the road out is busy — pavilions coming down, a crowd arguing about a
ruling that will not be a ruling for much longer, and somewhere past all of
it, the next city.

Somewhere, in a world that had almost forgotten them, a page turns.

---

## 6. Where the cards come in

**The lore above names no factions on purpose.** This section is the
implementation note: which deck each rival fields, and why it suits them.

| Rival | Fields | Why it fits the person |
|---|---|---|
| The Understudy | Hemithea | mortals with no god; everyone becomes more mid-fight |
| The Bookmaker | **Huaxia** | a bookmaker never picks a side — he takes the other side of yours |
| The Herald | Genesis | announces every blow a round early |
| The Collector | Transylvania | takes rather than destroys |
| The Hero of the Bridge *(exam)* | *the four taught decks, 3/3/3/3* | an exam fields what you were taught, not something new |
| The Undertaker | Asgard | strongest once the board starts emptying |
| The Mason | Devas | setup and payoff as two separate jobs |
| The Wrecker | Tortuga | steals advantages rather than removing them |
| The Auditor *(exam)* | *the seven taught decks* | the audit is your own week, handed back to you |
| Asmodeus, the Redactor | **Pandemonium** + bespoke boss card | every edit to the record was paid for |

### Each rival's gimmick is the faction they introduce

Chapter One's pattern, stated plainly: the Outlaw likes snipers because she
is the gate that hands you Robin Hood. The rival is not merely *holding* a
faction, she is a **demonstration of why that faction is worth drafting**,
and her legendary is the centrepiece of the demonstration.

Every gate here follows it. The gimmick is the faction's mechanical identity,
the faction's one legendary is the card that proves it, and the reward is the
faction:

| Gate | The gimmick | Proved by | Unlocks |
|---|---|---|---|
| XI The Understudy | nothing is finished at turn one; legends ascend mid-fight | **Achilles** | Hemithea |
| XII The Bookmaker | he never opens — every card answers what you just did | **Sun Wukong** | Huaxia |
| XIII The Herald | damage is scheduled a round early, in the open | **Lucifer** | Genesis |
| XIV The Collector | what she strips off you reappears on her | **Dracula** | Transylvania |
| **XV Hero of the Bridge** | *(exam — no gimmick, and that is the test)* | — | **nothing** |
| XVI The Undertaker | the deck improves as the board empties | **Odin** | Asgard |
| XVII The Mason | nothing kills without a second card first | **Shiva** | Devas |
| XVIII The Wrecker | advantages change sides rather than vanishing | **Blackbeard** | Tortuga |
| **XIX The Auditor** | *(exam — your own seven decks, aimed back)* | — | **nothing** |
| XX Asmodeus, the Redactor | every card buys its power at a stated, visible price | **Pride** | Pandemonium |

Each one also teaches the counter to itself, which is what makes them
lessons rather than gimmicks: cancel the schedule, kill the enabler, refuse
the even trade, commit late.

### Rarity and where the cards come from

**One legendary per faction**, matching the roster law of one per six slots.
Confirmed across all seven: Odin, Achilles, Pride, Shiva, Lucifer, Dracula,
Blackbeard. Nothing to change — `sim/verify_chapter2.js` already asserts it.

**None of them are in packs, and that is the current ruling.** For one turn
on 2026-08-18 the non-legendaries were released into the shop; that has been
reverted. Owner: *"keep the shop as is with the pack pool containing just
chapter 1 cards."*

The measured reason is the good one. Releasing them took the packable pool
from **35 to 80 cards**, which roughly halved the odds of pulling any
specific Chapter One legend — for players who cannot play Chapter Two,
because it does not exist in code. A chapter that is still a design document
should not be taxing a live economy.

So the shelf is closed to the whole chapter: `WITHHELD` in `js/economy.js`
lists all eight faction ids, packable is back to **36 Chapter One cards**,
and a faction leaves that list when its chapter is *playable*, not when its
cards happen to exist. The Crown Law is unaffected either way — legendaries
are never sold, so the eight campaign legendaries were always going to come
from the Road.

**The per-chapter shop is still the open question**, not this revert; see
§8.

### Huaxia belongs to the two men who outlived its empire

An earlier draft mentioned Huaxia once, in passing, as a dissolved house —
which was a waste of the faction the whole roster has been holding back since
Chapter One. It now belongs to **two** characters, and the pairing is the
point.

An empire fell. Its armies, its emperors and its poets are gone. What
survived was a **tax farmer** and an **auditor** — the two least romantic
offices it had — and they took opposite lessons from the same collapse. The
Bookmaker took the empire's methods to the betting table and got rich. The
Auditor kept its procedures and got nothing. Neither thinks the other chose
wrongly, which is worse than a grudge.

The Bookmaker **fields** it, at gate XII, because a bookmaker's job is
structurally identical to Huaxia's mechanical identity: he never opens a
position, he prices yours and takes the other side. His six is Sun Wukong,
Guan Yu, Zhuge Liang and Qin Shi Huang — an empire's worth of legends run
like a ledger by the man who used to collect its taxes.

The Auditor does **not** field it, because he is an exam, and an exam fields
what you were taught. The faction he came from is already in your collection
by the time you meet him — which is the quieter version of the same joke.

---

## 7. Why this works

- **Rivals are people, not factions.** Nobody in this chapter *is* a
  tradition; they field one because of how they fight, matching how Chapter
  One handles the Outlaw and the Anointed. The word "house" is gone.
- **The Wayfarer identity carries; the plot does not.** Zero prerequisites.
- **The namelessness is an asset**, not a wound — it is why Sargon picks
  them, and the last beat of the chapter.
- **The antagonist is an institution** with motives, internal disagreement,
  and a defence that is genuinely good.
- **Ten gates, XI-XX, and the same SHAPE as Chapter One** — measured out of
  `data/campaign-ch1.js`, not remembered: eight factions introduced, two
  gates that introduce nothing and they are the exams, and a boss that hands
  over the last deck.
- **The turn at XV inverts the premise:** he was telling the truth, and the
  truth is worse than the lie — and it is a *gate*, because the chapter's
  biggest story beat should not be the one stage you sit and watch.
- **Two bad endings are reachable and tempting**, so the good one is a choice.
- **The boss mechanic is the theme** — a card that edits your history.
- **Huaxia belongs to two rivals**, a tax farmer and an auditor, who are the
  only survivors of the same dead empire and cannot agree what it meant.
- **The boss hands over the last deck**, exactly as Gilgamesh hands over
  Duat — and Pandemonium's "power at a stated price" is the chapter's
  closing argument about the Canon itself.
- **Every name is a trade, and the trade is the playstyle.** The
  Bookmaker prices things, the Undertaker finishes things, the Mason
  builds in two stages, the Auditor checks rather than acts, the
  Redactor removes lines from a record. Chapter One's law: the
  Oathkeeper teaches walls, the Outlaw teaches focus fire — and both
  are *people you could describe to a stranger in three words*.
- **No freebies.** The opening gate sits at ~45%, not ~95%.
- **Every rival demonstrates the faction they hand over**, legendary
  first, exactly as the Outlaw sells Sherwood with Robin Hood — and the two
  that hand over nothing are the two that are testing you.
- **One legendary each**, and for now the whole chapter is campaign-only:
  the shop stocks Chapter One until Chapter Two is playable, so building
  toward one of these factions means walking its Road.

---

## 8. Open questions

**The shop needs a decision before any of this ships.** Raised by the owner
2026-08-18: *"maybe make a chapter 1 shop and chapter 2 shop?"*

The current model is a single global pool with one withhold list
(`var WITHHELD = ['huaxia']` in `js/economy.js`). It was adequate when there
was one chapter and one faction being held back. It is now doing a job it was
never designed for, and this chapter breaks it in three places:

1. **Huaxia's withholding no longer has a reason.** It was withheld because
   it was Chapter Two's reveal. It is now introduced at gate XII, early, by
   the Bookmaker. Nothing is being protected by keeping it unbuyable.
2. **Pandemonium has inherited that job** — last deck, boss payout — but
   withholding it means holding back a faction whose seven cards are already
   written, arted and wired.
3. **The pool doubled and nobody was told.** Packs went from 35 to 77
   packable cards when the seven new factions landed, which roughly halved
   the odds of pulling any specific older legend. A Chapter One player who
   has not touched Chapter Two paid for that.

Three shapes are worth considering, and this doc deliberately does not pick
one:

- **Per-chapter shops.** Two storefronts, each selling only the factions its
  chapter has introduced. Solves (3) outright — a Chapter One player's odds
  never move — and makes withholding a property of *where you are* rather
  than a hardcoded list. Costs: a second shop UI, and a rule for what happens
  to a player who is halfway through both.
- **One shop, chapter-gated inventory.** A single storefront that reveals a
  faction's cards once its chapter is reached. Cheaper to build; keeps one
  pool, so (3) remains true for anyone who has unlocked both.
- **One shop, unchanged, and accept the dilution.** Honest and free. The odds
  argument is real but small if pack pricing is retuned.

Whichever is chosen, **the Crown Law is unaffected**: legendaries are never
sold, so the eight campaign legendaries stay campaign-only regardless.

---

## 9. The Wheel of Seven

*Added 2026-08-19, when the elements became mechanical. The Concord
has always staged its fights under rules, and this is the oldest one.*

Every arena in the city is chalked with a wheel of seven spokes, one
syllable on each, and the ring means what the judges say it has always
meant: a fire burns the green, but the sun makes the fire pointless.
The grounded tree swallows the storm, but the storm strikes the body.
The body breaks the spell, the word binds the shadow, the shadow
eclipses the light — and the light outshines the flame. Each element
sears one and bows to one; nothing in the wheel is strongest, which is
exactly why it has survived four hundred years of people arguing about
everything else.

In play: an attack made of an element that sears its target deals
eight percent more; an attack made of an element that bows to its
target deals the exact reciprocal less. The two halves cancel, which
is the point. The wheel does not make damage; it moves it, the way a
market moves money, and like the market it rewards reading the board
before you act. The card each legend carries names its prey and its
predator. The Concord calls this the one law nobody ever petitions to
have corrected.
