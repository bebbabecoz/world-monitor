import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Mark yahoo-finance2 as external so Node.js uses its native ESM loader.
  // Bundling it fails because its ESM source imports Deno-only test utilities.
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;
