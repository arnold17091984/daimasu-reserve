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
