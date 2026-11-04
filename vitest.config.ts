import { defineConfig } from 'vitest/config';

// Unit tests for the shared packages and the auth worker. The app's screens are checked by
// scripts/smoke.mjs (a real browser against the web build). Live GitHub tests: `npm run test:live`.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts'],
    exclude: ['**/*.live.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
});
