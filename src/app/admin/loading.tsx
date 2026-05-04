/**
 * Admin loading skeleton — shown by Next.js during navigation between
 * server-rendered admin pages so the operator gets immediate visual
 * feedback when tapping a sidebar link, instead of staring at a blank
 * tab while the next page's Supabase queries run (~700-1000ms).
 *
 * 2026-05-04 perf fix: previously no loading.tsx existed and admin
 * navigation felt frozen on tablet between page transitions.
 */
export default function AdminLoading() {
  return (
    <div className="min-w-0 overflow-x-auto p-6 lg:p-8">
      <div className="space-y-4">
        {/* Title skeleton */}
        <div
          aria-hidden
          className="h-8 w-56 animate-pulse rounded bg-border/40"
        />
        {/* Body skeleton — three rows */}
        <div className="space-y-3 pt-4">
          <div aria-hidden className="h-12 w-full animate-pulse rounded bg-border/30" />
          <div aria-hidden className="h-12 w-full animate-pulse rounded bg-border/30" />
          <div aria-hidden className="h-12 w-full animate-pulse rounded bg-border/30" />
        </div>
      </div>
      <p className="sr-only" role="status">
        Loading…
      </p>
    </div>
  );
}
