-- Run once in the Supabase SQL editor before enabling config.js.
-- Browser clients receive only the publishable key and user JWTs.
begin;
create table if not exists public.cards (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 store text not null check (length(btrim(store)) between 1 and 40),
 number text not null check (length(number) between 1 and 2048),
 format text not null check (format in ('CODE_128','CODE_39','EAN_13','EAN_8','UPC_A','QR_CODE','DATA_MATRIX','AZTEC','PDF_417')),
 color text not null default '#276749' check (color ~ '^#[0-9a-fA-F]{6}$'),
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (user_id,id)
);
alter table public.cards enable row level security;
alter table public.cards force row level security;
revoke all on public.cards from anon, authenticated;
grant select, insert, update on public.cards to authenticated;
create policy cards_select_own on public.cards for select to authenticated using ((select auth.uid()) = user_id);
create policy cards_insert_own on public.cards for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cards_update_own on public.cards for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create or replace function public.onecard_stamp_update() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger cards_updated before update on public.cards for each row execute function public.onecard_stamp_update();
commit;
