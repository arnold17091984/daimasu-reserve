-- ============================================================================
-- DAIMASU reservation system — combined migrations 0001-0017
-- (Codex audit fixes 2026-04-29 included: 0007 no_show_rate column,
--  0015 advisory_xact_lock oversell, 0016 webhook dedup state,
--  0017 is_admin SECURITY DEFINER + guest_lang default 'en'.)
-- Run in supabase.com → SQL Editor.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
-- 0001_extensions.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — extensions used across the schema.
-- pgcrypto: gen_random_uuid()
-- citext:    case-insensitive email
-- pg_cron:   scheduled reminders + auto-cancel charges
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_cron";

-- ────────────────────────────────────────────────────────────────────────
-- 0002_settings.sql
-- ────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────
-- 0003_reservations.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — reservations: the canonical bookable record.
-- All money in PHP centavos (bigint) to avoid float drift.

-- Enums
do $$ begin
  create type reservation_status as enum (
    'pending_payment',  -- Stripe Checkout opened, deposit not yet captured
    'confirmed',        -- deposit captured, reservation locked
    'cancelled_full',   -- cancelled ≥ refund_full_hours before service: 100% refund
    'cancelled_partial',-- cancelled ≥ refund_partial_hours before service: 50% refund
    'cancelled_late',   -- cancelled inside the no-refund window: 0% refund
    'no_show',          -- did not arrive; deposit retained, balance forfeited
    'completed'         -- guests arrived, course served, settlement recorded
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type seating_slot as enum ('s1', 's2');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'card', 'gcash', 'deposit_only');
exception when duplicate_object then null; end $$;

create table if not exists public.reservations (
  id                       uuid primary key default gen_random_uuid(),

  -- when
  service_date             date          not null,
  seating                  seating_slot  not null,
  service_starts_at        timestamptz   not null,        -- denormalized: date + seating start in Manila TZ
  party_size               smallint      not null check (party_size between 1 and 8),

  -- who (minimum PII per anti-goal #2)
  guest_name               text          not null check (length(guest_name) between 1 and 80),
  guest_email              citext        not null,
  guest_phone              text          not null check (length(guest_phone) between 7 and 30),
  guest_lang               text          not null default 'ja' check (guest_lang in ('ja','en')),
  notes                    text          check (length(notes) <= 1000),

  -- pricing snapshot (immutable after creation — protects against settings change)
  course_price_centavos    integer       not null check (course_price_centavos > 0),
  deposit_pct              smallint      not null check (deposit_pct between 0 and 100),
  total_centavos           bigint        not null
                           generated always as (course_price_centavos::bigint * party_size) stored,
  deposit_centavos         bigint        not null,         -- captured up front via Stripe
  balance_centavos         bigint        not null,         -- collected on-site

  -- state machine
  status                   reservation_status not null default 'pending_payment',

  -- self-cancel: HMAC-signed token validated server-side; rotated after each cancel attempt
  cancel_token_hash        text          not null,         -- sha256(token + server secret)
  cancel_token_expires_at  timestamptz   not null,

  -- reminders
  reminder_long_sent_at    timestamptz,
  reminder_short_sent_at   timestamptz,

  -- settlement (Phase 2 dashboard fields)
  settled_at               timestamptz,
  settlement_method        payment_method,
  settlement_centavos      bigint,                         -- total received (deposit + balance)

  -- audit
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),
  cancelled_at             timestamptz,
  cancelled_by             text          check (cancelled_by in ('guest','staff','system')),

  -- denormalized for quick admin queries
  source                   text          not null default 'web' check (source in ('web','staff','phone','walkin')),

  -- safety constraints
  constraint deposit_le_total check (deposit_centavos <= total_centavos),
  constraint balance_eq_total check (deposit_centavos + balance_centavos = total_centavos)
);

comment on table public.reservations is
  'One booking. Money fields in PHP centavos. Status is the source of truth for capacity counting.';

-- Capacity index (the hot path)
create index if not exists idx_reservations_capacity
  on public.reservations (service_date, seating)
  where status in ('pending_payment','confirmed');

-- Owner dashboard queries
create index if not exists idx_reservations_status_date    on public.reservations (status, service_date);
create index if not exists idx_reservations_settled_at     on public.reservations (settled_at) where settled_at is not null;
create index if not exists idx_reservations_service_date   on public.reservations (service_date);

-- Reminder cron
create index if not exists idx_reservations_reminder_long
  on public.reservations (service_starts_at)
  where status = 'confirmed' and reminder_long_sent_at is null;
create index if not exists idx_reservations_reminder_short
  on public.reservations (service_starts_at)
  where status = 'confirmed' and reminder_short_sent_at is null;

-- updated_at trigger
drop trigger if exists trg_reservations_set_updated_at on public.reservations;
create trigger trg_reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.tg_set_updated_at();

-- Capacity check + atomic insert helper.
-- Caller wraps INSERT in a transaction; this function does:
--   1. lock the (date, seating) capacity row via SELECT FOR UPDATE on existing reservations
--   2. count active party_size sum
--   3. raise if + new party_size > online_seats
--   4. return remaining seats so caller can validate
-- Race-safe: concurrent transactions block on FOR UPDATE.
create or replace function public.assert_capacity_or_throw(
  p_service_date date,
  p_seating      seating_slot,
  p_party_size   smallint
) returns smallint
language plpgsql
as $$
declare
  v_used    int;
  v_online  int;
  v_closed  boolean;
begin
  -- closed-date check
  select exists (select 1 from public.closed_dates where closed_date = p_service_date)
    into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  -- lock existing rows for this slot
  perform 1
    from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

  select coalesce(sum(party_size), 0)
    into v_used
    from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed');

  select online_seats into v_online from public.restaurant_settings where id = 1;

  if v_used + p_party_size > v_online then
    raise exception 'capacity_exceeded' using errcode = 'P0002';
  end if;

  return (v_online - v_used - p_party_size)::smallint;  -- remaining after this booking
end;
$$;

comment on function public.assert_capacity_or_throw is
  'Atomic capacity check used inside the booking transaction. Throws SQLSTATE P0001 (closed) or P0002 (full).';

-- ────────────────────────────────────────────────────────────────────────
-- 0004_payments.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — payments: every Stripe / GCash / on-site money event recorded as immutable rows.
-- Anti-goal #1: idempotency_key prevents Stripe webhook double-fire from charging twice.

do $$ begin
  create type payment_kind as enum (
    'deposit_capture',  -- Stripe Checkout success: deposit captured
    'refund_full',      -- 100% refund issued (cancellation ≥ refund_full_hours)
    'refund_partial',   -- 50% refund issued
    'on_site_settlement', -- staff records balance collected on-site
    'manual_adjustment'   -- owner override (audit_log mandatory)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_provider as enum ('stripe','paymongo','on_site');
exception when duplicate_object then null; end $$;

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references public.reservations(id) on delete restrict,
  kind                payment_kind     not null,
  provider            payment_provider not null,
  -- positive for captures, NEGATIVE for refunds — sum() over a reservation = net received
  amount_centavos     bigint           not null,
  method              payment_method,         -- on-site only; null for Stripe events
  provider_ref        text,                   -- Stripe charge / refund / payment_intent id
  -- Anti-goal #1: hard idempotency
  idempotency_key     text             not null unique,
  notes               text,
  recorded_by         text,                   -- 'system' | 'webhook' | owner email
  created_at          timestamptz      not null default now()
);

comment on table public.payments is
  'Append-only money ledger per reservation. Refunds are negative amount. idempotency_key is unique to absorb Stripe webhook duplicates.';

create index if not exists idx_payments_reservation on public.payments (reservation_id);
create index if not exists idx_payments_kind_date   on public.payments (kind, created_at);

-- Convenience view: reservation with rolled-up money
create or replace view public.reservation_money as
select r.id                                            as reservation_id,
       r.service_date,
       r.seating,
       r.status,
       r.party_size,
       r.total_centavos,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind = 'deposit_capture'), 0)        as deposit_received,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind in ('refund_full','refund_partial')), 0) as refunded,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind = 'on_site_settlement'), 0)     as on_site_received,
       coalesce(sum(p.amount_centavos), 0)             as net_received
  from public.reservations r
  left join public.payments p on p.reservation_id = r.id
 group by r.id;

comment on view public.reservation_money is
  'Per-reservation money summary. Powers the owner revenue dashboard.';

-- ────────────────────────────────────────────────────────────────────────
-- 0005_audit.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — audit_log: every staff action that changes a reservation or money state.
-- Required for NPC compliance + dispute resolution.

create table if not exists public.audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  actor           text        not null,        -- owner email | 'system' | 'webhook' | 'guest'
  actor_ip        inet,
  reservation_id  uuid        references public.reservations(id),
  action          text        not null,        -- e.g. 'reservation.create','reservation.cancel.full','payment.capture','settings.update'
  before_data     jsonb,
  after_data      jsonb,
  reason          text
);

comment on table public.audit_log is
  'Immutable log of state changes. Never updated, only inserted. Retention: 5 years (NPC PH).';

create index if not exists idx_audit_reservation on public.audit_log (reservation_id, occurred_at desc);
create index if not exists idx_audit_actor       on public.audit_log (actor, occurred_at desc);
create index if not exists idx_audit_action      on public.audit_log (action, occurred_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- 0006_owners_rls.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — admin auth via Supabase Auth + owner allowlist.
-- RLS denies anon clients on every table. Service-role key (server-side only) bypasses RLS.

-- Owner allowlist — only these emails can sign in to /admin via magic link.
create table if not exists public.admin_owners (
  email        citext primary key,
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.admin_owners is
  'Owner allowlist. Insert manually via Supabase SQL editor. Magic-link sign-in checks this table.';

-- Helper: is the current auth.uid() an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.admin_owners o
      join auth.users u on lower(u.email) = lower(o.email::text)
     where u.id = auth.uid()
  );
$$;

-- ── RLS policies ────────────────────────────────────────────────────────────
-- Public site uses service-role on the server (Next.js API routes); never anon.
-- Admin /admin pages use the user's JWT, which is checked via is_admin().

alter table public.restaurant_settings enable row level security;
alter table public.reservations         enable row level security;
alter table public.payments             enable row level security;
alter table public.audit_log            enable row level security;
alter table public.closed_dates         enable row level security;
alter table public.admin_owners         enable row level security;

-- restaurant_settings: admin read/write; nobody else (server uses service-role bypass)
drop policy if exists settings_admin_all on public.restaurant_settings;
create policy settings_admin_all on public.restaurant_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- reservations: admin can see/edit everything via /admin
drop policy if exists reservations_admin_all on public.reservations;
create policy reservations_admin_all on public.reservations
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- payments: admin read; writes only via service role (anti-goal #1)
drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments
  for select
  using (public.is_admin());

-- audit_log: admin read; inserts only via service role
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select
  using (public.is_admin());

-- closed_dates: admin read/write
drop policy if exists closed_dates_admin_all on public.closed_dates;
create policy closed_dates_admin_all on public.closed_dates
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- admin_owners: read only via admin (writes through SQL editor or service role)
drop policy if exists owners_admin_read on public.admin_owners;
create policy owners_admin_read on public.admin_owners
  for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────
-- 0007_revenue_views.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — revenue rollup views for /admin/dashboard (Q9 L1 + L3 + L2-lite).
-- All amounts in PHP centavos. Time-bucketed in Asia/Manila.

-- Daily revenue (booked + received + lost-to-no-show).
create or replace view public.revenue_daily as
with by_date as (
  select r.service_date,
         count(*) filter (where r.status in ('confirmed','completed','no_show'))                       as covers_booked,
         coalesce(sum(r.total_centavos)        filter (where r.status in ('confirmed','completed')), 0) as gross_booked_centavos,
         coalesce(sum(rm.net_received)         filter (where r.status = 'completed'), 0)                as net_completed_centavos,
         coalesce(sum(rm.deposit_received)     filter (where r.status = 'no_show'), 0)                  as no_show_deposit_kept_centavos,
         coalesce(sum(r.balance_centavos)      filter (where r.status = 'no_show'), 0)                  as no_show_lost_centavos,
         count(*) filter (where r.status = 'no_show')                                                   as no_show_count,
         count(*) filter (where r.status in ('cancelled_full','cancelled_partial','cancelled_late'))    as cancel_count
    from public.reservations r
    left join public.reservation_money rm on rm.reservation_id = r.id
   group by r.service_date
)
select * from by_date;

comment on view public.revenue_daily is
  'Daily KPIs: bookings, money in, no-show impact. Filter by service_date in app code.';

-- Monthly revenue (Manila TZ month).
create or replace view public.revenue_monthly as
select date_trunc('month', service_date)::date     as month_start,
       sum(covers_booked)                          as covers_booked,
       sum(gross_booked_centavos)                  as gross_booked_centavos,
       sum(net_completed_centavos)                 as net_completed_centavos,
       sum(no_show_deposit_kept_centavos)          as no_show_deposit_kept_centavos,
       sum(no_show_lost_centavos)                  as no_show_lost_centavos,
       sum(no_show_count)                          as no_show_count,
       sum(cancel_count)                           as cancel_count
  from public.revenue_daily
 group by 1
 order by 1 desc;

comment on view public.revenue_monthly is
  'Monthly rollup. month_start is the first day at 00:00 Manila local.';

-- No-show rate (KPI for success metric: < 5%).
-- Note: revenue_monthly already exposes month_start (aggregated from service_date
-- in revenue_daily). Don't re-apply date_trunc here.
create or replace view public.no_show_rate as
select month_start,
       no_show_count,
       (covers_booked - cancel_count)           as eligible_covers,
       case when (covers_booked - cancel_count) > 0
            then round(no_show_count::numeric / (covers_booked - cancel_count) * 100, 2)
            else 0
       end                                       as no_show_rate_pct
  from public.revenue_monthly;

comment on view public.no_show_rate is
  'Monthly no-show percentage. eligible_covers excludes cancelled reservations.';

-- ────────────────────────────────────────────────────────────────────────
-- 0008_cron.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 0.3 — pg_cron schedules for reminders + auto-cancel transition.
-- Each job calls a Supabase Edge Function (HTTPS) via pg_net or net.http_post.
-- Edge Function URLs and secrets are stored in private.cron_settings.

create schema if not exists private;

create table if not exists private.cron_settings (
  key   text primary key,
  value text not null
);

comment on table private.cron_settings is
  'Stores Edge Function base URL + service-role JWT for pg_cron HTTP calls. Insert via SQL editor.';

-- Helper: read a cron secret
create or replace function private.cs(key text)
returns text
language sql
stable
as $$
  select value from private.cron_settings where key = $1;
$$;

-- The actual cron HTTP calls go through Supabase Edge Functions. Examples below;
-- they will be ENABLED only after the Edge Function URLs are seeded into private.cron_settings.

-- Every 10 min: send 24h reminder for any confirmed reservation crossing the threshold
-- select cron.schedule(
--   'reminder_long',
--   '*/10 * * * *',
--   $$
--     select net.http_post(
--       url     := private.cs('edge_base_url') || '/reminders/long',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--         'Content-Type',  'application/json'
--       )
--     );
--   $$
-- );

-- Every 5 min: send 2h reminder
-- select cron.schedule(
--   'reminder_short',
--   '*/5 * * * *',
--   $$ select net.http_post(
--        url     := private.cs('edge_base_url') || '/reminders/short',
--        headers := jsonb_build_object('Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--                                      'Content-Type',  'application/json')
--      ); $$
-- );

-- Daily 02:00 Manila: mark past confirmed reservations as no_show if not completed
-- select cron.schedule(
--   'mark_no_show',
--   '0 18 * * *',  -- 02:00 Manila = 18:00 UTC
--   $$ select net.http_post(
--        url     := private.cs('edge_base_url') || '/cron/mark-no-show',
--        headers := jsonb_build_object('Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--                                      'Content-Type',  'application/json')
--      ); $$
-- );

comment on schema private is
  'Server-only objects. Never granted to anon/authenticated. Read by service role.';

-- ────────────────────────────────────────────────────────────────────────
-- 0009_audit_fixes.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 3 audit fixes:
--   C-3 — add `expired` status so reap-pending soft-deletes (preserves audit trail
--          and avoids losing rows that arrive concurrently with a late Stripe webhook).
--   P1-5 — webhook_events dedup table.
--   Stripe session id column on reservations so reap can verify expiry against Stripe
--          before flipping a pending row.

-- 1. Extend reservation_status enum to include `expired`.
alter type reservation_status add value if not exists 'expired';

-- 2. Track Stripe Checkout session id so the reaper can confirm expiry server-side.
alter table public.reservations
  add column if not exists stripe_checkout_session_id text;

create index if not exists idx_reservations_stripe_session
  on public.reservations (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- 3. Webhook event dedup. Stripe replays events on 5xx for up to 3 days; the
--    payments table already has idempotency_key UNIQUE for capture rows, but
--    charge.refunded and payment_intent.payment_failed handlers were not
--    deduped (audit P1-5). This table is the universal pre-check.
create table if not exists public.webhook_events (
  event_id    text primary key,
  source      text not null,            -- 'stripe' | 'paymongo' | …
  event_type  text not null,
  received_at timestamptz not null default now()
);

comment on table public.webhook_events is
  'Universal dedup for inbound webhook events. INSERT before processing; ON CONFLICT → 200 noop.';

alter table public.webhook_events enable row level security;
-- service-role only; admin doesn't read this directly
drop policy if exists webhook_events_admin_read on public.webhook_events;
create policy webhook_events_admin_read on public.webhook_events
  for select using (public.is_admin());

-- 4. Capacity index includes `pending_payment` (NOT `expired`) so soft-deleted
--    rows stop blocking seats. Re-create the partial index to drop expired ones.
drop index if exists public.idx_reservations_capacity;
create index idx_reservations_capacity
  on public.reservations (service_date, seating)
  where status in ('pending_payment','confirmed');

comment on column public.reservations.stripe_checkout_session_id is
  'Stripe Checkout session id (cs_…). Used by /api/cron/reap-pending to verify
   the session is actually expired before soft-deleting the reservation, so we
   never lose a row whose webhook is in-flight.';

-- ────────────────────────────────────────────────────────────────────────
-- 0010_admin_ops.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 4 — operator-UX upgrades.
--
--  1. notification_log: every outbound message attempt (telegram / email /
--     whatsapp / sms). Failures surface in the dashboard "要対応" panel so
--     the owner notices when a confirmation didn't actually reach the guest.
--  2. RLS for service-role + admin-read.
--  3. Index for "recent failures" lookup.

create table if not exists public.notification_log (
  id              bigserial primary key,
  reservation_id  uuid        references public.reservations(id) on delete set null,
  channel         text        not null check (channel in ('telegram','email','whatsapp','sms')),
  kind            text        not null check (kind in (
    'admin_alert','guest_confirm','reminder_long','reminder_short',
    'cancel_confirm','no_show_alert'
  )),
  status          text        not null check (status in ('sent','failed','skipped')),
  recipient       text,
  error_message   text,
  attempted_at    timestamptz not null default now()
);

comment on table public.notification_log is
  'Every outbound notification attempt. Used by /admin to surface delivery failures to the owner.';

create index if not exists idx_notification_log_failed_recent
  on public.notification_log (attempted_at desc)
  where status = 'failed';

create index if not exists idx_notification_log_reservation
  on public.notification_log (reservation_id, attempted_at desc);

alter table public.notification_log enable row level security;

drop policy if exists notification_log_admin_read on public.notification_log;
create policy notification_log_admin_read on public.notification_log
  for select using (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────
-- 0011_seat_assignment.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 5 — per-seat assignment for the 8-seat hinoki counter.
--
-- Why: operator UX request. Booking form should let staff pick exact
-- seats; if no pick, auto-allocate from seat #N (rightmost = back of
-- counter) toward seat #1 in a contiguous block. Display layer renders
-- this like an airline seat map.
--
-- Design:
--   * `reservations.seat_numbers smallint[]` — 1-indexed list of taken
--     seats. NULL is allowed for the migration period; new bookings
--     always populate it.
--   * `allocate_seats_or_throw(date, seating, party_size, requested?)`
--     does atomic FOR UPDATE locking + manual-mode validation +
--     auto-mode rightmost-contiguous allocation. Replaces
--     assert_capacity_or_throw at all call sites (closed-date check
--     + capacity envelope still enforced inside).

alter table public.reservations
  add column if not exists seat_numbers smallint[]
    check (seat_numbers is null or (
      array_length(seat_numbers, 1) between 1 and 20
    ));

comment on column public.reservations.seat_numbers is
  '1-indexed seat positions occupied by this booking. NULL for legacy rows; new bookings always set it.';

-- Backfill: any pending/confirmed legacy rows get seats allocated by the
-- same rule (rightmost contiguous), grouped by date+seating in arrival
-- order. Idempotent — only touches rows where seat_numbers is null.
do $$
declare
  r record;
  v_taken smallint[];
  v_total smallint;
  v_party smallint;
  v_seat smallint;
  v_start smallint;
  v_end smallint;
  v_ok boolean;
  v_result smallint[];
begin
  select online_seats into v_total from public.restaurant_settings where id = 1;
  if v_total is null then return; end if;

  for r in
    select id, service_date, seating, party_size, created_at
      from public.reservations
     where status in ('pending_payment','confirmed')
       and seat_numbers is null
     order by service_date, seating, created_at
  loop
    -- Refresh taken[] for this slot every iteration (other rows may have
    -- been backfilled in the same loop).
    select coalesce(array_agg(s order by s), array[]::smallint[]) into v_taken
    from (
      select unnest(seat_numbers) as s
        from public.reservations
       where service_date = r.service_date
         and seating      = r.seating
         and status in ('pending_payment','confirmed')
         and seat_numbers is not null
    ) sub;

    v_party := r.party_size;
    v_end := v_total;
    v_result := null;
    while v_end >= v_party loop
      v_start := v_end - v_party + 1;
      v_ok := true;
      for v_seat in v_start..v_end loop
        if v_seat = any(v_taken) then v_ok := false; exit; end if;
      end loop;
      if v_ok then
        v_result := array(select generate_series(v_start, v_end))::smallint[];
        exit;
      end if;
      v_end := v_end - 1;
    end loop;

    if v_result is not null then
      update public.reservations set seat_numbers = v_result where id = r.id;
    end if;
    -- If null: existing data already over-capacity (shouldn't happen with
    -- assert_capacity_or_throw enforced); leave seat_numbers null.
  end loop;
end $$;

-- GIN index: lets us quickly check seat overlap inside the SQL function.
create index if not exists idx_reservations_seat_numbers
  on public.reservations using gin (seat_numbers)
  where status in ('pending_payment','confirmed');

-- Atomic allocator. Replaces assert_capacity_or_throw at API call sites.
-- Throws:
--   closed_date (P0001)
--   capacity_exceeded (P0002)         -- no contiguous block fits
--   seat_count_mismatch (P0003)       -- requested.length != party_size
--   seat_out_of_range (P0004)         -- requested seat < 1 or > total
--   seat_occupied (P0005)             -- requested seat conflict
--   settings_missing (P0006)
create or replace function public.allocate_seats_or_throw(
  p_service_date date,
  p_seating      seating_slot,
  p_party_size   smallint,
  p_requested    smallint[] default null
) returns smallint[]
language plpgsql
as $$
declare
  v_total      smallint;
  v_taken      smallint[] := array[]::smallint[];
  v_legacy_pax smallint := 0;
  v_seat       smallint;
  v_start      smallint;
  v_end        smallint;
  v_ok         boolean;
  v_result     smallint[];
  v_closed     boolean;
begin
  -- 1. closed-date check
  select exists (select 1 from public.closed_dates where closed_date = p_service_date)
    into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  -- 2. Get capacity
  select online_seats into v_total from public.restaurant_settings where id = 1;
  if v_total is null then
    raise exception 'settings_missing' using errcode = 'P0006';
  end if;

  -- 3. Lock existing rows + collect taken seat numbers
  perform 1
    from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

  select coalesce(array_agg(s order by s), array[]::smallint[])
    into v_taken
  from (
    select unnest(seat_numbers) as s
      from public.reservations
     where service_date = p_service_date
       and seating      = p_seating
       and status in ('pending_payment','confirmed')
       and seat_numbers is not null
  ) sub;

  -- 4. Account for legacy rows missing seat_numbers (treat them as taking
  --    the leftmost available seats so allocation still respects total
  --    capacity, even if old rows never got backfilled).
  select coalesce(sum(party_size), 0)::smallint
    into v_legacy_pax
  from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
     and seat_numbers is null;

  if v_legacy_pax > 0 then
    for v_seat in 1..v_total loop
      if v_legacy_pax = 0 then exit; end if;
      if not (v_seat = any(v_taken)) then
        v_taken := array_append(v_taken, v_seat);
        v_legacy_pax := v_legacy_pax - 1;
      end if;
    end loop;
  end if;

  -- 5. Manual mode: validate requested seats
  if p_requested is not null and array_length(p_requested, 1) > 0 then
    if array_length(p_requested, 1) <> p_party_size then
      raise exception 'seat_count_mismatch' using errcode = 'P0003';
    end if;
    foreach v_seat in array p_requested loop
      if v_seat < 1 or v_seat > v_total then
        raise exception 'seat_out_of_range' using errcode = 'P0004';
      end if;
      if v_seat = any(v_taken) then
        raise exception 'seat_occupied' using errcode = 'P0005';
      end if;
    end loop;
    return p_requested;
  end if;

  -- 6. Auto-allocate: rightmost contiguous block of party_size seats.
  v_end := v_total;
  while v_end >= p_party_size loop
    v_start := v_end - p_party_size + 1;
    v_ok := true;
    for v_seat in v_start..v_end loop
      if v_seat = any(v_taken) then
        v_ok := false; exit;
      end if;
    end loop;
    if v_ok then
      v_result := array(select generate_series(v_start, v_end))::smallint[];
      return v_result;
    end if;
    v_end := v_end - 1;
  end loop;

  -- 7. No contiguous block fits — caller can retry with a different slot
  -- or accept fragmentation (currently we don't allow split parties).
  raise exception 'capacity_exceeded' using errcode = 'P0002';
end;
$$;

comment on function public.allocate_seats_or_throw is
  'Atomic seat allocator. Manual mode validates requested[]; auto mode picks rightmost contiguous block of party_size seats. Replaces assert_capacity_or_throw at API call sites.';

-- ────────────────────────────────────────────────────────────────────────
-- 0012_celebration.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase 6 — celebration / surprise booking metadata.
--
-- DAIMASU specializes in birthday and anniversary surprise dinners with
-- projection-mapping moments. Free-text notes were losing structure;
-- this column gives operators a typed slot for occasion, surprise,
-- celebrant info, and deliverables (cake, flowers, champagne, mapping
-- content, photo service).
--
-- Stored as JSONB so the shape can evolve without migrations. Read
-- shape lives in src/lib/db/types.ts (Reservation.celebration) and the
-- zod validator at src/lib/domain/schemas.ts (celebrationSchema).

alter table public.reservations
  add column if not exists celebration jsonb;

comment on column public.reservations.celebration is
  'Structured celebration / surprise data. Shape: see Reservation.celebration in TS types. NULL = ordinary booking.';

-- GIN index lets the dashboard query "upcoming celebrations" / "needs
-- prep in 3 days" without scanning every reservation.
create index if not exists idx_reservations_celebration
  on public.reservations using gin (celebration)
  where celebration is not null
    and status in ('pending_payment','confirmed');

-- Helper: bookings within N days that have celebration data set,
-- ordered by service date. Used by /admin/celebrations and the
-- 3-day-out lead-time alerts on the dashboard.
create or replace view public.upcoming_celebrations as
select id,
       service_date,
       seating,
       service_starts_at,
       guest_name,
       guest_phone,
       guest_email,
       guest_lang,
       party_size,
       status,
       celebration,
       (service_date - current_date)::int as days_until
  from public.reservations
 where celebration is not null
   and (celebration->>'occasion') is distinct from 'none'
   and status in ('pending_payment','confirmed')
   and service_date >= current_date
 order by service_date asc, service_starts_at asc;

comment on view public.upcoming_celebrations is
  'Future bookings with celebration metadata, with days_until. Used by celebration dashboard + lead-time alerts.';

-- ────────────────────────────────────────────────────────────────────────
-- 0013_receipts_or.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase: BIR Official Receipt + VAT/SVC breakdown.
-- ----------------------------------------------------------------------------
-- The Bureau of Internal Revenue (BIR) requires every transaction to bear a
-- sequential Official Receipt (OR) number issued by an authorised receipt
-- printer. Until DAIMASU obtains its own ATP (Authority to Print), this table
-- tracks the *internal* sequence so the operator can match Stripe-driven
-- bookings to the manually-issued OR slip at the bar.
--
-- It also persists the VAT / Service Charge breakdown computed at booking
-- time so the receipt PDF, the email, and the audit log all show the same
-- numbers — the on-the-fly recalculation in domain/reservation.ts is fine
-- for previews, but the captured row is the source of truth for accounting.
-- ----------------------------------------------------------------------------

-- ─── 1. Sequential OR generator ────────────────────────────────────────────
-- One row per "series" — typically a single open series at a time. When the
-- operator is issued a new ATP they bump the series and reset.
create table if not exists or_series (
  id              smallserial primary key,
  prefix          text not null,                 -- e.g. 'DBM-2026-' for traceability
  next_number     bigint not null default 1,
  active          boolean not null default true, -- only one row may be true
  notes           text,
  created_at      timestamptz not null default now()
);

-- Default series — operator can edit the prefix in admin/settings.
-- The number resets when a new ATP is issued (insert a new row, set
-- the old row active=false, set the new row active=true).
insert into or_series (prefix, active, notes)
values ('DBM-', true, 'Initial DAIMASU BAR series. Replace prefix on next BIR ATP issuance.')
on conflict do nothing;

-- ─── 2. Receipts table ─────────────────────────────────────────────────────
create table if not exists receipts (
  id                          uuid primary key default gen_random_uuid(),
  reservation_id              uuid not null references reservations(id) on delete restrict,
  -- The formatted OR number ('DBM-000001234'). Unique across all series.
  or_number                   text not null unique,
  -- Snapshot of the price breakdown at issuance time (centavos).
  menu_subtotal_centavos      bigint not null check (menu_subtotal_centavos >= 0),
  service_charge_centavos     bigint not null check (service_charge_centavos >= 0),
  vat_centavos                bigint not null check (vat_centavos >= 0),
  grand_total_centavos        bigint not null check (grand_total_centavos >= 0),
  -- The settlement payment(s) that this OR represents (cash / card / mixed).
  settlement_method           text check (settlement_method in ('cash', 'card', 'gcash', 'mixed') or settlement_method is null),
  -- Issuance metadata. issued_by / voided_by store the admin email
  -- as plain text — same convention as audit_log.actor — rather than
  -- an FK, because admin_owners.email is the PK (not `id`) and the
  -- value is informational, not relational.
  issued_at                   timestamptz not null default now(),
  issued_by                   text,
  voided_at                   timestamptz,
  voided_by                   text,
  void_reason                 text,
  -- Sum-check trip-wire: the trio must sum to grand_total exactly.
  constraint receipts_total_consistency
    check (menu_subtotal_centavos + service_charge_centavos + vat_centavos = grand_total_centavos)
);

create index if not exists receipts_reservation_idx on receipts(reservation_id);
create index if not exists receipts_issued_at_idx on receipts(issued_at desc);
create index if not exists receipts_voided_idx on receipts(voided_at) where voided_at is not null;

comment on table receipts is
  'BIR Official Receipt records. One per fully-settled reservation. Voided rows kept for audit (5-yr retention).';

-- ─── 3. Atomic OR-number issuance ──────────────────────────────────────────
-- Concurrent settle calls would otherwise race on next_number. This function
-- takes a row-level lock on the active series, increments, and returns the
-- formatted OR number — all in one round-trip.
create or replace function issue_or_number()
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_n bigint;
begin
  update or_series
    set next_number = next_number + 1
  where active = true
  returning prefix, next_number - 1
    into v_prefix, v_n;

  if v_prefix is null then
    raise exception 'no_active_or_series'
      using errcode = 'P0001';
  end if;

  -- Format: prefix + 8-digit zero-padded number.
  -- 8 digits = 99,999,999 receipts before the next series; ample for a
  -- single restaurant's lifetime. Wider series can be added later.
  return v_prefix || lpad(v_n::text, 8, '0');
end;
$$;

comment on function issue_or_number() is
  'Atomically increments the active OR series and returns the next formatted number.';

-- ─── 4. Convenience write-side helper ──────────────────────────────────────
-- Wraps issue_or_number + insert into receipts in a single transaction.
-- Used from the settle-flow API; the breakdown columns must be supplied so
-- the function does not couple to the domain pricing constants (those live
-- in TS and must remain the single source of truth — this function only
-- *persists* what it is told to persist).
create or replace function settle_with_receipt(
  p_reservation_id        uuid,
  p_menu_subtotal         bigint,
  p_service_charge        bigint,
  p_vat                   bigint,
  p_grand_total           bigint,
  p_settlement_method     text,
  p_issued_by             text
)
returns receipts
language plpgsql
security definer
as $$
declare
  v_or_number text;
  v_row receipts;
begin
  if p_menu_subtotal + p_service_charge + p_vat <> p_grand_total then
    raise exception 'breakdown_does_not_sum_to_grand_total'
      using errcode = 'P0001';
  end if;

  v_or_number := issue_or_number();

  insert into receipts (
    reservation_id, or_number,
    menu_subtotal_centavos, service_charge_centavos, vat_centavos, grand_total_centavos,
    settlement_method, issued_by
  ) values (
    p_reservation_id, v_or_number,
    p_menu_subtotal, p_service_charge, p_vat, p_grand_total,
    p_settlement_method, p_issued_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function settle_with_receipt(uuid, bigint, bigint, bigint, bigint, text, text) is
  'Atomically issues an OR number and persists the receipt for a settled reservation.';

-- ─── 5. RLS — same shape as audit_log ──────────────────────────────────────
alter table or_series enable row level security;
alter table receipts enable row level security;

-- Owners (admin_owners allowlist) can see and manage everything.
create policy or_series_owners_all on or_series
  for all
  using (is_admin())
  with check (is_admin());

create policy receipts_owners_all on receipts
  for all
  using (is_admin())
  with check (is_admin());

-- ────────────────────────────────────────────────────────────────────────
-- 0014_book_atomic.sql
-- ────────────────────────────────────────────────────────────────────────
-- Phase: atomic seat-allocate + reservation INSERT.
-- ----------------------------------------------------------------------------
-- The previous flow used two separate Supabase HTTP calls:
--   1. SELECT … FOR UPDATE inside allocate_seats_or_throw() (lock released
--      when the function returns)
--   2. INSERT INTO reservations from the API
-- These run on different connections, so the lock from step 1 does NOT
-- extend into step 2. Two concurrent bookings can therefore both see the
-- same "free" seat numbers and both insert successfully — overselling.
--
-- This migration adds public.book_reservation_atomic() which performs the
-- allocator + the INSERT in a single transaction (single PL/pgSQL block).
-- Errors raised by the allocator surface to the caller as before so the
-- API path can keep its existing 409 / 500 mapping.
-- ----------------------------------------------------------------------------

create or replace function public.book_reservation_atomic(
  p_id                       uuid,
  p_service_date             date,
  p_seating                  seating_slot,
  p_service_starts_at        timestamptz,
  p_party_size               smallint,
  p_guest_name               text,
  p_guest_email              text,
  p_guest_phone              text,
  p_guest_lang               text,
  p_notes                    text,
  p_course_price_centavos    bigint,
  p_deposit_pct              smallint,
  p_deposit_centavos         bigint,
  p_balance_centavos         bigint,
  p_cancel_token_hash        text,
  p_cancel_token_expires_at  timestamptz,
  p_source                   text default 'web',
  p_requested_seats          smallint[] default null,
  p_celebration              jsonb default null,
  p_status                   reservation_status default 'pending_payment'
)
returns reservations
language plpgsql
as $$
declare
  v_seats smallint[];
  v_row   reservations;
begin
  -- Allocate (or validate) seats. The allocator's FOR UPDATE lock is held
  -- until the surrounding transaction commits — i.e. until our INSERT below
  -- has either succeeded or rolled back. A second concurrent invocation
  -- will block on the same lock and see *this* booking's seat reservation
  -- once it commits, and will then either allocate other seats or raise
  -- capacity_exceeded.
  v_seats := public.allocate_seats_or_throw(
    p_service_date,
    p_seating,
    p_party_size,
    p_requested_seats
  );

  insert into public.reservations (
    id, service_date, seating, service_starts_at, party_size,
    guest_name, guest_email, guest_phone, guest_lang, notes,
    course_price_centavos, deposit_pct,
    deposit_centavos, balance_centavos,
    status,
    cancel_token_hash, cancel_token_expires_at,
    source, seat_numbers, celebration
  ) values (
    p_id, p_service_date, p_seating, p_service_starts_at, p_party_size,
    p_guest_name, p_guest_email, p_guest_phone, p_guest_lang, p_notes,
    p_course_price_centavos, p_deposit_pct,
    p_deposit_centavos, p_balance_centavos,
    p_status,
    p_cancel_token_hash, p_cancel_token_expires_at,
    p_source, v_seats, p_celebration
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.book_reservation_atomic is
  'Single-transaction allocate-seats + insert-reservation. Replaces the two-step (allocate then insert) flow that allowed concurrent oversell. Anti-oversell race fix; see codex review 2026-04-29.';

-- ────────────────────────────────────────────────────────────────────────
-- 0015_oversell_advisory_lock.sql
-- ────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Codex audit fix (2026-04-29): oversell race when no prior bookings exist
-- ============================================================================
-- The previous allocator used `FOR UPDATE` on existing reservation rows. When
-- the (service_date, seating) slot had zero existing rows, FOR UPDATE locked
-- nothing — two concurrent bookings could both proceed past the lock, compute
-- the same v_taken = [], and INSERT overlapping seat_numbers.
--
-- Fix: Take a transactional advisory lock keyed on (service_date, seating)
-- BEFORE the row-level FOR UPDATE. Advisory locks don't depend on the
-- presence of any rows, so concurrent bookings serialize whether or not the
-- slot has existing reservations.
--
-- pg_advisory_xact_lock(int8) is released automatically at COMMIT/ROLLBACK
-- and uses the same lock space across the whole DB. We hash the date and
-- seating together to derive the lock key.
-- ============================================================================

create or replace function public.allocate_seats_or_throw(
  p_service_date date,
  p_seating      seating_slot,
  p_party_size   smallint,
  p_requested    smallint[] default null
) returns smallint[]
language plpgsql
as $$
declare
  v_total      smallint;
  v_taken      smallint[] := array[]::smallint[];
  v_legacy_pax smallint := 0;
  v_seat       smallint;
  v_start      smallint;
  v_end        smallint;
  v_ok         boolean;
  v_result     smallint[];
  v_closed     boolean;
  v_lock_key   bigint;
begin
  -- 0. Advisory lock keyed on (date, seating). Held until COMMIT/ROLLBACK,
  --    so the entire allocator + the caller's downstream INSERT serialise
  --    against any other concurrent booking for the same slot. Works even
  --    when no rows exist yet (first-mover protection).
  v_lock_key := (
    ('x' || substr(md5(p_service_date::text || ':' || p_seating::text), 1, 16))::bit(64)
  )::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- 1. closed-date check
  select exists (select 1 from public.closed_dates where closed_date = p_service_date)
    into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  -- 2. Get capacity
  select online_seats into v_total from public.restaurant_settings where id = 1;
  if v_total is null then
    raise exception 'settings_missing' using errcode = 'P0006';
  end if;

  -- 3. (defence-in-depth) row-level lock on existing reservations. Redundant
  --    with the advisory lock above, but kept so nothing changes if the
  --    advisory key collides cross-slot.
  perform 1
    from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

  select coalesce(array_agg(s order by s), array[]::smallint[])
    into v_taken
  from (
    select unnest(seat_numbers) as s
      from public.reservations
     where service_date = p_service_date
       and seating      = p_seating
       and status in ('pending_payment','confirmed')
       and seat_numbers is not null
  ) sub;

  -- 4. Legacy rows missing seat_numbers — treat them as occupying the
  --    leftmost available seats so total capacity is still respected.
  select coalesce(sum(party_size), 0)::smallint
    into v_legacy_pax
  from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
     and seat_numbers is null;

  if v_legacy_pax > 0 then
    for v_seat in 1..v_legacy_pax loop
      if not (v_seat = any(v_taken)) then
        v_taken := array_append(v_taken, v_seat);
      end if;
    end loop;
  end if;

  -- 5. Manual seat selection mode
  if p_requested is not null then
    if array_length(p_requested, 1) <> p_party_size then
      raise exception 'seat_count_mismatch' using errcode = 'P0003';
    end if;
    foreach v_seat in array p_requested loop
      if v_seat < 1 or v_seat > v_total then
        raise exception 'seat_out_of_range' using errcode = 'P0004';
      end if;
      if v_seat = any(v_taken) then
        raise exception 'seat_occupied' using errcode = 'P0005';
      end if;
    end loop;
    return p_requested;
  end if;

  -- 6. Auto-allocate rightmost contiguous block
  v_end := v_total;
  while v_end >= p_party_size loop
    v_start := v_end - p_party_size + 1;
    v_ok := true;
    for v_seat in v_start..v_end loop
      if v_seat = any(v_taken) then v_ok := false; exit; end if;
    end loop;
    if v_ok then
      v_result := array(select generate_series(v_start, v_end))::smallint[];
      return v_result;
    end if;
    v_end := v_end - 1;
  end loop;

  raise exception 'capacity_exceeded' using errcode = 'P0002';
end;
$$;

comment on function public.allocate_seats_or_throw is
  'Atomic seat allocator. Uses pg_advisory_xact_lock keyed on (date,seating) to prevent oversell when no prior bookings exist. Codex audit fix 2026-04-29.';

-- ────────────────────────────────────────────────────────────────────────
-- 0016_webhook_dedup_state.sql
-- ────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Codex audit fix (2026-04-29): webhook handler retry trap
-- ============================================================================
-- Previous flow: insert webhook_events row BEFORE processing. If the handler
-- crashed (500), Stripe retried but the duplicate-key check now returned
-- "replay: true" (200 OK) and the handler was never re-run. Failed payment
-- events were silently dropped.
--
-- Fix: track event lifecycle. Mark row 'processing' on first arrival; only
-- ack-and-noop on 'succeeded'. 'processing' and 'failed' rows let Stripe
-- retries proceed to the handler.
-- ============================================================================

alter table public.webhook_events
  add column if not exists status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists attempts smallint not null default 0;

comment on column public.webhook_events.status is
  'processing → handler in flight or last attempt failed; succeeded → handler completed; failed → exhausted retries (manual review).';

-- Backfill any pre-existing rows (from before this migration) as succeeded.
update public.webhook_events
   set status = 'succeeded',
       processed_at = received_at
 where processed_at is null
   and status = 'processing';

-- ────────────────────────────────────────────────────────────────────────
-- 0017_is_admin_security_definer.sql
-- ────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Codex audit fix (2026-04-29): is_admin() RLS recursion / search_path hardening
-- ============================================================================
-- The previous is_admin() was SECURITY INVOKER (default) and read
-- public.admin_owners directly. Because admin_owners has its own RLS policy
-- that itself calls is_admin(), the function executes through the caller's
-- RLS context — creating a recursive read-from-policy → policy-calls-function
-- chain that risked breaking owner allowlist reads.
--
-- Fix: SECURITY DEFINER, owned by postgres, search_path locked to a known
-- schema list. The function now bypasses RLS on admin_owners (intentional —
-- it IS the gate) without recursive policy evaluation.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from public.admin_owners o
      join auth.users u on lower(u.email) = lower(o.email::text)
     where u.id = auth.uid()
  );
$$;

-- Revoke from PUBLIC, grant only to authenticated + service_role. Anon
-- callers can't probe admin allowlist.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

comment on function public.is_admin is
  'SECURITY DEFINER admin allowlist check. Bypasses admin_owners RLS so the function does not depend on its own policies (anti-recursion). Codex audit fix 2026-04-29.';

-- ============================================================================
-- Codex audit fix (2026-04-29): guest_lang default switched to 'en'.
-- The public site is now English-primary; reservations created without an
-- explicit guest_lang should follow that default.
-- ============================================================================

alter table public.reservations
  alter column guest_lang set default 'en';
