-- Phase 0.3 — admin auth via Supabase Auth + owner allowlist.
-- RLS denies anon clients on every table. Service-role key (server-side only) bypasses RLS.

-- Owner allowlist — only these emails can sign in to /admin via magic link.
create table if not exists public.admin_owners (
  email        citext primary key,
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.admin_owners is
  'Owner allowlist. Insert manually via Supabase SQL editor. Magic-link sign-in checks this table.';

-- Helper: is the current auth.uid() an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.admin_owners o
      join auth.users u on lower(u.email) = lower(o.email::text)
     where u.id = auth.uid()
  );
$$;

-- ── RLS policies ────────────────────────────────────────────────────────────
-- Public site uses service-role on the server (Next.js API routes); never anon.
-- Admin /admin pages use the user's JWT, which is checked via is_admin().

alter table public.restaurant_settings enable row level security;
alter table public.reservations         enable row level security;
alter table public.payments             enable row level security;
alter table public.audit_log            enable row level security;
alter table public.closed_dates         enable row level security;
alter table public.admin_owners         enable row level security;

-- restaurant_settings: admin read/write; nobody else (server uses service-role bypass)
drop policy if exists settings_admin_all on public.restaurant_settings;
create policy settings_admin_all on public.restaurant_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- reservations: admin can see/edit everything via /admin
drop policy if exists reservations_admin_all on public.reservations;
create policy reservations_admin_all on public.reservations
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- payments: admin read; writes only via service role (anti-goal #1)
drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments
  for select
  using (public.is_admin());

-- audit_log: admin read; inserts only via service role
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select
  using (public.is_admin());

-- closed_dates: admin read/write
drop policy if exists closed_dates_admin_all on public.closed_dates;
create policy closed_dates_admin_all on public.closed_dates
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- admin_owners: read only via admin (writes through SQL editor or service role)
drop policy if exists owners_admin_read on public.admin_owners;
create policy owners_admin_read on public.admin_owners
  for select
  using (public.is_admin());
