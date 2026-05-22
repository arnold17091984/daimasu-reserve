-- 0021 — affiliate attribution columns.
--
-- Why: the DAIMASU cast-affiliate system (separate Next.js app, Neon DB)
-- needs its affiliate-link bookings to become REAL reservations in this
-- system so the 8-seat counter capacity, confirmation email and Telegram
-- all run through the single source of truth. When the affiliate app
-- calls POST /api/reservations it tags the booking with the cast's
-- affiliate link slug (and, if a QR coupon was involved, its code) so
-- the settlement webhook can later confirm the cast's commission.
--
-- Both columns are nullable — a direct public booking has neither.

alter table public.reservations
  add column if not exists affiliate_link_slug   text,
  add column if not exists affiliate_coupon_code text;

comment on column public.reservations.affiliate_link_slug is
  'Cast affiliate link slug (8-char nanoid) when the booking originated from the affiliate app. NULL for direct bookings.';
comment on column public.reservations.affiliate_coupon_code is
  'Cast affiliate coupon code when a QR coupon drove the booking. NULL otherwise.';

-- Partial index — the settlement webhook and any affiliate reporting
-- filter to "reservations that carry an affiliate attribution".
create index if not exists reservations_affiliate_link_idx
  on public.reservations (affiliate_link_slug)
  where affiliate_link_slug is not null;
