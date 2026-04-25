import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-kompatibilní auth konfigurace – BEZ Node.js závislostí (žádný Supabase).
 * Používá se v middleware (Edge Runtime).
 * Plná konfigurace (se Supabase whitelist) je v auth.ts.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = nextUrl.pathname.startsWith("/login");
      const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
      const isWebhook =
        nextUrl.pathname.startsWith("/api/recall") ||
        nextUrl.pathname.startsWith("/api/assembly");

      if (isApiAuth || isWebhook || isPublic) return true;
      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }

      // Refresh expired access token
      if (token.expiresAt && typeof token.expiresAt === "number") {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec >= token.expiresAt - 60) {
          // Token expiroval nebo brzy expiruje – refresh
          try {
            const response = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                grant_type: "refresh_token",
                refresh_token: token.refreshToken as string,
              }),
            });

            const data = await response.json();

            if (!response.ok) {
              console.error("Token refresh failed:", data);
              throw new Error("RefreshAccessTokenError");
            }

            token.accessToken = data.access_token;
            token.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
            // Pokud Google vrátil nový refresh token, uložíme ho
            if (data.refresh_token) {
              token.refreshToken = data.refresh_token;
            }
          } catch (error) {
            console.error("Error refreshing access token:", error);
            // Token je neplatný – uživatel se musí přihlásit znovu
            token.error = "RefreshAccessTokenError";
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      return session;
    },
  },
};
