import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimální Edge-compatible middleware.
 * Kontroluje POUZE přítomnost NextAuth session cookie – bez krypto operací.
 * Skutečná validace tokenu probíhá v server komponentách přes auth().
 */
export function middleware(req: NextRequest) {
  const { nextUrl } = req;

  const isPublic = nextUrl.pathname.startsWith("/login");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isWebhook =
    nextUrl.pathname.startsWith("/api/recall") ||
    nextUrl.pathname.startsWith("/api/assembly");

  if (isApiAuth || isWebhook || isPublic) return NextResponse.next();

  // Kontrola NextAuth session cookie – funguje v Edge Runtime bez závislostí
  const sessionToken =
    req.cookies.get("next-auth.session-token") ??
    req.cookies.get("__Secure-next-auth.session-token");

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
