-- Renumber the original 103 placeholder flats without changing IDs or their financial history.
-- This preserves all existing collection references because fund_collections uses flat_id.
with target_numbers(flat_number, sequence) as (
  select (100 + unit)::text, row_number() over (order by unit)
  from generate_series(1,14) unit where unit <> 12
  union all
  select (floor_number * 100 + unit)::text,
         13 + ((floor_number - 2) * 18) + unit
  from generate_series(2,6) floor_number cross join generate_series(1,18) unit
), existing_flats as (
  select id, row_number() over (order by nullif(regexp_replace(flat_number, '[^0-9]', '', 'g'), '')::integer, id) as sequence
  from public.flats
)
update public.flats f set flat_number = t.flat_number
from existing_flats e join target_numbers t using (sequence)
where f.id = e.id;
