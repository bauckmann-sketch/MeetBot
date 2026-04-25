import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lightweight auth check v proxy – používá pouze JWT cookie, žádný Supabase
export async function proxy(req: NextRequest) {
  const { nextUrl } = req;

  const isPublic = nextUrl.pathname.startsWith("/login");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isWebhook =
    nextUrl.pathname.startsWith("/api/recall") ||
    nextUrl.pathname.startsWith("/api/assembly");

  if (isApiAuth || isWebhook || isPublic) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
