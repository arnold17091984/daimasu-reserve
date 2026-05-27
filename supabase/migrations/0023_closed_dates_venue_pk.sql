-- 0023_closed_dates_venue_pk.sql — widen closed_dates PK to (venue, closed_date)
-- ----------------------------------------------------------------------------
-- Phase 0 (migration 0022) added the venue column to closed_dates but left
-- the PK on closed_date alone for back-compat. That was fine while no
-- application code passed venue, but Phase 1c now needs each venue to
-- manage its own closures independently (Bar closed on 2026-06-15 should
-- not prevent Restaurant from also closing that same date, or vice versa).
--
-- This migration widens the PK so the upsert/delete in
-- /api/admin/closed-dates can scope by (venue, closed_date).
--
-- Safety: the table currently has 0 rows (verified 2026-05-27), so the PK
-- swap cannot fail on duplicate keys. allocate_seats_or_throw() already
-- filters by venue (see 0022), so widening the PK is a pure metadata
-- change visible only to the admin CRUD path.
-- ----------------------------------------------------------------------------

begin;

alter table public.closed_dates drop constraint if exists closed_dates_pkey;
alter table public.closed_dates add  primary key (venue, closed_date);

comment on table public.closed_dates is
  'Per-venue date closures. PK is composite (venue, closed_date) so each venue can independently close any date.';

commit;
