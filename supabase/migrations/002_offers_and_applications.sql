-- This migration creates the job offers and applications tables with relational security policies.

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  company text not null,
  location text,
  url text,
  description text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  offer_id uuid not null references public.job_offers(id) on delete cascade,
  status text not null default 'Applied' check (status in ('Saved', 'Applied', 'Interview', 'Offer', 'Rejected')),
  applied_at timestamp with time zone default timezone('utc'::text, now()) not null,
  notes text,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_offer unique (user_id, offer_id)
);

-- This index optimizes queries filtering offers by user and sorted by creation date.
create index if not exists idx_job_offers_user_created
  on public.job_offers (user_id, created_at desc);

-- This index accelerates dashboard and list queries by user, status and update timestamp.
create index if not exists idx_applications_user_status_updated
  on public.applications (user_id, status, updated_at desc);

-- This index optimizes join lookups between applications and job offers.
create index if not exists idx_applications_offer_id
  on public.applications (offer_id);

-- This trigger updates the modification timestamp before modifying a job offer.
drop trigger if exists set_job_offers_updated_at on public.job_offers;
create trigger set_job_offers_updated_at
  before update on public.job_offers
  for each row execute function public.handle_updated_at();

-- This trigger updates the modification timestamp before modifying an application.
drop trigger if exists set_applications_updated_at on public.applications;
create trigger set_applications_updated_at
  before update on public.applications
  for each row execute function public.handle_updated_at();

-- This grants schema and table permissions for authenticated users.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.job_offers to authenticated;
grant select, insert, update, delete on table public.applications to authenticated;

-- This enables row level security on job offers and applications.
alter table public.job_offers enable row level security;
alter table public.applications enable row level security;

-- This policy allows users to select only their own job offers.
drop policy if exists "users can view their own job offers" on public.job_offers;
create policy "users can view their own job offers"
  on public.job_offers
  for select
  to authenticated
  using (auth.uid() = user_id);

-- This policy allows users to insert their own job offers.
drop policy if exists "users can insert their own job offers" on public.job_offers;
create policy "users can insert their own job offers"
  on public.job_offers
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- This policy allows users to update only their own job offers.
drop policy if exists "users can update their own job offers" on public.job_offers;
create policy "users can update their own job offers"
  on public.job_offers
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- This policy allows users to delete only their own job offers.
drop policy if exists "users can delete their own job offers" on public.job_offers;
create policy "users can delete their own job offers"
  on public.job_offers
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- This policy allows users to select only their own applications.
drop policy if exists "users can view their own applications" on public.applications;
create policy "users can view their own applications"
  on public.applications
  for select
  to authenticated
  using (auth.uid() = user_id);

-- This policy ensures users can only insert applications referencing their own offers.
drop policy if exists "users can insert their own applications" on public.applications;
create policy "users can insert their own applications"
  on public.applications
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.job_offers
      where id = offer_id and user_id = auth.uid()
    )
  );

-- This policy ensures users can only update applications referencing their own offers.
drop policy if exists "users can update their own applications" on public.applications;
create policy "users can update their own applications"
  on public.applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.job_offers
      where id = offer_id and user_id = auth.uid()
    )
  );

-- This policy allows users to delete only their own applications.
drop policy if exists "users can delete their own applications" on public.applications;
create policy "users can delete their own applications"
  on public.applications
  for delete
  to authenticated
  using (auth.uid() = user_id);
