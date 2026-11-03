import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

/** Opt-in bundle analysis: `pnpm build:analyze` (or `ANALYZE=true pnpm build`). */
const shouldAnalyzeBundle = process.env.ANALYZE === 'true';

export default defineConfig({
  plugins: [
    react(),
    ...(shouldAnalyzeBundle
      ? [
          // Writes dist/stats.html: an interactive treemap of what's in the production bundle,
          // with gzip/brotli sizes, to catch dependency bloat before it ships.
          visualizer({
            filename: 'dist/stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://api-gateway-node:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Routes are code-split via React.lazy (see src/App.tsx), so apexcharts only ever
    // loads in the Analytics route chunk, not the initial bundle. That chunk alone
    // still exceeds Rollup's default 500kB warning threshold because of apexcharts'
    // own size; raise the limit rather than chase a warning about an already-isolated,
    // non-critical-path chunk.
    chunkSizeWarningLimit: 650,
  },
});
