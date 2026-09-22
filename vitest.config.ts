import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
