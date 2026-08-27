# 宿迹 STAYLOG

我的酒店住宿记录平台。灵感来自 Flighty 和 Awaybook——把每一次入住变成足迹：自动累计常旅客定级进度、在地图上点亮城市、生成年度住宿总结。

## 功能

- **总览仪表盘** — 年度晚数/酒店/城市/国家/积分/支出，月度趋势图；顶部「即将入住」倒计时卡
- **住宿记录** — 时间线卡片，按集团/年份筛选、关键字搜索；支持「即将入住」筛选与「再住一次」一键复制
- **常旅客计划** — 希尔顿荣誉客会、华住会，以及自定义集团（可自设等级门槛与主题色）；定级进度自动累计、到期券提醒；进度轨叠加已订未住晚数，回答「加上手上的预订能到哪」
- **轨迹** — 全年住宿热力日历（含最长连住/最长空档），20+ 枚成就徽章按已解锁/进行中分组
- **足迹地图** — MapLibre GL 栅格底图，高德街道图（中文地名），酒店标记按晚数缩放
- **统计分析 + 年度总结** — Flighty 风格的 Wrapped 卡片流，可导出 1080×1920 分享图（手写 Canvas 渲染）
- **多用户 + 云同步** — 邮箱密码登录，数据库行级安全真隔离；跨设备同步，离线可用联网补传
- **快速录入** — 粘贴携程/官网/邮件的订单确认文本自动提取酒店、日期、房价；输入酒店名自动识别集团/子品牌（离线）；部署方配置全局高德 Key 后还能自动补全城市与坐标（在线，所有用户共享）

> 「即将入住」不需要额外字段：入住日晚于今天即视为已订未住，且**不计入任何统计口径**（首页 KPI、地图、统计、年度总结都只算已住）。

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
3. **配置环境变量**（Settings → Environment Variables，勾选 Production + Preview + Development）：
   - `VITE_SUPABASE_URL` — Supabase 项目的 Project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase 的 anon public key（可安全暴露在前端，RLS 才是安全边界）
   - `VITE_AMAP_KEY` —（可选）高德 Web 服务 Key，全局共享给所有用户，用于录入时自动搜索酒店。不填则仅离线品牌识别

   ⚠️ `VITE_` 变量是**构建期**注入的，必须在部署前配好；修改后需重新部署才生效。
4. 其余保持默认（`vercel.json` 已提交，会自动生效——包含 SPA 路由重写，避免刷新 `/stays` 等深链 404）
5. Deploy

高德 Key 全局共享：由部署方通过 `VITE_AMAP_KEY` 统一提供，所有用户共用这一把，无需各自设置。注意它会打包进前端，技术用户可从浏览器取得——环境变量的作用是避免 Key 写进公开源码被爬虫扫走。

## 技术栈

Vite 8 · React 19 · TypeScript · React Router v7 · zustand（本地缓存持久化） · Supabase（Postgres + Auth，云端同步） · MapLibre GL · Recharts · dayjs

## 数据与同步

- **后端**：Supabase（托管 Postgres + Auth）。邮箱 + 密码登录，首个注册账号为管理员。
- **同步策略**：离线优先。写入先落本地 localStorage 即时生效，再后台上传云端；读取本地秒开，聚焦/联网时后台对账合并（最后写入优先，软删墓碑防误删复活）。断网可照常记录，联网自动补传。
- **安全隔离**：数据库行级安全（RLS）强制每个用户只能读写自己的行，是真实隔离，非前端门禁。anon key 暴露在前端是安全的。
- 数据库表结构与 RLS 策略的建表 SQL 见提交历史/项目文档。
