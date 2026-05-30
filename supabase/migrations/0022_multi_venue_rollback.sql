-- Rollback for 0022_multi_venue.sql
-- ----------------------------------------------------------------------------
-- Reverts every change in 0022 in reverse order. Safe to run if Phase 0 was
-- applied but no actual Restaurant reservations exist yet (the delete of the
-- restaurant venue row will fail-soft via ON CONFLICT but any reservations
-- pinned to venue='restaurant' would block the DROP COLUMN. Inspect first
-- with:  select venue, count(*) from reservations group by venue;
-- ----------------------------------------------------------------------------

begin;

-- 6. Drop venue-aware views.
drop view if exists public.revenue_monthly_by_venue;
drop view if exists public.revenue_daily_by_venue;

-- 5. Restore book_reservation_atomic to pre-venue signature (from 0014).
-- Drop the venue-aware 21-arg version first; CREATE OR REPLACE only matches
-- exact signatures, so both would otherwise coexist.
drop function if exists public.book_reservation_atomic(
  uuid, date, seating_slot, timestamptz, smallint,
  text, text, text, text, text,
  bigint, smallint, bigint, bigint,
  text, timestamptz, text, smallint[], jsonb, reservation_status, text
);

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
  v_seats := public.allocate_seats_or_throw(
    p_service_date, p_seating, p_party_size, p_requested_seats
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

-- 4. Restore allocate_seats_or_throw to pre-venue version (from 0015).
-- Same overload housekeeping as #5.
drop function if exists public.allocate_seats_or_throw(
  date, seating_slot, smallint, smallint[], text
);

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
  v_lock_key := (
    ('x' || substr(md5(p_service_date::text || ':' || p_seating::text), 1, 16))::bit(64)
  )::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  select exists (select 1 from public.closed_dates where closed_date = p_service_date)
    into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  select online_seats into v_total from public.restaurant_settings where id = 1;
  if v_total is null then
    raise exception 'settings_missing' using errcode = 'P0006';
  end if;

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
      v_result := array(select generate_series(v_start::int, v_end::int))::smallint[];
      return v_result;
    end if;
    v_end := v_end - 1;
  end loop;

  raise exception 'capacity_exceeded' using errcode = 'P0002';
end;
$$;

-- 3. Drop venue column from closed_dates.
alter table public.closed_dates drop column if exists venue;

-- 2. Drop venue column from reservations + new index.
drop index if exists public.idx_reservations_venue_capacity;
alter table public.reservations drop column if exists venue;

-- 1. Restore restaurant_settings to single-row, id-keyed.
-- (Will fail if anyone has actually configured the restaurant venue and you
-- don't want to lose that data — back it up first.)
delete from public.restaurant_settings where venue = 'restaurant';
alter table public.restaurant_settings drop constraint if exists restaurant_settings_venue_key;
alter table public.restaurant_settings drop column if exists seat_layout_mode;
alter table public.restaurant_settings drop column if exists venue;
alter table public.restaurant_settings add constraint single_row check (id = 1);

commit;
