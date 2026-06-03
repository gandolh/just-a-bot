import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Vite hashes chunk + asset filenames by default. The static handler in
    // src/server/static.ts serves index.html with `Cache-Control: no-cache`
    // and hashed assets as immutable — see docs/discord/dicetable/README.md
    // ("Cache headers in production").
  },
});
