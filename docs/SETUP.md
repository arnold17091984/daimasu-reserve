# DAIMASU Reservation System — Owner Setup Checklist

This is the one-time setup the **owner** performs to bring the system online.
Roughly 60–90 minutes of clicking through dashboards. After this, every push
to `main` deploys automatically.

---

## 0. Domain (one-time, ~15 min)

- [ ] DNS provider for `daimasu.com.ph` → add **A record**:
      `reserve.daimasu.com.ph` → `<Vultr VPS IP>`
- [ ] Wait until `dig +short reserve.daimasu.com.ph` returns the Vultr IP
      (≤ 30 min usually).

---

## 1. Vultr VPS (~10 min)

- [ ] Create instance on https://my.vultr.com
      - Cloud Compute · **Regular Performance** (or High-Frequency for snappier)
      - 1 vCPU / 2 GB RAM is enough for an 8-seat counter (peak ≪ 10 RPS)
      - Region: **Tokyo** (closest to Manila with stable peering)
      - OS: **Ubuntu 24.04 LTS**
      - Add your SSH public key during creation
- [ ] Note the public IPv4. Add the DNS A record above.
- [ ] SSH in: `ssh root@<IP>`
- [ ] Run bootstrap:
      ```bash
      curl -fsSL https://raw.githubusercontent.com/kjh960120-dev/daimasu-projection-mapping/main/deploy/vultr-bootstrap.sh | bash
      ```
      This installs Docker + Caddy + UFW + creates the `deploy` user.

---

## 2. Supabase project (~15 min)

- [ ] https://app.supabase.com → **New project**
      - Name: `daimasu-bar`
      - Region: **Singapore** (closest to PH)
      - Database password: save in 1Password
- [ ] Once project is up:
      - Settings → API → copy `URL`, `anon key`, `service_role key`
      - SQL Editor → run each file in `supabase/migrations/` in order
        (0001 → 0008). Or `pnpm supabase db push` once linked.
- [ ] Settings → Authentication → enable **Magic link** provider
- [ ] SQL Editor → seed your owner email:
      ```sql
      insert into public.admin_owners (email, display_name)
      values ('owner@daimasu.com.ph', 'DAIMASU Owner');
      ```
- [ ] (Optional) Enable `pg_cron` HTTP calls — see `supabase/migrations/0008_cron.sql`
      and uncomment after seeding `private.cron_settings`.

---

## 3. Stripe (~10 min)

- [ ] https://dashboard.stripe.com → **register PH legal entity**
      (charges in PHP require a PH-registered Stripe account)
- [ ] Developers → API keys → copy `sk_test_…` and `pk_test_…`
- [ ] Developers → Webhooks → **+ Add endpoint**
      - URL: `https://reserve.daimasu.com.ph/api/webhooks/stripe`
      - Events: `checkout.session.completed`, `charge.refunded`,
        `payment_intent.payment_failed`
      - Copy the signing secret (`whsec_…`)
- [ ] Settings → Payment methods → enable **Card** (and **GCash** if available
      in your region; otherwise we'll evaluate PayMongo in Phase 1)

---

## 4. Resend (~5 min)

- [ ] https://resend.com → API Keys → new key
- [ ] Domains → add `reserve.daimasu.com.ph`
      - Add the SPF / DKIM / DMARC TXT records to `daimasu.com.ph` DNS
      - Verify; takes ≤ 24h

---

## 5. Twilio WhatsApp (~10 min, optional Phase 2)

Skip if you're OK with email-only reminders for the MVP.

- [ ] https://console.twilio.com → register WhatsApp Business sender
      (sandbox is free for testing)
- [ ] Copy `Account SID` and `Auth Token`

---

## 6. GitHub repo secrets (~5 min)

In `kjh960120-dev/daimasu-projection-mapping` → Settings → Secrets and
variables → Actions:

- [ ] `VULTR_HOST` — VPS IP
- [ ] `VULTR_USER` — `deploy`
- [ ] `VULTR_SSH_KEY` — private key for the `deploy` user
- [ ] `VULTR_PORT` — `22` (or custom)
- [ ] `GHCR_PULL_TOKEN` — a personal access token with `read:packages` scope

---

## 7. Production env file (~5 min)

On your local machine, copy `.env.example` → `.env.production`, fill in
real values for all keys. Then:

```bash
scp .env.production deploy@<IP>:/opt/daimasu/.env.production
scp docker-compose.yml deploy@<IP>:/opt/daimasu/docker-compose.yml
scp deploy/Caddyfile  deploy@<IP>:/opt/daimasu/Caddyfile
```

---

## 8. First deploy

Push to `main` (or trigger workflow_dispatch). GitHub Actions will:

1. Run `tsc --noEmit` and `lint`
2. Build the Docker image and push to `ghcr.io`
3. SSH into the VPS and `docker compose pull && up -d`

Verify:
- [ ] `https://reserve.daimasu.com.ph/` shows the landing page
- [ ] `https://reserve.daimasu.com.ph/api/health` returns `{"ok":true}`
- [ ] `https://reserve.daimasu.com.ph/admin` redirects to magic-link login

---

## Going-live checklist (Phase 4)

- [ ] Switch Stripe keys from test → live
- [ ] Verify Resend domain (DKIM passes)
- [ ] First end-to-end live booking with the owner's own card
- [ ] Refund test (cancel within 48h, verify Stripe shows refund)
- [ ] Reminder cron test (manually call the Edge Function)
- [ ] Add owner phone to a Slack/Telegram channel for production alerts
- [ ] Monitor `/api/health` from UptimeRobot (free tier)

---

## Cost (monthly)

| Service | Tier | $ |
|---|---|---|
| Vultr VPS | 1 vCPU / 2 GB | ~$12 |
| Supabase | Free → Pro at scale | $0–$25 |
| Stripe | per-transaction 3.4% + ¥30 | usage-based |
| Resend | 3,000 emails/mo free | $0–$20 |
| Twilio WhatsApp | $0.005/msg | ~$5 |
| **Total fixed** | | **~$15–60/mo** |

---

Questions? Open an issue on the repo or ask Mr.fu.
