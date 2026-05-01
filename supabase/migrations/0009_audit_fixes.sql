-- Phase 3 audit fixes:
--   C-3 — add `expired` status so reap-pending soft-deletes (preserves audit trail
--          and avoids losing rows that arrive concurrently with a late Stripe webhook).
--   P1-5 — webhook_events dedup table.
--   Stripe session id column on reservations so reap can verify expiry against Stripe
--          before flipping a pending row.

-- 1. Extend reservation_status enum to include `expired`.
alter type reservation_status add value if not exists 'expired';

-- 2. Track Stripe Checkout session id so the reaper can confirm expiry server-side.
alter table public.reservations
  add column if not exists stripe_checkout_session_id text;

create index if not exists idx_reservations_stripe_session
  on public.reservations (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- 3. Webhook event dedup. Stripe replays events on 5xx for up to 3 days; the
--    payments table already has idempotency_key UNIQUE for capture rows, but
--    charge.refunded and payment_intent.payment_failed handlers were not
--    deduped (audit P1-5). This table is the universal pre-check.
create table if not exists public.webhook_events (
  event_id    text primary key,
  source      text not null,            -- 'stripe' | 'paymongo' | …
  event_type  text not null,
  received_at timestamptz not null default now()
);

comment on table public.webhook_events is
  'Universal dedup for inbound webhook events. INSERT before processing; ON CONFLICT → 200 noop.';

alter table public.webhook_events enable row level security;
-- service-role only; admin doesn't read this directly
drop policy if exists webhook_events_admin_read on public.webhook_events;
create policy webhook_events_admin_read on public.webhook_events
  for select using (public.is_admin());

-- 4. Capacity index includes `pending_payment` (NOT `expired`) so soft-deleted
--    rows stop blocking seats. Re-create the partial index to drop expired ones.
drop index if exists public.idx_reservations_capacity;
create index idx_reservations_capacity
  on public.reservations (service_date, seating)
  where status in ('pending_payment','confirmed');

comment on column public.reservations.stripe_checkout_session_id is
  'Stripe Checkout session id (cs_…). Used by /api/cron/reap-pending to verify
   the session is actually expired before soft-deleting the reservation, so we
   never lose a row whose webhook is in-flight.';
