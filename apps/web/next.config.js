/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@bull-bear/shared'],
};

module.exports = nextConfig;
