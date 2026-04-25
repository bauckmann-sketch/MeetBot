import NextAuth from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "./auth.config";

/**
 * Plná auth konfigurace – běží pouze v Node.js runtime (API routes, server components).
 * Rozšiřuje Edge-kompatibilní authConfig o Supabase whitelist check + ukládání refresh tokenu.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    // Zděd jwt a session callbacks z authConfig
    ...authConfig.callbacks,

    // Rozšířený jwt callback – uloží refresh token do DB při prvním přihlášení
    async jwt({ token, account }) {
      // Volej původní jwt callback z authConfig
      if (authConfig.callbacks?.jwt) {
        const result = await authConfig.callbacks.jwt({ token, account } as Parameters<NonNullable<typeof authConfig.callbacks.jwt>>[0]);
        if (result) token = result;
      }

      // Při prvním přihlášení (account je přítomen) uložíme refresh token do Supabase
      if (account?.refresh_token && token.email) {
        try {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (url && key && !url.includes("your-supabase")) {
            const supabase = createClient(url, key);
            await supabase.from("user_tokens").upsert({
              user_email: token.email,
              google_refresh_token: account.refresh_token,
              updated_at: new Date().toISOString(),
            });
            console.log(`Saved refresh token for ${token.email}`);
          }
        } catch (err) {
          console.error("Failed to save refresh token:", err);
        }
      }

      return token;
    },

    async signIn({ user }) {
      if (!user.email) return false;

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key || url.includes("your-supabase")) {
        console.warn("Supabase not configured, skipping whitelist check");
        return true;
      }

      const supabase = createClient(url, key);

      const { data } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", user.email)
        .single();

      if (!data) return "/login?error=not_allowed";
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.AUTH_SECRET,
});
