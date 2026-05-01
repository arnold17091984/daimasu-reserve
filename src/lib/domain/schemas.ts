/**
 * Public-facing input shapes. Validated at every API boundary.
 * Server-only (zod is heavy — keep the parser off the client bundle when possible).
 */
import { z } from "zod";

/** YYYY-MM-DD in local restaurant TZ (validated as a real date below). */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "Invalid date");

/**
 * Strip CR/LF/TAB before any other validation runs (audit fix C-1: prevents
 * SMTP/Telegram header injection downstream). Multiple whitespace runs collapse
 * to a single space so "Hello\r\nBcc:" doesn't yield "Hello  Bcc:".
 */
const cleanString = (raw: unknown) =>
  typeof raw === "string"
    ? raw.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim()
    : raw;

/** ITU-T E.164-ish: + then 7-19 digits/spaces/dashes. Cleaned first. */
const phone = z.preprocess(
  cleanString,
  z.string().min(7).max(30).regex(/^[+0-9 ()-]{7,30}$/, "Invalid phone")
);

/** RFC 5321 length cap; defer the full RFC 5322 dance to Resend. */
const email = z.preprocess(
  (raw) => (typeof raw === "string" ? raw.trim().toLowerCase() : raw),
  z.string().email().max(254)
);

export const createReservationSchema = z.object({
  service_date: dateString,
  seating: z.enum(["s1", "s2"]),
  party_size: z.number().int().min(1).max(8),
  guest_name: z.preprocess(
    cleanString,
    z.string().min(1).max(80)
  ),
  guest_email: email,
  guest_phone: phone,
  guest_lang: z.enum(["ja", "en"]).default("en"),
  // Cap to 280 chars (audit fix P2-2): owner reads notes in Telegram;
  // bigger surface = phishing risk.
  notes: z.preprocess(
    (raw) => (raw == null ? null : cleanString(raw)),
    z.string().max(280).nullable().optional()
  ),
  // Honeypot — the booking UI ships an always-hidden field. Bots fill it.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const cancelReservationSchema = z.object({
  token: z.string().min(20).max(2048),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

/** Date-availability query — used by the booking calendar to disable full slots. */
export const availabilityQuerySchema = z.object({
  from: dateString,
  to: dateString,
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** Celebration / surprise booking metadata. */
const cleanText = (max: number) =>
  z.preprocess(
    (raw) => (raw == null ? undefined : cleanString(raw)),
    z.string().max(max).optional()
  );
const cleanRequired = (max: number) =>
  z.preprocess(
    (raw) => (raw == null ? "" : cleanString(raw)),
    z.string().max(max).default("")
  );

export const celebrationSchema = z.object({
  occasion: z.enum([
    "none",
    "birthday",
    "anniversary",
    "proposal",
    "milestone_age",
    "business",
    "farewell",
    "other",
  ]),
  occasion_other: cleanText(80),
  is_surprise: z.boolean().default(false),
  celebrant: z.object({
    name: cleanRequired(80),
    relation: z
      .enum(["self", "spouse", "partner", "parent", "child", "friend", "colleague", "other"])
      .optional(),
    gender: z.enum(["m", "f", "x"]).optional(),
    age_label: cleanText(40),
  }),
  surprise: z
    .object({
      timing: z.enum(["arrival", "mid_course", "dessert", "farewell", "custom"]),
      timing_custom: cleanText(120),
      arrives_first: z.enum(["booker", "celebrant", "together"]),
      bringing_items: cleanText(280),
      coordination_phone: cleanText(30),
    })
    .optional(),
  deliverables: z
    .object({
      cake: z
        .object({
          size: cleanText(20),
          message: cleanText(140),
          dietary: cleanText(140),
        })
        .optional(),
      message_plate: z
        .object({ message: cleanRequired(140) })
        .optional(),
      flowers: z
        .object({
          budget_pesos: z.number().int().min(0).max(1_000_000).optional(),
          color: cleanText(40),
        })
        .optional(),
      champagne: z
        .object({ label: cleanText(80) })
        .optional(),
      projection: z
        .object({ content: cleanRequired(280) })
        .optional(),
      photo_service: z
        .object({ delivery_method: cleanText(40) })
        .optional(),
      bgm: cleanText(140),
    })
    .default({}),
  sns_ok: z.boolean().default(false),
  notes_celebration: cleanText(560),
});

export type CelebrationInput = z.infer<typeof celebrationSchema>;

/** Owner-side manual booking (phone / walk-in / staff). No deposit, status=confirmed. */
export const adminCreateReservationSchema = z.object({
  service_date: dateString,
  seating: z.enum(["s1", "s2"]),
  party_size: z.number().int().min(1).max(20),
  guest_name: z.preprocess(cleanString, z.string().min(1).max(80)),
  guest_email: z.preprocess(
    (raw) => (typeof raw === "string" ? raw.trim().toLowerCase() : raw),
    z.union([z.string().email().max(254), z.literal("")])
  ),
  guest_phone: phone,
  guest_lang: z.enum(["ja", "en"]).default("en"),
  notes: z.preprocess(
    (raw) => (raw == null ? null : cleanString(raw)),
    z.string().max(280).nullable().optional()
  ),
  source: z.enum(["staff", "phone", "walkin"]),
  // Cash deposit already collected at the bar?
  deposit_received: z.boolean().default(false),
  // Optional manually-picked seat numbers (1-indexed). When omitted/empty,
  // the server auto-allocates the rightmost contiguous block.
  seat_numbers: z
    .array(z.number().int().min(1).max(20))
    .max(20)
    .optional()
    .nullable(),
  // Optional structured celebration / surprise data. NULL = ordinary
  // booking (no occasion).
  celebration: celebrationSchema.optional().nullable(),
});

export type AdminCreateReservationInput = z.infer<
  typeof adminCreateReservationSchema
>;

/** Refund override — owner can cap or extend the auto-computed refund amount. */
export const refundOverrideSchema = z.object({
  amount_centavos: z.number().int().min(0).max(100_000_00),
  reason: z.preprocess(cleanString, z.string().min(3).max(280)),
});

export type RefundOverrideInput = z.infer<typeof refundOverrideSchema>;

/** Toggle / set / unset a closed date. */
export const closedDateSchema = z.object({
  closed_date: dateString,
  reason: z.preprocess(
    (raw) => (raw == null ? null : cleanString(raw)),
    z.string().max(140).nullable().optional()
  ),
});

export type ClosedDateInput = z.infer<typeof closedDateSchema>;
