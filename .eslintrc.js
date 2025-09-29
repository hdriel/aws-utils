module.exports = {
    env: {
        browser: false,
        es6: true,
        jest: true,
    },
    ignorePatterns: ['**/env.config.js'],
    extends: [
        'airbnb',
        'airbnb-typescript/base',
        'plugin:prettier/recommended',
        'plugin:jest-dom/recommended',
        'eslint:recommended',
    ],
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
    },
    parser: '@babel/eslint-parser',
    parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: {
            jsx: true,
        },
        ecmaVersion: 2018,
        sourceType: 'module',
    },
    plugins: ['jest-dom', 'testing-library'],
    rules: {
        'linebreak-style': 0,
        'require-default-props': 0,
        'import/prefer-default-export': 0,
        'no-underscore-dangle': 0,
        '@typescript-eslint/restrict-plus-operands': 0,
    },
};
