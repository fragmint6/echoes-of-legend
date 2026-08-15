# CrazyGames submission copy — Echoes of Legend

Paste-ready text for the developer portal. Covers are the three JPGs in
this folder.

---

## Cover images

| Slot | File | Size |
|---|---|---|
| Landscape 16:9 | `cover-1920x1080.jpg` | 1920×1080 |
| Portrait 2:3 | `cover-800x1200.jpg` | 800×1200 |
| Square 1:1 | `cover-800x800.jpg` | 800×800 |

All three share the same four legends, palette and Cinzel title (the
game's own display font), so they read as one set. They carry the game
title and nothing else — no "Play now", no borders, no store icons,
no screenshots — per the cover restrictions.

---

## Short description

*(one-liner, for cards and search results)*

> Ban their best legend, then beat them with yours. A free tactical card
> battler with 63 legends from nine mythologies.

---

## Description

*(main portal description)*

> Bring twelve legends from world mythology to the table. Ban two of
> theirs. They ban two of yours. Both bans are sealed and revealed
> together, so there is no peeking and no taking it back.
>
> Then field six of the ten you have left — three in the front row,
> three in the back — and fight one action at a time until a team falls.
>
> Every legend has a skill that costs Energy, the only currency in the
> game. Spend it on a heavy hit now, or hold it for the combo you have
> been setting up since round one. Position matters: the front row
> shields the back, and a Provoke drags an attack away from the ally who
> could not survive it. So does the arena — ten battlefields each bend a
> rule, from an Energy Void that starves your biggest skills to a Mirror
> Realm that turns your own tricks against you.
>
> The ban is the real game. It is a question you ask your opponent:
> what can you not live without? Crown cards are protected, so the
> answer is rarely obvious — take the quiet support piece that makes
> their star work, and their whole plan comes apart before a single
> blow is struck.
>
> Nine mythologies to build from — Olympus, Camelot, Duat, Yamato,
> Huaxia, Roma, Sherwood, Takamagahara and the fairy-tale dark of
> Grimmwood. Sixty-three legends in all, from Zeus and King Arthur to
> Sun Wukong, Anubis and the Big Bad Wolf.
>
> Play the story campaign against rival commanders, draft a squad from
> scratch when you want a level field, take the Daily Puzzle — one
> shared position for every player, every day — or face a real opponent
> online in Classic or Draft.
>
> Free, in your browser, no download.

---

## Controls

> **Mouse only.**
>
> - **Left click** — select a legend, choose a skill, pick a target
> - **Left click and drag** — move legends between slots while building
>   your squad
> - **Hover** — see a card's full stats, its skill text, and the exact
>   damage a hit will do before you commit
> - **Escape** — close the open panel
>
> Every action is confirmed before it happens, so a misclick never costs
> you a turn.

---

## Submission form answers

- **Genre** — Strategy / Card
- **Input** — Mouse. **Not** keyboard-required, **not** touch.
- **Devices** — **Desktop only.** Do not tick mobile: the card and
  battle UI has no touch handlers, so a phone tester cannot drag a card
  and the build will be rejected.
- **Orientation** — Landscape
- **Players** — Singleplayer **and** online multiplayer
- **Progress save** — "Yes, using the Data Module from the CrazyGames
  SDK". This must be selected or the module is disabled and every
  write fails with `dataModuleDisabled`.
- **Audio muting through SDK** — Yes
- **Chat** — None (answer N/A on the chat rows)
- **Age rating** — PEGI 12 compliant. Stylised fantasy combat, no blood,
  no gore, no gambling, no chat.

---

## Notes for the QA re-run

Two checklist rows came back automatically "No" because the tester never
reached the state that fires them:

- **First gameplay start** — `gameplayStart` fires on entering a battle,
  draft or prep screen. Start an actual match during the QA session.
- **InviteLink** — fires from **Copy invite link** inside a private
  room. Create a room and click it.

Both were verified firing against the real upload build.
