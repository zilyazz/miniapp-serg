-- VK Mini Apps auth support for the current Node.js backend.
-- Apply this file in Supabase before enabling /vk/init in production.

alter table public.users
add column if not exists vk_real bigint null;

create unique index if not exists idx_users_vk_real_unique
on public.users (vk_real)
where vk_real is not null;

create or replace function public.init_user_all_vk_v1(
  p_vk_mask text,
  p_vk_real bigint,
  p_referrer_vk_real bigint default null
)
returns table(
  out_user_id bigint,
  score_crystal bigint,
  sound smallint,
  is_new boolean
)
language plpgsql
security definer
as $$
declare
  v_mask text := lower(trim(p_vk_mask));
  u public.users%rowtype;
  v_is_new boolean := false;
  referrer_user_id bigint;
begin
  if v_mask is null or v_mask = '' then
    raise exception 'vk_mask_is_empty';
  end if;

  if p_vk_real is null then
    raise exception 'vk_real_is_null';
  end if;

  select *
  into u
  from public.users
  where vk_real = p_vk_real
  limit 1;

  if not found then
    select *
    into u
    from public.users
    where lower(telegram) = v_mask
    limit 1;

    if found then
      if u.vk_real is null then
        update public.users
        set vk_real = p_vk_real,
            source = coalesce(nullif(source, ''), 'vk')
        where id = u.id;

        u.vk_real := p_vk_real;
        u.source := coalesce(nullif(u.source, ''), 'vk');
      end if;
    else
      begin
        insert into public.users (
          telegram,
          vk_real,
          score_crystal,
          signed,
          "termAcceptedAt",
          sound,
          source
        )
        values (
          v_mask,
          p_vk_real,
          5,
          true,
          now()::date,
          1,
          'vk'
        )
        returning *
        into u;

        v_is_new := true;
      exception
        when unique_violation then
          select *
          into u
          from public.users
          where vk_real = p_vk_real
             or lower(telegram) = v_mask
          order by (vk_real is not null) desc, id desc
          limit 1;
      end;
    end if;
  else
    if lower(coalesce(u.telegram, '')) <> v_mask then
      begin
        update public.users
        set telegram = v_mask,
            source = coalesce(nullif(source, ''), 'vk')
        where id = u.id;

        u.telegram := v_mask;
        u.source := coalesce(nullif(u.source, ''), 'vk');
      exception
        when unique_violation then
          null;
      end;
    elsif coalesce(u.source, '') = '' then
      update public.users
      set source = 'vk'
      where id = u.id;

      u.source := 'vk';
    end if;
  end if;

  if p_referrer_vk_real is not null and p_referrer_vk_real <> p_vk_real then
    select id
    into referrer_user_id
    from public.users
    where vk_real = p_referrer_vk_real
    limit 1;

    if referrer_user_id is not null then
      perform public.reward_referral_bonus(
        referrer_id := referrer_user_id,
        referred_user_id := u.id
      );
    end if;
  end if;

  return query
  select
    u.id as out_user_id,
    coalesce(u.score_crystal, 0) as score_crystal,
    coalesce(u.sound, 1)::smallint as sound,
    v_is_new as is_new;
end;
$$;

alter function public.init_user_all_vk_v1(text, bigint, bigint)
set search_path = public, pg_temp;
