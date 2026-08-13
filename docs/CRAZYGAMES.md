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

## Full Launch (later)

Only if CrazyGames invites the game onward. The SDK's `getUserToken()`
returns a JWT (`userId`, `username`, `profilePictureUrl`) verified
server-side against `https://sdk.crazygames.com/publicKey.json`. Bridge
it to Supabase with an Edge Function that mints a session for a profile
keyed on a new `crazygames_id` column, then swap the anonymous sign-in
for that call inside `js/auth.js`. `canEditIdentity` stays false because
CrazyGames owns the player's name and avatar. No call site changes.
