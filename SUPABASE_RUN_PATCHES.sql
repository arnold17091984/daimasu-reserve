-- ============================================================================
-- Codex audit fix patch: run AFTER you've already applied 0001-0014.
-- Adds migrations 0015 + 0016 + 0017 (oversell race, webhook dedup state,
-- is_admin security definer + guest_lang en default).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
-- 0015_oversell_advisory_lock.sql
-- ────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Codex audit fix (2026-04-29): oversell race when no prior bookings exist
-- ============================================================================
-- The previous allocator used `FOR UPDATE` on existing reservation rows. When
-- the (service_date, seating) slot had zero existing rows, FOR UPDATE locked
-- nothing — two concurrent bookings could both proceed past the lock, compute
-- the same v_taken = [], and INSERT overlapping seat_numbers.
--
-- Fix: Take a transactional advisory lock keyed on (service_date, seating)
-- BEFORE the row-level FOR UPDATE. Advisory locks don't depend on the
-- presence of any rows, so concurrent bookings serialize whether or not the
-- slot has existing reservations.
--
-- pg_advisory_xact_lock(int8) is released automatically at COMMIT/ROLLBACK
-- and uses the same lock space across the whole DB. We hash the date and
-- seating together to derive the lock key.
-- ============================================================================

create or replace function public.allocate_seats_or_throw(
  p_service_date date,
  p_seating      seating_slot,
  p_party_size   smallint,
  p_requested    smallint[] default null
) returns smallint[]
language plpgsql
as $$
declare
  v_total      smallint;
  v_taken      smallint[] := array[]::smallint[];
  v_legacy_pax smallint := 0;
  v_seat       smallint;
  v_start      smallint;
  v_end        smallint;
  v_ok         boolean;
  v_result     smallint[];
  v_closed     boolean;
  v_lock_key   bigint;
begin
  -- 0. Advisory lock keyed on (date, seating). Held until COMMIT/ROLLBACK,
  --    so the entire allocator + the caller's downstream INSERT serialise
  --    against any other concurrent booking for the same slot. Works even
  --    when no rows exist yet (first-mover protection).
  v_lock_key := (
    ('x' || substr(md5(p_service_date::text || ':' || p_seating::text), 1, 16))::bit(64)
  )::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- 1. closed-date check
  select exists (select 1 from public.closed_dates where closed_date = p_service_date)
    into v_closed;
  if v_closed then
    raise exception 'closed_date' using errcode = 'P0001';
  end if;

  -- 2. Get capacity
  select online_seats into v_total from public.restaurant_settings where id = 1;
  if v_total is null then
    raise exception 'settings_missing' using errcode = 'P0006';
  end if;

  -- 3. (defence-in-depth) row-level lock on existing reservations. Redundant
  --    with the advisory lock above, but kept so nothing changes if the
  --    advisory key collides cross-slot.
  perform 1
    from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
   for update;

  select coalesce(array_agg(s order by s), array[]::smallint[])
    into v_taken
  from (
    select unnest(seat_numbers) as s
      from public.reservations
     where service_date = p_service_date
       and seating      = p_seating
       and status in ('pending_payment','confirmed')
       and seat_numbers is not null
  ) sub;

  -- 4. Legacy rows missing seat_numbers — treat them as occupying the
  --    leftmost available seats so total capacity is still respected.
  select coalesce(sum(party_size), 0)::smallint
    into v_legacy_pax
  from public.reservations
   where service_date = p_service_date
     and seating      = p_seating
     and status in ('pending_payment','confirmed')
     and seat_numbers is null;

  if v_legacy_pax > 0 then
    for v_seat in 1..v_legacy_pax loop
      if not (v_seat = any(v_taken)) then
        v_taken := array_append(v_taken, v_seat);
      end if;
    end loop;
  end if;

  -- 5. Manual seat selection mode
  if p_requested is not null then
    if array_length(p_requested, 1) <> p_party_size then
      raise exception 'seat_count_mismatch' using errcode = 'P0003';
    end if;
    foreach v_seat in array p_requested loop
      if v_seat < 1 or v_seat > v_total then
        raise exception 'seat_out_of_range' using errcode = 'P0004';
      end if;
      if v_seat = any(v_taken) then
        raise exception 'seat_occupied' using errcode = 'P0005';
      end if;
    end loop;
    return p_requested;
  end if;

  -- 6. Auto-allocate rightmost contiguous block
  v_end := v_total;
  while v_end >= p_party_size loop
    v_start := v_end - p_party_size + 1;
    v_ok := true;
    for v_seat in v_start..v_end loop
      if v_seat = any(v_taken) then v_ok := false; exit; end if;
    end loop;
    if v_ok then
      v_result := array(select generate_series(v_start, v_end))::smallint[];
      return v_result;
    end if;
    v_end := v_end - 1;
  end loop;

  raise exception 'capacity_exceeded' using errcode = 'P0002';
end;
$$;

comment on function public.allocate_seats_or_throw is
  'Atomic seat allocator. Uses pg_advisory_xact_lock keyed on (date,seating) to prevent oversell when no prior bookings exist. Codex audit fix 2026-04-29.';

-- ────────────────────────────────────────────────────────────────────────
-- 0016_webhook_dedup_state.sql
-- ────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────
-- 0017_is_admin_security_definer.sql
-- ────────────────────────────────────────────────────────────────────────
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
-- 0018 — structured dietary information.
--
-- Why: until now, allergy / dietary info was scribbled into the
-- free-text `notes` column with no structured signal for the kitchen
-- and no acknowledgement loop in the confirmation email. UX research
-- 2026-05-06 (Persona A: shellfish-allergic Western traveller; Persona
-- B: Japanese expat clients with dietary preferences) flagged this as
-- a Critical safety + service gap.
--
-- Shape:
--   dietary_type   – coarse category (none / vegetarian / pescatarian / ...)
--   allergens      – free text list of specific allergens (peanuts, dairy)
--   severe         – boolean signalling "needs EpiPen / hospital risk"
--   instructions   – additional kitchen-visible instructions
--
-- Stored as jsonb so the shape can evolve without another migration.
-- Empty / null means "no dietary requirement" (most reservations).

alter table public.reservations
  add column if not exists dietary jsonb;

comment on column public.reservations.dietary is
  'Structured dietary info. NULL = none. Shape: { type, allergens, severe, instructions }';

-- Optional partial index — speeds up the kitchen prep query that filters
-- to "show me everyone with a dietary entry on this date+seating".
create index if not exists reservations_dietary_idx
  on public.reservations ((dietary is not null))
  where dietary is not null;
-- 0019 — allow walk-ins to be recorded without a phone number.
--
-- Why: ops review 2026-05-06 (floor manager scenario) flagged that the
-- walk-in flow was effectively blocked when guests arrived with only a
-- name (or a hotel business card with no local number). The schema
-- forced staff to invent a placeholder, polluting customer dedup and
-- repeat-visit counts forever.
--
-- Make guest_phone nullable, but keep the length check so any value
-- that IS provided still has to look phone-shaped. Online bookings
-- still require a phone (enforced in createReservationSchema), so this
-- only relaxes the constraint for the admin walk-in path.

alter table public.reservations
  alter column guest_phone drop not null;

-- Replace the bare length check (which fails on NULL because length(NULL)
-- is NULL is comparable but constraint trips on the NOT NULL implicit
-- in original) with one that explicitly allows NULL. The original
-- "between 7 and 30" check survives unchanged for non-null values.
do $$ begin
  alter table public.reservations
    drop constraint reservations_guest_phone_check;
exception when undefined_object then null; end $$;

alter table public.reservations
  add constraint reservations_guest_phone_check
    check (guest_phone is null or length(guest_phone) between 7 and 30);

-- The book_reservation_atomic SP signature is unchanged — Postgres
-- coerces a NULL passed to a `text` parameter through fine.

comment on column public.reservations.guest_phone is
  'Guest phone — NULL allowed for walk-ins. Online bookings reject NULL at the API boundary.';
-- 0020 — payment-method + VAT/SVC monthly breakdown.
--
-- Why: ops review 2026-05-06 (Persona owner doing month-end accounting)
-- flagged that the revenue page rolled up `net_completed_centavos`
-- without exposing the per-method split (cash / card / GCash) or the
-- VAT / service-charge totals — both of which are required by the BIR
-- monthly OR summary. The data was in the `receipts` table all along,
-- just not surfaced.
--
-- Two new views, both filtering out voided receipts:
--   - revenue_method_monthly: rows per (month, method)
--   - revenue_breakdown_monthly: one row per month with menu / svc / vat
--     and grand totals across all methods
--
-- Existing revenue_daily / revenue_monthly views are untouched so the
-- dashboard keeps working as-is.

create or replace view public.revenue_method_monthly as
select date_trunc('month', issued_at at time zone 'Asia/Manila')::date as month_start,
       coalesce(settlement_method, 'unknown')      as method,
       count(*)                                    as receipt_count,
       coalesce(sum(menu_subtotal_centavos), 0)    as menu_subtotal_centavos,
       coalesce(sum(service_charge_centavos), 0)   as service_charge_centavos,
       coalesce(sum(vat_centavos), 0)              as vat_centavos,
       coalesce(sum(grand_total_centavos), 0)      as grand_total_centavos
  from public.receipts
 where voided_at is null
 group by 1, 2
 order by 1 desc, 2;

comment on view public.revenue_method_monthly is
  'Monthly receipts split by settlement method (cash/card/gcash/mixed). Voided receipts excluded.';

create or replace view public.revenue_breakdown_monthly as
select date_trunc('month', issued_at at time zone 'Asia/Manila')::date as month_start,
       count(*)                                    as receipt_count,
       coalesce(sum(menu_subtotal_centavos), 0)    as menu_subtotal_centavos,
       coalesce(sum(service_charge_centavos), 0)   as service_charge_centavos,
       coalesce(sum(vat_centavos), 0)              as vat_centavos,
       coalesce(sum(grand_total_centavos), 0)      as grand_total_centavos
  from public.receipts
 where voided_at is null
 group by 1
 order by 1 desc;

comment on view public.revenue_breakdown_monthly is
  'Monthly menu / service-charge / VAT / grand total totals from receipts. Voided rows excluded.';
