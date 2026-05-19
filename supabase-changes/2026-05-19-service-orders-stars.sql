-- Telegram Stars for paid service orders / consultations.
-- Run after 2026-05-12-service-orders.sql.

alter table public.service_catalog
add column if not exists price_stars integer null;

alter table public.service_orders
add column if not exists price_stars integer null;

create or replace view public.service_order_admin_queue as
select
  so.id,
  so.status,
  so.created_at,
  so.updated_at,
  so.notified_at,
  so.auth_provider,
  so.provider_user_id,
  so.username,
  so.input_data,
  so.admin_notes,
  so.result_text,
  sc.title as service_title,
  sc.description as service_description,
  so.price_money,
  so.price_stars,
  so.pay_method,
  so.payment_id
from public.service_orders so
join public.service_catalog sc on sc.id = so.service_id;

-- Fill this manually per consultation before enabling Stars payments.
-- Example:
-- update public.service_catalog
-- set price_stars = 500
-- where id = 1;
