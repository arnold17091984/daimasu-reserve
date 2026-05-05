-- 0019 — allow walk-ins to be recorded without a phone number.
--
-- Why: ops review 2026-05-06 (floor manager scenario) flagged that the
-- walk-in flow was effectively blocked when guests arrived with only a
-- name (or a hotel business card with no local number). The schema
-- forced staff to invent a placeholder, polluting customer dedup and
-- repeat-visit counts forever.
--
-- Make guest_phone nullable, but keep the length check so any value
-- that IS provided still has to look phone-shaped. Online bookings
-- still require a phone (enforced in createReservationSchema), so this
-- only relaxes the constraint for the admin walk-in path.

alter table public.reservations
  alter column guest_phone drop not null;

-- Replace the bare length check (which fails on NULL because length(NULL)
-- is NULL is comparable but constraint trips on the NOT NULL implicit
-- in original) with one that explicitly allows NULL. The original
-- "between 7 and 30" check survives unchanged for non-null values.
do $$ begin
  alter table public.reservations
    drop constraint reservations_guest_phone_check;
exception when undefined_object then null; end $$;

alter table public.reservations
  add constraint reservations_guest_phone_check
    check (guest_phone is null or length(guest_phone) between 7 and 30);

-- The book_reservation_atomic SP signature is unchanged — Postgres
-- coerces a NULL passed to a `text` parameter through fine.

comment on column public.reservations.guest_phone is
  'Guest phone — NULL allowed for walk-ins. Online bookings reject NULL at the API boundary.';
