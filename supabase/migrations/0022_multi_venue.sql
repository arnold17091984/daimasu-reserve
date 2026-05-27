-- 0022_multi_venue.sql — Phase 0: introduce multi-venue support (Bar + Restaurant)
-- ----------------------------------------------------------------------------
-- Strategy: PURELY ADDITIVE. Existing Bar code paths are not modified and
-- continue to work unchanged. New `venue` columns/rows are introduced with
-- default 'bar' so all backfilled data stays correct, and a Restaurant
-- venue row is seeded but no code reads from it until Phase 1.
--
-- Specifically preserved for zero-downtime:
--   * restaurant_settings.id PK retained — every existing `eq("id", 1)`
--     query keeps returning the Bar settings row unchanged.
--   * Original revenue_daily / revenue_monthly views are NOT modified —
--     two TS callers use .maybeSingle() and would crash if these became
--     multi-row. New _by_venue views are added alongside.
--   * RPC functions gain a trailing `p_venue text default 'bar'` parameter
--     so every existing caller (which passes no venue) keeps booking into
--     the Bar venue with identical behaviour.
--
-- Phase 1 (separate PR) will incrementally migrate TS callers to be
-- venue-aware. Once all callers pass venue explicitly, Phase X can drop
-- the deprecated views and the default on p_venue.
-- ----------------------------------------------------------------------------

begin;

-- ==========================================================================
-- 1. restaurant_settings: become multi-row, keep id PK for back-compat
-- ==========================================================================
alter table public.restaurant_settings
  add column if not exists venue            text not null default 'bar',
  add column if not exists seat_layout_mode text not null default 'numbered'
    check (seat_layout_mode in ('numbered','capacity_only'));

-- Drop the single-row sentinel so id=2 can be inserted.
alter table public.restaurant_settings drop constraint if exists single_row;

-- Each venue gets at most one settings row.
alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_venue_key;
alter table public.restaurant_settings
  add  constraint restaurant_settings_venue_key unique (venue);

comment on column public.restaurant_settings.venue is
  'Venue slug. The historical single row carries ''bar''; ''restaurant'' is the second venue.';
comment on column public.restaurant_settings.seat_layout_mode is
  'numbered: 8-seat hinoki counter (Bar). capacity_only: table seats, only total head-count enforced (Restaurant).';

-- Seed the restaurant venue with sensible defaults. Operator can edit
-- via /admin/settings once Phase 1 lands the venue switcher.
-- Pricing is set such that course_price_centavos × party_size × 5% gives
-- the displayed deposit guidance to the customer (collected manually
-- off-system via GCash/bank transfer).
insert into public.restaurant_settings (
  id, venue,
  total_seats, online_seats,
  seating_1_label, seating_2_label,
  seating_1_starts_at, seating_2_starts_at,
  service_minutes,
  course_price_centavos, deposit_pct,
  refund_full_hours, refund_partial_hours,
  reminder_long_hours, reminder_short_hours,
  display_name, seat_layout_mode,
  monthly_revenue_target_centavos, reservations_open
) values (
  2, 'restaurant',
  40, 40,
  '18:00', '20:30',
  '18:00', '20:30',
  120,
  1500000, 5,
  48, 24,
  24, 2,
  'DAIMASU 大桝 Restaurant', 'capacity_only',
  0, true
) on conflict (id) do nothing;

-- ==========================================================================
-- 2. reservations: add venue column (default 'bar' backfills history)
-- ==========================================================================
alter table public.reservations
  add column if not exists venue text not null default 'bar';

comment on column public.reservations.venue is
  'Which venue this booking is for. Defaults to ''bar'' to preserve all pre-multi-venue rows.';

-- Hot path index for capacity counting once Phase 1 starts scoping by venue.
-- Original (date, seating) index in 0003 keeps serving Bar queries that
-- haven't yet been updated.
create index if not exists idx_reservations_venue_capacity
  on public.reservations (venue, service_date, seating)
  where status in ('pending_payment','confirmed');

-- ==========================================================================
-- 3. closed_dates: add venue column. PK NOT touched (Phase 1 will widen it
--    to (venue, closed_date) once callers pass venue explicitly).
-- ==========================================================================
alter table public.closed_dates
  add column if not exists venue text not null default 'bar';

comment on column public.closed_dates.venue is
  'Venue this closure applies to. PK still on closed_date for back-compat — Phase 1 widens to composite.';

-- ==========================================================================
-- 4. allocate_seats_or_throw — add p_venue, branch by seat_layout_mode
-- ==========================================================================
-- Backwards-compatible: callers that don't pass p_venue still operate on
-- 'bar' identically (same advisory lock semantics, same numbered allocator).
create or replace function public.allocate_seats_or_throw(
  p_service_date date,
  p_seating      seating_slot,
  p_party_size   smallint,
  p_requested    smallint[] default null,
  p_venue        text       default 'bar'
) returns smallint[]
language plpgsql
as $$
declare
  v_total      smallint;
  v_layout     text;
  v_used       smallint;
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
  -- Advisory lock keyed on (venue, date, seating) so Bar and Restaurant
  -- bookings on the same date/seating don't serialise against each other.
  v_lock_key := (
    ('x' || substr(md5(p_venue || ':' || p_service_date::text || ':' || p_seating::text), 1, 16))::bit(64)
  )::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Closed-date check, scoped to venue.
  select exists (
    select 1
      from public.closed_dates
     where closed_date = p_service_date
       and venue       = p_venue
  ) into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  -- Read this venue's capacity and layout mode.
  select online_seats, seat_layout_mode
    into v_total, v_layout
    from public.restaurant_settings
   where venue = p_venue;
  if v_total is null then
    raise exception 'settings_missing' using errcode = 'P0006';
  end if;

  -- Row-level lock on existing reservations for this slot in this venue.
  perform 1
    from public.reservations
   where venue        = p_venue
     and service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

  -- ---- capacity_only mode (Restaurant): just enforce total head-count ----
  if v_layout = 'capacity_only' then
    if p_requested is not null then
      raise exception 'seat_selection_not_supported' using errcode = 'P0007';
    end if;

    select coalesce(sum(party_size), 0)::smallint
      into v_used
      from public.reservations
     where venue        = p_venue
       and service_date = p_service_date
       and seating      = p_seating
       and status in ('pending_payment','confirmed');

    if v_used + p_party_size > v_total then
      raise exception 'capacity_exceeded' using errcode = 'P0002';
    end if;

    return null;  -- no seat numbers in capacity_only mode
  end if;

  -- ---- numbered mode (Bar): original logic, scoped to venue ----
  select coalesce(array_agg(s order by s), array[]::smallint[])
    into v_taken
  from (
    select unnest(seat_numbers) as s
      from public.reservations
     where venue        = p_venue
       and service_date = p_service_date
       and seating      = p_seating
       and status in ('pending_payment','confirmed')
       and seat_numbers is not null
  ) sub;

  -- Legacy rows missing seat_numbers — treat them as occupying leftmost seats.
  select coalesce(sum(party_size), 0)::smallint
    into v_legacy_pax
  from public.reservations
   where venue        = p_venue
     and service_date = p_service_date
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

  -- Manual seat selection mode.
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

  -- Auto-allocate rightmost contiguous block.
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
  'Venue-aware atomic seat allocator. capacity_only mode (Restaurant) skips seat numbering and only enforces total head-count.';

-- ==========================================================================
-- 5. book_reservation_atomic — add p_venue (default 'bar') and persist it
-- ==========================================================================
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
  p_status                   reservation_status default 'pending_payment',
  p_venue                    text default 'bar'
)
returns reservations
language plpgsql
as $$
declare
  v_seats smallint[];
  v_row   reservations;
begin
  v_seats := public.allocate_seats_or_throw(
    p_service_date,
    p_seating,
    p_party_size,
    p_requested_seats,
    p_venue
  );

  insert into public.reservations (
    id, venue, service_date, seating, service_starts_at, party_size,
    guest_name, guest_email, guest_phone, guest_lang, notes,
    course_price_centavos, deposit_pct,
    deposit_centavos, balance_centavos,
    status,
    cancel_token_hash, cancel_token_expires_at,
    source, seat_numbers, celebration
  ) values (
    p_id, p_venue, p_service_date, p_seating, p_service_starts_at, p_party_size,
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
  'Venue-aware booking RPC. Defaults p_venue=''bar'' so existing Bar callers work unchanged.';

-- ==========================================================================
-- 6. NEW venue-aware revenue views (existing views kept untouched)
-- ==========================================================================
-- Existing revenue_daily / revenue_monthly stay as-is. Two TS callers use
-- .maybeSingle() against them and would crash if we widened them. Phase 1
-- will switch those callers to the _by_venue variants.

create or replace view public.revenue_daily_by_venue as
with by_date as (
  select r.venue,
         r.service_date,
         count(*) filter (where r.status in ('confirmed','completed','no_show'))                       as covers_booked,
         coalesce(sum(r.total_centavos)        filter (where r.status in ('confirmed','completed')), 0) as gross_booked_centavos,
         coalesce(sum(rm.net_received)         filter (where r.status = 'completed'), 0)                as net_completed_centavos,
         coalesce(sum(rm.deposit_received)     filter (where r.status = 'no_show'), 0)                  as no_show_deposit_kept_centavos,
         coalesce(sum(r.balance_centavos)      filter (where r.status = 'no_show'), 0)                  as no_show_lost_centavos,
         count(*) filter (where r.status = 'no_show')                                                   as no_show_count,
         count(*) filter (where r.status in ('cancelled_full','cancelled_partial','cancelled_late'))    as cancel_count
    from public.reservations r
    left join public.reservation_money rm on rm.reservation_id = r.id
   group by r.venue, r.service_date
)
select * from by_date;

comment on view public.revenue_daily_by_venue is
  'Daily KPIs partitioned by venue. Phase 1 TS will switch from revenue_daily to this.';

create or replace view public.revenue_monthly_by_venue as
select venue,
       date_trunc('month', service_date)::date     as month_start,
       sum(covers_booked)                          as covers_booked,
       sum(gross_booked_centavos)                  as gross_booked_centavos,
       sum(net_completed_centavos)                 as net_completed_centavos,
       sum(no_show_deposit_kept_centavos)          as no_show_deposit_kept_centavos,
       sum(no_show_lost_centavos)                  as no_show_lost_centavos,
       sum(no_show_count)                          as no_show_count,
       sum(cancel_count)                           as cancel_count
  from public.revenue_daily_by_venue
 group by venue, 2
 order by 2 desc, venue;

comment on view public.revenue_monthly_by_venue is
  'Monthly rollup per venue. Phase 1 switches admin pages from revenue_monthly to this.';

commit;
