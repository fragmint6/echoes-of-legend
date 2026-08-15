#!/usr/bin/env python3
"""verify_migration_14.py - run migration 14 against a REAL Postgres.

The JS suites can only read the SQL as text. This one executes it, which
is the only way to catch what actually shipped broken: the unique index
on lower(handle) cannot be created on a database that already contains
two accounts differing only in case, and the migration went out without
handling that. The reported failure was

    ERROR: 23505: could not create unique index "profiles_handle_lower_idx"
    DETAIL:  Key (lower(handle))=(fragmint) is duplicated.

So the fixture below deliberately seeds fragmint / Fragmint / FRAGMINT.

Requires the `pgserver` package, which ships its own Postgres binary:
    pip install --break-system-packages pgserver
SKIPs cleanly (exit 0) when it is not installed, so the sweep still runs
on a machine without it.
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG_PATH = os.path.join(ROOT, 'docs', 'supabase-migration-14.sql')
SETUP_PATH = os.path.join(ROOT, 'sim', 'fixtures', 'profiles_with_duplicates.sql')

try:
    import pgserver
except ImportError:
    print('verify_migration_14: SKIP (pgserver not installed)')
    sys.exit(0)

PGDATA = os.environ.get('EOL_PGDATA', '/tmp/eol_pgdata')
db = pgserver.get_server(PGDATA)
PSQL = os.path.join(os.path.dirname(pgserver.__file__), 'pginstall', 'bin', 'psql')
if not os.path.exists(PSQL):
    print('verify_migration_14: SKIP (bundled psql not found)')
    sys.exit(0)

print('verify_migration_14')

U1 = '11111111-1111-1111-1111-111111111111'
U4 = '44444444-4444-4444-4444-444444444444'
results = []
# FRESH STATE EVERY RUN. Without this the previous run's renames leak in
# and the cooldown/uniqueness assertions test the wrong starting point.
db.psql(open(SETUP_PATH).read())
db.psql("do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;")
db.psql(open(MIG_PATH).read())
db.psql("grant usage on schema public to authenticated; grant select, insert, update on public.profiles to authenticated;")
# put U1 in the post-first-rename state the cooldown section expects
db.psql("begin; select set_config('app.handle_write','on',true); update public.profiles set handle='BrandNew', handle_changed_at=now() where id='11111111-1111-1111-1111-111111111111'; commit;")
def run(uid, sql):
    """returns (stdout, error_message_or_None)"""
    import subprocess, os
    full = "begin; set local role authenticated; set local request.jwt.claim.sub = '%s'; %s commit;" % (uid, sql)
    p = subprocess.run([PSQL, db.get_uri(), '-v','ON_ERROR_STOP=0','-c',full],
                       capture_output=True, text=True)
    err = None
    for l in p.stderr.splitlines():
        if l.startswith('ERROR:'): err = l[6:].strip()
    return p.stdout, err
def ok(cond, msg):
    results.append((cond,msg)); print(("  PASS  " if cond else "  FAIL  ")+msg)

def handle_of(uid):
    o,_ = run(uid, "select handle from public.profiles where id='%s';" % uid)
    lines=[l.strip() for l in o.splitlines()]
    # psql prints: BEGIN / SET / SET / handle / ------ / value / (1 row) / COMMIT
    for i,l in enumerate(lines):
        if set(l) <= set('-') and l:
            return lines[i+1] if i+1 < len(lines) else '?'
    return '?'

print("\n-- cooldown --")
o,e = run(U1, "select public.set_handle('TooSoon');")
ok(e is not None and 'again on' in e, 'a second rename inside the week is refused: %r' % (e or 'NO ERROR'))
ok(handle_of(U1)=='BrandNew', 'and the name is unchanged (%s)' % handle_of(U1))

print("\n-- re-saving the same name is a no-op --")
o,e = run(U4, "select public.set_handle('SomeoneElse');")
ok(e is None, 'saving your own name back does not error')
o,_ = run(U4, "select handle_changed_at is null as untouched from public.profiles where id='%s';" % U4)
ok('t' in o, 'and does NOT burn the weekly change (stamp still null)')

print("\n-- uniqueness --")
o,e = run(U4, "select public.set_handle('brandnew');")
ok(e is not None and 'taken' in e.lower(), 'a name held by someone else is refused case-insensitively: %r' % (e or 'NO ERROR'))

print("\n-- format --")
for bad,label in [('ab','too short'),('has space','space'),("bad!char",'punctuation'),('x'*25,'too long')]:
    o,e = run(U4, "select public.set_handle(%s);" % ("'"+bad+"'"))
    ok(e is not None, 'rejects %s' % label)

print("\n-- THE PIN: direct UPDATE cannot rename --")
o,e = run(U4, "update public.profiles set handle='Sneaky' where id='%s';" % U4)
ok(handle_of(U4)=='SomeoneElse', 'a direct client UPDATE leaves the handle alone (got %s)' % handle_of(U4))
o,e = run(U4, "update public.profiles set handle_changed_at=null where id='%s';" % U4)
ok(e is None, 'and does not error, so old clients are not broken')

print("\n-- the avatar still updates normally --")
o,e = run(U4, "update public.profiles set avatar_url='http://x/a.png' where id='%s';" % U4)
o2,_ = run(U4, "select avatar_url from public.profiles where id='%s';" % U4)
ok('a.png' in o2, 'avatar_url is still writable by the client')

print("\n-- no 42P17: the table is readable --")
o,e = run(U4, "select count(*) from public.profiles;")
ok(e is None and 'recursion' not in (e or ''), 'profiles is readable - no infinite recursion in policy')

print("\n-- the pin applies to EVERY writer, not just RLS-bound clients --")
db.psql("update public.profiles set handle_changed_at = now() - interval '99 days' where id='%s';" % U1)
o,_ = run(U1, "select now() - handle_changed_at < interval '90 days' as still_recent from public.profiles where id='%s';" % U1)
ok('t' in o, 'a plain owner UPDATE cannot backdate the stamp either')

print("\n-- cooldown expiry --")
db.psql("begin; select set_config('app.handle_write','on',true); update public.profiles set handle_changed_at = now() - interval '8 days' where id='%s'; commit;" % U1)
o,e = run(U1, "select public.set_handle('WeekLater');")
ok(e is None and handle_of(U1)=='WeekLater', 'after 7 days the rename unlocks (got %s)' % handle_of(U1))
db.psql("begin; select set_config('app.handle_write','on',true); update public.profiles set handle_changed_at = now() - interval '6 days' where id='%s'; commit;" % U1)
o,e = run(U1, "select public.set_handle('Nope');")
ok(e is not None, 'but 6 days is still refused')

bad=[m for c,m in results if not c]
print("\n"+"="*60)
print(("ALL %d PASSED" % len(results)) if not bad else ("%d FAILED" % len(bad)))
print("="*60)
sys.exit(1 if bad else 0)
