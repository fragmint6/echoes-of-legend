-- =============================================================
-- Echoes of Legend - migration 08
-- ATOMIC SHOP CODE REDEMPTION
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- Every code is once per account. `single_user_only = true` tightens that
-- rule so exactly ONE account globally can claim the code. The function
-- locks the code row, making simultaneous claims deterministic.
-- =============================================================

begin;

create table if not exists public.shop_codes (
  code text primary key,
  coins integer not null check (coins between 1 and 10000000),
  single_user_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint shop_codes_normalized check (
    code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{3,32}$'
  )
);

create table if not exists public.shop_code_redemptions (
  code text not null references public.shop_codes(code) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  coins integer not null check (coins > 0),
  wallet_after bigint,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
create index if not exists shop_code_redemptions_user_idx
  on public.shop_code_redemptions(user_id, redeemed_at desc);

-- No direct client reads or writes. The security-definer RPC below is the
-- only redemption path; owners can manage offers in the Dashboard/SQL.
alter table public.shop_codes enable row level security;
alter table public.shop_code_redemptions enable row level security;
revoke all on table public.shop_codes from anon, authenticated;
revoke all on table public.shop_code_redemptions from anon, authenticated;

-- Public launch code: every account may claim it once.
insert into public.shop_codes(code, coins, single_user_only, active)
values ('CREATOR5000', 5000, false, true)
on conflict (code) do update
set coins = excluded.coins,
    single_user_only = excluded.single_user_only,
    active = excluded.active;

-- To create a code that only ONE user can ever claim:
-- insert into public.shop_codes(code, coins, single_user_only)
-- values ('UNIQUE-CODE-HERE', 5000, true);


drop function if exists public.redeem_shop_code(text, bigint);
create function public.redeem_shop_code(
  p_code text,
  p_wallet bigint default 0
)
returns table (
  result_status text,
  result_code text,
  reward_coins integer,
  single_user_only boolean,
  wallet_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  normalized text := upper(btrim(coalesce(p_code, '')));
  offer public.shop_codes%rowtype;
  save_doc jsonb;
  submitted_wallet bigint := greatest(0, least(coalesce(p_wallet, 0), 2147483647));
  server_wallet bigint := 0;
  final_wallet bigint := 0;
  award integer := 0;
  own_claim boolean := false;
  any_claim boolean := false;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if normalized !~ '^[A-Z0-9_-]{3,32}$' then
    return query select 'invalid'::text, normalized, 0, false, submitted_wallet;
    return;
  end if;

  -- The row lock serializes every claim for this code. For a globally
  -- single-user code, only the first transaction can observe zero claims.
  select c.* into offer
    from public.shop_codes c
   where c.code = normalized
   for update;

  if not found or not offer.active then
    return query select 'invalid'::text, normalized, 0, false, submitted_wallet;
    return;
  end if;

  select exists (
    select 1 from public.shop_code_redemptions r
     where r.code = normalized and r.user_id = me
  ) into own_claim;

  if own_claim then
    -- Idempotent retry: the account already owns this claim. No second award.
    award := 0;
  elsif offer.single_user_only then
    select exists (
      select 1 from public.shop_code_redemptions r where r.code = normalized
    ) into any_claim;
    if any_claim then
      return query
        select 'claimed'::text, normalized, offer.coins, true, submitted_wallet;
      return;
    end if;
  end if;

  if not own_claim then
    insert into public.shop_code_redemptions(code, user_id, coins)
    values (normalized, me, offer.coins);
    award := offer.coins;
  end if;

  -- The current prototype wallet is a readable JSON field in public.saves.
  -- Lock that row too, preserve any newer client/cloud balance, then add the
  -- award exactly once in the same transaction as the claim.
  insert into public.saves(user_id, data, updated_at)
  values (
    me,
    jsonb_build_object('v', 2, 'wallet', submitted_wallet),
    now()
  )
  on conflict (user_id) do nothing;

  select s.data into save_doc
    from public.saves s
   where s.user_id = me
   for update;

  if coalesce(save_doc->>'wallet', '') ~ '^[0-9]+$'
     and length(save_doc->>'wallet') <= 18 then
    server_wallet := greatest(0, least((save_doc->>'wallet')::bigint, 2147483647));
  end if;
  final_wallet := least(2147483647, greatest(server_wallet, submitted_wallet) + award);

  update public.saves
     set data = jsonb_set(
           case
             when jsonb_typeof(coalesce(data, '{}'::jsonb)) = 'object' then coalesce(data, '{}'::jsonb)
             else '{}'::jsonb
           end,
           '{wallet}',
           to_jsonb(final_wallet),
           true
         ),
         updated_at = now()
   where user_id = me;

  if not own_claim then
    update public.shop_code_redemptions
       set wallet_after = final_wallet
     where code = normalized and user_id = me;
  end if;

  return query
    select case when own_claim then 'redeemed' else 'granted' end,
           normalized,
           offer.coins,
           offer.single_user_only,
           final_wallet;
end;
$$;

revoke all on function public.redeem_shop_code(text, bigint) from public, anon;
grant execute on function public.redeem_shop_code(text, bigint) to authenticated;

commit;
