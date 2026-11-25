import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: process.env.SIM ? ['scripts/**/*.test.ts'] : ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
