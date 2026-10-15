import { defineConfig } from 'vite';
import path from 'path';
import { resolve } from 'path';

// Custom domain (netmark.re-el.co.za) serves the site at the domain root,
// so the default base is "/". Override with VITE_BASE if deploying to a
// project subpath (e.g. /NetMark-Platform/).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        register: resolve(__dirname, 'register.html'),
        platform: resolve(__dirname, 'platform/index.html'),
        owner: resolve(__dirname, 'owner/index.html'),
        business: resolve(__dirname, 'business/index.html'),
        shop: resolve(__dirname, 'shop/index.html'),
        driver: resolve(__dirname, 'driver/index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  }
});
