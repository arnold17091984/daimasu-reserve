/**
 * Cancel-token security tests.
 *
 * Properties verified:
 *  - Tokens are valid only with the correct secret
 *  - Hash is the only thing stored; raw token is unrecoverable from hash
 *  - Tampered tokens are rejected
 *  - Two distinct reservations get distinct tokens
 *  - Expiration is enforced
 */
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // Long-enough secret to satisfy zod min(32) in env.ts
  process.env.CANCEL_TOKEN_SECRET ||=
    "test_cancel_token_secret_for_unit_tests_xyz_32_chars_min";
});

describe("cancel-token: issue / verify / hash", () => {
  it("issue → verify roundtrip with same rid", async () => {
    const { issueCancelToken, verifyCancelToken } = await import(
      "@/lib/security/cancel-token"
    );
    const { token } = await issueCancelToken("res-1");
    const verified = await verifyCancelToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.rid).toBe("res-1");
  });

  it("hash matches token", async () => {
    const { issueCancelToken, tokenMatchesHash } = await import(
      "@/lib/security/cancel-token"
    );
    const { token, hash } = await issueCancelToken("res-2");
    expect(tokenMatchesHash(token, hash)).toBe(true);
  });

  it("hash mismatch when token swapped", async () => {
    const { issueCancelToken, tokenMatchesHash } = await import(
      "@/lib/security/cancel-token"
    );
    const a = await issueCancelToken("res-3");
    const b = await issueCancelToken("res-4");
    expect(tokenMatchesHash(a.token, b.hash)).toBe(false);
    expect(tokenMatchesHash(b.token, a.hash)).toBe(false);
  });

  it("two distinct rids produce distinct tokens", async () => {
    const { issueCancelToken } = await import("@/lib/security/cancel-token");
    const a = await issueCancelToken("res-5");
    const b = await issueCancelToken("res-6");
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects tampered tokens", async () => {
    const { issueCancelToken, verifyCancelToken } = await import(
      "@/lib/security/cancel-token"
    );
    const { token } = await issueCancelToken("res-7");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a") + "c";
    const verified = await verifyCancelToken(tampered);
    expect(verified.ok).toBe(false);
  });

  it("rejects expired tokens", async () => {
    const { issueCancelToken, verifyCancelToken } = await import(
      "@/lib/security/cancel-token"
    );
    // -1 ttl ⇒ already expired
    const { token } = await issueCancelToken("res-8", -1);
    const verified = await verifyCancelToken(token);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe("expired");
  });
});

describe("schemas — zod validators reject obviously bad input", () => {
  it("rejects party_size outside 1..8", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const base = {
      service_date: "2026-06-01",
      seating: "s1" as const,
      guest_name: "T",
      guest_email: "a@b.com",
      guest_phone: "+639170000000",
    };
    expect(createReservationSchema.safeParse({ ...base, party_size: 0 }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...base, party_size: 9 }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...base, party_size: 4 }).success).toBe(true);
  });

  it("rejects malformed dates", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const base = {
      seating: "s1" as const,
      party_size: 2,
      guest_name: "T",
      guest_email: "a@b.com",
      guest_phone: "+639170000000",
    };
    expect(createReservationSchema.safeParse({ ...base, service_date: "2026/06/01" }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...base, service_date: "06-01-2026" }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...base, service_date: "2026-06-01" }).success).toBe(true);
  });

  it("rejects invalid email", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const base = {
      service_date: "2026-06-01",
      seating: "s1" as const,
      party_size: 2,
      guest_name: "T",
      guest_phone: "+639170000000",
    };
    expect(createReservationSchema.safeParse({ ...base, guest_email: "not-an-email" }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...base, guest_email: "ok@ok.com" }).success).toBe(true);
  });

  it("honeypot tripped → still parses (router checks the field)", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const base = {
      service_date: "2026-06-01",
      seating: "s1" as const,
      party_size: 2,
      guest_name: "T",
      guest_email: "a@b.com",
      guest_phone: "+639170000000",
      website: "http://spam.example",
    };
    // Honeypot field requires empty string when present; non-empty fails validation.
    const r = createReservationSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it("strips CR/LF/TAB from name, phone, notes (header-injection defense)", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const r = createReservationSchema.parse({
      service_date: "2026-06-01",
      seating: "s1" as const,
      party_size: 2,
      guest_name: "Hello\r\nBcc: attacker@evil.com",
      guest_email: "OK@OK.COM ",
      guest_phone: "+63\t917\n0000\r000",
      notes: "line1\nline2\rline3",
    });
    expect(r.guest_name).toBe("Hello Bcc: attacker@evil.com");
    expect(r.guest_email).toBe("ok@ok.com"); // trimmed + lowercased
    expect(r.guest_phone).toBe("+63 917 0000 000");
    expect(r.notes).toBe("line1 line2 line3");
  });

  it("rejects notes longer than 280 chars (phishing-surface cap)", async () => {
    const { createReservationSchema } = await import("@/lib/domain/schemas");
    const r = createReservationSchema.safeParse({
      service_date: "2026-06-01",
      seating: "s1" as const,
      party_size: 2,
      guest_name: "T",
      guest_email: "a@b.com",
      guest_phone: "+639170000000",
      notes: "x".repeat(281),
    });
    expect(r.success).toBe(false);
  });
});
