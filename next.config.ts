import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/api\/whatsapp\/webhook/] } },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }];
  },
};

export default config;
