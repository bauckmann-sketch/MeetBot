import NextAuth from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "./auth.config";

/**
 * Plná auth konfigurace – běží pouze v Node.js runtime (API routes, server components).
 * Rozšiřuje Edge-kompatibilní authConfig o Supabase whitelist check.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

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
