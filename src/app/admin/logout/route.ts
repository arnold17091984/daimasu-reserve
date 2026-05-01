import { NextResponse, type NextRequest } from "next/server";
import { authedServerClient } from "@/lib/db/clients";
import { publicUrl } from "@/lib/http/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 303 See Other so the browser converts the POST into a GET on /admin/login.
async function handle(req: NextRequest): Promise<NextResponse> {
  const sb = await authedServerClient();
  await sb.auth.signOut();
  return NextResponse.redirect(publicUrl(req, "/admin/login"), { status: 303 });
}

export const POST = handle;
export const GET = handle;
