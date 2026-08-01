/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Explicitly bind the @/* import alias to ./src/* so the webpack build
  // resolves it the same way as the TypeScript compiler. (Next.js 14 +
  // some monorepo structures need this nudge.)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
};

module.exports = nextConfig;
