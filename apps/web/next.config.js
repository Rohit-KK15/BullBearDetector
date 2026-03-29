/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@bull-bear/shared', '@bull-bear/engine'],
};

module.exports = nextConfig;
