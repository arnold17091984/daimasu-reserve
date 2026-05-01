-- Phase 0.3 — audit_log: every staff action that changes a reservation or money state.
-- Required for NPC compliance + dispute resolution.

create table if not exists public.audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  actor           text        not null,        -- owner email | 'system' | 'webhook' | 'guest'
  actor_ip        inet,
  reservation_id  uuid        references public.reservations(id),
  action          text        not null,        -- e.g. 'reservation.create','reservation.cancel.full','payment.capture','settings.update'
  before_data     jsonb,
  after_data      jsonb,
  reason          text
);

comment on table public.audit_log is
  'Immutable log of state changes. Never updated, only inserted. Retention: 5 years (NPC PH).';

create index if not exists idx_audit_reservation on public.audit_log (reservation_id, occurred_at desc);
create index if not exists idx_audit_actor       on public.audit_log (actor, occurred_at desc);
create index if not exists idx_audit_action      on public.audit_log (action, occurred_at desc);
