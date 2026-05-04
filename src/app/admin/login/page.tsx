import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth/admin";
import { LoginForm } from "./login-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  // If a valid admin session already exists (e.g. left over from a previous
  // browser tab), forward to /admin instead of showing the login form on top
  // of the sidebar — that mixed state confused the user 2026-05-04.
  const existing = await getAdmin();
  if (existing) {
    redirect("/admin");
  }

  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 sm:p-12">
        <div className="mb-8 text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-gold">
            DAIMASU
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] text-foreground">
            Owner Sign-In
          </h1>
          <p className="mt-2 admin-caption">
            Sign in with your email and password.
          </p>
        </div>
        {error && (
          <div className="mb-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <p className="font-medium">Sign-in failed</p>
            <p className="mt-1 break-words text-red-200/80">{error}</p>
          </div>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
