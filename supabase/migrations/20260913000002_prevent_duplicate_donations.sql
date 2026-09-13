create or replace function public.prevent_duplicate_active_donation()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.festival_id::text || new.flat_id::text || new.donation_type,
      0
    )
  );

  if exists (
    select 1
    from public.fund_collections
    where festival_id = new.festival_id
      and flat_id = new.flat_id
      and donation_type = new.donation_type
      and status = 'ACTIVE'
  ) then
    raise exception 'An active donation for this flat and donation type already exists';
  end if;

  return new;
end;
$$;

create trigger prevent_duplicate_active_donation
before insert on public.fund_collections
for each row execute function public.prevent_duplicate_active_donation();
