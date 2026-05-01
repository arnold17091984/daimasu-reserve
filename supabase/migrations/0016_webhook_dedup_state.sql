-- ============================================================================
-- Codex audit fix (2026-04-29): webhook handler retry trap
-- ============================================================================
-- Previous flow: insert webhook_events row BEFORE processing. If the handler
-- crashed (500), Stripe retried but the duplicate-key check now returned
-- "replay: true" (200 OK) and the handler was never re-run. Failed payment
-- events were silently dropped.
--
-- Fix: track event lifecycle. Mark row 'processing' on first arrival; only
-- ack-and-noop on 'succeeded'. 'processing' and 'failed' rows let Stripe
-- retries proceed to the handler.
-- ============================================================================

alter table public.webhook_events
  add column if not exists status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists attempts smallint not null default 0;

comment on column public.webhook_events.status is
  'processing → handler in flight or last attempt failed; succeeded → handler completed; failed → exhausted retries (manual review).';

-- Backfill any pre-existing rows (from before this migration) as succeeded.
update public.webhook_events
   set status = 'succeeded',
       processed_at = received_at
 where processed_at is null
   and status = 'processing';
