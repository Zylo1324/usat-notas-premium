import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubPages ? "/usat-notas-premium" : "",
  assetPrefix: isGithubPages ? "/usat-notas-premium/" : "",
  turbopack: {
    root: process.cwd()
  },
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;
