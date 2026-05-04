"use client";

import { useState } from "react";
import { Loader2, Lock, Check } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);

    if (password !== confirm) {
      setStatus("error");
      setErrorMsg("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }

    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
      );
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      // Clear the recovery-session lock cookie (Codex 2026-05-04 H2 fix
      // companion). Best-effort — even if this call fails the cookie
      // expires in 15min, but the user would temporarily see /admin
      // bounce them back to /admin/login until then.
      try {
        await fetch("/admin/auth/reset-password/finish", { method: "POST" });
      } catch {
        // ignore — cookie expires on its own
      }
      setStatus("success");
      // Brief pause so user sees confirmation, then forward to admin.
      setTimeout(() => {
        window.location.href = "/admin";
      }, 800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Check size={40} className="text-gold" aria-hidden="true" />
        <p className="font-[family-name:var(--font-noto-serif)] text-lg text-foreground">
          Password updated
        </p>
        <p className="admin-body leading-relaxed text-text-secondary">
          Redirecting you to the admin console…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="admin-section-label flex flex-col gap-2">
        New password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder="••••••••"
          className="w-full border border-border bg-background px-4 py-3 text-base normal-case tracking-normal text-foreground placeholder:text-text-muted/70 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
        />
      </label>

      <label className="admin-section-label flex flex-col gap-2">
        Confirm password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          placeholder="••••••••"
          className="w-full border border-border bg-background px-4 py-3 text-base normal-case tracking-normal text-foreground placeholder:text-text-muted/70 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
        />
      </label>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em] disabled:opacity-60"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            Updating...
          </>
        ) : (
          <>
            <Lock size={16} aria-hidden="true" />
            Set password
          </>
        )}
      </button>

      {status === "error" && (
        <p className="admin-caption text-red-400">
          {errorMsg ?? "Could not update password."}
        </p>
      )}
    </form>
  );
}
