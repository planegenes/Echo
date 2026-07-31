import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Pair Quiz PWA',
        short_name: 'PairQuiz',
        description: '配对测验与填空检测学习应用',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // 缓存应用壳、样式、KaTeX 字体
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf}'],
        // KaTeX 字体资源较大，放宽上限
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
