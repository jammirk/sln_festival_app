-- Add the society flat to the Flats directory. Re-running this migration keeps
-- the requested resident name without changing an existing contribution amount.
insert into public.flats (flat_number, resident_name, expected_contribution)
values ('100', 'SLN Society', 1000)
on conflict (flat_number) do update
set resident_name = excluded.resident_name;
