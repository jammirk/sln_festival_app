-- Sponsors are separate from financial donations and may be managed by administrators.
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id),
  flat_id uuid not null references public.flats(id),
  sponsor_for text not null check (length(trim(sponsor_for)) > 0),
  sponsor_date date not null check (sponsor_date <= current_date),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sponsors_festival_date_idx on public.sponsors(festival_id, sponsor_date desc);
create trigger sponsors_updated before update on public.sponsors
for each row execute function public.set_updated_at();

alter table public.sponsors enable row level security;
drop policy if exists "authenticated users read sponsors" on public.sponsors;
create policy "authenticated users read sponsors"
on public.sponsors for select to authenticated using (true);
drop policy if exists "admins manage sponsors" on public.sponsors;
create policy "admins manage sponsors"
on public.sponsors for all to authenticated
using (public.has_role('ADMIN'))
with check (public.has_role('ADMIN'));