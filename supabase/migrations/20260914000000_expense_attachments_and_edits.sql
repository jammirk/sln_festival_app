-- Private bill attachments for expenses, plus administrator corrections to expenses.
alter table public.expenses add column if not exists attachment_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-bills',
  'expense-bills',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users view expense bills" on storage.objects;
create policy "authenticated users view expense bills"
on storage.objects for select to authenticated
using (bucket_id = 'expense-bills');

drop policy if exists "admins upload expense bills" on storage.objects;
create policy "admins upload expense bills"
on storage.objects for insert to authenticated
with check (bucket_id = 'expense-bills' and public.has_role('ADMIN'));

drop policy if exists "admins delete expense bills" on storage.objects;
create policy "admins delete expense bills"
on storage.objects for delete to authenticated
using (bucket_id = 'expense-bills' and public.has_role('ADMIN'));

-- Collections remain immutable. Administrators may correct active expenses,
-- but cannot change their identity, ownership, or a voided record.
create or replace function public.protect_expense_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Financial transactions cannot be deleted';
  end if;

  if old.status = 'VOIDED' then
    raise exception 'Voided financial transactions are immutable';
  end if;

  if new.status = 'VOIDED' then
    if (to_jsonb(new) - 'status' - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'voided_at' - 'voided_by' - 'void_reason' - 'updated_at') then
      raise exception 'Only void status and void reason may change while voiding';
    end if;
    if length(trim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'A void reason is required';
    end if;
    new.voided_at = now();
    new.voided_by = auth.uid();
    return new;
  end if;

  if (to_jsonb(new)
      - 'expense_date' - 'category_id' - 'description' - 'amount' - 'paid_to'
      - 'payment_mode' - 'notes' - 'attachment_path' - 'updated_at')
     is distinct from
     (to_jsonb(old)
      - 'expense_date' - 'category_id' - 'description' - 'amount' - 'paid_to'
      - 'payment_mode' - 'notes' - 'attachment_path' - 'updated_at') then
    raise exception 'Only expense details and the bill attachment may be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_expenses on public.expenses;
create trigger protect_expenses
before update or delete on public.expenses
for each row execute function public.protect_expense_row();
