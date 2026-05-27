-- Rollback for 0023_closed_dates_venue_pk.sql
-- ----------------------------------------------------------------------------
-- Restores the pre-Phase 1c PK on closed_date alone. Will refuse if any
-- (venue, closed_date) pair shares a closed_date with another venue —
-- inspect first with:
--   select closed_date, count(*) from closed_dates group by closed_date having count(*) > 1;
-- If duplicates exist, delete the Restaurant rows before running this.
-- ----------------------------------------------------------------------------

begin;

alter table public.closed_dates drop constraint if exists closed_dates_pkey;
alter table public.closed_dates add  primary key (closed_date);

commit;
