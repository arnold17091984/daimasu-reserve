-- 0024_restaurant_operating_hours.sql — Restaurant flexible time slots
-- ----------------------------------------------------------------------------
-- DAIMASU Restaurant needs free arrival-time selection across an extended
-- operating window (Tue–Thu/Sun: 11:00–23:00, Fri/Sat: 11:00–24:00) rather
-- than the two fixed kaiseki seatings (17:30 / 20:00) the Bar uses.
--
-- The clean approach is:
--   1. Add weekday/weekend open/close columns to restaurant_settings so the
--      operator can edit operating hours from /admin/settings.
--   2. Add a slot interval so the booking dialog can render a half-hour
--      grid by default but support 60-min/15-min variants later.
--   3. Re-shape the capacity_only branch of allocate_seats_or_throw to
--      count covers per DAY (venue + service_date) instead of per slot
--      (venue + date + seating). For a restaurant the seating column no
--      longer represents a meaningful capacity bucket — guests pick any
--      arrival time within hours, and the cover count rolls up to one
--      whole-day pool. The seating column itself stays (Bar still uses
--      it; Restaurant will canonicalise everything to 's1').
--
-- Bar continues to work unchanged because the numbered branch of the
-- allocator is untouched and the new settings columns have defaults that
-- the Bar row simply ignores.
-- ----------------------------------------------------------------------------

begin;

-- 1. operating-hours config
alter table public.restaurant_settings
  add column if not exists weekday_open_at        time     not null default '11:00',
  add column if not exists weekday_close_at       time     not null default '23:00',
  add column if not exists weekend_open_at        time     not null default '11:00',
  add column if not exists weekend_close_at       time     not null default '00:00:00',
  add column if not exists slot_interval_minutes  smallint not null default 30
    check (slot_interval_minutes in (15, 30, 60));

comment on column public.restaurant_settings.weekday_open_at is
  'For capacity_only venues (Restaurant): operating-hours open time on Tue–Thu/Sun. Bar ignores; uses seating_1_starts_at / seating_2_starts_at instead.';
comment on column public.restaurant_settings.weekday_close_at is
  'Operating-hours close on Tue–Thu/Sun. May equal weekend_close_at if midnight closure shared across all weekdays.';
comment on column public.restaurant_settings.weekend_open_at is
  'Operating-hours open on Fri/Sat.';
comment on column public.restaurant_settings.weekend_close_at is
  'Operating-hours close on Fri/Sat. 00:00:00 = midnight (24:00 in 24h).';
comment on column public.restaurant_settings.slot_interval_minutes is
  'Booking-dialog time-grid step (15/30/60). 30 is the default — yields ~24 weekday slots and ~26 weekend slots.';

-- 2. Restaurant venue picks up the user-stated operating hours.
update public.restaurant_settings
   set weekday_open_at       = '11:00',
       weekday_close_at      = '23:00',
       weekend_open_at       = '11:00',
       weekend_close_at      = '00:00:00',
       slot_interval_minutes = 30
 where venue = 'restaurant';

-- 3. allocate_seats_or_throw: capacity_only branch counts per DAY now.
-- Drop + recreate with the new logic. Same signature as 0022, so all
-- existing callers (admin POST, public POST, admin manual booking) keep
-- compiling without further code changes.
drop function if exists public.allocate_seats_or_throw(
  date, seating_slot, smallint, smallint[], text
);

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
  -- Advisory lock keyed on (venue, date, seating). For capacity_only
  -- venues every seating value collapses into the same per-day pool, so
  -- the lock effectively becomes per (venue, date) — which is exactly
  -- what we want (one concurrent allocator per restaurant per day).
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

  -- ---- capacity_only mode (Restaurant): per-DAY total, ignore seating ----
  if v_layout = 'capacity_only' then
    if p_requested is not null then
      raise exception 'seat_selection_not_supported' using errcode = 'P0007';
    end if;

    -- Row-level lock on every existing reservation for this date/venue —
    -- guests across the whole operating window draw from the same pool.
    perform 1
      from public.reservations
     where venue        = p_venue
       and service_date = p_service_date
       and status in ('pending_payment','confirmed')
     for update;

    select coalesce(sum(party_size), 0)::smallint
      into v_used
      from public.reservations
     where venue        = p_venue
       and service_date = p_service_date
       and status in ('pending_payment','confirmed');

    if v_used + p_party_size > v_total then
      raise exception 'capacity_exceeded' using errcode = 'P0002';
    end if;

    return null;  -- no seat numbers in capacity_only mode
  end if;

  -- ---- numbered mode (Bar): per (date, seating), seat-number allocator ----
  perform 1
    from public.reservations
   where venue        = p_venue
     and service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

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

comment on function public.allocate_seats_or_throw(
  date, seating_slot, smallint, smallint[], text
) is
  'Venue-aware atomic seat allocator. capacity_only mode (Restaurant) sums covers per (venue, date) ignoring seating, so the whole operating window draws from one pool.';

commit;
