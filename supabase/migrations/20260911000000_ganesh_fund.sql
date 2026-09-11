-- Ganesh Festival Fund Manager: schema, safeguards and role-aware RLS
create extension if not exists pgcrypto;
create type public.record_status as enum ('ACTIVE', 'VOIDED');
create type public.festival_status as enum ('DRAFT', 'ACTIVE', 'CLOSED');
create type public.user_role as enum ('ADMIN', 'COLLECTOR', 'VIEWER');

create table public.festivals (
  id uuid primary key default gen_random_uuid(), name text not null, year integer not null check(year between 2000 and 2100),
  start_date date, end_date date, opening_balance numeric(12,2) not null default 0 check(opening_balance >= 0),
  expected_contribution numeric(12,2) not null default 1000 check(expected_contribution >= 0), status public.festival_status not null default 'DRAFT',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(year)
);
create table public.profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null, role public.user_role not null default 'VIEWER', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.flats (
  id uuid primary key default gen_random_uuid(), flat_number text not null unique, resident_name text, phone text,
  expected_contribution numeric(12,2) not null default 1000 check(expected_contribution >= 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(), festival_id uuid not null references public.festivals(id), name text not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(festival_id,name)
);
create table public.fund_collections (
  id uuid primary key default gen_random_uuid(), festival_id uuid not null references public.festivals(id), receipt_number text not null unique,
  flat_id uuid not null references public.flats(id), amount numeric(12,2) not null check(amount > 0), payment_date date not null check(payment_date <= current_date),
  payment_mode text not null check(payment_mode in ('CASH','UPI','BANK_TRANSFER','OTHER')), notes text, status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id),
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text,
  check((status = 'ACTIVE' and voided_at is null and void_reason is null) or (status = 'VOIDED' and voided_at is not null and length(trim(void_reason)) > 0))
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), festival_id uuid not null references public.festivals(id), expense_number text not null unique,
  expense_date date not null check(expense_date <= current_date), category_id uuid not null references public.expense_categories(id), description text not null check(length(trim(description)) > 0),
  amount numeric(12,2) not null check(amount > 0), paid_to text, payment_mode text not null check(payment_mode in ('CASH','UPI','BANK_TRANSFER','OTHER')),
  notes text, status public.record_status not null default 'ACTIVE', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text,
  check((status = 'ACTIVE' and voided_at is null and void_reason is null) or (status = 'VOIDED' and voided_at is not null and length(trim(void_reason)) > 0))
);
create index on public.fund_collections(festival_id, payment_date, created_at); create index on public.expenses(festival_id, expense_date, created_at);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.has_role(required public.user_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where user_id=auth.uid() and role=required) $$;
create or replace function public.assign_collection_number() returns trigger language plpgsql as $$ declare y integer; n integer; begin select year into y from public.festivals where id=new.festival_id; select count(*)+1 into n from public.fund_collections where festival_id=new.festival_id; new.receipt_number:=format('SLN-%s-%s',y,lpad(n::text,4,'0')); return new; end $$;
create or replace function public.assign_expense_number() returns trigger language plpgsql as $$ declare y integer; n integer; begin select year into y from public.festivals where id=new.festival_id; select count(*)+1 into n from public.expenses where festival_id=new.festival_id; new.expense_number:=format('EXP-%s-%s',y,lpad(n::text,5,'0')); return new; end $$;
create trigger festivals_updated before update on public.festivals for each row execute function public.set_updated_at(); create trigger flats_updated before update on public.flats for each row execute function public.set_updated_at(); create trigger collections_updated before update on public.fund_collections for each row execute function public.set_updated_at(); create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();
create trigger collection_number before insert on public.fund_collections for each row when (new.receipt_number is null or new.receipt_number='') execute function public.assign_collection_number(); create trigger expense_number before insert on public.expenses for each row when (new.expense_number is null or new.expense_number='') execute function public.assign_expense_number();
-- Financial rows may only be voided, never deleted; a closed festival accepts no new entries.
create or replace function public.protect_financial_row() returns trigger language plpgsql as $$ begin if tg_op='DELETE' then raise exception 'Financial transactions cannot be deleted'; end if; if old.status='VOIDED' then raise exception 'Voided financial transactions are immutable'; end if; if new.status<>'VOIDED' then raise exception 'Financial transactions cannot be edited; void them instead'; end if; if (to_jsonb(new)-'status'-'voided_at'-'voided_by'-'void_reason'-'updated_at') is distinct from (to_jsonb(old)-'status'-'voided_at'-'voided_by'-'void_reason'-'updated_at') then raise exception 'Only void status and void reason may change'; end if; if length(trim(coalesce(new.void_reason,'')))=0 then raise exception 'A void reason is required'; end if; new.voided_at=now(); new.voided_by=auth.uid(); return new; end $$;
create trigger protect_collections before update or delete on public.fund_collections for each row execute function public.protect_financial_row(); create trigger protect_expenses before update or delete on public.expenses for each row execute function public.protect_financial_row();
alter table public.festivals enable row level security; alter table public.profiles enable row level security; alter table public.flats enable row level security; alter table public.expense_categories enable row level security; alter table public.fund_collections enable row level security; alter table public.expenses enable row level security;
create policy "authenticated read" on public.festivals for select to authenticated using(true); create policy "admins manage festivals" on public.festivals for all to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
create policy "read profiles" on public.profiles for select to authenticated using(user_id=auth.uid() or public.has_role('ADMIN')); create policy "admins manage profiles" on public.profiles for all to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
create policy "read flats" on public.flats for select to authenticated using(true); create policy "admins manage flats" on public.flats for all to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
create policy "read categories" on public.expense_categories for select to authenticated using(true); create policy "admins manage categories" on public.expense_categories for all to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
create policy "read collections" on public.fund_collections for select to authenticated using(true); create policy "collectors insert collections" on public.fund_collections for insert to authenticated with check(public.has_role('ADMIN') or public.has_role('COLLECTOR')); create policy "admins void collections" on public.fund_collections for update to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
create policy "read expenses" on public.expenses for select to authenticated using(true); create policy "admins manage expenses" on public.expenses for all to authenticated using(public.has_role('ADMIN')) with check(public.has_role('ADMIN'));
insert into public.festivals(name,year,start_date,end_date,opening_balance,expected_contribution,status) values ('Ganesh Festival 2026',2026,'2026-09-07','2026-09-17',0,1000,'ACTIVE');
insert into public.expense_categories(festival_id,name) select id,category from public.festivals cross join unnest(array['Decoration','Ganesh Idol','Pooja Materials','Flowers','Food','Sound System','Cultural Program','Electricity','Cleaning','Prasadam','Miscellaneous']) category;
insert into public.flats(flat_number,resident_name,expected_contribution)
select flat_number, null, 1000 from (
  select (100 + unit)::text as flat_number from generate_series(1,14) unit where unit <> 12
  union all
  select (floor_number * 100 + unit)::text from generate_series(2,6) floor_number cross join generate_series(1,18) unit
) numbers order by flat_number::integer;
