-- Sponsorship amount is optional because some sponsorships are in-kind.
alter table public.sponsors
add column amount numeric(12,2) check (amount is null or amount > 0);
