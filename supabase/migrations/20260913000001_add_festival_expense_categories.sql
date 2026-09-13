insert into public.expense_categories (festival_id, name)
select festivals.id, category.name
from public.festivals festivals
cross join unnest(array['Groceries', 'Cook', 'Sweets', 'Pujari']) as category(name)
on conflict (festival_id, name) do nothing;
