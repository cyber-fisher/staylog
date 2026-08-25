import type { LoyaltyGroup } from "../types";
import { GROUP_BRANDS } from "../types";

export interface BrandMatch {
  group: LoyaltyGroup;
  brand: string;
}

/**
 * 品牌别名表：把常见的英文名 / 简称 / 异写映射到 GROUP_BRANDS 里的规范中文品牌名。
 * 键会与酒店名做包含匹配（大小写不敏感）。
 */
const BRAND_ALIASES: Record<string, { group: LoyaltyGroup; brand: string }> = {
  // 希尔顿
  conrad: { group: "hilton", brand: "康莱德" },
  "waldorf astoria": { group: "hilton", brand: "华尔道夫" },
  waldorf: { group: "hilton", brand: "华尔道夫" },
  doubletree: { group: "hilton", brand: "希尔顿逸林" },
  逸林: { group: "hilton", brand: "希尔顿逸林" },
  hampton: { group: "hilton", brand: "汉普顿" },
  欢朋: { group: "hilton", brand: "汉普顿" },
  hilton: { group: "hilton", brand: "希尔顿" },
  // 华住会
  禧玥: { group: "huazhu", brand: "禧玥" },
  花间堂: { group: "huazhu", brand: "花间堂" },
  美爵: { group: "huazhu", brand: "美爵" },
  美居: { group: "huazhu", brand: "美居" },
  mercure: { group: "huazhu", brand: "美居" },
  诺富特: { group: "huazhu", brand: "诺富特" },
  novotel: { group: "huazhu", brand: "诺富特" },
  施柏阁: { group: "huazhu", brand: "施柏阁" },
  steigenberger: { group: "huazhu", brand: "施柏阁" },
  全季: { group: "huazhu", brand: "全季" },
  "ji hotel": { group: "huazhu", brand: "全季" },
  桔子水晶: { group: "huazhu", brand: "桔子水晶" },
  "crystal orange": { group: "huazhu", brand: "桔子水晶" },
  桔子: { group: "huazhu", brand: "桔子" },
  orange: { group: "huazhu", brand: "桔子" },
  漫心: { group: "huazhu", brand: "漫心" },
  宜必思: { group: "huazhu", brand: "宜必思" },
  ibis: { group: "huazhu", brand: "宜必思" },
  星程: { group: "huazhu", brand: "星程" },
  starway: { group: "huazhu", brand: "星程" },
  汉庭: { group: "huazhu", brand: "汉庭" },
  hanting: { group: "huazhu", brand: "汉庭" },
  怡莱: { group: "huazhu", brand: "怡莱" },
  海友: { group: "huazhu", brand: "海友" },
  citigo: { group: "huazhu", brand: "CitiGO" },
  zleep: { group: "huazhu", brand: "Zleep" },
};

// 预排序：更长的键优先匹配，避免 "桔子" 抢先于 "桔子水晶"、"万豪" 抢先于 "JW万豪"
const SORTED_KEYS = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);

/**
 * 从酒店名推断集团与子品牌。识别不出返回 null（保存不受影响，用户可手动选）。
 */
export function matchBrand(hotelName: string): BrandMatch | null {
  if (!hotelName.trim()) return null;
  const lower = hotelName.toLowerCase();
  for (const key of SORTED_KEYS) {
    if (lower.includes(key.toLowerCase())) {
      return BRAND_ALIASES[key];
    }
  }
  return null;
}

/** 校验某子品牌是否属于某集团（表单里辅助判断，暂留作扩展用） */
export function brandBelongsTo(group: LoyaltyGroup, brand: string): boolean {
  return GROUP_BRANDS[group]?.includes(brand) ?? false;
}
