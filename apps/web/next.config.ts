import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // An address that matches no page gets app/global-not-found.tsx: real HTML with a 404
    // status. A page that calls notFound() could only send an empty document for the browser
    // to fill in (docs/decisions/2026-11-13-not-found-page.md).
    globalNotFound: true,
  },
};

export default nextConfig;
