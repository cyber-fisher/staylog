/**
 * Wrapped 年度分享图。手写 Canvas，刻意不引 html-to-image 之类的 DOM 截图库——
 * 那类库在 CSS 渐变、自定义字体栈、CSS 变量上都会掉链子，而本项目的视觉恰好全靠这三样。
 *
 * 版式是「房卡」语言的延伸：深色底、金色只出现在描边/压印/比例条上，不做大面积填色。
 */

export interface ShareCardData {
  year: number;
  nights: number;
  cities: number;
  countries: number;
  hotels: number;
  pointsEarned: number;
  /** 前 5 座城市，按晚数降序 */
  topCities: { city: string; nights: number }[];
  topGroupName: string | null;
  topGroupNights: number;
}

// 分享图固定 1080×1920（手机竖屏），不跟随 devicePixelRatio——
// 导出的是文件而非屏幕渲染，固定尺寸才能保证不同设备下产物一致。
const W = 1080;
const H = 1920;

const SERIF = '"Palatino","Iowan Old Style","Songti SC","Times New Roman",serif';
const MONO = 'ui-monospace,"SF Mono","Menlo",monospace';
const SANS = '-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

const GOLD = "#c9a24b";
const GOLD_LIGHT = "#f4d78a";
const TEXT = "#ece8e0";
const MUTED = "#9a9488";

/** 金箔渐变，用于大字与比例条 */
function foil(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(0.45, GOLD);
  g.addColorStop(1, "#9a7a34");
  return g;
}

/** 小标签：字距拉开的全大写 eyebrow */
function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "left";
  // Canvas 没有 letter-spacing 的跨浏览器保证，手动逐字铺开
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + 6;
  }
  ctx.restore();
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  // 字体必须先就绪，否则第一次 fillText 时衬线字还没解析，会静默回退成 sans
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境不支持 Canvas 导出");

  // ---- 底：石墨黑渐变 ----
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#141720");
  bg.addColorStop(0.55, "#0b0d10");
  bg.addColorStop(1, "#16130c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ---- 金色细边框（双线，外粗内细，模仿烫金压边）----
  ctx.strokeStyle = "rgba(201,162,75,.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = "rgba(201,162,75,.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  ctx.textBaseline = "alphabetic";
  const L = 108; // 内容左边距

  // ---- 头部 ----
  eyebrow(ctx, `STAYLOG WRAPPED · ${d.year}`, L, 180);

  ctx.font = `600 46px ${SERIF}`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = "left";
  ctx.fillText("这一年，你在别处醒来的日子", L, 258);

  // ---- 主数字：晚数 ----
  const nightsText = String(d.nights);
  ctx.font = `700 300px ${MONO}`;
  const nw = ctx.measureText(nightsText).width;
  ctx.fillStyle = foil(ctx, L, 0, Math.max(nw, 200));
  ctx.fillText(nightsText, L, 560);

  ctx.font = `400 42px ${SERIF}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("晚，不在家的夜", L + nw + 24, 560);

  // 分隔线
  ctx.strokeStyle = "rgba(201,162,75,.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L, 640);
  ctx.lineTo(W - L, 640);
  ctx.stroke();

  // ---- 4 格数据 ----
  const stats: [string, string][] = [
    ["城市", String(d.cities)],
    ["国家/地区", String(d.countries)],
    ["酒店", String(d.hotels)],
    ["积分", d.pointsEarned.toLocaleString()],
  ];
  const colW = (W - L * 2) / 2;
  stats.forEach(([label, value], i) => {
    const x = L + (i % 2) * colW;
    const y = 740 + Math.floor(i / 2) * 150;
    ctx.font = `400 24px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "left";
    ctx.fillText(label, x, y);
    ctx.font = `700 66px ${MONO}`;
    ctx.fillStyle = TEXT;
    ctx.fillText(value, x, y + 76);
  });

  // ---- 最常入住集团 ----
  let y = 1080;
  if (d.topGroupName) {
    eyebrow(ctx, "MOST LOYAL TO", L, y);
    ctx.font = `600 52px ${SERIF}`;
    ctx.fillStyle = TEXT;
    ctx.textAlign = "left";
    ctx.fillText(d.topGroupName, L, y + 74);
    ctx.font = `400 28px ${MONO}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(`${d.topGroupNights} 晚`, L, y + 118);
    y += 190;
  }

  // ---- Top 5 城市比例条 ----
  if (d.topCities.length > 0) {
    eyebrow(ctx, "TOP CITIES", L, y);
    y += 54;
    const barMax = W - L * 2 - 200;
    const max = Math.max(1, ...d.topCities.map((c) => c.nights));
    for (const c of d.topCities.slice(0, 5)) {
      ctx.font = `400 30px ${SANS}`;
      ctx.fillStyle = TEXT;
      ctx.textAlign = "left";
      ctx.fillText(c.city, L, y + 30);

      const bw = Math.max(6, (c.nights / max) * barMax);
      // 轨道
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fillRect(L + 200, y + 12, barMax, 22);
      // 金箔条
      ctx.fillStyle = foil(ctx, L + 200, 0, barMax);
      ctx.fillRect(L + 200, y + 12, bw, 22);

      ctx.font = `500 26px ${MONO}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = "right";
      ctx.fillText(`${c.nights} 晚`, W - L, y + 32);
      y += 64;
    }
  }

  // ---- 页脚 ----
  ctx.textAlign = "center";
  ctx.font = `600 40px ${SERIF}`;
  ctx.fillStyle = GOLD;
  ctx.fillText("宿迹 STAYLOG", W / 2, H - 150);
  ctx.font = `400 22px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("个人住宿记录与常旅客账本", W / 2, H - 108);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成图片失败"));
    }, "image/png");
  });
}
