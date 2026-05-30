-- ============================================================================
-- 0025_fix_seat_alloc_smallint_generate_series.sql
--
-- HOTFIX (production-down): every numbered (Bar) booking that reached the
-- auto-allocate seat path failed with HTTP 500 and the Postgres error:
--
--     function generate_series(smallint, smallint) is not unique
--
-- Root cause: allocate_seats_or_throw() declares v_start / v_end as smallint
-- and called generate_series(v_start, v_end). PostgreSQL has no
-- generate_series(smallint, smallint) overload; smallint is implicitly
-- castable to int4, int8 AND numeric, none of which is preferred, so the
-- call is ambiguous and raised "is not unique". This has been latent since
-- 0011 and was carried forward through 0015 / 0022 / 0024.
--
-- Fix: cast the bounds to int so the call resolves unambiguously to
-- generate_series(int, int); the result is still cast back to smallint[].
-- Seat numbers are bounded by online_seats (a smallint), so the round-trip
-- cast is lossless.
--
-- Signature is identical to 0024, so a plain CREATE OR REPLACE swaps the
-- body in place without dropping the function (no dependent-object churn).
-- ============================================================================

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
      -- Cast bounds to int: generate_series has no (smallint, smallint)
      -- overload and the implicit cast is ambiguous. int4 resolves cleanly;
      -- result cast back to smallint[] (seat numbers fit in smallint).
      v_result := array(select generate_series(v_start::int, v_end::int))::smallint[];
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
  'Venue-aware atomic seat allocator. capacity_only mode (Restaurant) sums covers per (venue, date) ignoring seating, so the whole operating window draws from one pool. (0025: cast generate_series bounds to int to resolve the ambiguous smallint overload.)';
