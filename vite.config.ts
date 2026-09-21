import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Builds the React webview into a single IIFE bundle consumed by the
// extension webview (GitViewProvider). Output paths are stable so the
// extension can reference `assets/git.js` / `assets/git.css` directly.
export default defineConfig({
  root: path.resolve(__dirname, 'webview'),
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  build: {
    cssCodeSplit: false,
    outDir: path.resolve(__dirname, 'media/webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'IdeaGitWebview',
        inlineDynamicImports: true,
        entryFileNames: 'assets/git.js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'assets/git.css' : 'assets/[name][extname]'
      }
    }
  }
});
