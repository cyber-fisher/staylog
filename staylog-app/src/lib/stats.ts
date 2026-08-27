import dayjs from "dayjs";
import type { LoyaltyGroup, Membership, Stay, TierDef } from "../types";
import { GROUP_META, GROUP_TIERS } from "../types";

export function nightsOf(stay: Stay): number {
  return Math.max(1, dayjs(stay.checkOut).diff(dayjs(stay.checkIn), "day"));
}

// ============ 时态：已住 vs 已订未住 ============
// 没有 status 字段，纯按日期推导：入住日晚于今天 = 未来行程。
// 未来行程不能进任何统计口径（否则首页 KPI/地图/年度总结会把还没发生的事算进去），
// 所以过滤下沉到本文件每个聚合函数的入口——调用方无法漏掉。

/** 未来行程：入住日在今天之后 → 已订未住 */
export function isUpcoming(s: Stay): boolean {
  return dayjs(s.checkIn).isAfter(dayjs(), "day");
}

/** 剔除未来行程，只留已发生的住宿 */
export function stayedOnly(stays: Stay[]): Stay[] {
  return stays.filter((s) => !isUpcoming(s));
}

/** 已订未住，按入住日升序（最近的一趟在前） */
export function upcomingOf(stays: Stay[]): Stay[] {
  return stays.filter(isUpcoming).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

export function staysInYear(stays: Stay[], year: number): Stay[] {
  return stayedOnly(stays).filter((s) => dayjs(s.checkIn).year() === year);
}

export interface YearSummary {
  nights: number;
  hotels: number;
  cities: number;
  countries: number;
  pointsEarned: number;
  /** 只按 CNY 累计（其余币种忽略汇率，仅计入 spendByCurrency） */
  spendCny: number;
  spendByCurrency: Record<string, number>;
  avgRateCny: number | null;
  newCities: string[];
  newCountries: string[];
}

export function summarizeYear(stays: Stay[], year: number): YearSummary {
  const inYear = staysInYear(stays, year);
  const before = stayedOnly(stays).filter((s) => dayjs(s.checkIn).year() < year);
  const beforeCities = new Set(before.map((s) => s.city));
  const beforeCountries = new Set(before.map((s) => s.country));

  const cities = new Set(inYear.map((s) => s.city));
  const countries = new Set(inYear.map((s) => s.country));
  const hotels = new Set(inYear.map((s) => s.hotelName));

  const spendByCurrency: Record<string, number> = {};
  let cnyNights = 0;
  for (const s of inYear) {
    if (s.rate) {
      const cur = s.currency || "CNY";
      spendByCurrency[cur] = (spendByCurrency[cur] || 0) + s.rate * nightsOf(s);
      if (cur === "CNY") cnyNights += nightsOf(s);
    }
  }
  const spendCny = spendByCurrency["CNY"] || 0;

  return {
    nights: inYear.reduce((n, s) => n + nightsOf(s), 0),
    hotels: hotels.size,
    cities: cities.size,
    countries: countries.size,
    pointsEarned: inYear.reduce((n, s) => n + (s.pointsEarned || 0), 0),
    spendCny,
    spendByCurrency,
    avgRateCny: cnyNights > 0 ? Math.round(spendCny / cnyNights) : null,
    newCities: [...cities].filter((c) => !beforeCities.has(c)),
    newCountries: [...countries].filter((c) => !beforeCountries.has(c)),
  };
}

export function monthlyNights(stays: Stay[], year: number): number[] {
  const months = new Array(12).fill(0);
  for (const s of staysInYear(stays, year)) {
    months[dayjs(s.checkIn).month()] += nightsOf(s);
  }
  return months;
}

export function nightsByGroup(stays: Stay[], year?: number): Record<string, number> {
  const src = year == null ? stayedOnly(stays) : staysInYear(stays, year);
  const out: Record<string, number> = {};
  for (const s of src) out[s.group] = (out[s.group] || 0) + nightsOf(s);
  return out;
}

export interface CityAgg {
  city: string;
  country: string;
  nights: number;
  stays: number;
  lat?: number;
  lng?: number;
}

export function aggregateCities(stays: Stay[]): CityAgg[] {
  const map = new Map<string, CityAgg>();
  for (const s of stayedOnly(stays)) {
    const cur = map.get(s.city) || { city: s.city, country: s.country, nights: 0, stays: 0 };
    cur.nights += nightsOf(s);
    cur.stays += 1;
    if (cur.lat == null && s.lat != null) { cur.lat = s.lat; cur.lng = s.lng; }
    map.set(s.city, cur);
  }
  return [...map.values()].sort((a, b) => b.nights - a.nights);
}

export interface HotelAgg {
  hotelName: string;
  hotelNameEn?: string;
  group: string;
  city: string;
  nights: number;
  visits: number;
  lat?: number;
  lng?: number;
  avgRating: number | null;
  stayIds: string[];
}

export function aggregateHotels(stays: Stay[]): HotelAgg[] {
  // 按 酒店名+城市 聚合：连锁品牌（全季/汉庭…）在不同城市同名，不能合并成一个地图点。
  const map = new Map<string, HotelAgg & { _ratingSum: number; _ratingCount: number }>();
  for (const s of stayedOnly(stays)) {
    const key = `${s.hotelName}|${s.city}`;
    const cur =
      map.get(key) ||
      { hotelName: s.hotelName, hotelNameEn: s.hotelNameEn, group: s.group, city: s.city,
        nights: 0, visits: 0, avgRating: null, stayIds: [] as string[], _ratingSum: 0, _ratingCount: 0 };
    cur.nights += nightsOf(s);
    cur.visits += 1;
    cur.stayIds.push(s.id);
    if (s.rating != null) { cur._ratingSum += s.rating; cur._ratingCount += 1; }
    if (cur.lat == null && s.lat != null) { cur.lat = s.lat; cur.lng = s.lng; }
    map.set(key, cur);
  }
  const out: HotelAgg[] = [];
  for (const h of map.values()) {
    const { _ratingSum, _ratingCount, ...agg } = h;
    agg.avgRating = _ratingCount > 0 ? Math.round((_ratingSum / _ratingCount) * 10) / 10 : null;
    out.push(agg);
  }
  return out.sort((a, b) => b.nights - a.nights);
}

/** 大圆距离 km */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** 近 n 个月月均晚数（含当月），用于会籍达成预测。只算已住——未来预订不能抬高节奏。 */
export function recentMonthlyPace(stays: Stay[], months = 6): number {
  const cutoff = dayjs().subtract(months, "month").startOf("month");
  const nights = stayedOnly(stays)
    .filter((s) => dayjs(s.checkIn).isAfter(cutoff))
    .reduce((n, s) => n + nightsOf(s), 0);
  return nights / months;
}

/** 年份列表。刻意不过滤未来行程——住宿记录页需要能显示明年的预订分组。 */
export function yearsWithData(stays: Stay[]): number[] {
  return [...new Set(stays.map((s) => dayjs(s.checkIn).year()))].sort((a, b) => b - a);
}

/** 某年住得最多的集团（Wrapped 与分享图共用，避免两处逻辑漂移） */
export function topGroupInYear(
  stays: Stay[],
  year: number
): { group: LoyaltyGroup; name: string; nights: number } | null {
  const inYear = staysInYear(stays, year);
  const byGroup: Record<string, number> = {};
  for (const s of inYear) byGroup[s.group] = (byGroup[s.group] || 0) + nightsOf(s);
  const top = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const group = top[0] as LoyaltyGroup;
  const sample = inYear.find((x) => x.group === group);
  const name =
    group === "other"
      ? sample?.customGroupName || "其他"
      : GROUP_META[group]?.name || "其他";
  return { group, name, nights: top[1] };
}

// ============ 日级占用（热力日历用）============

export interface DayCell {
  /** YYYY-MM-DD */
  date: string;
  /** 该日入住的记录数（跨日重叠时可 >1） */
  nights: number;
  stays: Stay[];
}

/**
 * 把每条记录摊成它实际占用的每一晚（checkIn 含、checkOut 不含），裁剪到指定年份。
 *
 * ⚠️ 与 staysInYear/summarizeYear 的口径**刻意不同**：本函数按真实住宿日历切分，
 * 12/30 入住、1/3 离店会正确拆成 2025 年 2 晚 + 2026 年 3 晚；而 summarizeYear
 * 按 checkIn 年份把 5 晚整段归给 2025。所以存在跨年住宿时，热力图格子数与
 * 首页 KPI 的「住宿晚数」可能差几晚。热力图下方有小字说明。
 */
export function dailyOccupancy(stays: Stay[], year: number): Map<string, DayCell> {
  const out = new Map<string, DayCell>();
  const yearStart = dayjs(`${year}-01-01`);
  const yearEnd = dayjs(`${year}-12-31`);
  for (const s of stayedOnly(stays)) {
    const ci = dayjs(s.checkIn);
    const nights = nightsOf(s);
    for (let i = 0; i < nights; i++) {
      const d = ci.add(i, "day");
      if (d.isBefore(yearStart, "day") || d.isAfter(yearEnd, "day")) continue;
      const key = d.format("YYYY-MM-DD");
      const cur = out.get(key) || { date: key, nights: 0, stays: [] };
      cur.nights += 1;
      cur.stays.push(s);
      out.set(key, cur);
    }
  }
  return out;
}

/** 最长连续住宿天数（日期集合内的最长连续段） */
export function longestStreak(dates: Iterable<string>): number {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev: dayjs.Dayjs | null = null;
  for (const d of sorted) {
    const cur = dayjs(d);
    run = prev && cur.diff(prev, "day") === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = cur;
  }
  return best;
}

/** 两次住宿之间的最长空档天数（首次住宿之前、末次之后的时间不计） */
export function longestGap(dates: Iterable<string>): number {
  const sorted = [...dates].sort();
  let best = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = dayjs(sorted[i]).diff(dayjs(sorted[i - 1]), "day") - 1;
    if (gap > best) best = gap;
  }
  return best;
}

// ============ 常旅客定级（基于内置 GROUP_TIERS 派生）============

/** 当前等级在该集团真实等级表中的定义；精确匹配，找不到返回 null（旧数据/自定义） */
export function currentTierDef(group: LoyaltyGroup, tier: string): TierDef | null {
  return GROUP_TIERS[group]?.find((t) => t.name === tier) ?? null;
}

/** 下一个更高等级；已是最高或未匹配返回 null */
export function nextTier(group: LoyaltyGroup, tier: string): TierDef | null {
  const tiers = GROUP_TIERS[group];
  if (!tiers || tiers.length === 0) return null;
  const i = tiers.findIndex((t) => t.name === tier);
  if (i < 0) return null;
  return tiers[i + 1] ?? null;
}

export interface TierProgress {
  /** upgrade=冲刺下一级；top=已达最高（保级）；manual=自定义/旧数据手填 */
  mode: "upgrade" | "top" | "manual";
  currentName: string;
  currentEn?: string;
  /** 本年晚数 + 赠晚 */
  progress: number;
  /** 目标门槛晚数 */
  threshold: number;
  /** 0-100 */
  pct: number;
  remaining: number;
  /** 目标等级名（upgrade 为下一级名；top 为 null；manual 为手填 targetTier） */
  targetName: string | null;
  targetEn?: string;
}

/**
 * 计算会籍的定级进度。已知集团按内置真实等级派生下一级与门槛；
 * other 集团或旧数据未匹配等级时，回退到手填 targetNights/targetTier。
 */
export function tierProgress(m: Membership, stays: Stay[], year: number): TierProgress {
  const progress = (nightsByGroup(stays, year)[m.group] || 0) + m.bonusNights;
  const tiers = GROUP_TIERS[m.group];

  // 自定义集团（无内置等级）→ 手填
  if (!tiers || tiers.length === 0) {
    return manualProgress(m, progress);
  }

  const cur = currentTierDef(m.group, m.tier);
  // 旧数据：存的等级名不匹配任一内置等级 → 手填回退
  if (!cur) {
    return manualProgress(m, progress);
  }

  const next = nextTier(m.group, m.tier);
  if (next) {
    const threshold = next.nights;
    return {
      mode: "upgrade",
      currentName: cur.name,
      currentEn: cur.en,
      progress,
      threshold,
      pct: threshold > 0 ? Math.min(100, Math.round((progress / threshold) * 100)) : 0,
      remaining: Math.max(0, threshold - progress),
      targetName: next.name,
      targetEn: next.en,
    };
  }

  // 已是最高等级 → 保级进度（对比自身门槛）
  const threshold = cur.nights;
  return {
    mode: "top",
    currentName: cur.name,
    currentEn: cur.en,
    progress,
    threshold,
    pct: threshold > 0 ? Math.min(100, Math.round((progress / threshold) * 100)) : 100,
    remaining: Math.max(0, threshold - progress),
    targetName: null,
  };
}

function manualProgress(m: Membership, progress: number): TierProgress {
  const threshold = m.targetNights;
  return {
    mode: "manual",
    currentName: m.tier,
    progress,
    threshold,
    pct: threshold > 0 ? Math.min(100, Math.round((progress / threshold) * 100)) : 0,
    remaining: Math.max(0, threshold - progress),
    targetName: m.targetTier || null,
  };
}

// ============ 定级规划器 ============

export interface TierProjection {
  /** 本定级年内、该集团的已订未住晚数 */
  upcomingNights: number;
  /** tierProgress.progress + upcomingNights */
  projected: number;
  /** 0-100，算上已订之后的进度 */
  projectedPct: number;
  /** 算上已订之后还差多少晚 */
  remainingAfterBooked: number;
  /** 按近 6 个月节奏预测的达成月份，null = 已达成或无法预测 */
  etaLabel: string | null;
}

/**
 * 在 tierProgress（只算已住）之上叠加已订未住的晚数，回答「加上手上的预订能到哪」。
 * ETA 逻辑原先内联在 WalletCard 里，抽到这里让卡片和规划器共用一份。
 */
export function tierProjection(
  m: Membership,
  stays: Stay[],
  year: number
): TierProjection {
  const tp = tierProgress(m, stays, year);
  // 已订未住中，属于该集团且入住日落在本定级年内的晚数
  const upcomingNights = upcomingOf(stays)
    .filter((s) => s.group === m.group && dayjs(s.checkIn).year() === year)
    .reduce((n, s) => n + nightsOf(s), 0);

  const projected = tp.progress + upcomingNights;
  const remainingAfterBooked = Math.max(0, tp.threshold - projected);

  // 已达成 / 无门槛 → 不预测
  let etaLabel: string | null = null;
  if (remainingAfterBooked > 0 && tp.threshold > 0) {
    // 节奏只看该集团自己的历史——混算别家会高估达成速度
    const pace = recentMonthlyPace(
      stays.filter((s) => s.group === m.group),
      6
    );
    if (pace > 0.1) {
      const months = Math.ceil(remainingAfterBooked / pace);
      const eta = dayjs().add(months, "month");
      etaLabel =
        eta.year() === year
          ? `按当前节奏预计 ${eta.month() + 1} 月达成`
          : "按当前节奏本年内难以达成";
    }
  }

  return {
    upcomingNights,
    projected,
    projectedPct:
      tp.threshold > 0 ? Math.min(100, Math.round((projected / tp.threshold) * 100)) : 0,
    remainingAfterBooked,
    etaLabel,
  };
}
