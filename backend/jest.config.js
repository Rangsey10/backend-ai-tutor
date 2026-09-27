/** @type {import('jest').Config} */
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/src/' }),
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/src/test/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup-after-env.ts'],
  clearMocks: true,
};
