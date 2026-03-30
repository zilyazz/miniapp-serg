create or replace function public.refund_crystals(
  p_telegram bigint,
  p_amount integer
)
returns boolean
language plpgsql
as $$
declare
  v_user_id bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'bad_amount';
  end if;

  select id
    into v_user_id
  from public.users
  where telegram = p_telegram
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  update public.users
     set score_crystal = coalesce(score_crystal, 0) + p_amount
   where id = v_user_id;

  return true;
end;
$$;
