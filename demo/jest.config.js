export default {
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    extensionsToTreatAsEsm: ['.ts'],
    verbose: true,
    roots: ['<rootDir>/src'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testEnvironment: 'node',
    modulePaths: ['node_modules', '.yalc', '<rootDir>/src'],
};
