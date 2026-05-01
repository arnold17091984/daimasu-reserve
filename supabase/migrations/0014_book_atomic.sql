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
