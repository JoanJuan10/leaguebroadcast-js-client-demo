import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import webfontDownload from 'vite-plugin-webfont-dl'
import svgLoader from 'vite-svg-loader'

const liveClientProxy = {
  target: 'https://127.0.0.1:2999',
  changeOrigin: true,
  secure: false,
  rewrite: (path: string) => path.replace(/^\/riot-liveclient/, ''),
}

const bluebottleCacheProxy = {
  target: 'http://localhost:58869',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/bluebottle-cache/, '/cache'),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue(), webfontDownload(), svgLoader()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/bluebottle-cache': bluebottleCacheProxy,
      '/riot-liveclient': liveClientProxy,
    },
  },
  preview: {
    proxy: {
      '/bluebottle-cache': bluebottleCacheProxy,
      '/riot-liveclient': liveClientProxy,
    },
  },
})
