/** Yksikkötestit FODMAP-analyysille (puhdasta TypeScriptiä, ei React Nativea). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, target: 'es2020', module: 'commonjs' } }],
  },
};
