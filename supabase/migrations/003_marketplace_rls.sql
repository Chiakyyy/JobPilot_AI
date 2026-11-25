-- This migration updates row level security policies for the shared marketplace model.

-- This block ensures a direct foreign key exists between job offers and profiles for api joins.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'job_offers_user_id_profiles_fkey'
  ) then
    alter table public.job_offers
      add constraint job_offers_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- This block ensures a direct foreign key exists between applications and profiles for api joins.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'applications_user_id_profiles_fkey'
  ) then
    alter table public.applications
      add constraint applications_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- This policy allows all authenticated users to view profiles across the platform.
drop policy if exists "users can view their own profile" on public.profiles;
drop policy if exists "authenticated users can view profiles" on public.profiles;
create policy "authenticated users can view profiles"
  on public.profiles
  for select
  to authenticated
  using (auth.role() = 'authenticated');

-- This policy allows all authenticated users to browse published job offers.
drop policy if exists "users can view their own job offers" on public.job_offers;
drop policy if exists "authenticated users can view all job offers" on public.job_offers;
create policy "authenticated users can view all job offers"
  on public.job_offers
  for select
  to authenticated
  using (auth.role() = 'authenticated');

-- This policy allows applicants and offer posters to view relevant applications.
drop policy if exists "users can view their own applications" on public.applications;
drop policy if exists "candidates and offer owners can view applications" on public.applications;
create policy "candidates and offer owners can view applications"
  on public.applications
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.job_offers
      where job_offers.id = applications.offer_id and job_offers.user_id = auth.uid()
    )
  );

-- This policy allows candidates to apply only to offers created by other users.
drop policy if exists "users can insert their own applications" on public.applications;
drop policy if exists "candidates can apply to offers from other users" on public.applications;
create policy "candidates can apply to offers from other users"
  on public.applications
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.job_offers
      where job_offers.id = applications.offer_id and job_offers.user_id = auth.uid()
    )
  );

-- This policy allows both the candidate and the offer poster to update the application.
drop policy if exists "users can update their own applications" on public.applications;
drop policy if exists "candidates and offer owners can update applications" on public.applications;
create policy "candidates and offer owners can update applications"
  on public.applications
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.job_offers
      where job_offers.id = applications.offer_id and job_offers.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.job_offers
      where job_offers.id = applications.offer_id and job_offers.user_id = auth.uid()
    )
  );

-- This policy restricts application deletion exclusively to the candidate who applied.
drop policy if exists "users can delete their own applications" on public.applications;
drop policy if exists "candidates can delete their own applications" on public.applications;
create policy "candidates can delete their own applications"
  on public.applications
  for delete
  to authenticated
  using (auth.uid() = user_id);
