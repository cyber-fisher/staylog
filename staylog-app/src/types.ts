export type LoyaltyGroup = "hilton" | "marriott" | "ihg" | "hyatt" | "huazhu" | "other";

export interface Stay {
  id: string;
  hotelName: string;
  hotelNameEn?: string;
  brand: string;
  group: LoyaltyGroup;
  /** 自定义集团时的集团名（group === "other" 时使用） */
  customGroupName?: string;
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  /** ISO 日期 YYYY-MM-DD */
  checkIn: string;
  checkOut: string;
  roomType?: string;
  rate?: number;
  currency?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  /** 1-5 */
  rating?: number;
  notes?: string;
  tags?: string[];
  /** 云同步用：最后修改时间（ISO），做最后写入优先合并 */
  updatedAt?: string;
}

export interface Certificate {
  name: string;
  expiry: string;
}

export interface Membership {
  /** 稳定主键（云同步需要；旧数据在 store migrate 时补齐） */
  id: string;
  group: LoyaltyGroup;
  /** group === "other" 时的显示名 */
  customName?: string;
  /** 自定义集团的主题色 */
  customColor?: string;
  memberNo?: string;
  tier: string;
  pointsBalance: number;
  tierExpiry?: string;
  targetTier?: string;
  targetNights: number;
  bonusNights: number;
  certificates: Certificate[];
  /** 云同步用：最后修改时间（ISO），做最后写入优先合并 */
  updatedAt?: string;
}

export interface BackupFile {
  app: "staylog";
  version: 1;
  exportedAt: string;
  stays: Stay[];
  memberships: Membership[];
}

export const GROUP_META: Record<
  LoyaltyGroup,
  { name: string; short: string; en: string; cssVar: string; className: string }
> = {
  hilton: { name: "希尔顿荣誉客会", short: "希尔顿", en: "HILTON HONORS", cssVar: "--hilton", className: "b-hilton" },
  marriott: { name: "万豪旅享家", short: "万豪", en: "MARRIOTT BONVOY", cssVar: "--marriott", className: "b-marriott" },
  ihg: { name: "IHG 优悦会", short: "IHG", en: "IHG ONE REWARDS", cssVar: "--ihg", className: "b-ihg" },
  hyatt: { name: "凯悦天地", short: "凯悦", en: "WORLD OF HYATT", cssVar: "--hyatt", className: "b-hyatt" },
  huazhu: { name: "华住会", short: "华住", en: "H REWARDS", cssVar: "--huazhu", className: "b-huazhu" },
  other: { name: "其他集团", short: "其他", en: "OTHER", cssVar: "--other", className: "b-other" },
};

/** 各集团常见子品牌，表单下拉用；可自由输入不受限 */
export const GROUP_BRANDS: Record<LoyaltyGroup, string[]> = {
  hilton: ["希尔顿", "康莱德", "华尔道夫", "希尔顿逸林", "希尔顿花园", "汉普顿", "嘉悦里", "LXR"],
  marriott: ["万豪", "JW万豪", "丽思卡尔顿", "瑞吉", "威斯汀", "喜来登", "W酒店", "艾迪逊", "福朋", "万丽", "万怡", "雅乐轩"],
  ihg: ["洲际", "金普顿", "英迪格", "皇冠假日", "voco", "假日酒店", "智选假日", "丽晶", "六善"],
  hyatt: ["柏悦", "君悦", "凯悦", "安达仕", "凯悦嘉轩", "凯悦嘉寓", "阿丽拉", "汤普森"],
  huazhu: ["禧玥", "花间堂", "美爵", "美居", "诺富特", "施柏阁", "全季", "桔子水晶", "桔子", "漫心", "宜必思", "星程", "汉庭", "怡莱", "海友", "你好", "CitiGO", "Steigenberger", "Zleep"],
  other: [],
};
