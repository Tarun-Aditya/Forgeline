import type { NextConfig } from "next";

const config: NextConfig = {
  // The server spawns `claude` and reads repo files; keep it out of the bundle.
  serverExternalPackages: [],
};

export default config;
