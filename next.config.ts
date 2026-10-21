import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/moblie",
        destination: "/products?category=iphone",
        permanent: true,
      },
      {
        source: "/mobile",
        destination: "/products?category=iphone",
        permanent: true,
      },
    ];
  },
  images: {
    /**
     * Product imagery currently comes from the seed catalogue CDN. Replace or
     * extend this list when your own upload host (for example Cloudinary) is
     * wired up - never allow an open-ended remote pattern.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.dummyjson.com",
        pathname: "/product-images/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      /**
       * POS managers can paste a product image URL from anywhere on the web.
       * The URL is validated against an http(s) check server-side, and uploads
       * ride the same /api/pos/images route, so a wide remotePattern is the
       * price of supporting arbitrary image hosts.
       */
      { protocol: "http", hostname: "**", pathname: "/**" },
      { protocol: "https", hostname: "**", pathname: "/**" },
    ],
    formats: ["image/webp"],
  },
  poweredByHeader: false,
};

export default nextConfig;

