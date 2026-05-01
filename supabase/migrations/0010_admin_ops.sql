-- Phase 4 — operator-UX upgrades.
--
--  1. notification_log: every outbound message attempt (telegram / email /
--     whatsapp / sms). Failures surface in the dashboard "要対応" panel so
--     the owner notices when a confirmation didn't actually reach the guest.
--  2. RLS for service-role + admin-read.
--  3. Index for "recent failures" lookup.

create table if not exists public.notification_log (
  id              bigserial primary key,
  reservation_id  uuid        references public.reservations(id) on delete set null,
  channel         text        not null check (channel in ('telegram','email','whatsapp','sms')),
  kind            text        not null check (kind in (
    'admin_alert','guest_confirm','reminder_long','reminder_short',
    'cancel_confirm','no_show_alert'
  )),
  status          text        not null check (status in ('sent','failed','skipped')),
  recipient       text,
  error_message   text,
  attempted_at    timestamptz not null default now()
);

comment on table public.notification_log is
  'Every outbound notification attempt. Used by /admin to surface delivery failures to the owner.';

create index if not exists idx_notification_log_failed_recent
  on public.notification_log (attempted_at desc)
  where status = 'failed';

create index if not exists idx_notification_log_reservation
  on public.notification_log (reservation_id, attempted_at desc);

alter table public.notification_log enable row level security;

drop policy if exists notification_log_admin_read on public.notification_log;
create policy notification_log_admin_read on public.notification_log
  for select using (public.is_admin());
