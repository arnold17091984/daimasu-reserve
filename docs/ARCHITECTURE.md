# DAIMASU Reservation System — Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         reserve.daimasu.com.ph (Vultr)                          │
│                                                                             │
│   ┌─────────────┐         ┌──────────────────────────────────┐              │
│   │   Caddy 2   │ ──HTTPS─▶  Next.js 16 (standalone server)   │              │
│   │ TLS + HSTS  │         │  · /            landing page      │              │
│   └─────────────┘         │  · /book        reservation flow  │              │
│         ▲                 │  · /admin       owner dashboard   │              │
│         │ 443             │  · /api/*       route handlers    │              │
│         │                 └──────────────────────────────────┘              │
└─────────┼───────────────────────────────┬─────────────────────────────────┘
          │                               │
          │                               ▼
   ┌──────┴──────┐               ┌────────────────────┐
   │  Customer   │               │   Supabase (PG)    │ ◀──┐
   │  / Owner    │               │  - reservations    │    │
   │   browser   │               │  - payments        │    │ pg_cron
   └─────────────┘               │  - audit_log       │    │ + Edge
                                 │  - settings        │    │ Functions
                                 └────────────────────┘    │ (reminders,
                                          ▲                │  no-show
                                          │                │  marker)
                                          ▼                │
                                 ┌────────────────────┐    │
                                 │   Stripe (PHP)     │ ───┘
                                 │  - Checkout        │
                                 │  - Webhook         │
                                 │  - Refunds         │
                                 └────────────────────┘
                                          ▲
                                          │  email           ┌────────────┐
                                          │  + WhatsApp      │  Resend    │
                                          │  + Telegram      │  Twilio    │
                                          │                  │  Telegram  │
                                          └──────────────────┴────────────┘
```

## Data flow — happy path booking

1. Guest opens `/book` → fills form → submit
2. Next.js API `/api/reservations` (server route handler):
   - validates payload (zod)
   - opens Supabase txn:
     - calls `assert_capacity_or_throw(date, seating, party_size)`
       → `SELECT FOR UPDATE` locks the slot. Either succeeds or throws
         `P0001 closed` / `P0002 capacity_exceeded`
     - INSERTs reservation with status `pending_payment`
     - issues HMAC self-cancel token, stores `cancel_token_hash`
   - creates Stripe Checkout session for the deposit (50%) with metadata
     `{ reservation_id }` and `idempotency_key = res:<id>:checkout`
   - returns `{ checkoutUrl, reservationId }`
3. Browser redirects to Stripe. Customer pays.
4. Stripe redirects back to `/reservation/confirm?session_id=…`
5. **Source of truth**: Stripe Webhook hits `/api/webhooks/stripe`:
   - verifies signature
   - on `checkout.session.completed` → marks reservation `confirmed`,
     INSERTs `payments` row (kind=`deposit_capture`, idempotency_key=stripe
     event id) — UNIQUE on idempotency_key absorbs duplicates
   - sends confirm email via Resend + Telegram fallback notify
6. Confirm page renders the reservation summary + the cancel URL

## Data flow — cancellation

1. Guest clicks cancel link from email → `/cancel/[token]`
2. Server:
   - `verifyCancelToken(token)` (jose JWS verify)
   - `tokenMatchesHash(token, reservation.cancel_token_hash)`
   - computes `refundTier(hours_remaining, settings)` → full / partial / late
   - if refund > 0: `stripe.refunds.create({ idempotency_key: res:<id>:refund:v1 })`
   - INSERT `payments` row (kind=`refund_*`, negative amount)
   - UPDATE reservation status → `cancelled_*`
   - sends cancellation email
3. If anything fails partway: Postgres txn rolls back the reservation status
   change, but Stripe refund may have already been issued. The `payments`
   table reconciles via Stripe's webhook `charge.refunded`.

## Data flow — reminders + no-show

```
pg_cron every 10 min  → Edge Function /reminders/long
    SELECT confirmed reservations
    WHERE service_starts_at - now() < 24h
      AND service_starts_at - now() >= 23h
      AND reminder_long_sent_at IS NULL
    For each: send email + WA → set reminder_long_sent_at

pg_cron every 5 min   → Edge Function /reminders/short  (similar, 2h window)

pg_cron 02:00 Manila  → Edge Function /cron/mark-no-show
    UPDATE reservations
       SET status = 'no_show'
     WHERE status = 'confirmed'
       AND service_starts_at < now() - 4h
       AND settled_at IS NULL
```

## Money-flow guarantees

- **No double-charge**: Stripe `idempotency_key` per reservation per kind.
  Database `payments.idempotency_key UNIQUE` absorbs Stripe webhook redelivery.
- **No refund without basis**: refund tier computed inside the API handler
  from immutable reservation `service_starts_at` + settings policy fields.
  Override only via `kind=manual_adjustment` which is logged in `audit_log`.
- **No silent settlement**: settlement requires staff action via /admin
  (Phase 2). Until set, the reservation shows the deposit as the only
  received money — surfaces in the dashboard as an exception.

## Schema entry points (read more)

- `supabase/migrations/0002_settings.sql` — single-row tenant config
- `supabase/migrations/0003_reservations.sql` — booking + capacity function
- `supabase/migrations/0004_payments.sql` — money ledger + view
- `supabase/migrations/0005_audit.sql` — append-only state-change log
- `supabase/migrations/0006_owners_rls.sql` — RLS + owner allowlist
- `supabase/migrations/0007_revenue_views.sql` — dashboard rollups
- `supabase/migrations/0008_cron.sql` — pg_cron schedules

## Code entry points

- `src/lib/env.ts` — zod-validated env
- `src/lib/db/clients.ts` — service-role + cookie-bound Supabase clients
- `src/lib/db/types.ts` — TS types mirroring schema
- `src/lib/domain/reservation.ts` — pure domain logic (refund tier, capacity)
- `src/lib/security/cancel-token.ts` — HMAC self-cancel token
- `src/lib/stripe/client.ts` — Stripe SDK singleton
- `src/lib/notifications/{email,whatsapp,telegram}.ts` — channels

## Threat model — top 5

| # | Threat | Defense |
|---|---|---|
| T1 | Capacity race (8 seats, 2 simultaneous bookings of last seat) | Postgres `SELECT FOR UPDATE` inside `assert_capacity_or_throw` |
| T2 | Stripe webhook duplicate → double charge or double refund | `idempotency_key` UNIQUE on `payments` |
| T3 | Self-cancel URL leak (forwarded email, screenshot) | JWT signature + 90-day TTL + hash check; one-shot rotation post-cancel |
| T4 | NPC PH personal data | RLS denies anon; minimum PII (name/phone/email); 5-year audit retention; deletion endpoint (Phase 3) |
| T5 | Spam / fraudulent bookings (counter blocking) | Stripe deposit (50%) requires real card; rate-limit `/api/reservations` per IP |

See `docs/SECURITY.md` for full STRIDE breakdown (Phase 3).
