-- ============================================================================
-- Codex audit fix (2026-04-29): is_admin() RLS recursion / search_path hardening
-- ============================================================================
-- The previous is_admin() was SECURITY INVOKER (default) and read
-- public.admin_owners directly. Because admin_owners has its own RLS policy
-- that itself calls is_admin(), the function executes through the caller's
-- RLS context — creating a recursive read-from-policy → policy-calls-function
-- chain that risked breaking owner allowlist reads.
--
-- Fix: SECURITY DEFINER, owned by postgres, search_path locked to a known
-- schema list. The function now bypasses RLS on admin_owners (intentional —
-- it IS the gate) without recursive policy evaluation.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from public.admin_owners o
      join auth.users u on lower(u.email) = lower(o.email::text)
     where u.id = auth.uid()
  );
$$;

-- Revoke from PUBLIC, grant only to authenticated + service_role. Anon
-- callers can't probe admin allowlist.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

comment on function public.is_admin is
  'SECURITY DEFINER admin allowlist check. Bypasses admin_owners RLS so the function does not depend on its own policies (anti-recursion). Codex audit fix 2026-04-29.';

-- ============================================================================
-- Codex audit fix (2026-04-29): guest_lang default switched to 'en'.
-- The public site is now English-primary; reservations created without an
-- explicit guest_lang should follow that default.
-- ============================================================================

alter table public.reservations
  alter column guest_lang set default 'en';
