-- 利用者ごとのデータ分離（Supabase / PostgreSQL）。
--
-- 注意: Supabase は新規テーブルに anon / authenticated 権限を自動で付け、RLS は初期状態で OFF。
-- テーブルを作る・変えるたびに下の設定を流さないと、公開キー（anon key）だけで
-- 全利用者のデータを読み書きできる状態になる。

create table if not exists public.cases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  compensation jsonb not null,
  decision     text not null check (decision in ('通知する', '要確認', '捨てる')),
  created_at   timestamptz not null default now()
);

alter table public.cases enable row level security;
-- テーブル所有者にも RLS を適用する（service_role は引き続き RLS を迂回する）。
alter table public.cases force row level security;

revoke all on public.cases from anon, authenticated;

-- 自分の行だけ操作できる権限を、必要な操作に限って付け直す。
grant select, insert, update, delete on public.cases to authenticated;

create policy cases_select_own on public.cases
  for select to authenticated using (user_id = auth.uid());

create policy cases_insert_own on public.cases
  for insert to authenticated with check (user_id = auth.uid());

create policy cases_update_own on public.cases
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cases_delete_own on public.cases
  for delete to authenticated using (user_id = auth.uid());
