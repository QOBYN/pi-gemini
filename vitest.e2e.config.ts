import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
  },
});
