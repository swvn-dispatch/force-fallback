import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works when the Python server mounts it under
  // any runtime-configured dash_path, not just a fixed prefix baked in here.
  base: './',
  build: { outDir: '../static', emptyOutDir: true },
  server: {
    // Dev-only: the real server mounts the API under the configured
    // dash_path (default "/stats"), so rewrite proxied requests to match.
    // Adjust the rewrite prefix here if you're testing a non-default path.
    proxy: {
      '/api': {
        target: 'http://localhost:9294',
        rewrite: (path) => `/stats${path}`,
      },
    },
  },
});
