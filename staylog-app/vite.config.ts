import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // maplibre-gl 自带 Web Worker 入口，Vite 依赖预构建会破坏 worker 的解析，
  // 导致 maplibre-gl-worker.mjs 加载失败、矢量瓦片无法解码（地图空白）。
  // 排除预构建后由浏览器直接加载其 ESM，worker 正常工作。
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
