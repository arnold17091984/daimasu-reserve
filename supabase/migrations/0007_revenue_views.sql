-- Phase 0.3 — revenue rollup views for /admin/dashboard (Q9 L1 + L3 + L2-lite).
-- All amounts in PHP centavos. Time-bucketed in Asia/Manila.

-- Daily revenue (booked + received + lost-to-no-show).
create or replace view public.revenue_daily as
with by_date as (
  select r.service_date,
         count(*) filter (where r.status in ('confirmed','completed','no_show'))                       as covers_booked,
         coalesce(sum(r.total_centavos)        filter (where r.status in ('confirmed','completed')), 0) as gross_booked_centavos,
         coalesce(sum(rm.net_received)         filter (where r.status = 'completed'), 0)                as net_completed_centavos,
         coalesce(sum(rm.deposit_received)     filter (where r.status = 'no_show'), 0)                  as no_show_deposit_kept_centavos,
         coalesce(sum(r.balance_centavos)      filter (where r.status = 'no_show'), 0)                  as no_show_lost_centavos,
         count(*) filter (where r.status = 'no_show')                                                   as no_show_count,
         count(*) filter (where r.status in ('cancelled_full','cancelled_partial','cancelled_late'))    as cancel_count
    from public.reservations r
    left join public.reservation_money rm on rm.reservation_id = r.id
   group by r.service_date
)
select * from by_date;

comment on view public.revenue_daily is
  'Daily KPIs: bookings, money in, no-show impact. Filter by service_date in app code.';

-- Monthly revenue (Manila TZ month).
create or replace view public.revenue_monthly as
select date_trunc('month', service_date)::date     as month_start,
       sum(covers_booked)                          as covers_booked,
       sum(gross_booked_centavos)                  as gross_booked_centavos,
       sum(net_completed_centavos)                 as net_completed_centavos,
       sum(no_show_deposit_kept_centavos)          as no_show_deposit_kept_centavos,
       sum(no_show_lost_centavos)                  as no_show_lost_centavos,
       sum(no_show_count)                          as no_show_count,
       sum(cancel_count)                           as cancel_count
  from public.revenue_daily
 group by 1
 order by 1 desc;

comment on view public.revenue_monthly is
  'Monthly rollup. month_start is the first day at 00:00 Manila local.';

-- No-show rate (KPI for success metric: < 5%).
-- Note: revenue_monthly already exposes month_start (aggregated from service_date
-- in revenue_daily). Don't re-apply date_trunc here.
create or replace view public.no_show_rate as
select month_start,
       no_show_count,
       (covers_booked - cancel_count)           as eligible_covers,
       case when (covers_booked - cancel_count) > 0
            then round(no_show_count::numeric / (covers_booked - cancel_count) * 100, 2)
            else 0
       end                                       as no_show_rate_pct
  from public.revenue_monthly;

comment on view public.no_show_rate is
  'Monthly no-show percentage. eligible_covers excludes cancelled reservations.';
