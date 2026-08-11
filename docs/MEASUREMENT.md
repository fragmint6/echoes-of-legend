# Playtest measurement and feedback

The browser sends a small anonymous product funnel and voluntary feedback to the game's **existing Supabase project**. No third-party analytics account is required.

Install it once by running [`supabase-migration-06.sql`](supabase-migration-06.sql) in **Supabase Dashboard → SQL Editor**. The migration is rerunnable.

## Where the data lives

| Table                     | Purpose                                                                                        | Retention                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `public.telemetry_events` | Screens, mode choices, queue/match milestones, battle starts/results, and coarse client errors | Raw events older than 180 days are deleted probabilistically by the insert RPC |
| `public.player_feedback`  | Messages deliberately submitted through the Feedback form                                      | Kept until the owner resolves or deletes them                                  |

Browser users cannot read either table and cannot write directly. The browser may only execute `record_telemetry()` and `submit_player_feedback()`, which validate payload shape, limit size, and rate-limit anonymous identifiers. Neither funnel events nor feedback messages attach account identity.

Use **Table Editor** for individual feedback. Use **SQL Editor** for funnel summaries.

## What is recorded

Measurement may store:

- random anonymous visitor and per-session UUIDs;
- current screen;
- selected mode;
- multiplayer queue and opponent-found milestones;
- coarse battle type, battlefield, result, and round count;
- build label, viewport size, graphics mode, touch capability, and language;
- UTM campaign values and referring hostname on session start;
- short client-error message, script basename, and line number.

Measurement does **not** store:

- email addresses or callsigns;
- card choices, decks, actions, or battle seeds;
- chat or feedback text inside telemetry;
- full URLs, full user-agent strings, or stack traces;
- advertising identifiers.

Players can turn anonymous measurement off under **Settings → Privacy**. Doing so clears the anonymous visitor UUID from that device. Previously aggregated anonymous rows cannot be located from the device after that UUID is erased.

Feedback remains available when measurement is off because submission is a deliberate player action. The form has a separate checkbox for coarse diagnostics.

## Useful queries

### Newest feedback

```sql
select
  id,
  created_at,
  category,
  message,
  status,
  context
from public.player_feedback
order by created_at desc
limit 100;
```

Mark a message when handled:

```sql
update public.player_feedback
set status = 'resolved', owner_note = 'Fixed in build YYYY-MM-DD'
where id = 123;
```

### Daily visitors and sessions

```sql
select
  created_at::date as day,
  count(distinct visitor_id) as visitors,
  count(distinct session_id) as sessions
from public.telemetry_events
where created_at >= now() - interval '30 days'
group by 1
order by 1 desc;
```

### Funnel totals

```sql
select
  event_name,
  count(*) as events,
  count(distinct visitor_id) as visitors
from public.telemetry_events
where created_at >= now() - interval '14 days'
group by event_name
order by visitors desc;
```

### Visitor-level activation funnel

```sql
with per_visitor as (
  select
    visitor_id,
    bool_or(event_name = 'session_started') as visited,
    bool_or(event_name = 'view_opened' and context->>'view' = 'play') as opened_play,
    bool_or(event_name = 'battle_started') as started_battle,
    bool_or(event_name = 'battle_completed') as completed_battle,
    bool_or(event_name = 'account_ready') as reached_account,
    bool_or(event_name = 'multiplayer_queue_started') as queued_online,
    bool_or(event_name = 'multiplayer_match_found') as found_opponent
  from public.telemetry_events
  where created_at >= now() - interval '30 days'
  group by visitor_id
)
select
  count(*) filter (where visited) as visitors,
  count(*) filter (where opened_play) as opened_play,
  count(*) filter (where started_battle) as started_battle,
  count(*) filter (where completed_battle) as completed_battle,
  count(*) filter (where reached_account) as reached_account,
  count(*) filter (where queued_online) as queued_online,
  count(*) filter (where found_opponent) as found_opponent
from per_visitor;
```

### Battle completion by mode

```sql
select
  context->>'mode' as mode,
  count(*) filter (where event_name = 'battle_started') as starts,
  count(*) filter (where event_name = 'battle_completed') as completions,
  round(
    100.0 * count(*) filter (where event_name = 'battle_completed') /
    nullif(count(*) filter (where event_name = 'battle_started'), 0),
    1
  ) as completion_percent
from public.telemetry_events
where created_at >= now() - interval '30 days'
  and event_name in ('battle_started', 'battle_completed')
group by context->>'mode'
order by starts desc;
```

### Acquisition sources

Use separate links such as:

```text
https://fragmint6.web.app/echoes-of-legend/?utm_source=reddit&utm_medium=post&utm_campaign=august_playtest
https://fragmint6.web.app/echoes-of-legend/?utm_source=youtube&utm_medium=short&utm_campaign=august_playtest
```

Then query:

```sql
select
  coalesce(context->>'utm_source', context->>'referrer', 'direct') as source,
  count(distinct visitor_id) as visitors,
  count(distinct session_id) as sessions
from public.telemetry_events
where event_name = 'session_started'
  and created_at >= now() - interval '30 days'
group by 1
order by visitors desc;
```

### Recent client errors

```sql
select
  created_at,
  context->>'message' as message,
  context->>'file' as file,
  context->>'line' as line,
  context->>'build' as build,
  count(*) over (partition by context->>'message') as occurrences
from public.telemetry_events
where event_name = 'client_error'
  and created_at >= now() - interval '14 days'
order by created_at desc
limit 100;
```

## Reading the funnel

For an early playtest, answer these in order:

1. **Acquisition:** Which links produce actual visitors?
2. **Activation:** Do visitors open Play and begin a battle?
3. **Comprehension:** Do they finish the first battle or Gate I?
4. **Identity:** Do they create or return to an account?
5. **Liquidity:** How many queue attempts find an opponent?
6. **Retention:** How many anonymous visitor IDs return on later dates?

Do not optimize every percentage at once. Fix the earliest large drop, deploy, and measure the next cohort.
