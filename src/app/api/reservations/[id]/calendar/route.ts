/**
 * GET /api/reservations/[id]/calendar
 *
 * Returns an .ics file for a reservation so the guest can add it to
 * Google Calendar / Apple Calendar / Outlook with one tap. UX 2026-05-06
 * (N3 — Persona Japanese expat with quarterly bookings flagged the
 * missing calendar add).
 *
 * Public route — guarded by reservation id (UUID) which is non-guessable.
 * The page returning this link already established that the requester
 * has the rid.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { CONTACT } from "@/lib/constants";
import type { Reservation } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, error: "validation" },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { data: r } = await sb
    .from("reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Reservation>();
  if (
    !r ||
    r.status === "cancelled_full" ||
    r.status === "cancelled_partial" ||
    r.status === "cancelled_late"
  ) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }

  const startsAt = new Date(r.service_starts_at);
  // Course is ~90 min; close out at 100 min to give the kitchen + farewell
  // breathing room on the guest's calendar.
  const endsAt = new Date(startsAt.getTime() + 100 * 60_000);

  const lang = r.guest_lang;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DAIMASU//reservation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${r.id}@reserve.daimasu.com.ph`,
    `DTSTAMP:${ical(new Date())}`,
    `DTSTART:${ical(startsAt)}`,
    `DTEND:${ical(endsAt)}`,
    `SUMMARY:${escIcs(
      lang === "ja"
        ? "DAIMASU 大桝 BAR — 懐石ディナー"
        : "DAIMASU 大桝 BAR — Kaiseki dinner"
    )}`,
    `LOCATION:${escIcs(CONTACT.address.full[lang])}`,
    `DESCRIPTION:${escIcs(
      lang === "ja"
        ? `${r.party_size}名様のご予約。お問い合わせ: ${CONTACT.phone.mobile.label} / ${CONTACT.whatsapp.label} (WhatsApp)。地図: ${CONTACT.mapLinkUrl}`
        : `Reservation for ${r.party_size} guest${r.party_size > 1 ? "s" : ""}. Contact: ${CONTACT.phone.mobile.label} / ${CONTACT.whatsapp.label} (WhatsApp). Map: ${CONTACT.mapLinkUrl}`
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="daimasu-${r.service_date}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

function ical(d: Date): string {
  // RFC 5545 UTC form, no separators.
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escIcs(s: string): string {
  // Escape per RFC 5545 §3.3.11.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
