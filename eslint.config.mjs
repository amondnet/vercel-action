import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,
  },
  ignores: [
    'dist/**',
    'example/**',
    'node_modules/**',
    '*.min.js',
  ],
  languageOptions: {
    globals: {
      describe: 'readonly',
      test: 'readonly',
      expect: 'readonly',
      it: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
      beforeAll: 'readonly',
      afterAll: 'readonly',
      jest: 'readonly',
    },
  },
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    'unused-imports/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    'unicorn/no-process-exit': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'prefer-const': 'off',
  },
})
