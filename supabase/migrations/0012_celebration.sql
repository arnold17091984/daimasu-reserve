-- Phase 6 — celebration / surprise booking metadata.
--
-- DAIMASU specializes in birthday and anniversary surprise dinners with
-- projection-mapping moments. Free-text notes were losing structure;
-- this column gives operators a typed slot for occasion, surprise,
-- celebrant info, and deliverables (cake, flowers, champagne, mapping
-- content, photo service).
--
-- Stored as JSONB so the shape can evolve without migrations. Read
-- shape lives in src/lib/db/types.ts (Reservation.celebration) and the
-- zod validator at src/lib/domain/schemas.ts (celebrationSchema).

alter table public.reservations
  add column if not exists celebration jsonb;

comment on column public.reservations.celebration is
  'Structured celebration / surprise data. Shape: see Reservation.celebration in TS types. NULL = ordinary booking.';

-- GIN index lets the dashboard query "upcoming celebrations" / "needs
-- prep in 3 days" without scanning every reservation.
create index if not exists idx_reservations_celebration
  on public.reservations using gin (celebration)
  where celebration is not null
    and status in ('pending_payment','confirmed');

-- Helper: bookings within N days that have celebration data set,
-- ordered by service date. Used by /admin/celebrations and the
-- 3-day-out lead-time alerts on the dashboard.
create or replace view public.upcoming_celebrations as
select id,
       service_date,
       seating,
       service_starts_at,
       guest_name,
       guest_phone,
       guest_email,
       guest_lang,
       party_size,
       status,
       celebration,
       (service_date - current_date)::int as days_until
  from public.reservations
 where celebration is not null
   and (celebration->>'occasion') is distinct from 'none'
   and status in ('pending_payment','confirmed')
   and service_date >= current_date
 order by service_date asc, service_starts_at asc;

comment on view public.upcoming_celebrations is
  'Future bookings with celebration metadata, with days_until. Used by celebration dashboard + lead-time alerts.';
