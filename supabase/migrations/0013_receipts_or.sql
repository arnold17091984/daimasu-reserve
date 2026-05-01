-- Phase: BIR Official Receipt + VAT/SVC breakdown.
-- ----------------------------------------------------------------------------
-- The Bureau of Internal Revenue (BIR) requires every transaction to bear a
-- sequential Official Receipt (OR) number issued by an authorised receipt
-- printer. Until DAIMASU obtains its own ATP (Authority to Print), this table
-- tracks the *internal* sequence so the operator can match Stripe-driven
-- bookings to the manually-issued OR slip at the bar.
--
-- It also persists the VAT / Service Charge breakdown computed at booking
-- time so the receipt PDF, the email, and the audit log all show the same
-- numbers — the on-the-fly recalculation in domain/reservation.ts is fine
-- for previews, but the captured row is the source of truth for accounting.
-- ----------------------------------------------------------------------------

-- ─── 1. Sequential OR generator ────────────────────────────────────────────
-- One row per "series" — typically a single open series at a time. When the
-- operator is issued a new ATP they bump the series and reset.
create table if not exists or_series (
  id              smallserial primary key,
  prefix          text not null,                 -- e.g. 'DBM-2026-' for traceability
  next_number     bigint not null default 1,
  active          boolean not null default true, -- only one row may be true
  notes           text,
  created_at      timestamptz not null default now()
);

-- Default series — operator can edit the prefix in admin/settings.
-- The number resets when a new ATP is issued (insert a new row, set
-- the old row active=false, set the new row active=true).
insert into or_series (prefix, active, notes)
values ('DBM-', true, 'Initial DAIMASU BAR series. Replace prefix on next BIR ATP issuance.')
on conflict do nothing;

-- ─── 2. Receipts table ─────────────────────────────────────────────────────
create table if not exists receipts (
  id                          uuid primary key default gen_random_uuid(),
  reservation_id              uuid not null references reservations(id) on delete restrict,
  -- The formatted OR number ('DBM-000001234'). Unique across all series.
  or_number                   text not null unique,
  -- Snapshot of the price breakdown at issuance time (centavos).
  menu_subtotal_centavos      bigint not null check (menu_subtotal_centavos >= 0),
  service_charge_centavos     bigint not null check (service_charge_centavos >= 0),
  vat_centavos                bigint not null check (vat_centavos >= 0),
  grand_total_centavos        bigint not null check (grand_total_centavos >= 0),
  -- The settlement payment(s) that this OR represents (cash / card / mixed).
  settlement_method           text check (settlement_method in ('cash', 'card', 'gcash', 'mixed') or settlement_method is null),
  -- Issuance metadata. issued_by / voided_by store the admin email
  -- as plain text — same convention as audit_log.actor — rather than
  -- an FK, because admin_owners.email is the PK (not `id`) and the
  -- value is informational, not relational.
  issued_at                   timestamptz not null default now(),
  issued_by                   text,
  voided_at                   timestamptz,
  voided_by                   text,
  void_reason                 text,
  -- Sum-check trip-wire: the trio must sum to grand_total exactly.
  constraint receipts_total_consistency
    check (menu_subtotal_centavos + service_charge_centavos + vat_centavos = grand_total_centavos)
);

create index if not exists receipts_reservation_idx on receipts(reservation_id);
create index if not exists receipts_issued_at_idx on receipts(issued_at desc);
create index if not exists receipts_voided_idx on receipts(voided_at) where voided_at is not null;

comment on table receipts is
  'BIR Official Receipt records. One per fully-settled reservation. Voided rows kept for audit (5-yr retention).';

-- ─── 3. Atomic OR-number issuance ──────────────────────────────────────────
-- Concurrent settle calls would otherwise race on next_number. This function
-- takes a row-level lock on the active series, increments, and returns the
-- formatted OR number — all in one round-trip.
create or replace function issue_or_number()
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_n bigint;
begin
  update or_series
    set next_number = next_number + 1
  where active = true
  returning prefix, next_number - 1
    into v_prefix, v_n;

  if v_prefix is null then
    raise exception 'no_active_or_series'
      using errcode = 'P0001';
  end if;

  -- Format: prefix + 8-digit zero-padded number.
  -- 8 digits = 99,999,999 receipts before the next series; ample for a
  -- single restaurant's lifetime. Wider series can be added later.
  return v_prefix || lpad(v_n::text, 8, '0');
end;
$$;

comment on function issue_or_number() is
  'Atomically increments the active OR series and returns the next formatted number.';

-- ─── 4. Convenience write-side helper ──────────────────────────────────────
-- Wraps issue_or_number + insert into receipts in a single transaction.
-- Used from the settle-flow API; the breakdown columns must be supplied so
-- the function does not couple to the domain pricing constants (those live
-- in TS and must remain the single source of truth — this function only
-- *persists* what it is told to persist).
create or replace function settle_with_receipt(
  p_reservation_id        uuid,
  p_menu_subtotal         bigint,
  p_service_charge        bigint,
  p_vat                   bigint,
  p_grand_total           bigint,
  p_settlement_method     text,
  p_issued_by             text
)
returns receipts
language plpgsql
security definer
as $$
declare
  v_or_number text;
  v_row receipts;
begin
  if p_menu_subtotal + p_service_charge + p_vat <> p_grand_total then
    raise exception 'breakdown_does_not_sum_to_grand_total'
      using errcode = 'P0001';
  end if;

  v_or_number := issue_or_number();

  insert into receipts (
    reservation_id, or_number,
    menu_subtotal_centavos, service_charge_centavos, vat_centavos, grand_total_centavos,
    settlement_method, issued_by
  ) values (
    p_reservation_id, v_or_number,
    p_menu_subtotal, p_service_charge, p_vat, p_grand_total,
    p_settlement_method, p_issued_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function settle_with_receipt(uuid, bigint, bigint, bigint, bigint, text, text) is
  'Atomically issues an OR number and persists the receipt for a settled reservation.';

-- ─── 5. RLS — same shape as audit_log ──────────────────────────────────────
alter table or_series enable row level security;
alter table receipts enable row level security;

-- Owners (admin_owners allowlist) can see and manage everything.
create policy or_series_owners_all on or_series
  for all
  using (is_admin())
  with check (is_admin());

create policy receipts_owners_all on receipts
  for all
  using (is_admin())
  with check (is_admin());
