import dayjs from "dayjs";
import type { Membership, Stay } from "../types";
import { aggregateCities, distanceKm, nightsOf, stayedOnly } from "./stats";

/**
 * 成就徽章。全部从现有字段派生，不新增任何存储。
 *
 * 「解锁时间」是有信息量的部分：不能只判断「现在是否达标」，还要回答「哪一晚跨过了门槛」。
 * 做法是把记录按 checkIn 升序推一遍计数器，记下每个阈值第一次被跨过的那条记录所在月份。
 * 未来行程一律不算——徽章是已发生的事。
 */

export interface Achievement {
  id: string;
  name: string;
  en: string;
  desc: string;
  /** 视觉分级：bronze/silver/gold，仅影响描边质感 */
  tier: "bronze" | "silver" | "gold";
  unlocked: boolean;
  /** 当前进度值（未解锁时画进度条用；布尔型徽章不给） */
  progress?: number;
  threshold?: number;
  /** YYYY-MM，跨过门槛那一晚所在月份 */
  unlockedAt?: string;
}

/**
 * 沿时间轴推进一个计数器，返回「处理完第 i 条记录后」的值序列。
 * advance 负责改变外部状态，read 负责读出当前值——用闭包比传状态对象更贴合各徽章的口径差异。
 */
function series(sorted: Stay[], advance: (s: Stay) => void, read: () => number): number[] {
  const out: number[] = [];
  for (const s of sorted) {
    advance(s);
    out.push(read());
  }
  return out;
}

/** 序列中第一次 >= threshold 的记录所在月份；从未达到返回 null */
function crossedAt(sorted: Stay[], vals: number[], threshold: number): string | null {
  const i = vals.findIndex((v) => v >= threshold);
  return i < 0 ? null : dayjs(sorted[i].checkIn).format("YYYY-MM");
}

/** 组装一枚「累计到 N」型徽章 */
function milestone(
  base: Omit<Achievement, "unlocked" | "progress" | "threshold" | "unlockedAt">,
  sorted: Stay[],
  vals: number[],
  threshold: number
): Achievement {
  const current = vals.length ? vals[vals.length - 1] : 0;
  const at = crossedAt(sorted, vals, threshold);
  return {
    ...base,
    unlocked: at != null,
    progress: Math.min(current, threshold),
    threshold,
    unlockedAt: at ?? undefined,
  };
}

/** 该记录是否覆盖某年的 12/31（跨年夜在酒店） */
function coversNewYearEve(s: Stay): string | null {
  const ci = dayjs(s.checkIn);
  const n = nightsOf(s);
  for (let i = 0; i < n; i++) {
    const d = ci.add(i, "day");
    if (d.month() === 11 && d.date() === 31) return d.format("YYYY-MM");
  }
  return null;
}

export function computeAchievements(stays: Stay[], memberships: Membership[]): Achievement[] {
  const sorted = stayedOnly(stays)
    .slice()
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  // ---- 累计型序列（一次遍历一个口径，闭包各自持状态）----
  let nightSum = 0;
  const nightVals = series(sorted, (s) => { nightSum += nightsOf(s); }, () => nightSum);

  const citySet = new Set<string>();
  const cityVals = series(sorted, (s) => { if (s.city) citySet.add(s.city); }, () => citySet.size);

  const countrySet = new Set<string>();
  const countryVals = series(sorted, (s) => { if (s.country) countrySet.add(s.country); }, () => countrySet.size);

  const brandSet = new Set<string>();
  const brandVals = series(sorted, (s) => { if (s.brand) brandSet.add(s.brand); }, () => brandSet.size);

  let ratedCount = 0;
  const ratedVals = series(sorted, (s) => { if (s.rating != null) ratedCount += 1; }, () => ratedCount);

  // 同一家酒店的累计入住次数（按 酒店名+城市 区分，与 aggregateHotels 口径一致）
  const visitMap = new Map<string, number>();
  let maxVisits = 0;
  const visitVals = series(
    sorted,
    (s) => {
      const key = `${s.hotelName}|${s.city}`;
      const v = (visitMap.get(key) || 0) + 1;
      visitMap.set(key, v);
      if (v > maxVisits) maxVisits = v;
    },
    () => maxVisits
  );

  // 单次最长连住（同一家连续住满 N 晚 = 单条记录的晚数）
  let maxSingle = 0;
  const singleVals = series(sorted, (s) => { maxSingle = Math.max(maxSingle, nightsOf(s)); }, () => maxSingle);

  // 远行：以住得最多的有坐标城市为 home base，量到最远一晚的直线距离
  const cities = aggregateCities(sorted).filter((c) => c.lat != null);
  const home = cities[0] ?? null;
  let maxKm = 0;
  const kmVals = series(
    sorted,
    (s) => {
      if (!home || s.lat == null || s.lng == null) return;
      const km = distanceKm(home.lat!, home.lng!, s.lat, s.lng);
      if (km > maxKm) maxKm = km;
    },
    () => maxKm
  );

  // 跨年夜：取最早那一次
  const nyeAt = sorted.map(coversNewYearEve).find((v) => v != null) ?? null;

  const list: Achievement[] = [
    milestone({ id: "night-1", name: "第一晚", en: "FIRST NIGHT", desc: "记录你的第一次入住", tier: "bronze" }, sorted, nightVals, 1),
    milestone({ id: "night-10", name: "十夜行者", en: "TEN NIGHTS", desc: "累计住满 10 晚", tier: "bronze" }, sorted, nightVals, 10),
    milestone({ id: "night-50", name: "半百之夜", en: "FIFTY NIGHTS", desc: "累计住满 50 晚", tier: "silver" }, sorted, nightVals, 50),
    milestone({ id: "night-100", name: "百夜俱乐部", en: "CENTURY", desc: "累计住满 100 晚", tier: "gold" }, sorted, nightVals, 100),
    milestone({ id: "night-365", name: "整年在外", en: "A FULL YEAR", desc: "累计住满 365 晚", tier: "gold" }, sorted, nightVals, 365),

    milestone({ id: "city-5", name: "五城初探", en: "FIVE CITIES", desc: "到访 5 座城市", tier: "bronze" }, sorted, cityVals, 5),
    milestone({ id: "city-20", name: "二十城", en: "TWENTY CITIES", desc: "到访 20 座城市", tier: "silver" }, sorted, cityVals, 20),
    milestone({ id: "city-50", name: "城市收藏家", en: "COLLECTOR", desc: "到访 50 座城市", tier: "gold" }, sorted, cityVals, 50),

    milestone({ id: "country-3", name: "出境", en: "BORDERLESS", desc: "到访 3 个国家/地区", tier: "bronze" }, sorted, countryVals, 3),
    milestone({ id: "country-10", name: "十国之旅", en: "TEN FLAGS", desc: "到访 10 个国家/地区", tier: "gold" }, sorted, countryVals, 10),

    milestone({ id: "streak-7", name: "长住客", en: "LONG STAY", desc: "同一家酒店连住 7 晚", tier: "silver" }, sorted, singleVals, 7),
    milestone({ id: "visits-10", name: "老熟客", en: "REGULAR", desc: "同一家酒店累计住 10 次", tier: "gold" }, sorted, visitVals, 10),

    milestone({ id: "brand-5", name: "品牌尝鲜", en: "FIVE BRANDS", desc: "住过 5 个不同子品牌", tier: "bronze" }, sorted, brandVals, 5),
    milestone({ id: "brand-10", name: "品牌控", en: "BRAND HUNTER", desc: "住过 10 个不同子品牌", tier: "silver" }, sorted, brandVals, 10),

    milestone({ id: "rated-20", name: "挑剔的住客", en: "CRITIC", desc: "给 20 次入住打过分", tier: "silver" }, sorted, ratedVals, 20),
    milestone({ id: "far-5000", name: "远行者", en: "FAR FROM HOME", desc: "离常驻城市 5000 公里以外过夜", tier: "gold" }, sorted, kmVals, 5000),

    {
      id: "nye",
      name: "跨年夜",
      en: "NEW YEAR'S EVE",
      desc: "12 月 31 日在酒店过夜",
      tier: "gold",
      unlocked: nyeAt != null,
      unlockedAt: nyeAt ?? undefined,
    },
  ];

  // ---- 定级徽章：读会籍当前等级。等级没有历史可追溯，故不给 unlockedAt ----
  // 关键词匹配是刻意的：「铂金会员」含「金」，所以铂金/曜钻会同时点亮金卡徽章——
  // 高等级本就该覆盖低等级徽章，不需要额外的等级序比较。
  const tiers = memberships.map((m) => m.tier || "");
  const hasTier = (kw: string) => tiers.some((t) => t.includes(kw));
  list.push(
    { id: "tier-gold", name: "金卡在手", en: "GOLD STATUS", desc: "任一集团达到金卡等级", tier: "silver", unlocked: hasTier("金") },
    { id: "tier-plat", name: "铂金会员", en: "PLATINUM", desc: "任一集团达到铂金等级", tier: "gold", unlocked: hasTier("铂金") },
    { id: "tier-diamond", name: "钻石会员", en: "DIAMOND", desc: "任一集团达到钻石等级", tier: "gold", unlocked: hasTier("钻石") }
  );

  return list;
}
