import { fileURLToPath } from 'node:url';

// The per-test coverage command overrides rootDir, so the setup module is named by its absolute path.
export default {
  transform: {},
  globalSetup: fileURLToPath(new URL('./jest-global-setup.mjs', import.meta.url)),
  testMatch: ['**/__tests__/**/*.mjs', '**/?(*.)+(spec|test).mjs'],
};
