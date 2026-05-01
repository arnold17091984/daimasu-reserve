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

  // Stripe (PH legal entity recommended for PHP charges)
  STRIPE_SECRET_KEY: z.string().min(10),
  STRIPE_WEBHOOK_SECRET: z.string().min(10),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(10),

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
} as const;
