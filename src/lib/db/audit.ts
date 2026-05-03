/**
 * Thin wrapper around `audit_log.insert` that surfaces failures via console
 * instead of swallowing them.
 *
 * E2E test 2026-05-02 found that the codebase has ~13 audit_log inserts
 * and none of them check the returned `error`. The table happened to be
 * empty for an unrelated reason (Stripe webhook never fired in prod, no
 * admin actions yet), but the silent-failure mode itself is a hazard:
 * if RLS/FK/disk-full caused inserts to fail, no operator would notice.
 *
 * Usage (drop-in replacement for `await sb.from("audit_log").insert(p)`):
 *
 *   await auditInsert(sb, { actor: "system", action: "...", ... });
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type SbClient = SupabaseClient;

export interface AuditPayload {
  actor: string;
  action: string;
  reservation_id?: string | null;
  actor_ip?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  reason?: string | null;
}

export async function auditInsert(
  sb: SbClient,
  payload: AuditPayload
): Promise<void> {
  const { error } = await sb.from("audit_log").insert(payload as never);
  if (error) {
    console.error("[audit_log] insert failed", {
      action: payload.action,
      reservation_id: payload.reservation_id ?? null,
      code: error.code,
      message: error.message,
    });
  }
}
