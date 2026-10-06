alter table public.fund_collections
  drop constraint fund_collections_donation_type_check;

alter table public.fund_collections
  add constraint fund_collections_donation_type_check
  check (donation_type in ('Donation', 'Annaprasadam', 'Pooja', 'Homam', 'Hundi'));
