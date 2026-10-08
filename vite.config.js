import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadConfig } from './server/config.js';

// In dev (npm run dev) the page is served by Vite: inject the paper's language here too.
const injectLang = {
  name: 'localhost-times-lang',
  apply: 'serve',
  transformIndexHtml(html) {
    const { language } = loadConfig();
    return html.replace('<html lang="en">', `<html lang="${language}">`)
      .replace('</head>', `<script>window.__LT__=${JSON.stringify({ lang: language })}</script></head>`);
  },
};

export default defineConfig({
  root: 'web',
  plugins: [react(), injectLang],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4321', '/media': 'http://localhost:4321', '/feed': 'http://localhost:4321' },
  },
});
