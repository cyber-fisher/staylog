import dayjs from "dayjs";
import type { LoyaltyGroup, Membership, Stay, TierDef } from "../types";
import { GROUP_TIERS } from "../types";

export function nightsOf(stay: Stay): number {
  return Math.max(1, dayjs(stay.checkOut).diff(dayjs(stay.checkIn), "day"));
}

export function staysInYear(stays: Stay[], year: number): Stay[] {
  return stays.filter((s) => dayjs(s.checkIn).year() === year);
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
  const before = stays.filter((s) => dayjs(s.checkIn).year() < year);
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
      spendByCurrency[cur] = (spendByCurrency[cur] || 0) + s.rate;
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
  const src = year == null ? stays : staysInYear(stays, year);
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
  for (const s of stays) {
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
  const map = new Map<string, HotelAgg>();
  for (const s of stays) {
    const cur =
      map.get(s.hotelName) ||
      { hotelName: s.hotelName, hotelNameEn: s.hotelNameEn, group: s.group, city: s.city,
        nights: 0, visits: 0, avgRating: null, stayIds: [] as string[] };
    cur.nights += nightsOf(s);
    cur.visits += 1;
    cur.stayIds.push(s.id);
    if (cur.lat == null && s.lat != null) { cur.lat = s.lat; cur.lng = s.lng; }
    map.set(s.hotelName, cur);
  }
  for (const h of map.values()) {
    const rated = h.stayIds
      .map((id) => stays.find((s) => s.id === id))
      .filter((s): s is Stay => !!s && s.rating != null);
    h.avgRating = rated.length
      ? Math.round((rated.reduce((n, s) => n + (s.rating || 0), 0) / rated.length) * 10) / 10
      : null;
  }
  return [...map.values()].sort((a, b) => b.nights - a.nights);
}

/** 大圆距离 km */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** 近 n 个月月均晚数（含当月），用于会籍达成预测 */
export function recentMonthlyPace(stays: Stay[], months = 6): number {
  const cutoff = dayjs().subtract(months, "month").startOf("month");
  const nights = stays
    .filter((s) => dayjs(s.checkIn).isAfter(cutoff))
    .reduce((n, s) => n + nightsOf(s), 0);
  return nights / months;
}

export function yearsWithData(stays: Stay[]): number[] {
  return [...new Set(stays.map((s) => dayjs(s.checkIn).year()))].sort((a, b) => b - a);
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
