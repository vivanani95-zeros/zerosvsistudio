-- MAI private group history.
-- The application never exposes this table directly to the browser:
-- all reads/writes go through the Cloudflare server route after MAI password authentication.
create table if not exists public.mai_messages (
  id uuid primary key default gen_random_uuid(),
  character text not null check (character in ('SPIDER-MAN', 'IRON-MAN', 'THOR', 'MAI')),
  content text not null check (char_length(content) between 1 and 4000),
  is_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mai_messages_created_at_idx
  on public.mai_messages (created_at desc);

alter table public.mai_messages enable row level security;

revoke all on table public.mai_messages from anon, authenticated;

grant all on table public.mai_messages to service_role;

-- Keep the table out of the browser-facing Data API. The server-only Supabase
-- secret key is the sole database credential used by the MAI routes.
