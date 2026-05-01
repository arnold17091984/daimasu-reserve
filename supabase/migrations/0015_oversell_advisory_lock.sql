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
