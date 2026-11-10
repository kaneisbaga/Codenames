import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'github-pages-dual-entry',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (html.includes('/src/client/main.tsx')) {
            return html;
          }
          return html
            .replace(/<link[^>]*href="\.\/assets\/index\.css"[^>]*>\s*/g, '')
            .replace(/<script[^>]*src="\.\/assets\/app\.js"[^>]*><\/script>\s*/g, '')
            .replace(
              '</body>',
              '    <script type="module" src="/src/client/main.tsx"></script>\n  </body>'
            );
        },
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
      '@server': path.resolve(__dirname, 'src/server'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    watch: {
      ignored: [
        '**/codenames/**',
        '**/data/**',
        '**/*.sqlite',
        '**/*.sqlite-wal',
        '**/*.sqlite-shm',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/tests/**',
      ],
    },
  },
});
