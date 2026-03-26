import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  public: false,
  git: {
    deploymentEnabled: false,
  },
  headers: [
    routes.header('/(.*)', [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ]),
    routes.header('/(.*).html', [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ]),
    routes.cacheControl(
      '/(assets/.+|amcharts/.+|.+\\.css|.+\\.js|.+\\.eot|.+\\.svg|.+\\.ttf|.+\\.woff|.+\\.gif|.+\\.png|.+\\.jpg)',
      { maxAge: '1 year', immutable: true },
    ),
  ],
  rewrites: [
    routes.rewrite('/favicon.ico', '/favicon.ico'),
    routes.rewrite('/(.*)', '/index.html'),
  ],
};
