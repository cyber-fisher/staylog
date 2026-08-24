# 宿迹 STAYLOG

我的酒店住宿记录平台。灵感来自 Flighty 和 Awaybook——把每一次入住变成足迹：自动累计常旅客定级进度、在地图上点亮城市、生成年度住宿总结。

## 功能

- **总览仪表盘** — 年度晚数/酒店/城市/国家/积分/支出，月度趋势图
- **住宿记录** — 时间线卡片，按集团/年份筛选、关键字搜索
- **常旅客计划** — 希尔顿、万豪、IHG、凯悦、华住会五大集团，定级进度自动累计、到期券提醒
- **足迹地图** — MapLibre GL 栅格底图，国内用高德街道图（中文地名），海外自动切 ESRI 卫星影像，酒店标记按晚数缩放
- **统计分析 + 年度总结** — Flighty 风格的 Wrapped 卡片流
- **多用户 + 权限** — 支持多账号自助注册，数据按用户隔离，高德 Key 等系统设置仅管理员可访问
- **酒店自动匹配** — 输入酒店名自动识别集团/子品牌（离线），填了高德 Key 后还能自动补全城市与坐标（在线）

## 项目结构

```
.
├── staylog-app/       # Vite + React + TS 应用（这个是可部署的）
└── staylog.html       # 早期静态原型存档
```

## 本地开发

```bash
cd staylog-app
npm install
npm run dev            # http://localhost:5173
```

生产构建：`npm run build`，产物在 `staylog-app/dist/`。

## 部署到 Vercel

仓库根目录不是 Vite 项目，Vercel 需要指到 `staylog-app/`：

1. Vercel 控制台 → Add New → Project → 从 GitHub 导入 `cyber-fisher/staylog`
2. 在配置页把 **Root Directory** 改成 `staylog-app`（这一步不能省）
3. 其余保持默认（`vercel.json` 已提交，会自动生效——包含 SPA 路由重写，避免刷新 `/stays` 等深链 404）
4. Deploy

无需配置任何环境变量。高德 Key 是运行时由每个用户在应用内输入并存自己的浏览器 localStorage，不入库、不上传。

## 技术栈

Vite 6 · React 18 · TypeScript · React Router v7 · zustand（含 localStorage 持久化） · MapLibre GL · Recharts · dayjs

## 安全边界

多用户与登录是**纯前端门禁**：能防误操作和随手访问，但技术用户可通过浏览器开发者工具查看/修改本地数据。数据只在当前浏览器，不跨设备同步。如需真实安全隔离，需要引入后端与数据库。
