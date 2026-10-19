import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Real Chog art is served from public IPFS gateways; the optimizer resizes and caches it at the edge.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ipfs.filebase.io", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "gateway.pinata.cloud", pathname: "/ipfs/**" },
    ],
    formats: ["image/webp"],
  },
  // Optional native deps pulled in by wallet SDKs; not needed in the browser bundle.
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

export default nextConfig;
