/**
 * next.config.ts
 *
 * Next.js configuration.
 *  - The dev-mode "N" indicator is switched off so it does not appear in the
 *    end-to-end screenshots used as assignment deliverables.
 *  - `NEXT_DIST_DIR` lets the end-to-end tests build into their own folder
 *    (`.next-e2e`). Next.js allows only one dev server per build folder, so this
 *    is what lets `npm run test:e2e` run while your own `npm run dev` is open.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
