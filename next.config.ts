import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container image is built from a traced, self-contained server (Dockerfile). Only that
  // build asks for it: on Windows it needs symlinks, which an ordinary local build should not.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  cacheComponents: true,
  // The database migrations are read from disk when the database is first opened (lib/db), not
  // imported, so a build would leave them out of a deployed server without this.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  partialPrefetching: true,
  experimental: {
    // Off because a stale app/globals.css survived restarts of the dev server in this disk cache
    // (9 Oct 2026). The dev server still misses an edit to that file now and then; with the cache
    // off, restarting it is enough to get the current styles.
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: {
    // The parent folder has lockfiles of its own; without this the root is guessed from them.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
