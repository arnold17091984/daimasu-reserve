/**
 * /cancel?token=… — self-cancel preview + execute.
 *
 * Server component fetches token preview server-side (so unparseable tokens
 * fail fast). Confirm step delegates to the client component below.
 */
import { CancelClient } from "./cancel-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function CancelPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-xl px-6 py-32 text-center">
          <h1 className="mb-3 font-[family-name:var(--font-noto-serif)] text-2xl text-foreground">
            キャンセルリンクが無効です / Invalid cancel link
          </h1>
          <p className="text-sm text-text-secondary">
            メール内のリンクからアクセスしてください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-24 sm:py-32">
        <CancelClient token={token} />
      </div>
    </main>
  );
}
