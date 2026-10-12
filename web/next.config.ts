import type { NextConfig } from "next";

const config: NextConfig = {
  // The e2e test runs its own server beside the dev one and needs a separate build dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The server spawns `claude` and reads repo files; keep it out of the bundle.
  serverExternalPackages: [],
};

export default config;
