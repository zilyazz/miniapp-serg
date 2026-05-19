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

create or replace function public.activate_service_order_payment(
  p_payment_id text,
  p_paid_amount numeric default null
)
returns table(
  out_payment_id text,
  out_order_id bigint,
  out_payment_status text,
  out_order_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_expected_amount numeric;
  v_order_id bigint;
begin
  select *
  into v_payment
  from public.payments
  where payment_id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  select id
  into v_order_id
  from public.service_orders
  where payment_id = p_payment_id
  for update;

  if v_order_id is null then
    raise exception 'service_order_not_found';
  end if;

  if p_paid_amount is not null then
    v_expected_amount := round(coalesce(v_payment.final_price, 0) * 100);
    if p_paid_amount <> v_expected_amount then
      raise exception 'payment_amount_mismatch paid=% expected=%', p_paid_amount, v_expected_amount;
    end if;
  end if;

  update public.payments
  set status = 'succeeded',
      crystals_give = true,
      updated_at = now()
  where payment_id = p_payment_id;

  update public.service_orders
  set status = 'new',
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = v_order_id;

  return query
  select
    p_payment_id,
    v_order_id,
    'succeeded'::text,
    'new'::text;
end;
$$;
