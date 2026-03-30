create table if not exists public.users_tarot_day (
  id bigint generated always as identity primary key,
  user_id bigint not null unique,
  card_key text null,
  interpretation text null,
  drawn_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_tarot_day_user_id_fkey
    foreign key (user_id) references public.users (id)
    on update cascade
    on delete cascade
);

create index if not exists idx_users_tarot_day_user_id
  on public.users_tarot_day using btree (user_id);

create index if not exists idx_users_tarot_day_drawn_at
  on public.users_tarot_day using btree (drawn_at);

create table if not exists public.ai_prompts (
  id bigint generated always as identity primary key,
  code text not null unique,
  prompt text not null,
  model text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_prompts
  add column if not exists model text;

update public.ai_prompts
set model = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8'
where code = 'tarot_day'
  and (model is null or btrim(model) = '');

alter table public.ai_prompts
  alter column model set not null;

insert into public.ai_prompts (code, prompt, model, is_active)
values (
  'tarot_day',
  'Ты таролог. Дай краткую, ясную и полезную трактовку карты дня. Карта: {{card_display_name}}. Ключ карты: {{card_key}}. Ориентация: {{orientation}}. Ответ дай на русском языке, без списков, 2-4 абзаца, с практическим советом на день.',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  true
)
on conflict (code) do nothing;
