-- Phase 0.3 — payments: every Stripe / GCash / on-site money event recorded as immutable rows.
-- Anti-goal #1: idempotency_key prevents Stripe webhook double-fire from charging twice.

do $$ begin
  create type payment_kind as enum (
    'deposit_capture',  -- Stripe Checkout success: deposit captured
    'refund_full',      -- 100% refund issued (cancellation ≥ refund_full_hours)
    'refund_partial',   -- 50% refund issued
    'on_site_settlement', -- staff records balance collected on-site
    'manual_adjustment'   -- owner override (audit_log mandatory)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_provider as enum ('stripe','paymongo','on_site');
exception when duplicate_object then null; end $$;

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references public.reservations(id) on delete restrict,
  kind                payment_kind     not null,
  provider            payment_provider not null,
  -- positive for captures, NEGATIVE for refunds — sum() over a reservation = net received
  amount_centavos     bigint           not null,
  method              payment_method,         -- on-site only; null for Stripe events
  provider_ref        text,                   -- Stripe charge / refund / payment_intent id
  -- Anti-goal #1: hard idempotency
  idempotency_key     text             not null unique,
  notes               text,
  recorded_by         text,                   -- 'system' | 'webhook' | owner email
  created_at          timestamptz      not null default now()
);

comment on table public.payments is
  'Append-only money ledger per reservation. Refunds are negative amount. idempotency_key is unique to absorb Stripe webhook duplicates.';

create index if not exists idx_payments_reservation on public.payments (reservation_id);
create index if not exists idx_payments_kind_date   on public.payments (kind, created_at);

-- Convenience view: reservation with rolled-up money
create or replace view public.reservation_money as
select r.id                                            as reservation_id,
       r.service_date,
       r.seating,
       r.status,
       r.party_size,
       r.total_centavos,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind = 'deposit_capture'), 0)        as deposit_received,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind in ('refund_full','refund_partial')), 0) as refunded,
       coalesce(sum(p.amount_centavos) filter
         (where p.kind = 'on_site_settlement'), 0)     as on_site_received,
       coalesce(sum(p.amount_centavos), 0)             as net_received
  from public.reservations r
  left join public.payments p on p.reservation_id = r.id
 group by r.id;

comment on view public.reservation_money is
  'Per-reservation money summary. Powers the owner revenue dashboard.';
