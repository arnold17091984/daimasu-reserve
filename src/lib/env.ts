/**
 * Centralized env access with zod validation.
 *
 * Anti-pattern dodged: scattering `process.env.X || ""` everywhere.
 * Single failure mode: missing/invalid env -> server boot fails fast (clear stderr).
 */
import { z } from "zod";

const schema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Stripe (PH legal entity recommended for PHP charges).
  // Optional: when RESERVATIONS_DEPOSIT_REQUIRED=false the deposit flow is
  // disabled and these are unused. We still type them so existing keys
  // remain valid; missing values are accepted.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Master switch for the deposit / Stripe flow.
  // - "true" (default): legacy flow — POST /api/reservations creates a Stripe
  //   Checkout session, status starts as `pending_payment`, the webhook flips
  //   to `confirmed` on payment success.
  // - "false": deposit-free flow — reservations are inserted with status
  //   `confirmed` directly, the confirmation email and admin Telegram ping
  //   fire from the API handler, no Stripe calls anywhere. Use this where
  //   Stripe is unavailable (Philippines acquiring etc.).
  RESERVATIONS_DEPOSIT_REQUIRED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Public mirror of RESERVATIONS_DEPOSIT_REQUIRED for client-side UI hints
  // (deposit notice, CTA copy). The actual booking flow is decided server-
  // side; this only changes presentation. Keep these two in sync.
  NEXT_PUBLIC_RESERVATIONS_DEPOSIT_REQUIRED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Resend (transactional email)
  RESEND_API_KEY: z.string().min(10),

  // Twilio (WhatsApp Business reminders)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),

  // Self-cancel HMAC + admin session secret
  CANCEL_TOKEN_SECRET: z.string().min(32),

  // Shared secret for /api/cron/* — only Supabase pg_cron / curl with this
  // bearer token may invoke. Generate: openssl rand -base64 48
  CRON_SHARED_SECRET: z.string().min(32),

  // Public site URL (used in email templates + Stripe redirect)
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://reserve.daimasu.com.ph"),

  // Restaurant timezone — overridable; default Asia/Manila
  RESTAURANT_TIMEZONE: z.string().default("Asia/Manila"),

  // Telegram fallback (existing flow). Settings-table values override at runtime.
  TELEGRAM_BOT_TOKEN_FALLBACK: z.string().optional(),
  TELEGRAM_CHAT_ID_FALLBACK: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

/**
 * Validate-once-on-import. We DO NOT throw at module-load if process.env is empty
 * (Next.js may import this on the client where most vars are absent). Instead the
 * server-only callers below throw lazily.
 */
let cached: Env | null = null;

function read(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Server-only env access. Throws if any required key is missing. */
export function serverEnv(): Env {
  return read();
}

/**
 * Public env subset safe to expose to the client. Never includes secrets.
 * Use this from "use client" components.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://reserve.daimasu.com.ph",
  // Client-side UI hint only — actual booking flow is decided server-side.
  // Defaults to true so unset envs preserve the legacy presentation.
  depositRequired:
    (process.env.NEXT_PUBLIC_RESERVATIONS_DEPOSIT_REQUIRED ?? "true") !== "false",
} as const;

/**
 * Server-only convenience: is the deposit / Stripe path active?
 * Defaults to true so existing deployments don't change behaviour.
 */
export function isDepositRequired(): boolean {
  return read().RESERVATIONS_DEPOSIT_REQUIRED;
}
