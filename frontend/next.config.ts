import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Optional native deps pulled in by wallet SDKs; not needed in the browser bundle.
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

export default nextConfig;
