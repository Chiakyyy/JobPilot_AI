-- This migration creates the profiles table and row level security policies.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  target_role text,
  location text,
  skills text[] default '{}'::text[] not null,
  experience_level text,
  education_summary text,
  experience_summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- This function automatically sets the updated timestamp on row updates.
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer;

-- This trigger runs the timestamp update function before any profile update.
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- This function creates an empty profile whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- This trigger calls the profile creation function after user registration.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- This grants schema and table permissions to authenticated users.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

-- This command enables row level security on the profiles table.
alter table public.profiles enable row level security;

-- This policy allows users to select only their own profile.
drop policy if exists "users can view their own profile" on public.profiles;
create policy "users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- This policy allows users to insert their own profile.
drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- This policy allows users to update only their own profile.
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- This policy allows users to delete only their own profile.
drop policy if exists "users can delete their own profile" on public.profiles;
create policy "users can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);
