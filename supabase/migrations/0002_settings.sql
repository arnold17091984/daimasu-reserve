-- Phase 0.3 — restaurant_settings: single-row tenant config.
-- Owner edits via /admin/settings; public booking flow reads via service role.

create table if not exists public.restaurant_settings (
  id                          smallint primary key default 1,
  -- capacity & seatings
  total_seats                 smallint not null default 8 check (total_seats > 0),
  online_seats                smallint not null default 8 check (online_seats >= 0),
  seating_1_label             text     not null default '17:30',
  seating_2_label             text     not null default '20:00',
  seating_1_starts_at         time     not null default '17:30',
  seating_2_starts_at         time     not null default '20:00',
  service_minutes             smallint not null default 90,

  -- pricing (PHP centavos to avoid float)
  course_price_centavos       integer  not null default 800000 check (course_price_centavos > 0),
  deposit_pct                 smallint not null default 50 check (deposit_pct between 0 and 100),

  -- cancellation policy windows
  refund_full_hours           smallint not null default 48,  -- ≥ this many hours before: 100% refund
  refund_partial_hours        smallint not null default 24,  -- ≥ this many hours before: 50% refund

  -- reminders
  reminder_long_hours         smallint not null default 24,
  reminder_short_hours        smallint not null default 2,

  -- notification channels (telegram is admin-editable per Q's answer)
  telegram_bot_token          text,
  telegram_chat_id            text,
  whatsapp_from_number        text,        -- Twilio sender (e.g. whatsapp:+14155238886)
  resend_from_email           text default 'reservations@reserve.daimasu.com.ph',

  -- timezone of the restaurant (Asia/Manila)
  timezone                    text     not null default 'Asia/Manila',

  -- monthly revenue target (centavos) — used by /admin/dashboard
  monthly_revenue_target_centavos  bigint not null default 0,

  -- soft brand
  display_name                text     not null default 'DAIMASU 大桝 BAR',
  reservations_open           boolean  not null default true,

  updated_at                  timestamptz not null default now(),
  -- enforce single row
  constraint single_row check (id = 1)
);

comment on table  public.restaurant_settings is
  'Single-row tenant config. Owner edits via /admin/settings. Read by booking + reminder workers.';
comment on column public.restaurant_settings.online_seats is
  'How many of total_seats are bookable online. Walk-in budget = total_seats - online_seats.';

-- Seed the single row so app code can update-by-id without first checking existence.
insert into public.restaurant_settings (id) values (1)
on conflict (id) do nothing;

-- Trigger: keep updated_at fresh
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_settings_set_updated_at on public.restaurant_settings;
create trigger trg_settings_set_updated_at
  before update on public.restaurant_settings
  for each row execute function public.tg_set_updated_at();

-- Closed dates table — owner-blocked dates (holidays, private events, etc.)
create table if not exists public.closed_dates (
  closed_date  date primary key,
  reason       text,
  created_at   timestamptz not null default now()
);

comment on table public.closed_dates is
  'Dates entirely blocked from online booking. Both seatings unavailable.';
