/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/tee/:path*",
        destination: `${process.env.TEE_API_URL || "http://127.0.0.1:8787"}/:path*`,
      },
      {
        source: "/api/xrpl/:path*",
        destination: `${process.env.XRPL_API_URL || "http://127.0.0.1:8788"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
