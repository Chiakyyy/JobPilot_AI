-- This migration creates the private cv metadata table and storage policies.

-- This table stores file metadata and storage paths for user uploaded documents.
create table if not exists public.user_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  file_path text not null,
  file_name text not null,
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 5242880),
  mime_type text not null default 'application/pdf',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- This block links the user cvs relation to profiles for convenient api joins.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'user_cvs_user_id_profiles_fkey'
  ) then
    alter table public.user_cvs
      add constraint user_cvs_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- This index optimizes document lookups by candidate identifier.
create index if not exists idx_user_cvs_user_id
  on public.user_cvs (user_id);

-- This trigger updates the modification timestamp before modifying cv metadata.
drop trigger if exists set_user_cvs_updated_at on public.user_cvs;
create trigger set_user_cvs_updated_at
  before update on public.user_cvs
  for each row execute function public.handle_updated_at();

-- This grants schema and table permissions for authenticated users.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.user_cvs to authenticated;

-- This enables row level security on the cv metadata table.
alter table public.user_cvs enable row level security;

-- This policy allows owners and reviewing recruiters to read cv metadata.
drop policy if exists "users and authorized recruiters can view cv metadata" on public.user_cvs;
create policy "users and authorized recruiters can view cv metadata"
  on public.user_cvs
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.applications a
      join public.job_offers o on o.id = a.offer_id
      where a.user_id = user_cvs.user_id
        and o.user_id = auth.uid()
    )
  );

-- This policy restricts document metadata creation exclusively to the document owner.
drop policy if exists "users can insert their own cv metadata" on public.user_cvs;
create policy "users can insert their own cv metadata"
  on public.user_cvs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- This policy restricts document metadata updates exclusively to the document owner.
drop policy if exists "users can update their own cv metadata" on public.user_cvs;
create policy "users can update their own cv metadata"
  on public.user_cvs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- This policy restricts document metadata deletion exclusively to the document owner.
drop policy if exists "users can delete their own cv metadata" on public.user_cvs;
create policy "users can delete their own cv metadata"
  on public.user_cvs
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- This statement provisions the private storage bucket with size and format limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- This policy allows users to upload documents only into their assigned user folder.
drop policy if exists "users can upload their own cv object" on storage.objects;
create policy "users can upload their own cv object"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- This policy allows users to update files located in their assigned user folder.
drop policy if exists "users can update their own cv object" on storage.objects;
create policy "users can update their own cv object"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- This policy allows users to delete files located in their assigned user folder.
drop policy if exists "users can delete their own cv object" on storage.objects;
create policy "users can delete their own cv object"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- This policy allows owners and reviewing recruiters to read private cv storage objects.
drop policy if exists "users and authorized recruiters can read cv objects" on storage.objects;
create policy "users and authorized recruiters can read cv objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'cvs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.applications a
        join public.job_offers o on o.id = a.offer_id
        where a.user_id::text = (storage.foldername(name))[1]
          and o.user_id = auth.uid()
      )
    )
  );
