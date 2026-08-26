export type LoyaltyGroup = "hilton" | "huazhu" | "other";

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
  huazhu: { name: "华住会", short: "华住", en: "H REWARDS", cssVar: "--huazhu", className: "b-huazhu" },
  other: { name: "其他集团", short: "其他", en: "OTHER", cssVar: "--other", className: "b-other" },
};

/** 各集团常见子品牌，表单下拉用；可自由输入不受限 */
export const GROUP_BRANDS: Record<LoyaltyGroup, string[]> = {
  hilton: ["希尔顿", "康莱德", "华尔道夫", "希尔顿逸林", "希尔顿花园", "汉普顿", "嘉悦里", "LXR"],
  huazhu: ["禧玥", "花间堂", "美爵", "美居", "诺富特", "施柏阁", "全季", "桔子水晶", "桔子", "漫心", "宜必思", "星程", "汉庭", "怡莱", "海友", "你好", "CitiGO", "Steigenberger", "Zleep"],
  other: [],
};

/** 单个会员等级定义 */
export interface TierDef {
  /** 中文等级名（作为 Membership.tier 的规范值） */
  name: string;
  /** 英文等级名 */
  en?: string;
  /** 达到该等级所需的本年入住晚数门槛 */
  nights: number;
}

/**
 * 各集团真实定级体系（按晚数升序）。仅晚数口径——官方"晚数 OR 次数 OR 积分"三选一中的晚数门槛。
 * 门槛数据核实于各集团 2025 官方规则。修改门槛只需改这里。
 * other（自定义集团）无内置等级，走手填回退。
 */
export const GROUP_TIERS: Record<LoyaltyGroup, TierDef[]> = {
  hilton: [
    { name: "会员", en: "Member", nights: 0 },
    { name: "银卡", en: "Silver", nights: 10 },
    { name: "金卡", en: "Gold", nights: 25 },
    { name: "钻石", en: "Diamond", nights: 50 },
    { name: "曜钻", en: "Diamond+", nights: 80 },
  ],
  huazhu: [
    { name: "星会员", en: "Star", nights: 0 },
    { name: "银会员", en: "Silver", nights: 3 },
    { name: "金会员", en: "Gold", nights: 5 },
    { name: "铂金会员", en: "Platinum", nights: 30 },
  ],
  other: [],
};
