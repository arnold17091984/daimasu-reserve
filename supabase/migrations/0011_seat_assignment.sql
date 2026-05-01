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
