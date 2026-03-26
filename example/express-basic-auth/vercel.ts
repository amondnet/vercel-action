import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  public: false,
  functions: {
    'index.js': {
      includeFiles: '_static/**/*.js',
    },
  },
  rewrites: [routes.rewrite('/(.*)', '/index.js')],
};
