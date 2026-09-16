-- Society-managed flats do not have a festival contribution due and must not
-- be listed in the outstanding-flats report.
update public.flats
set expected_contribution = 0,
    resident_name = 'SLN Society'
where flat_number = '100';

insert into public.flats (flat_number, resident_name, expected_contribution)
values ('000', 'SLN Society Fund', 0)
on conflict (flat_number) do update
set resident_name = excluded.resident_name,
    expected_contribution = excluded.expected_contribution;