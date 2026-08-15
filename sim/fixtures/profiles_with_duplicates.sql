drop schema if exists public cascade;
create schema public;
-- minimal stand-ins for the Supabase bits migration 14 touches
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles (
  id uuid primary key,
  handle text not null default 'Player',
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles readable"  on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "profiles readable"  on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
-- THE REPORTED CLASH: same name, different case, plus a clean control
insert into public.profiles(id, handle, created_at) values
  ('11111111-1111-1111-1111-111111111111','fragmint', now() - interval '10 days'),
  ('22222222-2222-2222-2222-222222222222','Fragmint', now() - interval '5 days'),
  ('33333333-3333-3333-3333-333333333333','FRAGMINT', now() - interval '1 day'),
  ('44444444-4444-4444-4444-444444444444','SomeoneElse', now());
