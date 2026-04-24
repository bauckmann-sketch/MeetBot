import { createClient } from "@supabase/supabase-js";

// Server-side klient s service role (přístup ke všemu)
// Lazy creation – volá se až při skutečném requestu, ne při build time
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("your-supabase")) {
    throw new Error("Missing or invalid SUPABASE credentials in environment variables");
  }
  return createClient(url, key);
}

// Anon klient pro browser (omezené přístupy přes RLS)
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

