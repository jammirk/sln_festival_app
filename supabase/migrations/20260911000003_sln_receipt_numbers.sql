-- Change receipt references to SLN-YYYY-0001 while retaining every transaction and audit record.
create or replace function public.assign_collection_number()
returns trigger language plpgsql as $$
declare y integer; n integer;
begin
  select year into y from public.festivals where id = new.festival_id;
  select count(*) + 1 into n from public.fund_collections where festival_id = new.festival_id;
  new.receipt_number := format('SLN-%s-%s', y, lpad(n::text, 4, '0'));
  return new;
end $$;

-- This controlled data migration is the only exception to the immutable financial-row rule.
alter table public.fund_collections disable trigger protect_collections;

-- A temporary unique prefix avoids collisions while renumbering existing receipts.
update public.fund_collections set receipt_number = 'TMP-' || id::text;

with ordered as (
  select c.id, f.year,
    row_number() over (partition by c.festival_id order by c.created_at, c.id) as sequence
  from public.fund_collections c
  join public.festivals f on f.id = c.festival_id
)
update public.fund_collections c
set receipt_number = format('SLN-%s-%s', ordered.year, lpad(ordered.sequence::text, 4, '0'))
from ordered
where c.id = ordered.id;

alter table public.fund_collections enable trigger protect_collections;
