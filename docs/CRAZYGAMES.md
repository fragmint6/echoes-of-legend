# The CrazyGames build

One repository, two builds. Everything below is a runtime capability
flag, not a fork: a balance change, a hero fix, or a new gate lands in
both builds automatically.

|               | web                     | crazygames                                                     |
| ------------- | ----------------------- | -------------------------------------------------------------- |
| Where         | fragmint6.web.app       | uploaded to the portal, served from their CDN in a 16:9 iframe |
| Accounts      | email + Google          | anonymous session only                                         |
| Online modes  | yes                     | hidden                                                         |
| Daily Puzzle  | shared board, forges it | shared board, never forges it                                  |
| Discord links | yes                     | hidden                                                         |
| Owner console | loaded                  | not loaded                                                     |

## Testing both builds locally

```bash
python3 -m http.server 8080
```

- `http://localhost:8080/` - the web build
- `http://localhost:8080/?platform=crazygames` - the portal build
- `http://localhost:8080/?platform=web` - forces the web build back even
  when the referrer says otherwise

Detection is by `document.referrer` suffix against `crazygames.com` (plus
regional hosts), so the query override is the only way to reproduce the
portal build off-portal.

```bash
node sim/verify_platform.js   # 50 assertions across BOTH builds
```

## What the flag controls

`js/platform.js` sets `body[data-platform]` before first paint and
publishes `window.EOL.platform`:

| Capability        | web   | cg    | Enforced by                                  |
| ----------------- | ----- | ----- | -------------------------------------------- |
| `canPlayOnline`   | true  | false | `css/platform.css`, `js/play.js`, `js/mp.js` |
| `canLinkOut`      | true  | false | `css/platform.css` via `[data-community]`    |
| `canEditIdentity` | true  | false | `js/auth.js` (`needsHandle`)                 |
| `devConsole`      | true  | false | conditional `<script>` in `index.html`       |
| `anonymousAuth`   | false | true  | `js/auth.js`                                 |
| `canForgeDaily`   | true  | false | `js/daily.js`                                |

Adding a new off-site link? Tag it `data-community` and it is covered.

## The Daily Puzzle on the portal

The Daily is enforced in Postgres: one shared `active` board per day and
a `(puzzle_id, user_id, attempt_no)` ledger capped at two. Every RPC
opens with `auth.uid()` and raises when it is null, and the tables are
`REVOKE`d from `anon`.

Google cannot redirect inside the portal iframe, so the portal build
calls `signInAnonymously()`. That creates a **real** `auth.users` row, so
`auth.uid()` is non-null and every existing RPC, grant, and policy keeps
working **with no schema change**. Players get the genuine shared board
and a genuine two-attempt limit.

Two deliberate limits:

1. **Portal tabs never forge.** An anonymous session satisfies
   `signedInUser()`, so without a guard a portal tab could win the 6:55
   generation lease and publish the board _the whole playerbase_
   receives. `canForgeDaily` blocks the lease and the 6:55 alarm.
2. **An anonymous session is not an account.** `EOL.mp.available()`
   returns false for it, so it can never queue for multiplayer, and it
   is never written to `profiles`.

### Required dashboard step

Enable **Authentication → Sign In / Providers → Anonymous** in Supabase.
Without it the Daily Puzzle stays locked on the portal build and logs a
precise reason to the console; nothing else is affected.

Anonymous rows accumulate in `auth.users`. They hold no personal data and
no `profiles` row, but a periodic sweep of anonymous users with no
`daily_puzzle_attempts` is worth scheduling.

## Before uploading

- [ ] Enable anonymous sign-ins in Supabase
- [ ] `node sim/verify_platform.js`
- [ ] Run the portal build through the developer portal QA tool
- [ ] Confirm `js/daily-worker.js` (`importScripts`) runs inside the iframe
- [ ] Check every **Escape** binding: Escape exits fullscreen on the
      portal, so a modal must not be left open behind it
- [ ] Cross-browser pass, Safari especially (audio autoplay)
- [ ] Verify at devicePixelRatio 1 in a 16:9 frame

Build payload is ~37 MB / 166 files, inside the 50 MB no-SDK initial
download cap and the 1,500 file limit. Compressing the ten ~2 MB board
PNGs to WebP is not required but would materially improve load time,
which feeds the Basic Launch engagement review.

## The SDK (`js/crazygames-sdk.js`)

Loaded only on the portal build, gated on `EOL.platform.sdk`, via the
same conditional `document.write` pattern as `dev.js`. It is the **last**
script in the body: the game is fully wired before a third-party CDN is
even contacted, so a blocked or slow SDK cannot delay boot.

**Scope is deliberately the game module only** — `loadingStart/Stop` and
`gameplayStart/Stop`. That is not a stopgap, it is the whole of what is
useful right now:

- **Ads are disabled during Basic Launch.** `requestAd()` answers with
  the `adsDisabledBasicLaunch` error. Placements written today could not
  be tested, tuned, or revenue-checked — only guessed at.
- **Gameplay timing is exactly what the trial measures.** CrazyGames
  decides Full Launch on engagement. Without this, four minutes in a
  battle and four minutes idling in the Rulebook look identical. With it,
  they don't.

What counts as gameplay: `battle`, `draft`, `prep`. Every other view is a
menu break. The bridge listens on the existing `eol:view` event, so it
stays consistent with `js/telemetry.js` without coupling to it.
`loadingStop` is driven by a `MutationObserver` on `#veil` — the honest
"the game is up" moment, since the veil waits on art and fonts, not
merely on scripts.

Failure is designed for, because an SDK inside an iframe behind an ad
blocker is a normal condition, not an edge case. The script load resolves
`null` (never rejects) on error or after 8 s; `init()` rejection is
caught; every call is wrapped. State is tracked in two layers — what the
game is doing versus what the SDK has been told — so a battle entered
while the SDK is still loading is still reported once it arrives, and a
`loadingStop` is never sent without its matching start. If the SDK never
loads, the game plays normally and reports nothing.

**Audio muting** is wired and is a Full Implementation requirement for
HTML5 games. CrazyGames can mute the game from its own chrome, and that
setting **outranks** the in-game control: a player who presses Unmute in
Settings still hears nothing while the portal holds the mute. `js/audio.js`
keeps it in a separate `externalMute` flag rather than folding it into
`prefs.muted`, so the portal's choice is never written into the player's
saved preferences and their own setting returns intact when the mute is
released. `muted()` is the effective answer used at every playback gate.
`disableChat` is read for completeness; the game has no chat.

Regression: `node sim/verify_crazygames_sdk.js` (60 assertions, covering
the blocked, rejecting, throwing, and slow-arrival paths, plus the mute
priority rule driven against the real `js/audio.js`).

### Where progress is saved

Exactly one cloud save is active per build, chosen by `js/platform.js`:

| build      | flag         | backend                                              |
| ---------- | ------------ | ---------------------------------------------------- |
| web        | `cloudVault` | Supabase `saves`, keyed on a real account            |
| crazygames | `dataModule` | the SDK Data module, keyed on the CrazyGames account |

`js/cloud.js` returns immediately when `cloudVault` is false. This is not
a tidiness measure: the portal's Supabase session is **anonymous** - no
email, no password, nothing to sign back into - so a save pushed to it
could never be recovered by the player, and every visitor would leave
another orphan row in `saves`. That session exists only to give the Daily
Puzzle's attempt ledger a `auth.uid()` to key on.

The Data module mirror reuses `EOL.cloud.KEYS` as its key list, so
`MAP` in `js/cloud.js` stays the single source of truth for what counts
as progress and a new persisted key is picked up by both builds at once.
At boot the account wins when it holds anything (it is the only copy that
survives the browser); the local save is adopted only when the account is
empty, which is the guest-then-signs-in case. Writes are debounced 1.2 s
on top of the SDK's own ~1 s, and flushed when the tab hides.

### Submission form answers

- **Progress save** — "Yes, using the Data Module from the CrazyGames SDK".
  Selecting this is REQUIRED or the module is disabled and every write
  fails with `dataModuleDisabled`. Chosen over APS because APS is banned
  for games with in-game purchases (coins/cosmetics are planned) and
  because APS syncs the WHOLE of localStorage - including the Supabase
  auth token at `sb-<ref>-auth-token`, which must never be copied to
  another device. Do NOT claim the backend-linked option until the user
  module is integrated.
- **Audio muting through SDK** — yes, see above.
- **Online multiplayer** — no; the portal build hides the arena entirely.
- **Mobile** — not yet. The CSS has breakpoints, but `deck.js` and
  `play.js` register no touch/pointer handlers.

## Full Launch (later)

Ads (midgame + rewarded), banners, Xsolla purchases, and the user module
all belong here — none can be exercised during Basic Launch. Per the
docs, an ad must mute audio and pause on `adStarted`, and unmute and
resume on **both** `adFinished` and `adError`; midgame ads have a ~3 min
cooldown. Do **not** call `gameplayStop` on focus loss or on leaving the
game area — CrazyGames handles that itself.

Only if CrazyGames invites the game onward. The SDK's `getUserToken()`
returns a JWT (`userId`, `username`, `profilePictureUrl`) verified
server-side against `https://sdk.crazygames.com/publicKey.json`. Bridge
it to Supabase with an Edge Function that mints a session for a profile
keyed on a new `crazygames_id` column, then swap the anonymous sign-in
for that call inside `js/auth.js`. `canEditIdentity` stays false because
CrazyGames owns the player's name and avatar. No call site changes.
