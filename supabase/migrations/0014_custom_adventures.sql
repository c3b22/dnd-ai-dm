create table custom_adventures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  title_th text not null,
  tagline text not null,
  tagline_th text not null,
  tone text not null,
  tone_th text not null,
  setting text not null,
  hook text not null,
  opening_th text not null,
  secret text not null,
  acts jsonb not null,
  npcs jsonb not null default '[]',
  scenes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table custom_adventures enable row level security;

create policy "custom adventures are publicly readable"
  on custom_adventures for select
  using (true);

create policy "owners manage their own custom adventures"
  on custom_adventures for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('adventure-scenes', 'adventure-scenes', true)
on conflict (id) do nothing;

create policy "adventure scene images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'adventure-scenes');

create policy "owners manage their adventure scene images"
  on storage.objects for all
  using (
    bucket_id = 'adventure-scenes'
    and exists (
      select 1 from custom_adventures a
      where a.id::text = (storage.foldername(name))[1]
        and a.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'adventure-scenes'
    and exists (
      select 1 from custom_adventures a
      where a.id::text = (storage.foldername(name))[1]
        and a.owner_id = auth.uid()
    )
  );
