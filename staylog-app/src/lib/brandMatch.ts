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
  // 万豪
  "ritz-carlton": { group: "marriott", brand: "丽思卡尔顿" },
  "ritz carlton": { group: "marriott", brand: "丽思卡尔顿" },
  丽思卡尔顿: { group: "marriott", brand: "丽思卡尔顿" },
  "st. regis": { group: "marriott", brand: "瑞吉" },
  "st regis": { group: "marriott", brand: "瑞吉" },
  瑞吉: { group: "marriott", brand: "瑞吉" },
  westin: { group: "marriott", brand: "威斯汀" },
  威斯汀: { group: "marriott", brand: "威斯汀" },
  sheraton: { group: "marriott", brand: "喜来登" },
  喜来登: { group: "marriott", brand: "喜来登" },
  edition: { group: "marriott", brand: "艾迪逊" },
  艾迪逊: { group: "marriott", brand: "艾迪逊" },
  "jw marriott": { group: "marriott", brand: "JW万豪" },
  jw万豪: { group: "marriott", brand: "JW万豪" },
  "aloft": { group: "marriott", brand: "雅乐轩" },
  雅乐轩: { group: "marriott", brand: "雅乐轩" },
  "four points": { group: "marriott", brand: "福朋" },
  福朋: { group: "marriott", brand: "福朋" },
  renaissance: { group: "marriott", brand: "万丽" },
  万丽: { group: "marriott", brand: "万丽" },
  courtyard: { group: "marriott", brand: "万怡" },
  万怡: { group: "marriott", brand: "万怡" },
  marriott: { group: "marriott", brand: "万豪" },
  万豪: { group: "marriott", brand: "万豪" },
  // IHG
  intercontinental: { group: "ihg", brand: "洲际" },
  洲际: { group: "ihg", brand: "洲际" },
  kimpton: { group: "ihg", brand: "金普顿" },
  金普顿: { group: "ihg", brand: "金普顿" },
  "hotel indigo": { group: "ihg", brand: "英迪格" },
  indigo: { group: "ihg", brand: "英迪格" },
  英迪格: { group: "ihg", brand: "英迪格" },
  "crowne plaza": { group: "ihg", brand: "皇冠假日" },
  皇冠假日: { group: "ihg", brand: "皇冠假日" },
  "holiday inn express": { group: "ihg", brand: "智选假日" },
  智选假日: { group: "ihg", brand: "智选假日" },
  "holiday inn": { group: "ihg", brand: "假日酒店" },
  假日: { group: "ihg", brand: "假日酒店" },
  voco: { group: "ihg", brand: "voco" },
  regent: { group: "ihg", brand: "丽晶" },
  丽晶: { group: "ihg", brand: "丽晶" },
  "six senses": { group: "ihg", brand: "六善" },
  六善: { group: "ihg", brand: "六善" },
  // 凯悦
  "park hyatt": { group: "hyatt", brand: "柏悦" },
  柏悦: { group: "hyatt", brand: "柏悦" },
  "grand hyatt": { group: "hyatt", brand: "君悦" },
  君悦: { group: "hyatt", brand: "君悦" },
  andaz: { group: "hyatt", brand: "安达仕" },
  安达仕: { group: "hyatt", brand: "安达仕" },
  "hyatt regency": { group: "hyatt", brand: "凯悦" },
  "hyatt place": { group: "hyatt", brand: "凯悦嘉轩" },
  凯悦嘉轩: { group: "hyatt", brand: "凯悦嘉轩" },
  "hyatt house": { group: "hyatt", brand: "凯悦嘉寓" },
  凯悦嘉寓: { group: "hyatt", brand: "凯悦嘉寓" },
  alila: { group: "hyatt", brand: "阿丽拉" },
  阿丽拉: { group: "hyatt", brand: "阿丽拉" },
  thompson: { group: "hyatt", brand: "汤普森" },
  hyatt: { group: "hyatt", brand: "凯悦" },
  凯悦: { group: "hyatt", brand: "凯悦" },
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
