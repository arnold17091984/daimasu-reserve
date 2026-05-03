"use client";

import { useState } from "react";
import { Mail, Loader2, Lock, KeyRound } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

type View = "login" | "forgot" | "forgot_sent";
type Status = "idle" | "submitting" | "error";

export function LoginForm() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function client() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    );
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const sb = client();
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      // Server-side admin check is enforced by /admin layout — if email is
      // not in admin_owners the page redirects back to /admin/login.
      window.location.href = "/admin";
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const sb = client();
      const { error } = await sb.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          // Lands on /admin/auth/callback with ?type=recovery → callback
          // verifies and redirects to /admin/auth/reset-password where the
          // user enters a new password.
          redirectTo: `${window.location.origin}/admin/auth/callback?next=/admin/auth/reset-password`,
        }
      );
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      setView("forgot_sent");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  if (view === "forgot_sent") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Mail size={40} className="text-gold" aria-hidden="true" />
        <p className="font-[family-name:var(--font-noto-serif)] text-lg text-foreground">
          Check your email
        </p>
        <p className="admin-body leading-relaxed text-text-secondary">
          We sent a password-reset link to{" "}
          <span className="text-gold">{email}</span>.
          <br />
          The link expires in 1 hour.
        </p>
        <button
          type="button"
          onClick={() => {
            setView("login");
            setErrorMsg(null);
          }}
          className="mt-2 text-xs uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-foreground"
        >
          ← Back to sign-in
        </button>
      </div>
    );
  }

  if (view === "forgot") {
    return (
      <form onSubmit={handleForgot} className="flex flex-col gap-4">
        <p className="admin-body text-text-secondary">
          Enter your email and we&apos;ll send you a one-time link to set a new
          password.
        </p>
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
          disabled={status === "submitting"}
          className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em] disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              Sending...
            </>
          ) : (
            <>
              <KeyRound size={16} aria-hidden="true" />
              Send reset link
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setView("login");
            setErrorMsg(null);
          }}
          className="mx-auto text-xs uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-foreground"
        >
          ← Back to sign-in
        </button>

        {status === "error" && (
          <p className="admin-caption text-red-400">
            {errorMsg ?? "Something went wrong."}
          </p>
        )}
      </form>
    );
  }

  // view === "login"
  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
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

      <label className="admin-section-label flex flex-col gap-2">
        Password
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          minLength={8}
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
            Signing in...
          </>
        ) : (
          <>
            <Lock size={16} aria-hidden="true" />
            Sign in
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          setView("forgot");
          setErrorMsg(null);
        }}
        className="mx-auto text-xs uppercase tracking-[0.18em] text-text-secondary transition-colors hover:text-foreground"
      >
        Forgot password?
      </button>

      {status === "error" && (
        <p className="admin-caption text-red-400">
          {errorMsg ?? "Invalid email or password."}
        </p>
      )}
    </form>
  );
}
