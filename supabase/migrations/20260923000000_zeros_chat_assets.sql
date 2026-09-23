-- Durable assets for Zeros chat history.
-- Run this once in Supabase SQL Editor.
insert into storage.buckets (id, name, public)
values ('zeros-chat-assets', 'zeros-chat-assets', false)
on conflict (id) do nothing;

drop policy if exists "zeros_assets_select_own" on storage.objects;
drop policy if exists "zeros_assets_insert_own" on storage.objects;
drop policy if exists "zeros_assets_delete_own" on storage.objects;

create policy "zeros_assets_select_own"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'zeros-chat-assets'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "zeros_assets_insert_own"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'zeros-chat-assets'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "zeros_assets_delete_own"
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'zeros-chat-assets'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
