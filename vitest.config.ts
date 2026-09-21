import path from 'node:path';
import { defineConfig } from 'vitest/config';

// סביבת node בלבד בשלב 1. react ו-jsdom יתווספו בשלב 2, יחד עם הממשק.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
