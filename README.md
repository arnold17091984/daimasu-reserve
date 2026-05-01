# DAIMASU 大桝 BAR — Reservation + Revenue System

8 席カウンターで運営する大桝バーの **公式予約サイト + 予約管理 + 売上管理システム**。
マカティ(フィリピン)の 90 分プロジェクションマッピング懐石コースを案内し、
オンライン予約 (50% デポジット) と店舗運営を一括管理します。

- 8 コース · ₱8,000 · 17:30 / 20:00 2 回転 · 8 席限定
- 50% デポジット (Stripe) + 残金は当日現地払い
- 段階キャンセル料: 48h+ 100% / 24h+ 50% / 以降 0%
- 自動リマインダ (24h 前 + 2h 前) — メール + WhatsApp
- 言語: 日本語 / English
- ダーク基調 (大桝ブランド) ・モバイル / デスクトップ両対応

## アーキテクチャ

```
reserve.daimasu.com.ph (Vultr) ──── Next.js 16 (standalone)
                            ├── Caddy 2 reverse proxy + Let's Encrypt
                            ├── Supabase (Postgres + Auth + RLS + pg_cron)
                            ├── Stripe (PHP charges + refunds + webhooks)
                            ├── Resend (transactional email)
                            ├── Twilio (WhatsApp Business reminders)
                            └── Telegram (フォールバック通知)
```

詳細: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (データフロー + 脅威モデル)
セットアップ: [`docs/SETUP.md`](docs/SETUP.md) (オーナー初期設定 60-90 分)

## Tech Stack

| Layer | Tech |
|---|---|
| **App** | Next.js 16 App Router (`output: "standalone"`), React 19, TypeScript strict |
| **Style** | Tailwind v4, Framer Motion, lucide-react |
| **Forms / dates** | react-day-picker 9, zod |
| **DB** | Supabase Postgres (RLS, pg_cron, atomic capacity via `SELECT FOR UPDATE`) |
| **Payments** | Stripe (idempotency_key を全 charge / refund に必須付与) |
| **Email / WA** | Resend, Twilio (任意) |
| **Self-cancel** | jose (JWS HS256) — DB には hash のみ保存 |
| **Tests** | Vitest (unit) — 29 tests, refund tier / capacity / token security 全 pass |
| **Deploy** | Docker → ghcr.io → ssh deploy to Vultr (GitHub Actions) |

## Local Development

```bash
pnpm install
cp .env.example .env.local      # fill in real Supabase / Stripe / Resend keys
pnpm dev                        # http://localhost:3000
pnpm test                       # 29 unit tests
pnpm build                      # standalone build (.next/standalone/)
pnpm lint                       # eslint
pnpm tsc --noEmit               # typecheck
```

`docs/SETUP.md` の Step 2 (Supabase migrations) を実行すると `pnpm dev` がフル機能で動きます。

## Routes (Phase 1+ 実装済み)

```
公開
├ /                              ランディングページ + 予約フォーム
├ /reservation/confirm           Stripe Checkout 成功後リダイレクト先
├ /reservation/abandoned         Stripe キャンセル後リダイレクト先
└ /cancel?token=…                self-cancel UI (preview → execute)

オーナー専用 (Supabase Auth magic-link + admin_owners allowlist + RLS)
├ /admin                         ダッシュボード (月次売上 vs 目標, 当日リスト, 7日トレンド)
├ /admin/reservations            予約一覧 (filter: upcoming/today/past/all)
├ /admin/reservations/[id]       予約詳細 + 支払台帳 + 監査ログ + settle/no-show
└ /admin/settings                テナント設定 (容量, 価格, ポリシー, 通知チャネル)

API
├ POST /api/reservations         atomic capacity + Stripe Checkout 50% deposit 作成
├ POST /api/reservations/cancel  preview/execute, 段階 refund (idempotent)
├ POST /api/webhooks/stripe      署名検証 + payments.insert + status 更新 (idempotent)
├ POST /api/cron/reminders       24h / 2h 前リマインド (Bearer guard)
├ POST /api/cron/mark-no-show    当日終了後の no-show 自動マーク
├ POST /api/cron/reap-pending    Stripe Checkout 期限切れの席解放
├ POST /api/admin/reservations/[id]/settle         on-site 決済記録
├ POST /api/admin/reservations/[id]/mark-no-show   manual no-show
├ POST /api/admin/settings       owner-only テナント設定更新
├ GET  /admin/auth/callback      magic-link 検証 + session cookie
└ GET  /api/health               Caddy / UptimeRobot 用
```

## Key Risk Mitigations

| リスク | 対策 (実装場所) |
|---|---|
| 8 席 race condition (同時最後の席) | `assert_capacity_or_throw` (SQL 関数で `SELECT FOR UPDATE`) |
| Stripe webhook 二重発火 → double charge | `payments.idempotency_key` UNIQUE + status guard |
| Self-cancel URL trust (本人以外) | jose JWS + DB は hash のみ + 短命 expiry + 確認時に再ローテート |
| PH NPC 個人情報保護 | RLS deny anon + 最小 PII (name/phone/email) + audit_log 5 年保持 |
| 不正 / フロード予約 | Stripe deposit (50%) + honeypot field + email + phone |
| no-show による損失 | 50% デポジット保留 + 自動 mark-no-show + ダッシュボード可視化 |
| キャンセル料の自動執行 | `refundTier` を `service_starts_at` から再計算 (clock-skew 耐性) |

## Project Structure

```
src/
├── app/                              Next.js App Router
│   ├── page.tsx                      ランディングページ
│   ├── layout.tsx                    フォント・メタデータ
│   ├── globals.css                   Tailwind + DayPicker テーマ
│   ├── reservation/{confirm,abandoned}/page.tsx
│   ├── cancel/{page,cancel-client}.tsx
│   ├── admin/
│   │   ├── layout.tsx                サイドバー shell
│   │   ├── login/{page,login-form}.tsx        magic-link
│   │   ├── auth/callback/route.ts             code → session
│   │   ├── logout/route.ts
│   │   ├── page.tsx                  ダッシュボード
│   │   ├── reservations/page.tsx     一覧
│   │   ├── reservations/[id]/{page,settle-form,no-show-button}.tsx
│   │   └── settings/{page,settings-form}.tsx
│   └── api/
│       ├── health/route.ts
│       ├── reservations/route.ts
│       ├── reservations/cancel/route.ts
│       ├── webhooks/stripe/route.ts
│       ├── cron/{reminders,mark-no-show,reap-pending}/route.ts
│       └── admin/{settings,reservations/[id]/{settle,mark-no-show}}/route.ts
├── components/
│   ├── ReservationForm.tsx           Stripe Checkout 連動 (Phase 1 で再配線)
│   ├── Hero / About / Experience / Gallery / MenuSection / Info / Footer / Header / StickyMobileCTA
└── lib/
    ├── env.ts                        zod-validated env (server-only enforced)
    ├── auth/admin.ts                 getAdmin / requireAdminOrRedirect
    ├── db/{clients,types,database.types}.ts
    ├── domain/{reservation,schemas}.ts        pure functions + zod
    ├── notifications/{email,whatsapp,telegram,templates}.ts
    ├── security/{cancel-token,cron-auth}.ts
    └── stripe/client.ts                Stripe SDK singleton

supabase/migrations/0001-0008.sql      schema + RLS + capacity fn + cron stubs
docs/{SETUP,ARCHITECTURE}.md
deploy/{Caddyfile,vultr-bootstrap.sh}
docker-compose.yml + Dockerfile + .github/workflows/deploy.yml
```

## Test Coverage

```bash
pnpm test
```

| Suite | What it verifies |
|---|---|
| `tests/domain/reservation.test.ts` | refund tier 境界 (48 / 24 hours), 返金額計算, deposit+balance==total, capacity-blocking status, Manila TZ wall-clock |
| `tests/security/cancel-token.test.ts` | issue ↔ verify roundtrip, hash matching, tampering detection, expiry enforcement, distinct rids → distinct tokens, zod input validators |

29 / 29 pass.

## Deployment

```bash
git push origin main      # GitHub Actions: test → docker build → push GHCR → ssh deploy
```

詳細: [`docs/SETUP.md`](docs/SETUP.md)

## License / Contact

Internal project. Issues: kjh960120-dev/daimasu-projection-mapping
