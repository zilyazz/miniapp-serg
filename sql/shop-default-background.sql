-- Add this block inside init_user_all_v2 after user row `u` is created/found.
-- Item 1 is the default background.

insert into public.user_inventory(user_id, item_id, obtained_from)
values (u.id, 1, 'shop')
on conflict (user_id, item_id) do nothing;

insert into public.user_equipment(user_id, type, item_id)
values (u.id, 'background', 1)
on conflict (user_id, type) do nothing;
