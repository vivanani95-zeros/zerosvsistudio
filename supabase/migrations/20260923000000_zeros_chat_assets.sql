-- Durable assets for Zeros chat history.
-- Existing bucket used by the app: ZerosMessages.
insert into storage.buckets (id, name, public)
values ('ZerosMessages', 'ZerosMessages', false)
on conflict (id) do update set public = false;

drop policy if exists "zeros_messages_select_own" on storage.objects;
drop policy if exists "zeros_messages_insert_own" on storage.objects;
drop policy if exists "zeros_messages_update_own" on storage.objects;
drop policy if exists "zeros_messages_delete_own" on storage.objects;

create policy "zeros_messages_select_own"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'ZerosMessages'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "zeros_messages_insert_own"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'ZerosMessages'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "zeros_messages_update_own"
on storage.objects for update
to anon, authenticated
using (
  bucket_id = 'ZerosMessages'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
)
with check (
  bucket_id = 'ZerosMessages'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "zeros_messages_delete_own"
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'ZerosMessages'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
