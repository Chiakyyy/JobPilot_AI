-- This migration adds recruiter consultation tracking and idempotent functions to applications.

-- This column records the timestamp when an offer poster first consults an application.
alter table public.applications
  add column if not exists viewed_by_recruiter_at timestamp with time zone default null;

-- This function verifies offer ownership and records the initial recruiter viewing timestamp.
create or replace function public.mark_application_viewed(p_application_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_is_authorized boolean;
begin
  select exists (
    select 1
    from public.applications a
    join public.job_offers o on o.id = a.offer_id
    where a.id = p_application_id and o.user_id = auth.uid()
  ) into v_is_authorized;

  if not v_is_authorized then
    return false;
  end if;

  update public.applications
  set viewed_by_recruiter_at = coalesce(viewed_by_recruiter_at, now())
  where id = p_application_id;

  return true;
end;
$$;

-- This grants execution permissions on the consultation marker to authenticated users.
grant execute on function public.mark_application_viewed(uuid) to authenticated;

-- This function guarantees that updating candidate status marks the application as consulted.
create or replace function public.handle_application_viewed_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.viewed_by_recruiter_at = coalesce(new.viewed_by_recruiter_at, old.viewed_by_recruiter_at, now());
  end if;
  return new;
end;
$$;

-- This trigger attaches the consultation guarantee to status transitions on applications.
drop trigger if exists set_application_viewed_on_status_update on public.applications;
create trigger set_application_viewed_on_status_update
  before update on public.applications
  for each row execute function public.handle_application_viewed_on_status_change();
