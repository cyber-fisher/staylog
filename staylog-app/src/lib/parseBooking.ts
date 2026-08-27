import dayjs from "dayjs";
import type { Stay } from "../types";
import { matchBrand } from "./brandMatch";

/**
 * 订单确认文本解析器。
 *
 * 目标是「少打字」，不是「完全自动」——解析结果一定会灌进 StayForm 让用户确认，
 * 所以这里宁可留空也不要猜错：拿不准的字段（尤其城市）交给表单的高德补全去做。
 * 集团/子品牌不自己判断，直接复用 brandMatch，保持一处维护。
 */

export interface ParsedBooking {
  /** 可直接作为 StayForm initial 的完整记录 */
  draft: Stay;
  /** 成功识别的字段中文名，用于弹窗里标「已识别 / 待补全」 */
  matched: string[];
}

/** 标签式提取：`酒店名称：xxx` / `Hotel: xxx` */
function byLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]\\s*(.+)`, "i");
    const m = text.match(re);
    if (m) {
      const v = m[1].trim().split(/\s{2,}|[|｜]/)[0].trim();
      if (v) return v;
    }
  }
  return null;
}

const HOTEL_HINT = /酒店|饭店|宾馆|度假村|公寓|hotel|inn|resort|suites|residence|lodge/i;

function extractHotelName(text: string, lines: string[]): string | null {
  const labeled = byLabel(text, ["酒店名称", "酒店", "住宿", "Hotel", "Property", "Hotel Name"]);
  if (labeled && HOTEL_HINT.test(labeled)) return labeled;
  if (labeled) return labeled;
  // 无标签：取含酒店关键词的最短行（最短通常最接近纯名称，噪音行往往更长）
  const cands = lines.filter((l) => HOTEL_HINT.test(l) && l.length <= 60);
  if (cands.length === 0) return null;
  return cands.sort((a, b) => a.length - b.length)[0];
}

/** 各种日期写法 → YYYY-MM-DD。识别不出返回 null。 */
const MONTH_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface FoundDate {
  iso: string;
  /** 在原文中的位置，用于按出现顺序排序 */
  at: number;
}

function collectDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const seen = new Set<string>();
  const push = (y: number, m: number, d: number, at: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const iso = dayjs(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    if (!iso.isValid()) return;
    const key = iso.format("YYYY-MM-DD");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ iso: key, at });
  };

  // 无年份的写法默认按今年推；若早于今天超过 6 个月，视为明年的预订
  const guessYear = (m: number, d: number): number => {
    const now = dayjs();
    const thisYear = dayjs(`${now.year()}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    if (thisYear.isValid() && thisYear.isBefore(now.subtract(6, "month"))) return now.year() + 1;
    return now.year();
  };

  let m: RegExpExecArray | null;

  // 2026-10-01 / 2026/10/01 / 2026.10.01
  const reIso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g;
  while ((m = reIso.exec(text))) push(+m[1], +m[2], +m[3], m.index);

  // 2026年10月1日
  const reZhFull = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
  while ((m = reZhFull.exec(text))) push(+m[1], +m[2], +m[3], m.index);

  // 10月1日（无年份）
  const reZh = /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
  while ((m = reZh.exec(text))) push(guessYear(+m[1], +m[2]), +m[1], +m[2], m.index);

  // Oct 1, 2026 / 1 Oct 2026
  const reEn = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,)?\s*(\d{4})?/g;
  while ((m = reEn.exec(text))) {
    const mo = MONTH_EN[m[1].slice(0, 3).toLowerCase()];
    if (!mo) continue;
    const d = +m[2];
    push(m[3] ? +m[3] : guessYear(mo, d), mo, d, m.index);
  }

  // 10/01/2026（美式，仅当没有更明确的写法命中时才有意义，故放最后）
  const reUs = /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  while ((m = reUs.exec(text))) push(+m[3], +m[1], +m[2], m.index);

  return out.sort((a, b) => (a.iso === b.iso ? a.at - b.at : a.iso.localeCompare(b.iso)));
}

function extractNights(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:晚|夜)|(\d+)\s*nights?/i);
  if (!m) return null;
  const n = +(m[1] || m[2]);
  return n > 0 && n < 366 ? n : null;
}

const CUR_SYMBOL: Record<string, string> = { "¥": "CNY", "￥": "CNY", $: "USD", "€": "EUR", "£": "GBP" };
const CUR_CODES = ["CNY", "RMB", "USD", "EUR", "JPY", "HKD", "THB", "GBP", "AED", "SGD"];

interface FoundRate {
  rate: number;
  currency: string;
  /** 是否明确标注为总价（需除以晚数换算成每晚） */
  isTotal: boolean;
}

function extractRate(text: string): FoundRate | null {
  // 逐行找，行内出现「总价/合计/Total」则标记为总价
  for (const line of text.split(/\r?\n/)) {
    const isTotal = /总价|总额|合计|总计|Total/i.test(line);
    let m = line.match(/([¥￥$€£])\s*([\d,]+(?:\.\d+)?)/);
    if (m) {
      const v = parseFloat(m[2].replace(/,/g, ""));
      if (v > 0) return { rate: v, currency: CUR_SYMBOL[m[1]] || "CNY", isTotal };
    }
    const codeRe = new RegExp(`(${CUR_CODES.join("|")})\\s*([\\d,]+(?:\\.\\d+)?)`, "i");
    m = line.match(codeRe);
    if (m) {
      const v = parseFloat(m[2].replace(/,/g, ""));
      const code = m[1].toUpperCase();
      if (v > 0) return { rate: v, currency: code === "RMB" ? "CNY" : code, isTotal };
    }
  }
  return null;
}

export function parseBookingText(text: string): ParsedBooking | null {
  const raw = text.trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const matched: string[] = [];

  const hotelName = extractHotelName(raw, lines);
  if (hotelName) matched.push("酒店名称");

  // 日期：取最早两个作为入住/离店
  const dates = collectDates(raw);
  let checkIn: string | null = null;
  let checkOut: string | null = null;
  if (dates.length >= 2) {
    checkIn = dates[0].iso;
    checkOut = dates[1].iso;
    matched.push("入住日期", "离店日期");
  } else if (dates.length === 1) {
    checkIn = dates[0].iso;
    matched.push("入住日期");
    const n = extractNights(raw);
    if (n) {
      checkOut = dayjs(checkIn).add(n, "day").format("YYYY-MM-DD");
      matched.push("离店日期（按晚数推算）");
    }
  }

  const roomType = byLabel(raw, ["房型", "房间类型", "房间", "Room Type", "Room"]);
  if (roomType) matched.push("房型");

  const city = byLabel(raw, ["城市", "City"]);
  if (city) matched.push("城市");

  const conf = byLabel(raw, ["确认号", "订单号", "预订号", "Confirmation", "Confirmation Number", "Booking Reference"]);
  if (conf) matched.push("确认号");

  const found = extractRate(raw);
  let rate: number | undefined;
  let currency: string | undefined;
  if (found) {
    const nights =
      checkIn && checkOut ? Math.max(1, dayjs(checkOut).diff(dayjs(checkIn), "day")) : 1;
    rate = found.isTotal && nights > 1 ? Math.round((found.rate / nights) * 100) / 100 : found.rate;
    currency = found.currency;
    matched.push(found.isTotal && nights > 1 ? "房价（总价折算每晚）" : "房价");
  }

  // 一个有效字段都没有 → 认定解析失败，让 UI 提示手动录入
  if (matched.length === 0) return null;

  // 集团/子品牌交给现有别名表，不在这里另判一套
  const bm = hotelName ? matchBrand(hotelName) : null;
  if (bm) matched.push("集团/品牌");

  const ci = checkIn || dayjs().format("YYYY-MM-DD");
  const draft: Stay = {
    id: crypto.randomUUID(),
    hotelName: hotelName || "",
    brand: bm?.brand || "",
    group: bm?.group || "other",
    city: city || "",
    country: city ? "中国" : "",
    checkIn: ci,
    checkOut: checkOut || dayjs(ci).add(1, "day").format("YYYY-MM-DD"),
    roomType: roomType || undefined,
    rate,
    currency: currency || "CNY",
    notes: conf ? `确认号 ${conf}` : undefined,
  };

  return { draft, matched };
}
