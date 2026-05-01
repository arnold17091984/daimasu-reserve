import { LoginForm } from "./login-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
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
            We&apos;ll email you a one-tap sign-in link.
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
