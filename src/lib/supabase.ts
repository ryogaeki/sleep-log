import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validatePublicConfig } from "./public-config";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const configured = Boolean(url && key);
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!validatePublicConfig(url,key)) return null;
  if (!client) client = createClient(url, key, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  return client;
}
export async function signIn() {
  const sb = getSupabase();
  if (!sb) throw new Error("接続設定が必要です。");
  const { error } = await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/` } });
  if (error) throw error;
}
