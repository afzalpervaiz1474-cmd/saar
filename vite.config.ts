import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// ShieldForge frontend build configuration.
//
// `server.host` + `server.allowedHosts` exist so the UI can be opened through a
// proxied preview host during development. They only affect `vite dev`; the
// packaged desktop build loads `dist/` inside the Tauri webview, where no
// network server is exposed at all.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  // Tauri expects a fixed port and watches the frontend itself.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2021',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    // Rust/Tauri does not need module preload polyfills.
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
