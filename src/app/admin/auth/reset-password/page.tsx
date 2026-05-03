/**
 * /admin/auth/reset-password — landed-here-from-email page where the user
 * sets a new password.
 *
 * Flow:
 *   user enters email at /admin/login → "Forgot password?"
 *     → sb.auth.resetPasswordForEmail() → email
 *     → user clicks link → /admin/auth/callback?token_hash=...&type=recovery&next=/admin/auth/reset-password
 *     → callback verifyOtp() establishes a session and redirects here
 *     → user sets a new password via sb.auth.updateUser({password})
 *     → redirect to /admin
 *
 * Since the callback already established a session, this page just needs
 * to be a logged-in surface that can call updateUser. We render a small
 * client form below.
 */
import { ResetPasswordForm } from "./reset-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 sm:p-12">
        <div className="mb-8 text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-gold">
            DAIMASU
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] text-foreground">
            Set a new password
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Choose a password you&apos;ll use to sign in to the admin console.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
