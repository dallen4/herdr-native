import react from '@vitejs/plugin-react';
import process from 'node:process';
import { defineConfig } from 'vitest/config';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in
  // `tauri dev` or `tauri build`:
  // 1. don't obscure Rust errors
  clearScreen: false,
  // 2. Tauri expects a fixed port; fail if it's taken
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. don't watch the Rust side
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    // The bundle loads from disk inside the app, not over a network,
    // so antd's size isn't a load-time cost worth splitting for yet.
    chunkSizeWarningLimit: 2500,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
