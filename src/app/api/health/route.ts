/**
 * GET /api/health — Docker healthcheck + UptimeRobot probe.
 *
 * Returns DB-reachability so the container is restarted if Supabase is down.
 * Cheap call: SELECT 1 with a 2 s budget.
 */
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/db/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const sb = adminClient();
    const { error } = await sb
      .from("restaurant_settings")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(2_000));

    if (error) {
      return NextResponse.json(
        { ok: false, db: "error", reason: error.message, latency_ms: Date.now() - started },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, db: "ok", latency_ms: Date.now() - started });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        reason: err instanceof Error ? err.message : "unknown",
        latency_ms: Date.now() - started,
      },
      { status: 503 }
    );
  }
}
