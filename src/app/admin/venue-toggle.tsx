"use client";

import { useRouter } from "next/navigation";
import { Building2, GlassWater } from "lucide-react";
import type { AdminVenue } from "@/lib/auth/admin-venue";

/**
 * Venue selector shown in the admin sidebar. Operator flips between Bar
 * and Restaurant; the cookie persists for a year so a single tablet
 * stays on one venue between sessions. router.refresh() picks up the
 * new cookie via the next server render without losing the SPA runtime.
 */
export function VenueToggle({ current }: { current: AdminVenue }) {
  const router = useRouter();

  function flip() {
    const next: AdminVenue = current === "bar" ? "restaurant" : "bar";
    document.cookie = `daimasu_admin_venue=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  const Icon = current === "bar" ? GlassWater : Building2;
  const label = current === "bar" ? "BAR" : "RESTO";

  return (
    <button
      type="button"
      onClick={flip}
      className="flex items-center gap-2 text-text-secondary transition-colors hover:text-foreground"
      aria-label={
        current === "bar"
          ? "Switch to Restaurant venue"
          : "Switch to Bar venue"
      }
      title={
        current === "bar"
          ? "Currently editing Bar — click to switch to Restaurant"
          : "Currently editing Restaurant — click to switch to Bar"
      }
    >
      <Icon size={14} className="text-gold" />
      <span className="font-mono text-[12px] font-medium tracking-[0.16em]">
        {label}
      </span>
    </button>
  );
}
