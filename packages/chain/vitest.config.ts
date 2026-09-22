import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'chain',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
