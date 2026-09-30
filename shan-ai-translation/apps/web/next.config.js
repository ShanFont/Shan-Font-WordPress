/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@sat/ui', '@sat/api-client'],
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

module.exports = nextConfig;
