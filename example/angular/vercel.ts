import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  public: false,
  git: {
    deploymentEnabled: false,
  },
  headers: [
    routes.cacheControl(
      '/(assets/.+|amcharts/.+|.+\\.css|.+\\.js|.+\\.eot|.+\\.svg|.+\\.ttf|.+\\.woff|.+\\.gif|.+\\.png|.+\\.jpg)',
      { maxAge: '1 year', immutable: true },
    ),
    routes.header('/(.*).html', [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ]),
    routes.header('/(.*)', [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ]),
  ],
  rewrites: [
    routes.rewrite('/robots.txt', '/robots.txt'),
    routes.rewrite('/favicon.ico', '/favicon.txt'),
    routes.rewrite('/(.*)', '/index.html'),
  ],
};
