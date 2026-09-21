-- Administrators may correct the amount and payment mode of active donations.
-- All other donation details remain immutable, and voiding still requires a reason.
create or replace function public.protect_financial_row()
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

  if (to_jsonb(new) - 'amount' - 'payment_mode' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'amount' - 'payment_mode' - 'updated_at') then
    raise exception 'Only donation amount and payment mode may be changed';
  end if;

  return new;
end;
$$;