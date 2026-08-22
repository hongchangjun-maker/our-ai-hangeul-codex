import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'], include: ['app/domain/**/*.ts', 'app/infrastructure/file-import.ts'] },
  },
});
