import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge Runtime middleware – používá POUZE getToken() z next-auth/jwt.
 * getToken() je Edge-kompatibilní (používá Web Crypto API, žádný Node.js, žádný Supabase).
 * Vercel vyžaduje middleware.ts (nikoli proxy.ts).
 */
export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Veřejné routes – propustit bez autentizace
  const isPublic = nextUrl.pathname.startsWith("/login");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isWebhook =
    nextUrl.pathname.startsWith("/api/recall") ||
    nextUrl.pathname.startsWith("/api/assembly");

  if (isApiAuth || isWebhook || isPublic) return NextResponse.next();

  // JWT check – Edge-kompatibilní, čte pouze cookie
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
