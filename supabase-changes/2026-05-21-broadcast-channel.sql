-- Broadcast channels:
-- tg   = Telegram only
-- vk   = VK only
-- both = Telegram and VK

alter table public.broadcast_jobs
add column if not exists channel text not null default 'tg';

alter table public.broadcast_jobs
drop constraint if exists broadcast_jobs_channel_check;

alter table public.broadcast_jobs
add constraint broadcast_jobs_channel_check
check (channel in ('tg', 'vk', 'both'));

create or replace function public.claim_due_broadcast_job()
returns table(
  id bigint,
  title text,
  body_html text,
  scheduled_at timestamptz,
  status text,
  channel text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select bj.id
    from public.broadcast_jobs bj
    where bj.status = 'pending'
      and bj.scheduled_at <= now()
    order by bj.scheduled_at asc, bj.id asc
    for update skip locked
    limit 1
  ),
  updated as (
    update public.broadcast_jobs bj
    set status = 'running',
        started_at = now(),
        error = null
    from picked
    where bj.id = picked.id
    returning
      bj.id,
      bj.title,
      bj.body_html,
      bj.scheduled_at,
      bj.status,
      bj.channel
  )
  select
    updated.id,
    updated.title,
    updated.body_html,
    updated.scheduled_at,
    updated.status,
    updated.channel
  from updated;
end;
$$;

create or replace function public.finish_broadcast_job(
  p_job_id bigint,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.broadcast_jobs
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      error = p_error
  where id = p_job_id;
end;
$$;
