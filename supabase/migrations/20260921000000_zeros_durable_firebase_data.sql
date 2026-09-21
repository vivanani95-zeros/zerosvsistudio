-- Zeros durable per-account data for Firebase third-party authentication.
-- Firebase UIDs are strings, so ownership keys are stored as text.
alter table if exists public.profiles drop constraint if exists profiles_id_fkey;
alter table if exists public.conversations drop constraint if exists conversations_user_id_fkey;
alter table if exists public.memories drop constraint if exists memories_user_id_fkey;
alter table if exists public.messages drop constraint if exists messages_user_id_fkey;

alter table if exists public.profiles alter column id type text using id::text;
alter table if exists public.conversations alter column user_id type text using user_id::text;
alter table if exists public.memories alter column user_id type text using user_id::text;
alter table if exists public.messages alter column user_id type text using user_id::text;

alter table if exists public.profiles enable row level security;
alter table if exists public.conversations enable row level security;
alter table if exists public.memories enable row level security;
alter table if exists public.messages enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'conversations', 'memories', 'messages')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "zeros_profiles_select_own" on public.profiles for select to anon, authenticated
using ((select auth.jwt()->>'sub') = id);
create policy "zeros_profiles_insert_own" on public.profiles for insert to anon, authenticated
with check ((select auth.jwt()->>'sub') = id);
create policy "zeros_profiles_update_own" on public.profiles for update to anon, authenticated
using ((select auth.jwt()->>'sub') = id) with check ((select auth.jwt()->>'sub') = id);

create policy "zeros_conversations_select_own" on public.conversations for select to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_conversations_insert_own" on public.conversations for insert to anon, authenticated
with check ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_conversations_update_own" on public.conversations for update to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_conversations_delete_own" on public.conversations for delete to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id);

create policy "zeros_memories_select_own" on public.memories for select to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_memories_insert_own" on public.memories for insert to anon, authenticated
with check ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_memories_update_own" on public.memories for update to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy "zeros_memories_delete_own" on public.memories for delete to anon, authenticated
using ((select auth.jwt()->>'sub') = user_id);

create policy "zeros_messages_select_own" on public.messages for select to anon, authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.jwt()->>'sub')
  )
);
create policy "zeros_messages_insert_own" on public.messages for insert to anon, authenticated
with check (
  (select auth.jwt()->>'sub') = user_id
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.jwt()->>'sub')
  )
);
create policy "zeros_messages_update_own" on public.messages for update to anon, authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.jwt()->>'sub')
  )
)
with check (
  (select auth.jwt()->>'sub') = user_id
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.jwt()->>'sub')
  )
);
create policy "zeros_messages_delete_own" on public.messages for delete to anon, authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.jwt()->>'sub')
  )
);

create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists memories_user_id_idx on public.memories(user_id);
create index if not exists messages_user_id_idx on public.messages(user_id);
