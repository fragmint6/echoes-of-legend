/* =============================================================
 * cg-auth - turn a CrazyGames token into a real Supabase session
 * -------------------------------------------------------------
 * Deploy with:
 *
 *   supabase functions deploy cg-auth --no-verify-jwt
 *
 * `--no-verify-jwt` is REQUIRED and is not a weakening: the caller
 * has no Supabase session yet - getting one is the entire point of
 * this endpoint. The request is authenticated by the CrazyGames
 * token instead, which is verified below before anything is done
 * with it.
 *
 * Secrets this needs (Dashboard -> Edge Functions -> Secrets, or
 * `supabase secrets set`):
 *
 *   SUPABASE_URL                already provided by the platform
 *   SUPABASE_SERVICE_ROLE_KEY   already provided by the platform
 *
 * THE THREAT MODEL
 * -------------------------------------------------------------
 * The browser is hostile. Everything it sends can be forged, so the
 * ONLY thing accepted here is a JWT signed by CrazyGames, and the
 * signature is checked against their published RS256 public key.
 *
 * Specifically NOT trusted:
 *
 *   - `__dangerousUserId` from the SDK. Forgeable from the console.
 *     It is never sent by the client and never read here.
 *   - Any username or avatar the client supplies. Both are taken
 *     from the VERIFIED token payload, so a player cannot pick
 *     someone else's name.
 *   - An unverified `exp`. Checked after the signature, because a
 *     claim in an unverified token means nothing.
 *
 * The token is never logged, never stored, and never returned.
 * ============================================================= */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jwtVerify, importJWK, type JWK } from 'https://deno.land/x/jose@v5.9.6/index.ts';

const CG_PUBLIC_KEY_URL = 'https://sdk.crazygames.com/publicKey.json';

/* CrazyGames may rotate the key, so it must be re-fetched rather
   than baked in. Re-fetching on EVERY request would add a round
   trip to every login, so it is cached briefly - short enough that
   a rotation heals within minutes on its own, and a verification
   failure busts the cache immediately (see verifyToken). */
const KEY_TTL_MS = 10 * 60 * 1000;
let keyCache: { key: CryptoKey; at: number } | null = null;

async function crazyGamesKey(force = false): Promise<CryptoKey> {
  const fresh = keyCache && Date.now() - keyCache.at < KEY_TTL_MS;
  if (fresh && !force) return keyCache!.key;

  const res = await fetch(CG_PUBLIC_KEY_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`public key fetch failed: ${res.status}`);

  /* The endpoint returns a JWK. Accept either a bare key or the
     first entry of a JWKS, so a change in shape does not break us. */
  const body = await res.json();
  const jwk: JWK = Array.isArray(body?.keys) ? body.keys[0] : body;
  if (!jwk || typeof jwk !== 'object') throw new Error('public key malformed');

  const key = (await importJWK(jwk, 'RS256')) as CryptoKey;
  keyCache = { key, at: Date.now() };
  return key;
}

type CgClaims = {
  userId: string;
  gameId?: string;
  username?: string;
  profilePictureUrl?: string;
};

async function verifyToken(token: string): Promise<CgClaims> {
  /* RS256 is pinned. Without `algorithms` a token could arrive
     claiming alg:none, or claiming HS256 with the public key used
     as an HMAC secret - both are classic JWT forgeries. */
  const opts = { algorithms: ['RS256'] };

  let payload: Record<string, unknown>;
  try {
    payload = (await jwtVerify(token, await crazyGamesKey(), opts)).payload as Record<
      string,
      unknown
    >;
  } catch (_first) {
    /* A rotated key looks exactly like a bad signature. Re-fetch
       once and retry before calling it a forgery. */
    payload = (await jwtVerify(token, await crazyGamesKey(true), opts)).payload as Record<
      string,
      unknown
    >;
  }

  /* jose enforces exp/nbf itself. userId is ours to insist on. */
  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  if (!userId) throw new Error('token carries no userId');

  /* AUDIENCE CHECK. A signature proves CrazyGames issued the token -
     it does NOT prove they issued it for THIS game. Every CrazyGames
     title gets tokens signed by the same key, so without this a token
     minted for any other game on the portal would be accepted here and
     silently create an account.

     Set CG_GAME_ID once the game has its portal id (Edge Functions ->
     Secrets). Left unset the check is skipped with a loud warning
     rather than failing closed, so the integration still works before
     the id is known - but set it before launch. */
  const expectedGame = Deno.env.get('CG_GAME_ID');
  const gameId = typeof payload.gameId === 'string' ? payload.gameId : undefined;
  if (expectedGame) {
    if (gameId !== expectedGame) {
      throw new Error('token was issued for a different game');
    }
  } else {
    console.warn('CG_GAME_ID is not set - accepting a token without checking which game it is for');
  }

  return {
    userId,
    gameId,
    username: typeof payload.username === 'string' ? payload.username : undefined,
    profilePictureUrl:
      typeof payload.profilePictureUrl === 'string' ? payload.profilePictureUrl : undefined,
  };
}

/* A deterministic, non-guessable email + password for the shadow
   account. The player never sees or types either: this is just how
   a session is minted for an identity that has no email.

   The password is derived from the CrazyGames id and the service
   role key, so it is stable across logins (the same player always
   lands on the same auth row) but cannot be computed by anyone
   without the secret. */
async function shadowCredentials(cgUserId: string, secret: string) {
  const data = new TextEncoder().encode(`${cgUserId}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return {
    email: `cg_${cgUserId}@crazygames.invalid`,
    password: hex,
  };
}

const CORS = {
  /* The portal serves games from many hosts (regional domains, the
     QA tool, the CDN sandbox), so the origin is not a fixed string.
     No cookies are involved and the token in the body is the only
     credential, so a wildcard is safe here. */
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'function is not configured' }, 500);

  let token = '';
  try {
    token = String((await req.json())?.token || '');
  } catch (_e) {
    return json({ error: 'body must be JSON' }, 400);
  }
  if (!token) return json({ error: 'no token' }, 400);

  let claims: CgClaims;
  try {
    claims = await verifyToken(token);
  } catch (err) {
    /* Deliberately vague to the caller, specific in the logs - and
       the token itself is never logged. */
    console.warn('token rejected:', err instanceof Error ? err.message : err);
    return json({ error: 'invalid token' }, 401);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { email, password } = await shadowCredentials(claims.userId, serviceKey);
  const username = claims.username || 'Player';
  const avatar = claims.profilePictureUrl || null;

  /* Is this CrazyGames account already linked? */
  const existing = await admin
    .from('cg_link')
    .select('user_id')
    .eq('cg_user_id', claims.userId)
    .maybeSingle();
  if (existing.error) {
    console.error('cg_link read failed:', existing.error.message);
    return json({ error: 'link lookup failed' }, 500);
  }

  let userId = existing.data?.user_id as string | undefined;

  if (!userId) {
    /* First time we have seen this CrazyGames account: create the
       shadow user. email_confirm skips the confirmation mail for an
       address that does not receive mail. */
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: username, avatar_url: avatar, cg_user_id: claims.userId },
    });

    if (created.error) {
      /* Two tabs logging in at once both miss the select and both
         create. The loser gets "already registered" - which is not
         an error, it means the account exists, so look it up. */
      const dup = /already|exists|duplicate/i.test(created.error.message);
      if (!dup) {
        console.error('createUser failed:', created.error.message);
        return json({ error: 'account creation failed' }, 500);
      }
      const again = await admin
        .from('cg_link')
        .select('user_id')
        .eq('cg_user_id', claims.userId)
        .maybeSingle();
      userId = again.data?.user_id as string | undefined;
      if (!userId) {
        console.error('duplicate user but no link row');
        return json({ error: 'account creation failed' }, 500);
      }
    } else {
      userId = created.data.user?.id;
    }
  } else {
    /* Known account. Keep the name and avatar current - people
       rename themselves on the portal - and re-assert the password,
       which matters if the service role key was ever rotated. */
    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { full_name: username, avatar_url: avatar, cg_user_id: claims.userId },
    });
    if (upd.error) console.warn('user refresh failed:', upd.error.message);
  }

  if (!userId) return json({ error: 'account creation failed' }, 500);

  /* Link row + profile. Both are upserts so this is idempotent. */
  const link = await admin.from('cg_link').upsert(
    {
      cg_user_id: claims.userId,
      user_id: userId,
      username,
      avatar_url: avatar,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'cg_user_id' }
  );
  if (link.error) {
    console.error('cg_link upsert failed:', link.error.message);
    return json({ error: 'link failed' }, 500);
  }

  const prof = await admin
    .from('profiles')
    .upsert(
      { id: userId, handle: username, avatar_url: avatar, is_portal: true },
      { onConflict: 'id' }
    );
  if (prof.error) console.warn('profile upsert failed:', prof.error.message);

  /* Hand back credentials for the shadow account. The CLIENT signs
     in with these, so the session lands in its own storage and the
     Supabase SDK refreshes it normally - no token juggling here.

     These are useless without a valid CrazyGames token to obtain
     them, and they authorise exactly one account: this player's. */
  return json({ email, password, username, avatar_url: avatar });
});
