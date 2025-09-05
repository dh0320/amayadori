/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  // trailingSlash: true, // ルーティング方針に応じて
};
module.exports = nextConfig;
