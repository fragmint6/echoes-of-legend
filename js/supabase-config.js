/* =============================================================
 * Supabase configuration
 * -------------------------------------------------------------
 * WHICH KEY GOES HERE
 *
 *   PUBLISHABLE / ANON key  ->  yes, belongs here.
 *     Looks like:  sb_publishable_...   (or a long eyJ... JWT on
 *     older projects). It is designed to ship in browser code. On
 *     its own it can do nothing: every table is protected by Row
 *     Level Security, so this key can only read and write rows the
 *     signed-in user is allowed to touch.
 *
 *   SECRET / SERVICE-ROLE key  ->  NEVER here.
 *     Looks like:  sb_secret_...        (or `service_role` in a JWT)
 *     It BYPASSES Row Level Security entirely. Anyone who opens
 *     devtools on this page would be able to read, edit and delete
 *     every account in the database. It belongs only in server-side
 *     code (Edge Functions, a backend you control) and in a secret
 *     store, never in a file the browser downloads.
 *
 * This file is a plain global rather than an env-var build step
 * because the game runs from file:// with no bundler. Swap in your
 * own values below.
 * ============================================================= */
window.EOL = window.EOL || {};

window.EOL.supabaseConfig = {
  /* Project URL. Dashboard -> Project Settings -> Data API.
     -------------------------------------------------------------
     This is the BASE project URL, with no path on the end. The
     dashboard also shows a REST endpoint ending in `/rest/v1/`;
     that is not this. The client appends its own paths (`/rest/v1`
     for tables, `/auth/v1` for sign-in, `/realtime/v1` for the match
     socket), so a URL with `/rest/v1/` already on it would send auth
     and realtime to addresses that do not exist. */
  url: 'https://ghchcvrojojrlbgqbvga.supabase.co',

  /* PUBLISHABLE (anon) key ONLY. Dashboard -> Project Settings ->
     API Keys -> "publishable" / "anon public". */
  anonKey: 'sb_publishable_SFZP7hPVaqIe8jB0GAO1TA_OyCo-JYl',

  /* Where Google should send the player back after the OAuth round
     trip. Left blank, it uses the page's own address. Any value here
     must also be listed under Authentication -> URL Configuration ->
     Redirect URLs in the Supabase dashboard. */
  redirectTo: '',
};
