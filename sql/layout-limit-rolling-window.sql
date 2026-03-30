alter table public.layout_limits
add column if not exists window_started_at timestamptz null;

create or replace function public.get_layout_limit_status(
  p_telegram bigint,
  p_theme text,
  p_type text,
  p_base_limit integer,
  p_premium_limit integer,
  p_window_hours integer default 24
)
returns table(
  allowed boolean,
  used integer,
  max integer,
  quota_left integer,
  is_premium boolean,
  window_started_at timestamptz,
  window_expires_at timestamptz
)
language plpgsql
as $$
declare
  v_user_id bigint;
  v_has_sub boolean;
  v_limit integer;
  v_row_id bigint;
  v_row_count integer;
  v_row_window_started timestamptz;
  v_used integer := 0;
  v_window_started timestamptz := null;
  v_window_expires timestamptz := null;
begin
  select u.id,
         exists(select 1 from public.subscribe s where s.user_id = u.id) as has_sub
    into v_user_id, v_has_sub
  from public.users u
  where u.telegram = p_telegram
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  select id, count, window_started_at
    into v_row_id, v_row_count, v_row_window_started
  from public.layout_limits
  where user_id = v_user_id
    and theme = p_theme
  order by id desc
  limit 1;

  if v_row_id is not null then
    if v_row_window_started is not null
       and v_row_window_started + make_interval(hours => p_window_hours) > now() then
      v_used := coalesce(v_row_count, 0);
      v_window_started := v_row_window_started;
      v_window_expires := v_row_window_started + make_interval(hours => p_window_hours);
    else
      update public.layout_limits
         set count = 0,
             window_started_at = null
       where id = v_row_id;
    end if;
  end if;

  v_limit := case when v_has_sub then p_premium_limit else p_base_limit end;

  return query
  select
    (v_used < v_limit) as allowed,
    v_used as used,
    v_limit as max,
    greatest(v_limit - v_used, 0) as quota_left,
    v_has_sub as is_premium,
    v_window_started as window_started_at,
    v_window_expires as window_expires_at;
end;
$$;

create or replace function public.consume_layout_limit(
  p_telegram bigint,
  p_theme text,
  p_type text,
  p_window_hours integer default 24
)
returns table(
  used integer,
  window_started_at timestamptz,
  window_expires_at timestamptz
)
language plpgsql
as $$
declare
  v_user_id bigint;
  v_row_id bigint;
  v_row_count integer;
  v_row_window_started timestamptz;
  v_used integer;
  v_window_started timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(format('%s:%s', p_telegram, p_theme), 0));

  select u.id
    into v_user_id
  from public.users u
  where u.telegram = p_telegram
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  select id, count, window_started_at
    into v_row_id, v_row_count, v_row_window_started
  from public.layout_limits
  where user_id = v_user_id
    and theme = p_theme
  order by id desc
  limit 1;

  if v_row_id is null then
    insert into public.layout_limits(user_id, theme, type, count, window_started_at)
    values (v_user_id, p_theme, p_type, 1, now())
    returning count, window_started_at into v_used, v_window_started;
  elsif v_row_window_started is null
        or v_row_window_started + make_interval(hours => p_window_hours) <= now() then
    update public.layout_limits
       set count = 1,
           type = p_type,
           window_started_at = now()
     where id = v_row_id
    returning count, window_started_at into v_used, v_window_started;
  else
    update public.layout_limits
       set count = coalesce(count, 0) + 1,
           type = p_type
     where id = v_row_id
    returning count, window_started_at into v_used, v_window_started;
  end if;

  return query
  select
    v_used as used,
    v_window_started as window_started_at,
    v_window_started + make_interval(hours => p_window_hours) as window_expires_at;
end;
$$;
