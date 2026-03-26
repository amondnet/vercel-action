export const config = {
  public: false,
  git: {
    deploymentEnabled: false,
  },
  functions: {
    'api/index.js': {
      includeFiles: '_static/**',
    },
  },
  rewrites: [
    {
      source: '/(.*)',
      destination: '/api/index.js',
    },
  ],
};
