alter table public.fund_collections
  add column donation_type text not null default 'Donation';

alter table public.fund_collections
  add constraint fund_collections_donation_type_check
  check (donation_type in ('Donation', 'Annaprasadam', 'Pooja', 'Homam'));
