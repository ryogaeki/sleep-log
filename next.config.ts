import type { NextConfig } from "next";
import { validatePublicConfig } from "./src/lib/public-config";

validatePublicConfig(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");

const basePath = (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: { useTypeScriptCli: false },
};
export default config;
