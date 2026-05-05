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
