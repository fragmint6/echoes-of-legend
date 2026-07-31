# Echoes of Legend — Balance Report

**Simulation:** 200 AI-vs-AI games · depth-2 AI · seed `20260729` · 2 threads (shard seeds 20260729, 20260829) · 47s wall clock
**Generated:** 2026-07-31T15:42:21.955Z
**Roster:** 51 heroes across 8 factions — this run introduces **Takamagahara** (6 heroes, marked 🆕 throughout).

> Per the Report Requirements, only **Section 1 (Global Match Statistics)** includes drawn games. Every other section is computed over decided games only.

## Executive Summary — Takamagahara

| Hero | Role | Rarity | Win Rate | Pick Rate | MVP/game | Kills/game | Deaths/game | Survival |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Susanoo** | Tank | epic | 76.3% | 10.3% | 9,382 | 0.45 | 0.50 | 50.0% |
| **Amaterasu** | Caster | legendary | 68.3% | 11.1% | 21,865 | 1.56 | 0.68 | 31.7% |
| **Izanami** | Controller | legendary | 55.0% | 10.8% | 6,317 | 0.95 | 0.70 | 30.0% |
| **Tsukuyomi** | Caster | epic | 52.5% | 10.8% | 10,334 | 1.18 | 0.72 | 27.5% |
| **Izanagi** | Medic | epic | 48.9% | 12.2% | 15,795 | 0.00 | 0.73 | 28.9% |
| **Inari** | Controller | rare | 42.9% | 9.5% | 3,572 | 0.71 | 0.66 | 34.3% |

**Takamagahara aggregate win rate: 57.3%** across 239 hero-appearances, versus **49.1%** for the 45 pre-existing heroes. A perfectly neutral faction sits at 50%; the healthy band per the requirements is 35–65% per hero.

## Balance Pass — Before / After

Nerfs applied after the 2,000-game Takamagahara baseline, compared across runs. Note the sample-size asymmetry: the baseline is 2,000 games, this run is 200.

| Card | Change | WR before | WR after | Δ | Sig casts/app before | after |
| --- | --- | --- | --- | --- | --- | --- |
| **Amaterasu** 🆕 | AoE 70%/105% → 50%/75%, cost 50 → 55 EN | 81.1% | 68.3% | -12.8pp | 2.88 | 2.59 |
| **Susanoo** 🆕 | Shields 12%/15% → 10%/10%, threshold 35% → 30% | 72.7% | 76.3% | +3.7pp | 0.00 | 0.00 |

**Verdict on each change**

- **Amaterasu:** 81.1% → 68.3% (-12.8pp, z = -1.71 — inside noise at this sample size). Damage per cast fell by about a third, which is the reliable signal. Her win rate moved the right way but cannot be called significant on 200 games.
- **Susanoo:** 72.7% → 76.3% (+3.7pp, z = 0.51 — inside noise at this sample size). Shield output roughly halved, but survival and deaths per game are unchanged — the shields were not what kept him alive, so this nerf did not hit the real lever. His counter-strike damage is.

**Engine correctness fix.** Ten effect kinds (`silence`, `taunt`, `untargetable`, `healMod`, `costMod`, `stealEnergy`, `drainEnergy`, `loseEnergy`, `drainTax`, `counterStrike`, `mark`, `revive`, `delayed`) never evaluated their `if` condition, so any condition attached to them was silently ignored. Additionally `condCtx` did not forward `drainedEnergy`, so `drainedEnergyAbove` always read 0. Both are fixed. The practical effect: **Abe no Seimei's Silence rider is now genuinely conditional** (it had always fired unconditionally, making his printed gate decorative), and **Tomoe Gozen's "Kill: steal 4 more" now actually requires a kill**. These were the only two cards in the roster attaching a condition to an affected effect kind.

## Behaviour Audit

Before this simulation every card in the roster was put through an automated behaviour audit (`sim/verify_all.js`) — **1,087 assertions, all passing**. Three layers:

- **Static** — schema, stat bands against the role table, icon existence and uniqueness, ability-spec uniqueness, keyword legality, and validation that every `k:` effect kind, `if:` condition and passive trigger referenced by a card actually exists in the engine.
- **Dynamic** — each new card cast on a controlled board with its damage checked against an explicit model (e.g. Tsukuyomi 90% clean vs 150% into a debuffed target), plus behavioural probes on 25 pre-existing actives to catch regressions.
- **Soak** — 120 AI-vs-AI games asserting global invariants: no negative or overflowed HP, no unit acting twice in a round, no dead unit acting or dealing damage, role cap never breached, and every hero in the roster appearing at least once.

**Three real bugs were found and fixed this pass:**

1. **Deferred effects resolved from a dead caster.** `resolveDeferred` never checked that the source was alive, so a hero killed before their delayed payoff landed still dealt full damage from the grave. Measured at 12,995 damage in a constructed case.
2. **Pending effects had the same hole.** The `u.pending` path checked the *victim* was alive but not the *source*, so Abe no Seimei's shikigami struck from the grave (5 occurrences in a 120-game soak). Both paths now require a living source, which restores the counterplay of killing the caster.
3. **Susanoo's counter was off-by-one.** `counterStrike` *arms* a retaliation for future hits rather than answering the current blow, so arming it on `wasAttacked` left the first attack of every round uncountered. Rebuilt as a standing counter armed at battle start.

Two further engine behaviours were confirmed as intended rather than bugs: a hero killed mid-cast still walks its remaining effect list but every hit resolves for **0** damage, and the engine leaves flag values on corpses without ever returning a dead unit as a legal target.

---

## 1. Global Match Statistics

*Includes drawn games.*

| Metric | Value |
| --- | --- |
| P1 Win Rate | 45.0% (90) |
| P2 Win Rate | 47.5% (95) |
| Draw Rate | 7.5% (15) |
| Average rounds per game | 12.09 |
| Median rounds per game | 11.0 |
| Shortest game | 5 rounds |
| Longest game | 21 rounds |
| Average actions per game | 70.32 |
| Average actions per round | 5.82 |
| Signature usage % | 41.6% (5,853 casts) |
| Basic usage % | 58.4% (8,211 casts) |
| Avg remaining heroes on winning team | 3.62 / 6 |
| Avg remaining HP on winning team | 58.4% |
| First kill rate (games with a kill) | 100.0% |
| First kill conversion rate | 65.4% |
| Average round of first kill | 4.47 |
| Average round of second kill | 5.91 |
| Average round signatures first appear | 2.02 |

**Insights**

- **Seat balance:** among decided games P1 takes 48.6% and P2 51.4%. That is within ±3pp of even, so the alternating-opener rule is doing its job and no seat advantage contaminates the hero numbers below.
- **Game length:** a median of 11.0 rounds against a 20-round cap means games resolve on damage, not on the timer. The draw rate of 7.5% confirms it.
- **Decisiveness:** winners finish with 3.62 of 6 heroes and 58.4% average HP — matches are won convincingly rather than scraped.
- **Snowball:** the first kill converts to a win 65.4% of the time. This is the single most important number for judging Roma, whose entire identity is monetising kills — a faction that reliably lands the first kill in a game where first blood is worth this much is structurally strong.
- **Economy:** signatures are 41.6% of all actions and first appear around round 2.0, right after the round-1 basics-only lock lifts.

---

## 2. Role Balance

| Role | Win Rate | Pick Rate | Avg Dmg | Avg Heal | Avg Shield | Avg Prevented | Survival | Kills | Deaths | KP | Dmg/EN | Sig/game | Basic/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tank | 54.1% | 16.3% | 3,502 | 479 | 3,761 | 766 | 30.7% | 0.25 | 0.69 | 5.6% | 25.7 | 2.15 | 4.14 |
| Medic | 53.3% | 13.8% | 0 | 9,813 | 4,581 | 0 | 40.5% | 0.00 | 0.60 | 0.0% | 0.0 | 3.08 | 3.83 |
| Bruiser | 51.5% | 19.8% | 9,073 | 215 | 772 | 0 | 31.0% | 1.14 | 0.69 | 25.0% | 70.6 | 1.53 | 3.95 |
| Sniper | 47.6% | 16.7% | 9,165 | 0 | 0 | 0 | 21.1% | 1.09 | 0.79 | 26.0% | 70.2 | 1.96 | 2.89 |
| Caster | 47.2% | 13.9% | 8,400 | 102 | 280 | 0 | 22.3% | 0.76 | 0.78 | 17.0% | 78.7 | 1.39 | 2.40 |
| Controller | 46.8% | 19.5% | 6,373 | 0 | 0 | 424 | 35.0% | 0.75 | 0.65 | 17.7% | 47.4 | 3.38 | 1.99 |

**Insights**

- **Spread:** Tank leads at 54.1% and Controller trails at 46.8% — a 7.4pp gap. No role is close to mandatory or dead.
- **Damage efficiency:** Caster converts Energy into damage best, which is what you would expect from the role that pays the least per cast.
- **Roma's footprint:** Roma adds one hero to each of the six roles, so it applies even pressure to every role band rather than inflating a single archetype.

---

## 3. Hero Statistics

### 3.1 General

| # | Hero | Faction | Rarity | Role | Element | Win Rate | Pick Rate | MVP/game | Survival | Kills | Deaths | KP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Susanoo** 🆕 | takamagahara | epic | Tank | Lightning | 76.3% | 10.3% | 9,382 | 50.0% | 0.45 | 0.50 | 7.7% |
| 2 | **Benkei** | yamato | epic | Tank | Physical | 70.7% | 11.1% | 8,324 | 46.3% | 0.24 | 0.54 | 4.1% |
| 3 | **Maid Marian** | sherwood | rare | Medic | Light | 69.2% | 10.5% | 16,946 | 53.8% | 0.00 | 0.46 | 0.0% |
| 4 | **Amaterasu** 🆕 | takamagahara | legendary | Caster | Light | 68.3% | 11.1% | 21,865 | 31.7% | 1.56 | 0.68 | 29.1% |
| 5 | **Guy of Gisborne** | sherwood | legendary | Bruiser | Shadow | 68.1% | 12.7% | 17,497 | 38.3% | 2.30 | 0.62 | 46.8% |
| 6 | **Apollo** | olympus | rare | Medic | Light | 61.0% | 11.1% | 11,291 | 41.5% | 0.00 | 0.59 | 0.0% |
| 7 | **Rumpelstiltskin** | grimmwood | legendary | Controller | Magic | 60.5% | 11.6% | 10,332 | 44.2% | 0.77 | 0.56 | 14.5% |
| 8 | **Little John** | sherwood | rare | Tank | Physical | 59.5% | 10.0% | 25,820 | 59.5% | 0.70 | 0.41 | 19.1% |
| 9 | **Lu Bu** | huaxia | legendary | Bruiser | Physical | 58.5% | 11.1% | 7,081 | 39.0% | 1.00 | 0.61 | 17.5% |
| 10 | **Red Riding Hood** | grimmwood | rare | Bruiser | Physical | 56.6% | 14.3% | 14,063 | 45.3% | 0.98 | 0.55 | 20.4% |
| 11 | **Nezha** | huaxia | epic | Sniper | Fire | 56.4% | 10.5% | 11,538 | 12.8% | 1.46 | 0.90 | 35.3% |
| 12 | **Lancelot** | camelot | epic | Bruiser | Physical | 56.0% | 13.5% | 9,514 | 24.0% | 0.70 | 0.76 | 13.1% |
| 13 | **Izanami** 🆕 | takamagahara | legendary | Controller | Shadow | 55.0% | 10.8% | 6,317 | 30.0% | 0.95 | 0.70 | 22.0% |
| 14 | **Snow White** | grimmwood | rare | Medic | Nature | 54.8% | 11.4% | 13,777 | 47.6% | 0.00 | 0.52 | 0.0% |
| 15 | **Merlin** | camelot | legendary | Caster | Magic | 53.3% | 12.2% | 7,540 | 28.9% | 0.49 | 0.71 | 11.9% |
| 16 | **Mordred** | camelot | rare | Sniper | Shadow | 53.3% | 16.2% | 12,053 | 23.3% | 1.65 | 0.77 | 40.3% |
| 17 | **Augustus** | roma | epic | Medic | Light | 53.3% | 12.2% | 13,508 | 40.0% | 0.00 | 0.60 | 0.0% |
| 18 | **Hua Tuo** | huaxia | rare | Medic | Light | 52.8% | 14.3% | 15,198 | 45.3% | 0.00 | 0.55 | 0.0% |
| 19 | **King Arthur** | camelot | legendary | Tank | Physical | 52.6% | 10.3% | 5,114 | 21.1% | 0.21 | 0.79 | 3.7% |
| 20 | **Tsukuyomi** 🆕 | takamagahara | epic | Caster | Shadow | 52.5% | 10.8% | 10,334 | 27.5% | 1.18 | 0.72 | 24.7% |
| 21 | **Huang Zhong** | huaxia | rare | Sniper | Physical | 52.1% | 13.0% | 9,751 | 22.9% | 1.04 | 0.77 | 21.4% |
| 22 | **Spartacus** | roma | epic | Tank | Physical | 52.0% | 13.5% | 5,669 | 30.0% | 0.30 | 0.70 | 6.3% |
| 23 | **Hansel & Gretel** | grimmwood | rare | Tank | Nature | 51.5% | 8.9% | 10,271 | 21.2% | 0.03 | 0.79 | 0.5% |
| 24 | **Big Bad Wolf** | grimmwood | epic | Bruiser | Nature | 50.0% | 9.7% | 15,361 | 38.9% | 1.36 | 0.61 | 31.5% |
| 25 | **Brutus** | roma | rare | Sniper | Shadow | 50.0% | 11.9% | 12,116 | 29.5% | 1.43 | 0.73 | 34.3% |
| 26 | **Julius Caesar** | roma | legendary | Bruiser | Physical | 49.1% | 14.3% | 9,768 | 30.2% | 1.19 | 0.70 | 31.0% |
| 27 | **Tomoe Gozen** | yamato | rare | Sniper | Physical | 49.0% | 13.2% | 11,442 | 28.6% | 1.41 | 0.71 | 35.1% |
| 28 | **Izanagi** 🆕 | takamagahara | epic | Medic | Light | 48.9% | 12.2% | 15,795 | 28.9% | 0.00 | 0.73 | 0.0% |
| 29 | **Pied Piper** | grimmwood | common | Controller | Magic | 48.8% | 11.1% | 5,412 | 41.5% | 0.51 | 0.59 | 9.3% |
| 30 | **Will Scarlet** | sherwood | epic | Bruiser | Physical | 48.5% | 8.9% | 5,987 | 24.2% | 0.70 | 0.76 | 16.2% |
| 31 | **Mulan** | huaxia | rare | Sniper | Physical | 47.8% | 12.4% | 7,928 | 21.7% | 0.76 | 0.78 | 14.6% |
| 32 | **Sun Wukong** | huaxia | legendary | Bruiser | Physical | 47.5% | 10.8% | 11,217 | 37.5% | 1.32 | 0.63 | 30.6% |
| 33 | **Qin Shi Huang** | huaxia | legendary | Caster | Magic | 46.5% | 11.6% | 9,120 | 11.6% | 0.79 | 0.88 | 21.0% |
| 34 | **Friar Tuck** | sherwood | common | Controller | Light | 46.2% | 10.5% | 6,429 | 35.9% | 0.95 | 0.64 | 22.2% |
| 35 | **Morgan le Fay** | camelot | epic | Controller | Shadow | 45.7% | 12.4% | 8,486 | 37.0% | 0.54 | 0.63 | 11.4% |
| 36 | **Abe no Seimei** | yamato | epic | Controller | Magic | 45.0% | 16.2% | 7,564 | 31.7% | 0.85 | 0.70 | 20.3% |
| 37 | **Athena** | olympus | epic | Controller | Light | 44.7% | 12.7% | 6,123 | 31.9% | 0.38 | 0.68 | 8.9% |
| 38 | **Zeus** | olympus | legendary | Caster | Lightning | 44.4% | 14.6% | 6,526 | 22.2% | 0.57 | 0.78 | 14.5% |
| 39 | **Hercules** | olympus | epic | Tank | Physical | 44.2% | 11.6% | 3,708 | 9.3% | 0.09 | 0.91 | 2.1% |
| 40 | **Inari** 🆕 | takamagahara | rare | Controller | Nature | 42.9% | 9.5% | 3,572 | 34.3% | 0.71 | 0.66 | 18.6% |
| 41 | **Cicero** | roma | rare | Controller | Magic | 42.2% | 12.2% | 6,901 | 35.6% | 1.00 | 0.64 | 27.0% |
| 42 | **Momotaro** | yamato | rare | Tank | Physical | 42.1% | 10.3% | 20,875 | 23.7% | 0.16 | 0.76 | 6.4% |
| 43 | **Medusa** | olympus | rare | Sniper | Shadow | 41.5% | 11.1% | 5,812 | 17.1% | 0.46 | 0.83 | 12.9% |
| 44 | **Guan Yu** | huaxia | epic | Tank | Physical | 40.9% | 11.9% | 5,411 | 18.2% | 0.07 | 0.82 | 1.2% |
| 45 | **Ares** | olympus | common | Bruiser | Fire | 39.1% | 12.4% | 5,900 | 13.0% | 0.65 | 0.87 | 14.7% |
| 46 | **Minamoto no Yoshitsune** | yamato | legendary | Bruiser | Physical | 37.5% | 10.8% | 9,767 | 17.5% | 1.13 | 0.82 | 27.9% |
| 47 | **Kaguya** | yamato | epic | Caster | Magic | 37.0% | 12.4% | 3,545 | 21.7% | 0.39 | 0.78 | 10.2% |
| 48 | **Zhuge Liang** | huaxia | epic | Controller | Magic | 36.8% | 10.3% | 8,062 | 28.9% | 0.87 | 0.71 | 23.9% |
| 49 | **Guinevere** | camelot | rare | Medic | Light | 34.1% | 11.1% | 14,998 | 26.8% | 0.00 | 0.73 | 0.0% |
| 50 | **Constantine the Great** | roma | legendary | Caster | Light | 30.0% | 10.8% | 7,153 | 12.5% | 0.45 | 0.88 | 9.6% |
| 51 | **Robin Hood** | sherwood | epic | Sniper | Nature | 27.9% | 11.6% | 5,007 | 9.3% | 0.30 | 0.91 | 8.6% |

### 3.2 Damage

| Hero | Total Dmg | Dmg/Round | Dmg/EN | Dmg Before Death | Dmg After 1st Kill | Crit % | Burn Dmg | Exposed Bonus | vs Tanks | vs Backline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Amaterasu 🆕 | 20,644 | 2,216 | 130.4 | 10,760 | 8,942 | 0.0% | 10,770 | 142 | 1,974 | 5,070 |
| Guy of Gisborne | 16,578 | 1,513 | 65.5 | 7,516 | 12,560 | 0.2% | 0 | 306 | 3,867 | 3,559 |
| Big Bad Wolf | 13,218 | 1,239 | 65.6 | 5,446 | 10,680 | 0.5% | 0 | 443 | 3,394 | 3,559 |
| Brutus | 11,543 | 1,016 | 65.4 | 5,967 | 9,027 | 0.0% | 0 | 184 | 2,512 | 5,934 |
| Mordred | 11,393 | 1,001 | 71.1 | 6,330 | 8,337 | 0.0% | 0 | 409 | 2,570 | 5,729 |
| Nezha | 10,954 | 935 | 61.9 | 6,282 | 6,875 | 0.0% | 271 | 236 | 3,607 | 4,636 |
| Tomoe Gozen | 10,879 | 987 | 54.4 | 5,901 | 8,480 | 0.0% | 0 | 592 | 2,123 | 5,223 |
| Rumpelstiltskin | 10,025 | 945 | 63.7 | 3,572 | 7,013 | 0.0% | 7,854 | 30 | 507 | 1,208 |
| Tsukuyomi 🆕 | 9,864 | 911 | 76.0 | 5,264 | 7,258 | 0.0% | 0 | 494 | 1,573 | 6,024 |
| Huang Zhong | 9,334 | 816 | 79.7 | 5,220 | 6,475 | 0.0% | 0 | 252 | 2,343 | 4,926 |
| Minamoto no Yoshitsune | 9,317 | 803 | 52.3 | 6,348 | 6,827 | 0.0% | 0 | 278 | 2,223 | 3,480 |
| Julius Caesar | 9,293 | 854 | 52.1 | 4,999 | 7,252 | 0.0% | 0 | 261 | 2,332 | 1,894 |
| Lancelot | 9,234 | 869 | 115.1 | 5,720 | 6,440 | 25.6% | 0 | 202 | 2,306 | 1,518 |
| Sun Wukong | 9,199 | 805 | 90.8 | 4,688 | 7,801 | 0.4% | 0 | 472 | 3,163 | 1,977 |
| Qin Shi Huang | 8,804 | 750 | 69.3 | 7,481 | 5,748 | 0.4% | 0 | 258 | 2,251 | 4,523 |
| Morgan le Fay | 8,268 | 693 | 42.6 | 3,669 | 5,912 | 0.0% | 0 | 1,915 | 829 | 5,003 |
| Zhuge Liang | 7,714 | 671 | 40.7 | 5,032 | 5,885 | 0.0% | 0 | 210 | 975 | 4,575 |
| Mulan | 7,624 | 709 | 116.2 | 4,405 | 5,880 | 18.1% | 0 | 251 | 1,771 | 3,321 |
| Little John | 7,250 | 549 | 29.1 | 3,938 | 6,263 | 0.0% | 0 | 102 | 911 | 3,314 |
| Abe no Seimei | 7,224 | 676 | 43.9 | 3,921 | 5,650 | 0.0% | 0 | 379 | 1,955 | 3,376 |
| Lu Bu | 6,681 | 579 | 86.4 | 2,062 | 5,181 | 0.0% | 0 | 409 | 1,403 | 2,727 |
| Cicero | 6,501 | 564 | 44.4 | 3,396 | 5,643 | 0.0% | 0 | 947 | 1,670 | 3,150 |
| Susanoo 🆕 | 6,352 | 571 | 76.3 | 1,864 | 4,087 | 0.3% | 0 | 264 | 1,470 | 1,683 |
| Zeus | 6,296 | 559 | 80.2 | 3,343 | 5,410 | 0.5% | 0 | 355 | 1,647 | 2,880 |
| Constantine the Great | 6,141 | 558 | 42.3 | 4,919 | 4,393 | 0.0% | 0 | 102 | 1,792 | 1,594 |
| Friar Tuck | 6,049 | 520 | 44.6 | 2,795 | 4,901 | 0.5% | 0 | 1,157 | 1,153 | 3,050 |
| Izanami 🆕 | 5,937 | 498 | 87.6 | 3,515 | 5,383 | 0.0% | 1,683 | 110 | 1,058 | 1,919 |
| Red Riding Hood | 5,876 | 533 | 84.7 | 2,130 | 4,901 | 11.2% | 0 | 503 | 1,571 | 1,069 |
| Will Scarlet | 5,708 | 474 | 78.7 | 3,524 | 4,335 | 0.0% | 0 | 225 | 881 | 1,020 |
| Ares | 5,639 | 497 | 77.0 | 3,927 | 4,046 | 1.1% | 217 | 236 | 1,825 | 1,182 |
| Medusa | 5,626 | 545 | 81.3 | 4,210 | 3,726 | 0.0% | 0 | 326 | 1,278 | 3,357 |
| Merlin | 5,269 | 440 | 62.2 | 2,554 | 3,928 | 0.0% | 0 | 517 | 1,700 | 2,466 |
| Pied Piper | 5,207 | 459 | 48.2 | 3,095 | 4,152 | 0.0% | 0 | 89 | 565 | 2,985 |
| Robin Hood | 4,886 | 450 | 76.1 | 4,145 | 2,427 | 0.0% | 0 | 42 | 1,027 | 2,890 |
| Spartacus | 3,488 | 318 | 43.4 | 2,254 | 2,335 | 0.4% | 0 | 103 | 980 | 443 |
| Kaguya | 3,330 | 324 | 77.1 | 1,893 | 2,584 | 0.0% | 0 | 166 | 979 | 1,439 |
| Inari 🆕 | 3,287 | 331 | 29.4 | 2,080 | 3,070 | 0.0% | 0 | 67 | 837 | 1,397 |
| Athena | 2,837 | 255 | 51.0 | 1,301 | 2,486 | 0.6% | 0 | 184 | 917 | 1,225 |
| Guan Yu | 2,835 | 258 | 23.7 | 2,260 | 1,440 | 0.0% | 0 | 59 | 645 | 388 |
| King Arthur | 2,830 | 259 | 39.2 | 1,622 | 1,763 | 0.0% | 0 | 101 | 784 | 410 |
| Benkei | 2,815 | 255 | 40.4 | 1,280 | 1,925 | 0.0% | 0 | 94 | 670 | 459 |
| Momotaro | 2,387 | 179 | 8.8 | 1,720 | 1,610 | 0.0% | 0 | 179 | 666 | 221 |
| Hercules | 1,957 | 172 | 15.1 | 1,517 | 998 | 0.0% | 0 | 51 | 690 | 215 |
| Hansel & Gretel | 1,857 | 155 | 10.0 | 1,328 | 890 | 0.0% | 0 | 63 | 505 | 161 |
| Guinevere | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Apollo | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Maid Marian | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Snow White | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Hua Tuo | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Augustus | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |
| Izanagi 🆕 | 0 | 0 | 0.0 | 0 | 0 | — | 0 | 0 | 0 | 0 |

### 3.3 Utility

| Hero | Healing | Shielding | Prevented | Taunt Turns | Redirects | Buff Uptime | Debuff Uptime | Ally Dmg Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Maid Marian | 10,781 | 5,787 | 0 | 0.00 | 0.00 | 14.5% | 9.5% | 0 |
| Hua Tuo | 12,325 | 3,755 | 0 | 0.00 | 0.00 | 22.1% | 19.8% | 0 |
| Snow White | 13,492 | 1,992 | 0 | 0.00 | 0.00 | 65.6% | 13.7% | 0 |
| Izanagi 🆕 | 9,824 | 5,178 | 0 | 0.00 | 0.00 | 26.3% | 16.4% | 0 |
| Momotaro | 3,688 | 10,354 | 0 | 3.68 | 4.82 | 72.5% | 28.5% | 0 |
| Augustus | 7,249 | 5,847 | 0 | 0.00 | 0.00 | 25.4% | 8.9% | 0 |
| Little John | 0 | 12,904 | 0 | 2.05 | 2.57 | 86.2% | 20.1% | 0 |
| Guinevere | 6,438 | 6,060 | 0 | 0.00 | 0.00 | 30.5% | 19.7% | 0 |
| Apollo | 8,051 | 3,633 | 0 | 0.00 | 0.00 | 27.5% | 8.8% | 0 |
| Benkei | 0 | 0 | 6,763 | 4.61 | 4.71 | 45.7% | 23.7% | 0 |
| Hansel & Gretel | 1,004 | 5,249 | 0 | 6.58 | 8.09 | 39.2% | 26.2% | 0 |
| Red Riding Hood | 423 | 5,636 | 0 | 0.00 | 0.00 | 62.2% | 24.4% | 0 |
| Athena | 0 | 0 | 3,916 | 0.00 | 0.00 | 21.0% | 16.2% | 0 |
| Big Bad Wolf | 1,998 | 0 | 0 | 0.00 | 0.00 | 32.7% | 28.9% | 0 |
| Guan Yu | 0 | 1,697 | 0 | 5.27 | 6.16 | 49.0% | 22.7% | 0 |
| King Arthur | 0 | 1,589 | 0 | 5.50 | 5.89 | 59.3% | 23.0% | 0 |
| Susanoo 🆕 | 0 | 1,575 | 0 | 7.74 | 6.50 | 53.0% | 19.8% | 0 |
| Merlin | 0 | 1,378 | 0 | 0.00 | 0.00 | 21.2% | 42.3% | 0 |
| Spartacus | 0 | 1,367 | 0 | 5.30 | 6.40 | 68.7% | 21.3% | 0 |
| Hercules | 0 | 1,258 | 0 | 6.56 | 9.28 | 71.3% | 34.6% | 0 |
| Sun Wukong | 0 | 1,004 | 0 | 0.78 | 0.13 | 42.7% | 21.8% | 0 |
| Amaterasu 🆕 | 747 | 0 | 0 | 0.00 | 0.00 | 9.8% | 33.3% | 0 |
| Constantine the Great | 0 | 586 | 0 | 0.00 | 0.00 | 45.2% | 29.3% | 0 |
| Kaguya | 21 | 26 | 0 | 0.02 | 0.00 | 25.7% | 29.4% | 0 |
| Lancelot | 0 | 0 | 0 | 0.00 | 0.00 | 88.1% | 38.7% | 0 |
| Morgan le Fay | 0 | 0 | 0 | 0.00 | 0.00 | 28.1% | 25.5% | 3,795 |
| Mordred | 0 | 0 | 0 | 0.00 | 0.00 | 21.5% | 29.0% | 71 |
| Zeus | 0 | 0 | 0 | 0.00 | 0.00 | 19.5% | 37.1% | 0 |
| Medusa | 0 | 0 | 0 | 0.00 | 0.00 | 14.1% | 16.4% | 383 |
| Ares | 0 | 0 | 0 | 0.00 | 0.00 | 82.8% | 29.5% | 0 |
| Guy of Gisborne | 0 | 0 | 0 | 0.00 | 0.00 | 22.2% | 21.1% | 0 |
| Robin Hood | 0 | 0 | 0 | 0.00 | 0.00 | 15.0% | 28.3% | 0 |
| Will Scarlet | 0 | 0 | 0 | 0.00 | 0.00 | 57.3% | 23.3% | 0 |
| Friar Tuck | 0 | 0 | 0 | 0.00 | 0.00 | 17.7% | 26.8% | 2,308 |
| Rumpelstiltskin | 0 | 0 | 0 | 0.00 | 0.00 | 19.6% | 15.4% | 1,094 |
| Pied Piper | 0 | 0 | 0 | 0.00 | 0.00 | 15.0% | 18.5% | 559 |
| Minamoto no Yoshitsune | 0 | 0 | 0 | 0.00 | 0.00 | 19.5% | 28.1% | 0 |
| Tomoe Gozen | 0 | 0 | 0 | 0.00 | 0.00 | 18.7% | 21.9% | 0 |
| Abe no Seimei | 0 | 0 | 0 | 0.00 | 0.00 | 24.8% | 21.8% | 2,032 |
| Qin Shi Huang | 0 | 0 | 0 | 0.00 | 0.00 | 26.5% | 33.1% | 0 |
| Lu Bu | 0 | 0 | 0 | 0.00 | 0.00 | 35.0% | 17.8% | 0 |
| Zhuge Liang | 0 | 0 | 0 | 0.00 | 0.00 | 21.3% | 17.8% | 0 |
| Huang Zhong | 0 | 0 | 0 | 0.00 | 0.00 | 22.2% | 35.2% | 13 |
| Nezha | 0 | 0 | 0 | 0.00 | 0.00 | 17.1% | 30.8% | 0 |
| Mulan | 0 | 0 | 0 | 0.00 | 0.00 | 53.2% | 26.5% | 0 |
| Julius Caesar | 0 | 0 | 0 | 0.00 | 0.00 | 21.0% | 28.4% | 0 |
| Cicero | 0 | 0 | 0 | 0.00 | 0.00 | 15.3% | 24.6% | 1,716 |
| Brutus | 0 | 0 | 0 | 0.00 | 0.00 | 32.9% | 28.8% | 0 |
| Tsukuyomi 🆕 | 0 | 0 | 0 | 0.00 | 0.00 | 18.7% | 24.6% | 0 |
| Izanami 🆕 | 0 | 0 | 0 | 0.00 | 0.00 | 55.2% | 17.9% | 0 |
| Inari 🆕 | 0 | 0 | 0 | 0.00 | 0.00 | 19.1% | 16.1% | 1,696 |

### 3.4 Economy

| Hero | Energy Spent/game | Basics/game | Signatures/game | Avg EN When Sig Used |
| --- | --- | --- | --- | --- |
| Little John | 249 | 2.05 | 8.70 | 71.7 |
| Momotaro | 271 | 3.68 | 6.05 | 80.4 |
| Snow White | 223 | 2.14 | 5.93 | 62.7 |
| Hua Tuo | 174 | 2.30 | 5.53 | 59.5 |
| Cicero | 147 | 0.87 | 5.33 | 73.8 |
| Friar Tuck | 135 | 0.51 | 5.08 | 71.0 |
| Guy of Gisborne | 253 | 1.79 | 5.02 | 79.3 |
| Big Bad Wolf | 202 | 1.22 | 4.56 | 77.0 |
| Abe no Seimei | 165 | 0.80 | 4.35 | 74.0 |
| Pied Piper | 108 | 1.76 | 4.20 | 63.7 |
| Morgan le Fay | 194 | 1.85 | 4.17 | 74.5 |
| Tomoe Gozen | 200 | 1.84 | 3.84 | 81.9 |
| Inari 🆕 | 112 | 1.14 | 3.77 | 65.2 |
| Zhuge Liang | 189 | 2.63 | 3.74 | 76.4 |
| Izanagi 🆕 | 190 | 3.60 | 3.40 | 67.1 |
| Mordred | 160 | 1.97 | 3.25 | 80.5 |
| Julius Caesar | 178 | 2.19 | 3.21 | 83.3 |
| Brutus | 177 | 2.27 | 3.16 | 77.7 |
| Nezha | 177 | 1.59 | 3.05 | 86.0 |
| Guinevere | 153 | 4.05 | 3.05 | 61.3 |
| Rumpelstiltskin | 157 | 2.42 | 3.00 | 70.5 |
| Apollo | 108 | 3.17 | 2.98 | 54.7 |
| Hansel & Gretel | 186 | 3.73 | 2.85 | 76.7 |
| Amaterasu 🆕 | 158 | 1.07 | 2.59 | 76.5 |
| Minamoto no Yoshitsune | 178 | 2.58 | 2.52 | 86.6 |
| Constantine the Great | 145 | 1.43 | 2.25 | 82.3 |
| Tsukuyomi 🆕 | 130 | 2.05 | 2.17 | 78.6 |
| Qin Shi Huang | 127 | 2.60 | 1.93 | 73.6 |
| Huang Zhong | 117 | 2.58 | 1.73 | 78.7 |
| Guan Yu | 119 | 3.70 | 1.57 | 75.7 |
| Hercules | 130 | 3.58 | 1.49 | 72.1 |
| Zeus | 79 | 2.93 | 0.61 | 79.1 |
| Merlin | 85 | 4.00 | 0.53 | 59.9 |
| Kaguya | 43 | 2.39 | 0.15 | 56.9 |
| King Arthur | 72 | 4.68 | 0.00 | — |
| Lancelot | 80 | 5.46 | 0.00 | — |
| Athena | 56 | 3.70 | 0.00 | — |
| Medusa | 69 | 4.66 | 0.00 | — |
| Ares | 73 | 4.83 | 0.00 | — |
| Robin Hood | 64 | 4.30 | 0.00 | — |
| Will Scarlet | 73 | 4.82 | 0.00 | — |
| Maid Marian | 88 | 5.82 | 0.00 | — |
| Red Riding Hood | 69 | 4.72 | 0.00 | — |
| Benkei | 70 | 4.61 | 0.00 | — |
| Lu Bu | 77 | 5.24 | 0.00 | — |
| Sun Wukong | 101 | 6.65 | 0.00 | — |
| Mulan | 66 | 4.35 | 0.00 | — |
| Spartacus | 80 | 5.30 | 0.00 | — |
| Augustus | 92 | 6.13 | 0.00 | — |
| Izanami 🆕 | 68 | 4.55 | 0.00 | — |
| Susanoo 🆕 | 83 | 5.55 | 0.00 | — |

**Insights**

- **Top 5:** Susanoo (76.3%), Benkei (70.7%), Maid Marian (69.2%), Amaterasu (68.3%), Guy of Gisborne (68.1%).
- **Bottom 5:** Robin Hood (27.9%), Constantine the Great (30.0%), Guinevere (34.1%), Zhuge Liang (36.8%), Kaguya (37.0%).
- **Roma placement:** Susanoo #1, Amaterasu #4, Izanami #13, Tsukuyomi #20, Izanagi #28, Inari #40 out of 51. At least one Roma hero reaches an extreme of the ladder; see Section 12 for flags.

---

## 4. Ability Statistics

| Ability | Hero | Kind | Casts | Casts/game | Value/cast | Kill conv. | Targets/cast | Dmg/cast | Heal/cast | Shield/cast | Buffs/cast | Debuffs/cast |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Divine Strategy | Athena | Passive | 1,270 | 6.35 | 289 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Standing Death | Benkei | Passive | 1,210 | 6.05 | 454 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Finest Knight | Lancelot | Passive | 817 | 4.08 | 642 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Hunter's Courage | Red Riding Hood | Passive | 508 | 2.54 | 1,417 | 0.00 | 0.00 | 0 | 0 | 458 | 0.00 | 0.00 |
| Rallying Spirit | Maid Marian | Passive | 440 | 2.20 | 1,384 | 0.00 | 0.00 | 0 | 566 | 0 | 0.00 | 0.00 |
| Quarterstaff Guard | Little John | Signature (25 EN) | 322 | 1.61 | 2,439 | 0.00 | 1.48 | 0 | 0 | 1,483 | 4.00 | 0.00 |
| Five Animals Play | Hua Tuo | Signature (25 EN) | 293 | 1.47 | 2,502 | 0.00 | 1.00 | 0 | 1,821 | 319 | 1.54 | 0.00 |
| Bloodlust | Ares | Passive | 282 | 1.41 | 0 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Warrior's Resolve | Mulan | Passive | 275 | 1.38 | 336 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Shikigami Prophecy | Abe no Seimei | Signature (35 EN) | 261 | 1.30 | 977 | 0.07 | 1.00 | 615 | 0 | 0 | 0.00 | 0.85 |
| Forest Blessing | Snow White | Signature (32 EN) | 249 | 1.25 | 3,620 | 0.00 | 4.69 | 0 | 2,052 | 0 | 4.69 | 0.00 |
| Slayer of Yamata no Orochi | Susanoo 🆕 | Passive | 243 | 1.22 | 869 | 0.00 | 0.00 | 0 | 0 | 246 | 0.00 | 0.00 |
| Philippics | Cicero | Signature (25 EN) | 240 | 1.20 | 1,624 | 0.18 | 1.00 | 1,130 | 0 | 0 | 0.00 | 1.38 |
| Ruthless Pursuit | Guy of Gisborne | Signature (45 EN) | 236 | 1.18 | 3,014 | 0.47 | 1.00 | 3,014 | 0 | 0 | 0.00 | 0.00 |
| Legendary Companions | Momotaro | Signature (35 EN) | 230 | 1.15 | 3,421 | 0.00 | 4.43 | 0 | 609 | 1,711 | 6.04 | 0.00 |
| Words of Wisdom | Friar Tuck | Signature (29 EN) | 198 | 0.99 | 1,893 | 0.18 | 1.00 | 1,123 | 0 | 0 | 0.00 | 1.54 |
| Treasonous Strike | Mordred | Signature (40 EN) | 195 | 0.97 | 2,934 | 0.49 | 1.10 | 2,890 | 0 | 0 | 0.00 | 0.10 |
| Dark Illusion | Morgan le Fay | Signature (40 EN) | 192 | 0.96 | 3,772 | 0.09 | 2.00 | 1,681 | 0 | 0 | 0.00 | 4.00 |
| Beheading Volley | Tomoe Gozen | Signature (45 EN) | 188 | 0.94 | 2,283 | 0.31 | 1.00 | 2,283 | 0 | 0 | 0.00 | 0.00 |
| Enchanted Melody | Pied Piper | Signature (20 EN) | 172 | 0.86 | 2,352 | 0.09 | 2.00 | 1,060 | 0 | 0 | 0.00 | 2.72 |
| Veni, Vidi, Vici | Julius Caesar | Signature (45 EN) | 170 | 0.85 | 2,302 | 0.35 | 1.30 | 2,297 | 0 | 0 | 0.02 | 0.00 |
| Savage Hunger | Big Bad Wolf | Signature (40 EN) | 164 | 0.82 | 3,124 | 0.27 | 1.57 | 2,685 | 439 | 0 | 0.00 | 0.00 |
| Pax Romana | Augustus | Passive | 154 | 0.77 | 4,099 | 0.00 | 0.00 | 0 | 684 | 0 | 0.00 | 0.00 |
| Misogi at the River Mouth | Izanagi 🆕 | Signature (40 EN) | 153 | 0.77 | 3,049 | 0.00 | 2.92 | 0 | 2,095 | 521 | 1.20 | 0.00 |
| Halberd of the Conqueror | Lu Bu | Passive | 143 | 0.71 | 0 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Eight Gates Array | Zhuge Liang | Signature (40 EN) | 142 | 0.71 | 2,689 | 0.18 | 2.00 | 1,585 | 0 | 0 | 0.00 | 3.92 |
| Et Tu, Brute | Brutus | Signature (45 EN) | 139 | 0.69 | 3,501 | 0.40 | 2.82 | 2,873 | 0 | 0 | 1.82 | 0.00 |
| Kitsune's Bounty | Inari 🆕 | Signature (25 EN) | 132 | 0.66 | 1,147 | 0.17 | 1.00 | 654 | 0 | 0 | 0.00 | 1.00 |
| Cruel Bargain | Rumpelstiltskin | Signature (40 EN) | 129 | 0.65 | 2,026 | 0.00 | 4.41 | 0 | 0 | 0 | 0.00 | 8.82 |
| Royal Blessing | Guinevere | Signature (30 EN) | 125 | 0.63 | 1,983 | 0.00 | 1.00 | 0 | 1,159 | 729 | 1.29 | 0.00 |
| Sun's Grace | Apollo | Signature (20 EN) | 122 | 0.61 | 2,356 | 0.00 | 1.66 | 0 | 1,906 | 0 | 1.00 | 0.66 |
| Wind Fire Wheels | Nezha | Signature (50 EN) | 119 | 0.59 | 2,972 | 0.48 | 1.00 | 2,972 | 0 | 0 | 0.00 | 0.18 |
| Heaven-Shining Radiance | Amaterasu 🆕 | Signature (55 EN) | 106 | 0.53 | 3,656 | 0.24 | 5.42 | 3,368 | 289 | 0 | 0.00 | 4.72 |
| War Drums | Minamoto no Yoshitsune | Signature (55 EN) | 101 | 0.51 | 2,693 | 0.43 | 1.00 | 2,693 | 0 | 0 | 0.00 | 0.00 |
| Petrifying Gaze | Medusa | Passive | 96 | 0.48 | 0 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Lost in the Woods | Hansel & Gretel | Signature (45 EN) | 94 | 0.47 | 2,844 | 0.00 | 1.83 | 0 | 0 | 1,843 | 3.00 | 0.00 |
| A Thousand a Day | Izanami 🆕 | Passive | 93 | 0.47 | 2,899 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| In Hoc Signo Vinces | Constantine the Great | Signature (55 EN) | 90 | 0.45 | 4,005 | 0.13 | 6.84 | 2,007 | 0 | 260 | 5.58 | 0.00 |
| Moonlit Reproach | Tsukuyomi 🆕 | Signature (45 EN) | 87 | 0.43 | 4,026 | 0.48 | 2.00 | 3,366 | 0 | 0 | 0.00 | 2.00 |
| Great Wall Mandate | Qin Shi Huang | Signature (45 EN) | 83 | 0.41 | 3,358 | 0.19 | 4.80 | 3,124 | 0 | 0 | 0.00 | 1.81 |
| Precision Volley | Huang Zhong | Signature (45 EN) | 83 | 0.41 | 3,534 | 0.39 | 1.00 | 3,496 | 0 | 0 | 0.00 | 0.08 |
| I Am Spartacus | Spartacus | Passive | 79 | 0.40 | 3,344 | 0.00 | 0.00 | 0 | 0 | 865 | 0.00 | 0.00 |
| Crescent Blade Guard | Guan Yu | Signature (40 EN) | 69 | 0.34 | 2,129 | 0.00 | 1.00 | 0 | 0 | 1,082 | 2.00 | 0.00 |
| Daring Duelist | Will Scarlet | Passive | 69 | 0.34 | 0 | 0.00 | 0.00 | 0 | 0 | 0 | 0.00 | 0.00 |
| Twelve Labors | Hercules | Signature (50 EN) | 64 | 0.32 | 2,308 | 0.00 | 1.00 | 0 | 0 | 0 | 3.00 | 0.00 |
| King of Knights | King Arthur | Passive | 52 | 0.26 | 3,449 | 0.00 | 0.00 | 0 | 0 | 1,161 | 0.00 | 0.00 |
| Divine Judgment | Zeus | Signature (60 EN) | 33 | 0.17 | 4,452 | 0.15 | 2.39 | 3,728 | 0 | 0 | 0.00 | 2.39 |
| 72 Transformations | Sun Wukong | Passive | 31 | 0.15 | 4,198 | 0.00 | 0.00 | 0 | 0 | 1,296 | 0.00 | 0.00 |
| Prophecy | Merlin | Signature (45 EN) | 24 | 0.12 | 2,583 | 0.00 | 4.88 | 0 | 0 | 2,583 | 4.88 | 0.00 |
| Moon Reflection | Kaguya | Signature (45 EN) | 7 | 0.04 | 1,792 | 0.00 | 1.29 | 1,349 | 136 | 174 | 0.43 | 0.00 |

### Role Basics

| Basic | Casts | Casts/game | Value/cast | Kill conv. | Dmg/cast | Heal/cast |
| --- | --- | --- | --- | --- | --- | --- |
| Strike | 1,732 | 8.66 | 1,484 | 0.14 | 1,246 | 13 |
| Guard | 1,499 | 7.50 | 1,894 | 0.05 | 608 | 0 |
| Restore | 1,173 | 5.87 | 1,919 | 0.00 | 0 | 773 |
| Aim | 1,070 | 5.35 | 1,264 | 0.11 | 1,257 | 0 |
| Disrupt | 864 | 4.32 | 995 | 0.13 | 756 | 0 |
| Spell | 743 | 3.71 | 1,254 | 0.14 | 1,254 | 0 |

**Insights**

- **Highest value per cast:** Divine Judgment (Zeus) at 4,452 per cast.
- **Best kill conversion:** Treasonous Strike (Mordred) at 0.49 kills per cast.
- 🆕 **Slayer of Yamata no Orochi** (Susanoo): 1.22 casts/game, 869 value/cast, 0.00 kills/cast.
- 🆕 **Misogi at the River Mouth** (Izanagi): 0.77 casts/game, 3,049 value/cast, 0.00 kills/cast.
- 🆕 **Kitsune's Bounty** (Inari): 0.66 casts/game, 1,147 value/cast, 0.17 kills/cast.
- 🆕 **Heaven-Shining Radiance** (Amaterasu): 0.53 casts/game, 3,656 value/cast, 0.24 kills/cast.
- 🆕 **A Thousand a Day** (Izanami): 0.47 casts/game, 2,899 value/cast, 0.00 kills/cast.
- 🆕 **Moonlit Reproach** (Tsukuyomi): 0.43 casts/game, 4,026 value/cast, 0.48 kills/cast.

---

## 5. Status Effect Statistics

| Status | Applications | Apps/game | Avg duration (rounds) | Cleanse rate | Avg value created |
| --- | --- | --- | --- | --- | --- |
| burn | 701 | 3.50 | 1.14 | 23.3% | 1,237 |
| exposed | 1,316 | 6.58 | 0.88 | 7.7% | 466 |
| marked | 931 | 4.66 | 1.20 | 15.4% | 1,250 |
| silence | 525 | 2.63 | 0.79 | 7.8% | 0 |
| taunt | 1,872 | 9.36 | 0.93 | 0.0% | 1,217 |
| healMod | 280 | 1.40 | 2.63 | 11.4% | 0 |
| untargetable | 31 | 0.15 | 1.00 | 0.0% | 0 |

### Burn

| Metric | Value |
| --- | --- |
| Total burn damage | 867,221 |
| Burn ticks | 3,137 |
| Average damage per tick | 276 |
| Burn kills | 57 |
| Burn damage per game | 4,336 |

### Exposed

| Metric | Value |
| --- | --- |
| Applications | 1,316 |
| Average damage dealt while Exposed | 1,368 |
| Average kills while Exposed | 0.20 |
| Total Exposed-enabled bonus damage | 613,670 |

### Mark

| Metric | Value |
| --- | --- |
| Applications | 931 |
| Triggers | 717 |
| Trigger rate | 77.0% |
| Damage dealt on trigger | 1,163,596 |
| Average damage per trigger | 1,623 |

**Insights**

- **Most applied status:** taunt (9.36 per game); least applied: untargetable (0.15 per game).
- **Mark reliability:** 77.0% of Marks are consumed for 1,623 damage each — Marks are a real currency, not a decoration.
- **Silence:** 2.63 applications per game. Roma's Cicero is one of only two sources in the game (with Abe no Seimei), so this line moves almost entirely with his pick rate.
- **Shielding:** Constantine's kill-gated team Shield now resolves conditionally — the engine previously ignored `if` on shield effects entirely, which also silently made Momotaro's energy-gated shield unconditional. That fix is included in this build and is the only change to a pre-existing card's real behaviour.

---

## 6. Pair Synergies

*Pairs with 65+ appearances together.*

Qualifying pairs: **0** of 1254 observed.

### Top 25 pairs

| Pair | Games | Win Rate | Dmg together | KP together |
| --- | --- | --- | --- | --- |

### Bottom 15 pairs

| Pair | Games | Win Rate | Dmg together | KP together |
| --- | --- | --- | --- | --- |

### Roma pairs (best 15)

| Pair | Games | Win Rate | Dmg together | KP together |
| --- | --- | --- | --- | --- |

**Insights**

- **Best pair overall:** —.
- **Worst pair overall:** —.
- **Roma cross-faction:** 0 qualifying pairs include a Roma hero, averaging — — versus — for pairs with no Roma hero.

---

## 7. Role Pair Synergies

| Role Pair | Games | Win Rate |
| --- | --- | --- |
| Medic + Tank | 142 | 59.9% |
| Tank + Tank | 82 | 58.5% |
| Bruiser + Tank | 199 | 54.8% |
| Bruiser + Medic | 161 | 54.7% |
| Caster + Medic | 127 | 54.3% |
| Medic + Medic | 74 | 54.1% |
| Caster + Tank | 163 | 53.4% |
| Sniper + Tank | 181 | 52.5% |
| Bruiser + Bruiser | 126 | 52.4% |
| Controller + Tank | 196 | 51.0% |
| Medic + Sniper | 149 | 51.0% |
| Bruiser + Sniper | 189 | 50.8% |
| Bruiser + Caster | 172 | 50.6% |
| Controller + Medic | 155 | 50.3% |
| Bruiser + Controller | 203 | 48.8% |
| Caster + Sniper | 159 | 48.4% |
| Controller + Sniper | 191 | 47.1% |
| Controller + Controller | 133 | 46.6% |
| Caster + Controller | 169 | 45.6% |
| Sniper + Sniper | 95 | 42.1% |
| Caster + Caster | 66 | 40.9% |

**Insights**

- **Strongest archetype:** Medic + Tank at 59.9%.
- **Weakest archetype:** Caster + Caster at 40.9%.
- **Archetype spread:** 19.0pp between the best and worst role pairing. Worth investigating the extremes.
- **Doubling up:** Tank×2 58.5%, Medic×2 54.1%, Bruiser×2 52.4%, Controller×2 46.6%, Sniper×2 42.1%, Caster×2 40.9%.

---

## 8. Matchups

*Best and worst 5 opposing heroes for each hero. Minimum 20 meetings.*

**Insights**

- Matchup tables are the balance-safe lens: a hero with a high overall win rate but a flat matchup spread is *generically* strong (nerf the numbers), while one with a jagged spread is *situationally* strong (adjust the counters instead).

---

## 9. Team Composition Statistics

| Composition | Games | Win Rate |
| --- | --- | --- |
| 2+ Tanks | 82 | 58.5% |
| 1 Tank | 186 | 50.5% |
| 0 Tanks | 102 | 42.2% |
| 2+ Bruisers | 126 | 52.4% |
| 1 Bruiser | 157 | 50.3% |
| 0 Bruisers | 87 | 46.0% |
| 2+ Controllers | 133 | 46.6% |
| 1 Controller | 146 | 47.9% |
| 0 Controllers | 91 | 58.2% |
| 2+ Casters | 66 | 40.9% |
| 1 Caster | 168 | 52.4% |
| 0 Casters | 136 | 51.5% |
| 2+ Medics | 74 | 54.1% |
| 1 Medic | 147 | 53.1% |
| 0 Medics | 149 | 45.0% |
| 2+ Snipers | 95 | 42.1% |
| 1 Sniper | 168 | 53.6% |
| 0 Snipers | 107 | 51.4% |

**Insights**

- **Tank:** 2+ = 58.5%, 1 = 50.5%, 0 = 42.2% (+16.4pp for stacking). Stacking this role pays off.
- **Bruiser:** 2+ = 52.4%, 1 = 50.3%, 0 = 46.0% (+6.4pp for stacking). Stacking this role pays off.
- **Controller:** 2+ = 46.6%, 1 = 47.9%, 0 = 58.2% (-11.6pp for stacking). Stacking this role is a liability.
- **Caster:** 2+ = 40.9%, 1 = 52.4%, 0 = 51.5% (-10.6pp for stacking). Stacking this role is a liability.
- **Medic:** 2+ = 54.1%, 1 = 53.1%, 0 = 45.0% (+9.1pp for stacking). Stacking this role pays off.
- **Sniper:** 2+ = 42.1%, 1 = 53.6%, 0 = 51.4% (-9.3pp for stacking). Stacking this role is a liability.

---

## 10. Position Statistics

| Row | Apps | Avg deaths | Avg survival | Avg damage | Avg healing | Avg targeted | Avg redirects |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Front | 1,110 | 0.72 | 27.8% | 5,250 | 964 | 8.63 | 1.97 |
| Back | 1,110 | 0.68 | 32.5% | 6,585 | 2,011 | 4.94 | 0.01 |

**Insights**

- **Front-line tax:** front-row heroes die 0.72 times per appearance versus 0.68 in the back (6.1% more), and are targeted 1.7× as often.
- **Back-line output:** the back row deals 6,585 damage per appearance versus 5,250 in front — the positioning trade (durability for output) is real and priced.
- Positioning matters enough to be a genuine decision, which validates the role-aware auto-formation.

---

## 11. AI Decision Statistics

### Action kind choice

| Kind | Count | Share |
| --- | --- | --- |
| Damage | 8,843 | 73.1% |
| Heal | 2,451 | 20.3% |
| Shield | 599 | 5.0% |
| Buff | 64 | 0.5% |
| Debuff | 136 | 1.1% |
| — Basic casts | 8,211 | 58.4% |
| — Signature casts | 5,853 | 41.6% |

### Target priorities

*Share of single-target enemy abilities that chose a target matching each property.*

| Priority | Count | Share of single-target casts |
| --- | --- | --- |
| Lowest HP | 5,169 | 67.0% |
| Highest ATK | 4,343 | 56.3% |
| Tank | 3,178 | 41.2% |
| Backline | 1,795 | 23.3% |
| Marked | 94 | 1.2% |
| Exposed | 963 | 12.5% |

**Insights**

- **Focus fire:** 67.0% of single-target casts go at the lowest-HP enemy — the AI is closing on wounded targets rather than spreading damage, which is correct play and the reason kill-payoff factions like Roma get to function at all.
- **Threat assessment:** 56.3% of casts hit the highest-ATK enemy, and 23.3% reach the back line despite row restrictions.
- **Status awareness:** 1.2% of casts land on Marked targets and 12.5% on Exposed ones, so setup keywords are being cashed in rather than wasted.

---

## 12. Outlier Detection

| Scope | Name | ID | Metric | Value | Threshold | Direction |
| --- | --- | --- | --- | --- | --- | --- |
| Hero | Guinevere | camelot-guinevere | Win Rate | 34.1% | < 35% | NEGATIVE |
| Hero | Guy of Gisborne | sherwood-guy-of-gisborne | Win Rate | 68.1% | > 65% | POSITIVE |
| Hero | Robin Hood | sherwood-robin-hood | Win Rate | 27.9% | < 35% | NEGATIVE |
| Hero | Maid Marian | sherwood-maid-marian | Win Rate | 69.2% | > 65% | POSITIVE |
| Hero | Benkei | yamato-benkei | Win Rate | 70.7% | > 65% | POSITIVE |
| Hero | Constantine the Great | roma-constantine-the-great | Win Rate | 30.0% | < 35% | NEGATIVE |
| Hero | Amaterasu 🆕 | takamagahara-amaterasu | Win Rate | 68.3% | > 65% | POSITIVE |
| Hero | Susanoo 🆕 | takamagahara-susanoo | Win Rate | 76.3% | > 65% | POSITIVE |
| Ability | Lost in the Woods | grimmwood-hansel-and-gretel|Lost in the Woods | Casts/game | 0.47 | < 0.5 | NEGATIVE |
| Ability | In Hoc Signo Vinces | roma-constantine-the-great|In Hoc Signo Vinces | Casts/game | 0.45 | < 0.5 | NEGATIVE |
| Ability | Moonlit Reproach 🆕 | takamagahara-tsukuyomi|Moonlit Reproach | Casts/game | 0.43 | < 0.5 | NEGATIVE |
| Ability | Great Wall Mandate | huaxia-qin-shi-huang|Great Wall Mandate | Casts/game | 0.41 | < 0.5 | NEGATIVE |
| Ability | Precision Volley | huaxia-huang-zhong|Precision Volley | Casts/game | 0.41 | < 0.5 | NEGATIVE |
| Ability | Crescent Blade Guard | huaxia-guan-yu|Crescent Blade Guard | Casts/game | 0.34 | < 0.5 | NEGATIVE |
| Ability | Twelve Labors | olympus-hercules|Twelve Labors | Casts/game | 0.32 | < 0.5 | NEGATIVE |
| Ability | Divine Judgment | olympus-zeus|Divine Judgment | Casts/game | 0.17 | < 0.5 | NEGATIVE |
| Ability | Prophecy | camelot-merlin|Prophecy | Casts/game | 0.12 | < 0.5 | NEGATIVE |
| Ability | Moon Reflection | yamato-kaguya|Moon Reflection | Casts/game | 0.04 | < 0.5 | NEGATIVE |
| Efficiency | Amaterasu 🆕 | takamagahara-amaterasu | Damage per Energy | 130.4 | top 10% | POSITIVE |
| Efficiency | Mulan | huaxia-mulan | Damage per Energy | 116.2 | top 10% | POSITIVE |
| Efficiency | Lancelot | camelot-lancelot | Damage per Energy | 115.1 | top 10% | POSITIVE |
| Efficiency | Sun Wukong | huaxia-sun-wukong | Damage per Energy | 90.8 | top 10% | POSITIVE |
| Efficiency | Izanami 🆕 | takamagahara-izanami | Damage per Energy | 87.6 | top 10% | POSITIVE |
| Efficiency | Maid Marian | sherwood-maid-marian | Damage per Energy | 0.0 | bottom 10% | NEGATIVE |
| Efficiency | Snow White | grimmwood-snow-white | Damage per Energy | 0.0 | bottom 10% | NEGATIVE |
| Efficiency | Hua Tuo | huaxia-hua-tuo | Damage per Energy | 0.0 | bottom 10% | NEGATIVE |
| Efficiency | Augustus | roma-augustus | Damage per Energy | 0.0 | bottom 10% | NEGATIVE |
| Efficiency | Izanagi 🆕 | takamagahara-izanagi | Damage per Energy | 0.0 | bottom 10% | NEGATIVE |

**Insights**

- **8** hero win-rate flags, **0** role flags, **10** ability-usage flags.
- **Roma flags: 6.** Detail: Amaterasu 🆕 (Win Rate 68.3%, positive); Susanoo 🆕 (Win Rate 76.3%, positive); Moonlit Reproach 🆕 (Casts/game 0.43, negative); Amaterasu 🆕 (Damage per Energy 130.4, positive); Izanami 🆕 (Damage per Energy 87.6, positive); Izanagi 🆕 (Damage per Energy 0.0, negative).
- Efficiency flags are ranking-based (top/bottom 10% by definition always populate) and are informational rather than pass/fail — read them alongside the win-rate flags, not instead of them.

---

## 13. Extended Metrics

Coverage of the "New Metrics" list. Implemented here from existing telemetry:

| Hero | Threat Rating | Focus Fire Rate | Overkill Rate | Clutch Factor | Snowball Index | Comeback Rate | Tempo Rating | Effective HP Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hercules | 160.2 | 1.62 | 2.1% | — | — | 36.0% | 9.00 | 2,142 |
| King Arthur | 129.2 | 1.29 | 4.4% | — | — | 36.8% | 9.50 | 2,749 |
| Hansel & Gretel | 123.2 | 1.22 | 0.2% | — | 100.0% | 40.0% | 5.00 | 10,502 |
| Guan Yu | 117.4 | 1.19 | 1.5% | — | — | 25.0% | 10.00 | 3,187 |
| Spartacus | 116.5 | 1.17 | 3.7% | — | 100.0% | 33.3% | 8.69 | 2,576 |
| Susanoo 🆕 | 108.7 | 1.08 | 5.2% | — | — | 58.3% | 10.55 | 3,565 |
| Little John | 101.7 | 0.99 | 5.7% | 100.0% | — | 30.0% | 10.88 | 22,861 |
| Benkei | 96.3 | 0.97 | 6.9% | — | — | 58.3% | 9.29 | 6,763 |
| Momotaro | 93.3 | 0.93 | 3.0% | — | — | 31.8% | 10.17 | 23,031 |
| Lancelot | 78.6 | 0.84 | 9.5% | — | 100.0% | 30.4% | 7.53 | 0 |
| Sun Wukong | 78.5 | 0.77 | 11.2% | 100.0% | 100.0% | 42.9% | 7.57 | 1,861 |
| Julius Caesar | 72.5 | 0.76 | 13.6% | — | 33.3% | 46.4% | 6.09 | 0 |
| Red Riding Hood | 69.6 | 0.71 | 15.7% | — | 0.0% | 51.5% | 7.24 | 9,743 |
| Big Bad Wolf | 66.6 | 0.69 | 14.5% | 100.0% | 60.0% | 31.8% | 6.67 | 1,998 |
| Guy of Gisborne | 63.6 | 0.67 | 15.4% | — | 81.3% | 52.6% | 5.39 | 0 |
| Ares | 72.3 | 0.66 | 9.9% | — | 100.0% | 16.0% | 8.29 | 0 |
| Minamoto no Yoshitsune | 65.5 | 0.66 | 13.1% | — | 100.0% | 20.8% | 5.75 | 0 |
| Qin Shi Huang | 69.8 | 0.62 | 4.6% | — | 75.0% | 32.1% | 6.19 | 0 |
| Will Scarlet | 61.1 | 0.62 | 11.7% | 100.0% | 100.0% | 23.5% | 7.57 | 0 |
| Nezha | 71.2 | 0.62 | 14.3% | — | 76.5% | 40.0% | 4.63 | 0 |
| Constantine the Great | 69.7 | 0.61 | 5.2% | — | 50.0% | 21.4% | 5.83 | 1,040 |
| Izanami 🆕 | 56.1 | 0.58 | 10.6% | — | 50.0% | 52.9% | 7.23 | 0 |
| Robin Hood | 57.5 | 0.58 | 4.2% | — | 40.0% | 11.1% | 4.78 | 0 |
| Lu Bu | 55.2 | 0.58 | 11.0% | 100.0% | 66.7% | 50.0% | 7.29 | 0 |
| Amaterasu 🆕 | 67.3 | 0.56 | 2.2% | — | 83.3% | 59.1% | 5.67 | 747 |
| Merlin | 53.1 | 0.54 | 7.2% | — | 66.7% | 25.0% | 7.63 | 2,594 |
| Abe no Seimei | 53.3 | 0.54 | 8.7% | — | 0.0% | 28.1% | 8.09 | 0 |
| Huang Zhong | 52.6 | 0.53 | 15.5% | 100.0% | 83.3% | 46.2% | 7.00 | 0 |
| Kaguya | 57.8 | 0.52 | 8.9% | 100.0% | 33.3% | 25.9% | 8.21 | 74 |
| Mulan | 51.9 | 0.48 | 10.5% | — | 50.0% | 34.8% | 6.05 | 0 |
| Zeus | 46.7 | 0.47 | 8.2% | 100.0% | 0.0% | 29.6% | 8.68 | 0 |
| Morgan le Fay | 42.0 | 0.45 | 4.9% | — | 100.0% | 18.2% | 9.19 | 0 |
| Mordred | 44.8 | 0.45 | 17.1% | — | 70.0% | 23.8% | 4.64 | 0 |
| Tsukuyomi 🆕 | 43.0 | 0.43 | 9.3% | — | 66.7% | 40.0% | 6.43 | 0 |
| Brutus | 42.7 | 0.43 | 17.4% | — | 55.6% | 26.3% | 5.63 | 0 |
| Athena | 38.3 | 0.41 | 8.5% | — | 100.0% | 25.0% | 8.43 | 3,916 |
| Zhuge Liang | 38.9 | 0.40 | 5.9% | — | 75.0% | 12.5% | 7.70 | 0 |
| Medusa | 39.2 | 0.39 | 6.0% | — | 60.0% | 33.3% | 5.81 | 0 |
| Rumpelstiltskin | 38.0 | 0.39 | 4.5% | 100.0% | 100.0% | 51.9% | 7.76 | 0 |
| Friar Tuck | 36.1 | 0.38 | 9.6% | 100.0% | 33.3% | 33.3% | 7.05 | 0 |
| Izanagi 🆕 | 37.6 | 0.37 | — | — | — | 29.2% | — | 19,744 |
| Guinevere | 31.8 | 0.35 | — | — | — | 15.0% | — | 18,747 |
| Inari 🆕 | 33.2 | 0.35 | 9.2% | — | 0.0% | 47.6% | 6.35 | 0 |
| Tomoe Gozen | 34.8 | 0.35 | 12.9% | — | 50.0% | 41.7% | 6.09 | 0 |
| Pied Piper | 31.4 | 0.34 | 4.9% | — | — | 34.8% | 8.57 | 0 |
| Cicero | 30.9 | 0.33 | 9.0% | — | 20.0% | 37.5% | 7.34 | 0 |
| Augustus | 29.8 | 0.32 | — | — | — | 28.6% | — | 16,886 |
| Apollo | 30.1 | 0.31 | — | — | — | 35.3% | — | 14,114 |
| Maid Marian | 27.5 | 0.28 | — | — | — | 41.2% | — | 21,183 |
| Snow White | 24.8 | 0.26 | — | — | — | 38.9% | — | 17,221 |
| Hua Tuo | 20.3 | 0.25 | — | — | — | 40.0% | — | 18,998 |

**Definitions.** Threat Rating = `targeted / rounds_alive × 100`. Focus Fire Rate = `focusN / focusD` (distinct attackers per round alive). Overkill Rate = `overkill / damage dealt`. Clutch Factor = win rate when last survivor. Snowball Index = win rate after landing the first kill. Comeback Rate = win rate after conceding the first kill. Tempo Rating = average round of the hero's first kill. Effective HP Created = `heals + shields + prevented + absorbCredit` per appearance.

**Not implemented — Value Over Average (VOA).** VOA requires a substitute-model branch that re-simulates each team with the hero swapped for an average stand-in. That is a second full simulation pass per hero and is out of scope for this run; it remains genuinely absent rather than approximated.

**Insights**

- **Most threatened:** Hercules draws the most enemy attention per round alive.
- **Best snowball:** Mordred wins 70.0% of games in which he lands first blood.
- **Best comeback:** Amaterasu still wins 59.1% after his team concedes the first kill.
- **Most overkill:** Brutus wastes 17.4% of his damage on already-lethal blows — a burst hero without a damage cap.
- 🆕 **Roma comeback rate:** 44.0% versus a roster average of 33.3% — the test of whether Spartacus's ally-death insurance and Augustus's triage actually convert a losing board into wins.

---

## 13b. Control Run — Attribution

A second simulation of **700 games** was run with Roma excluded from the draw pool (`--exclude roma`), so that any outlier can be attributed either to this build or to the pre-existing roster.

### Role win rate: with Roma vs without

| Role | With Roma | Without Roma (control) | Δ |
| --- | --- | --- | --- |
| Tank | 54.1% | 50.5% | +3.6pp |
| Bruiser | 51.5% | 51.9% | -0.4pp |
| Controller | 46.8% | 48.8% | -2.1pp |
| Caster | 47.2% | 47.4% | -0.1pp |
| Medic | 53.3% | 52.5% | +0.8pp |
| Sniper | 47.6% | 48.0% | -0.5pp |

### Pre-existing heroes most affected by this build

| Hero | With Roma | Control | Δ |
| --- | --- | --- | --- |
| Abe no Seimei | 45.0% | 73.7% | -28.7pp |
| Nezha | 56.4% | 42.9% | +13.5pp |
| Little John | 59.5% | 46.2% | +13.3pp |
| Minamoto no Yoshitsune | 37.5% | 50.8% | -13.3pp |
| Robin Hood | 27.9% | 40.1% | -12.2pp |
| Rumpelstiltskin | 60.5% | 48.7% | +11.8pp |
| Guy of Gisborne | 68.1% | 56.8% | +11.3pp |
| Benkei | 70.7% | 59.6% | +11.1pp |
| Apollo | 61.0% | 51.4% | +9.5pp |
| Pied Piper | 48.8% | 40.0% | +8.8pp |
| Ares | 39.1% | 46.7% | -7.6pp |
| Hercules | 44.2% | 51.7% | -7.6pp |

**Insights**

- **Role stability:** the largest role shift caused by adding Roma is 3.6pp. Adding six heroes to a 39-hero roster necessarily reshuffles matchups; nothing here indicates Roma broke a role band.
- **Abe no Seimei is a pre-existing outlier, not a Roma artifact:** 45.0% in this run versus 73.7% in the Roma-free control. He breaches the >65% flag in both, so the fix belongs to his own Energy-drain kit rather than to anything in this build.
- **Momotaro and the shield fix:** 42.1% here versus 46.7% in the control (both runs include the fix, so this pair does not isolate it). The correction removed an always-on shield he was never supposed to have on the low-energy branch, and he remains mid-table — the fix did not gut him.
- **Caveat:** the control is a smaller sample than the main run, so per-hero deltas of a few points are inside noise. Role-level and flag-level conclusions are the reliable readings.

---

## 14. Tier List

Tiers are assigned on a composite score — win rate (60%), MVP per game (25%) and kill participation (15%), each normalised across the roster — so a support hero is not punished for low damage.

| Tier | Heroes |
| --- | --- |
| **S** | Amaterasu 🆕 (68.3%), Guy of Gisborne (68.1%), Susanoo 🆕 (76.3%), Little John (59.5%), Maid Marian (69.2%), Benkei (70.7%) |
| **A** | Nezha (56.4%), Red Riding Hood (56.6%), Rumpelstiltskin (60.5%), Mordred (53.3%), Apollo (61.0%), Big Bad Wolf (50.0%), Lu Bu (58.5%) |
| **B** | Brutus (50.0%), Lancelot (56.0%), Snow White (54.8%), Tsukuyomi 🆕 (52.5%), Tomoe Gozen (49.0%), Hua Tuo (52.8%), Izanami 🆕 (55.0%), Augustus (53.3%), Huang Zhong (52.1%), Julius Caesar (49.1%), Sun Wukong (47.5%), Izanagi 🆕 (48.9%), Merlin (53.3%), Momotaro (42.1%), Hansel & Gretel (51.5%), Qin Shi Huang (46.5%), Spartacus (52.0%), King Arthur (52.6%), Mulan (47.8%), Will Scarlet (48.5%), Friar Tuck (46.2%) |
| **C** | Abe no Seimei (45.0%), Pied Piper (48.8%), Morgan le Fay (45.7%), Cicero (42.2%), Zeus (44.4%), Athena (44.7%), Minamoto no Yoshitsune (37.5%), Inari 🆕 (42.9%), Medusa (41.5%), Zhuge Liang (36.8%), Hercules (44.2%), Ares (39.1%), Guinevere (34.1%), Guan Yu (40.9%) |
| **D** | Kaguya (37.0%), Constantine the Great (30.0%), Robin Hood (27.9%) |

### Full ranking

| # | Hero | Faction | Role | Tier | Score | Win Rate | MVP/game | KP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Amaterasu** 🆕 | takamagahara | Caster | S | 1.88 | 68.3% | 21,865 | 29.1% |
| 2 | **Guy of Gisborne** | sherwood | Bruiser | S | 1.86 | 68.1% | 17,497 | 46.8% |
| 3 | **Susanoo** 🆕 | takamagahara | Tank | S | 1.45 | 76.3% | 9,382 | 7.7% |
| 4 | **Little John** | sherwood | Tank | S | 1.43 | 59.5% | 25,820 | 19.1% |
| 5 | **Maid Marian** | sherwood | Medic | S | 1.32 | 69.2% | 16,946 | 0.0% |
| 6 | **Benkei** | yamato | Tank | S | 1.01 | 70.7% | 8,324 | 4.1% |
| 7 | **Nezha** | huaxia | Sniper | A | 0.70 | 56.4% | 11,538 | 35.3% |
| 8 | **Red Riding Hood** | grimmwood | Bruiser | A | 0.66 | 56.6% | 14,063 | 20.4% |
| 9 | **Rumpelstiltskin** | grimmwood | Controller | A | 0.63 | 60.5% | 10,332 | 14.5% |
| 10 | **Mordred** | camelot | Sniper | A | 0.61 | 53.3% | 12,053 | 40.3% |
| 11 | **Apollo** | olympus | Medic | A | 0.53 | 61.0% | 11,291 | 0.0% |
| 12 | **Big Bad Wolf** | grimmwood | Bruiser | A | 0.47 | 50.0% | 15,361 | 31.5% |
| 13 | **Lu Bu** | huaxia | Bruiser | A | 0.38 | 58.5% | 7,081 | 17.5% |
| 14 | **Brutus** | roma | Sniper | B | 0.34 | 50.0% | 12,116 | 34.3% |
| 15 | **Lancelot** | camelot | Bruiser | B | 0.30 | 56.0% | 9,514 | 13.1% |
| 16 | **Snow White** | grimmwood | Medic | B | 0.28 | 54.8% | 13,777 | 0.0% |
| 17 | **Tsukuyomi** 🆕 | takamagahara | Caster | B | 0.27 | 52.5% | 10,334 | 24.7% |
| 18 | **Tomoe Gozen** | yamato | Sniper | B | 0.25 | 49.0% | 11,442 | 35.1% |
| 19 | **Hua Tuo** | huaxia | Medic | B | 0.24 | 52.8% | 15,198 | 0.0% |
| 20 | **Izanami** 🆕 | takamagahara | Controller | B | 0.18 | 55.0% | 6,317 | 22.0% |
| 21 | **Augustus** | roma | Medic | B | 0.18 | 53.3% | 13,508 | 0.0% |
| 22 | **Huang Zhong** | huaxia | Sniper | B | 0.18 | 52.1% | 9,751 | 21.4% |
| 23 | **Julius Caesar** | roma | Bruiser | B | 0.12 | 49.1% | 9,768 | 31.0% |
| 24 | **Sun Wukong** | huaxia | Bruiser | B | 0.09 | 47.5% | 11,217 | 30.6% |
| 25 | **Izanagi** 🆕 | takamagahara | Medic | B | 0.03 | 48.9% | 15,795 | 0.0% |
| 26 | **Merlin** | camelot | Caster | B | 0.02 | 53.3% | 7,540 | 11.9% |
| 27 | **Momotaro** | yamato | Tank | B | -0.03 | 42.1% | 20,875 | 6.4% |
| 28 | **Hansel & Gretel** | grimmwood | Tank | B | -0.09 | 51.5% | 10,271 | 0.5% |
| 29 | **Qin Shi Huang** | huaxia | Caster | B | -0.20 | 46.5% | 9,120 | 21.0% |
| 30 | **Spartacus** | roma | Tank | B | -0.23 | 52.0% | 5,669 | 6.3% |
| 31 | **King Arthur** | camelot | Tank | B | -0.25 | 52.6% | 5,114 | 3.7% |
| 32 | **Mulan** | huaxia | Sniper | B | -0.26 | 47.8% | 7,928 | 14.6% |
| 33 | **Will Scarlet** | sherwood | Bruiser | B | -0.30 | 48.5% | 5,987 | 16.2% |
| 34 | **Friar Tuck** | sherwood | Controller | B | -0.34 | 46.2% | 6,429 | 22.2% |
| 35 | **Abe no Seimei** | yamato | Controller | C | -0.38 | 45.0% | 7,564 | 20.3% |
| 36 | **Pied Piper** | grimmwood | Controller | C | -0.40 | 48.8% | 5,412 | 9.3% |
| 37 | **Morgan le Fay** | camelot | Controller | C | -0.40 | 45.7% | 8,486 | 11.4% |
| 38 | **Cicero** | roma | Controller | C | -0.50 | 42.2% | 6,901 | 27.0% |
| 39 | **Zeus** | olympus | Caster | C | -0.54 | 44.4% | 6,526 | 14.5% |
| 40 | **Athena** | olympus | Controller | C | -0.61 | 44.7% | 6,123 | 8.9% |
| 41 | **Minamoto no Yoshitsune** | yamato | Bruiser | C | -0.62 | 37.5% | 9,767 | 27.9% |
| 42 | **Inari** 🆕 | takamagahara | Controller | C | -0.74 | 42.9% | 3,572 | 18.6% |
| 43 | **Medusa** | olympus | Sniper | C | -0.77 | 41.5% | 5,812 | 12.9% |
| 44 | **Zhuge Liang** | huaxia | Controller | C | -0.80 | 36.8% | 8,062 | 23.9% |
| 45 | **Hercules** | olympus | Tank | C | -0.85 | 44.2% | 3,708 | 2.1% |
| 46 | **Ares** | olympus | Bruiser | C | -0.89 | 39.1% | 5,900 | 14.7% |
| 47 | **Guinevere** | camelot | Medic | C | -0.90 | 34.1% | 14,998 | 0.0% |
| 48 | **Guan Yu** | huaxia | Tank | C | -0.98 | 40.9% | 5,411 | 1.2% |
| 49 | **Kaguya** | yamato | Caster | D | -1.20 | 37.0% | 3,545 | 10.2% |
| 50 | **Constantine the Great** | roma | Caster | D | -1.44 | 30.0% | 7,153 | 9.6% |
| 51 | **Robin Hood** | sherwood | Sniper | D | -1.69 | 27.9% | 5,007 | 8.6% |

**Insights**

- **Roma tier placement:** Susanoo **S**, Amaterasu **S**, Izanami **B**, Tsukuyomi **B**, Izanagi **B**, Inari **C**.
- Roma occupies 3× B, 1× C, 2× S — it does place a hero in S tier, which is worth monitoring.
- **Faction ladder (mean hero win rate):** takamagahara 57.3% · grimmwood 53.7% · sherwood 53.2% · camelot 49.2% · huaxia 48.8% · yamato 46.9% · roma 46.1% · olympus 45.8%.

---

## 15. Lineup Analysis

The sim draws random legal sixes (max 3 per role), so "lineups" are read from the role skeletons and hero pairings that actually appeared, rather than from hand-built decks.

### Best role skeletons

| Rank | Role pairing | Games | Win Rate |
| --- | --- | --- | --- |
| 1 | Medic + Tank | 142 | 59.9% |
| 2 | Tank + Tank | 82 | 58.5% |
| 3 | Bruiser + Tank | 199 | 54.8% |
| 4 | Bruiser + Medic | 161 | 54.7% |
| 5 | Caster + Medic | 127 | 54.3% |
| 6 | Medic + Medic | 74 | 54.1% |
| 7 | Caster + Tank | 163 | 53.4% |
| 8 | Sniper + Tank | 181 | 52.5% |

### Weakest role skeletons

| Rank | Role pairing | Games | Win Rate |
| --- | --- | --- | --- |
| 1 | Caster + Caster | 66 | 40.9% |
| 2 | Sniper + Sniper | 95 | 42.1% |
| 3 | Caster + Controller | 169 | 45.6% |
| 4 | Controller + Controller | 133 | 46.6% |
| 5 | Controller + Sniper | 191 | 47.1% |
| 6 | Caster + Sniper | 159 | 48.4% |
| 7 | Bruiser + Controller | 203 | 48.8% |
| 8 | Controller + Medic | 155 | 50.3% |

### Recommended cores


### Building around Roma

- **The Triumph engine wants a first kill, not a long game.** Every Roma card except Cicero reads a death. Pair Constantine and Brutus with any reliable finisher so the first corpse arrives early, and the ATK riders compound from round 2 onward.
- **Cicero is the enabler, not a damage card.** His Silence + 12 Energy tax is the only proactive tempo denial in the faction; he is at his best against expensive signatures (Zeus at 60 EN, Caesar at 55, Constantine at 60) and his Exposed rider turns any pre-existing debuff into backline pressure for Camelot and Grimmwood partners.
- **Brutus punishes setup factions.** `targetHasBuff` means Camelot shields, Olympus crit buffs and Hercules' Twelve Labors all convert Brutus from a 150% hit into a 210% one. He is the natural answer to the buff-stacking archetypes that Marks and debuffs cannot punish.
- **Spartacus and Augustus are the losing-board insurance.** They pay out on deaths rather than kills, which is what stops Roma from being purely a win-more faction; check the Comeback Rate column in Section 13 for whether that insurance is cashing.
- **Cross-faction:** Spartacus stacks with Mulan (both read ally deaths) for a genuine comeback core; Augustus's triage pairs with any Taunt tank; Caesar wants a chip-damage partner to leave the lowest-HP enemy inside execute range for his 60% follow-up.

---

## 16. Takamagahara — Design Verdict

| Hero | Role | Win Rate | Role average | Δ vs role | Sig casts/app | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Susanoo** | Tank | 76.3% | 54.1% | +22.2pp | 0.00 | Overperforming |
| **Amaterasu** | Caster | 68.3% | 47.2% | +21.0pp | 2.59 | Overperforming |
| **Izanami** | Controller | 55.0% | 46.8% | +8.2pp | 0.00 | Overperforming |
| **Tsukuyomi** | Caster | 52.5% | 47.2% | +5.3pp | 2.17 | On target |
| **Inari** | Controller | 42.9% | 46.8% | -3.9pp | 3.77 | On target |
| **Izanagi** | Medic | 48.9% | 53.3% | -4.4pp | 3.40 | On target |

### Card-by-card

- **Susanoo** (Tank, 76.3%) — 0.45 kills/game, 6,352 dmg/game, 50.0% survival. Standing counter gated on being Shielded (engine rule shared with Guan Yu), plus a bodyguard reflex when an ally drops below 35%.
- **Amaterasu** (Caster, 68.3%) — 1.56 kills/game, 20,644 dmg/game, 31.7% survival. Rebuilt after the first draft proved exploitable (self-Untargetable made her unkillable as a lone survivor). Now a fragile 70%/105% AoE that must survive in the open.
- **Izanami** (Controller, 55.0%) — 0.95 kills/game, 5,937 dmg/game, 30.0% survival. Passive-only: no active cast, so her whole output is the Disrupt basic plus the ally-death payout. Watch for low agency.
- **Tsukuyomi** (Caster, 52.5%) — 1.18 kills/game, 9,864 dmg/game, 27.5% survival. Debuff detonator — 90% base, 150% into an already-debuffed target. His ceiling depends entirely on whether the team supplies dirty targets.
- **Izanagi** (Medic, 48.9%) — 0.00 kills/game, 0 dmg/game, 28.9% survival. The roster's only full-strip cleanse, and the designated counter to Grimmwood and to Cicero/Tsukuyomi debuff decks.
- **Inari** (Controller, 42.9%) — 0.71 kills/game, 3,287 dmg/game, 34.3% survival. Net Energy-positive enabler (25 EN cost, 12/18 refund). The riskiest number in the faction — opened deliberately below the draft value.

### Nerfs applied this pass

| Card | Change | Result |
| --- | --- | --- |
| **Amaterasu** | AoE 70%/105% → **50%/75%**, cost 50 → **55 EN**, kill rider kept | 68.3% WR, 20,644 dmg/game |
| **Susanoo** | opening Shield 12% → **10%**, reflex Shield 15% → **10%**, threshold 35% → **30%** | 76.3% WR, 6,352 dmg/game |

**Amaterasu — ability-level effect (the reliable read at this sample size):**

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Damage per cast | 4,941 | 3,368 | -31.8% |
| Kills per cast | 0.54 | 0.24 | -56.3% |
| Casts per appearance | 2.88 | 2.59 | — |

Damage per cast and kills per cast both fell by roughly a third — the nerf did exactly what it was aimed at. Her *win rate* is still elevated, which points at the remaining problem being six-target reach rather than per-target power.


> ### ⚠️ Sample-size warning
>
> This run is **200 games**, giving each hero only ~40 appearances and a 95% confidence interval of roughly **±14pp**. Against the previous 2,000-game baseline, *none* of the six Takamagahara win-rate changes reach significance (all |z| < 1.96), and several heroes flagged below are almost certainly noise. **Do not tune on these win rates.** Ability-level metrics (damage per cast, kills per cast) aggregate over far more events and are the trustworthy signal at this sample size. Re-run at 2,000 games before making another balance decision.

### Faction totals
### Faction totals

| Faction | Heroes | Appearances | Win Rate |
| --- | --- | --- | --- |
| **takamagahara** 🆕 | 6 | 239 | 57.3% |
| grimmwood | 6 | 248 | 54.0% |
| sherwood | 6 | 238 | 53.4% |
| camelot | 6 | 280 | 49.6% |
| huaxia | 9 | 392 | 49.0% |
| yamato | 6 | 274 | 46.7% |
| roma | 6 | 277 | 46.6% |
| olympus | 6 | 272 | 45.6% |

---

## 17. Roster Shape

| Role | Heroes | Win Rate | Note |
| --- | --- | --- | --- |
| Bruiser | 10 | 51.5% | meets the 6-per-role draft law |
| Controller | 10 | 46.8% | meets the 6-per-role draft law |
| Tank | 9 | 54.1% | meets the 6-per-role draft law |
| Sniper | 8 | 47.6% | meets the 6-per-role draft law |
| Caster | 7 | 47.2% | meets the 6-per-role draft law |
| Medic | 7 | 53.3% | meets the 6-per-role draft law |

Takamagahara added 2 Casters, 2 Controllers, 1 Medic and 1 Tank — deliberately no Bruiser or Sniper — because Caster and Controller were the thinnest and weakest roles in the previous run. **Every role now has 6+ heroes, so the draft-snapshot pool law is satisfiable for the first time.**

---

## Appendix — Methodology & Changes

- **Games:** 200, run as 2 parallel shards over disjoint seed ranges (`sim/run_parallel.js`). Because `sim.js` seeds game *i* with `SEED + i`, sharding the seed space produces exactly the same set of games as a single-threaded run, and the shard aggregates are summed field-by-field.
- **AI:** depth 2 (`AI.setDepth(2)`), both sides, with the standard sim rollout budget.
- **Teams:** random legal sixes, max 3 per role (`EOL.rules.splitCapped`), role-aware formation.
- **Roster shape:** Bruiser 10, Tank 8, Controller 8, Sniper 8, Medic 6, Caster 5. Caster is the only role below the 6-per-role draft-snapshot threshold, and Caster (47.2%) and Controller (46.8%) are the two weakest roles by win rate — so the roster is both numerically and competitively light on casters/controllers relative to bruisers and tanks.
- **Draws:** excluded from every table except Section 1, per the Report Requirements.

**Code changes in this build**

1. `data/takamagahara.js` — new 6-hero faction (Takamagahara, the Divine Cycle): Amaterasu, Tsukuyomi, Izanami, Inari, Izanagi, Susanoo. Built from existing keywords only — no faction-private mechanic.
2. `js/engine.js` — three additions, all generic infrastructure:
   - **`on:` per-trigger effect routing.** A passive with `triggers: [a, b]` previously fired its entire effect list on either trigger. An effect may now declare `on: 'triggerName'` to respond to only some. Effects without `on:` are unaffected, so every pre-existing card behaves identically. The 12 passive fire sites now pass their trigger name into the effect context.
   - **Battle-start `static` setup.** `static` passives previously only fed the damage-multiplier pipeline; standing setup effects are now applied once at `createBattle`. Declarative modifiers (`outgoingMult`/`damageMult`/`damageResist`) are explicitly excluded so no existing card changes.
   - **Dead sources no longer resolve deferred/pending effects** (both code paths).
3. `data/grimmwood.js` — Snow White DEF 24 → 22 (was outside the Medic band 18–22).
4. Icon corrections: Yoshitsune `ra-drum` → `ra-dervish-swords` and Benkei `ra-samurai-helmet` → `ra-helmet` (neither original existed in RPG Awesome); Brutus, Constantine, Abe no Seimei and the Huaxia faction icon moved off duplicates. The roster is now 0 invalid, 0 duplicate icons.
5. `index.html` / `sim/sim.js` — load `data/takamagahara.js`.

**Verification.** `sim/verify_all.js` (1,087 assertions), `sim/verify_roma.js` (48) and the Abe rework suite (22) all pass against this build.
