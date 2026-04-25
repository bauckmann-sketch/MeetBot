import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16: proxy.ts (přejmenováno z middleware.ts)
// Běží v Node.js runtime – může importovat @/auth i Supabase
export async function proxy(req: NextRequest) {
  const session = await auth();
  const { nextUrl } = req;

  const isPublic = nextUrl.pathname.startsWith("/login");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isWebhook =
    nextUrl.pathname.startsWith("/api/recall") ||
    nextUrl.pathname.startsWith("/api/assembly");

  if (isApiAuth || isWebhook || isPublic) return NextResponse.next();

  if (!session) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
