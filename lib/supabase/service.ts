import { createClient } from "@supabase/supabase-js";

const clean = (s: string) => s.replace(/﻿/g, "").trim();

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in server-side code (API routes, server actions).
 * Never expose the service role key to the client.
 */
export function createServiceClient() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}