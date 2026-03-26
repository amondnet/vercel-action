export const config = {
  public: false,
  git: {
    deploymentEnabled: false,
  },
  functions: {
    'index.js': {
      includeFiles: '_static/**/*.js',
    },
  },
  rewrites: [
    {
      source: '/(.*)',
      destination: '/index.js',
    },
  ],
};
