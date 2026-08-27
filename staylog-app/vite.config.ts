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
  build: {
    rollupOptions: {
      output: {
        // 把大体积第三方库拆成独立 vendor chunk：
        // - 与业务代码分离，业务改动不再使这些大 chunk 缓存失效；
        // - recharts / maplibre 只在进入对应页面时按需加载，配合路由预取消除首次点击卡顿。
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
            if (id.includes('maplibre-gl')) return 'vendor-map';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          }
        },
      },
    },
  },
})
