import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;

  // Veřejné routes
  const publicPaths = ["/login"];
  const isPublic = publicPaths.some((p) => nextUrl.pathname.startsWith(p));
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isWebhook =
    nextUrl.pathname.startsWith("/api/recall") ||
    nextUrl.pathname.startsWith("/api/assembly");

  if (isApiAuth || isWebhook || isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
