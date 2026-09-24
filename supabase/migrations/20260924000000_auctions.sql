-- Auction winners and bids are stored separately from financial donations.
create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id),
  flat_id uuid not null references public.flats(id),
  item text not null check (length(trim(item)) > 0),
  winning_price numeric(12,2) not null check (winning_price > 0),
  auction_date date not null check (auction_date <= current_date),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auctions_festival_date_idx on public.auctions(festival_id, auction_date desc);
create trigger auctions_updated before update on public.auctions
for each row execute function public.set_updated_at();

alter table public.auctions enable row level security;
drop policy if exists "authenticated users read auctions" on public.auctions;
create policy "authenticated users read auctions"
on public.auctions for select to authenticated using (true);
drop policy if exists "admins manage auctions" on public.auctions;
create policy "admins manage auctions"
on public.auctions for all to authenticated
using (public.has_role('ADMIN'))
with check (public.has_role('ADMIN'));