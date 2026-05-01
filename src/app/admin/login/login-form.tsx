"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
      );
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
        },
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
      } else {
        setStatus("sent");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Mail size={40} className="text-gold" aria-hidden="true" />
        <p className="font-[family-name:var(--font-noto-serif)] text-lg text-foreground">
          Check your email
        </p>
        <p className="admin-body leading-relaxed text-text-secondary">
          We sent a sign-in link to <span className="text-gold">{email}</span>.
          <br />
          The link expires in 1 hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="admin-section-label flex flex-col gap-2">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@daimasu.com.ph"
          className="w-full border border-border bg-background px-4 py-3 text-base normal-case tracking-normal text-foreground placeholder:text-text-muted/70 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
        />
      </label>

      <button
        type="submit"
        disabled={status === "sending"}
        className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em] disabled:opacity-60"
      >
        {status === "sending" ? (
          <>
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            Sending...
          </>
        ) : (
          <>
            <Mail size={16} aria-hidden="true" />
            Email me a sign-in link
          </>
        )}
      </button>

      {status === "error" && (
        <p className="admin-caption text-red-400">{errorMsg ?? "Something went wrong."}</p>
      )}
    </form>
  );
}
