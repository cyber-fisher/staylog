import { createClient } from "@supabase/supabase-js";

/**
 * Supabase 客户端单例。
 * URL 与 anon key 由构建期环境变量注入（.env.local / Vercel 环境变量）。
 * anon key 放前端是安全的——真正的安全边界是数据库的行级安全（RLS）。
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "缺少 Supabase 环境变量。请在 staylog-app/.env.local 配置 " +
      "VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY（Vercel 上在项目环境变量里配），然后重启/重新部署。"
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true, // session 存 localStorage，刷新免登录
    autoRefreshToken: true, // 自动续期
    detectSessionInUrl: false, // 非 OAuth 回调场景，关掉省事
  },
});

/** 云端数据表行类型（snake_case，与数据库一致）。 */
export interface StayRow {
  id: string;
  user_id: string;
  hotel_name: string;
  hotel_name_en: string | null;
  brand: string | null;
  group: string;
  custom_group_name: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  check_in: string;
  check_out: string;
  room_type: string | null;
  rate: number | null;
  currency: string | null;
  points_earned: number | null;
  points_redeemed: number | null;
  rating: number | null;
  notes: string | null;
  tags: string[] | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  group: string;
  custom_name: string | null;
  custom_color: string | null;
  member_no: string | null;
  tier: string | null;
  points_balance: number;
  tier_expiry: string | null;
  target_tier: string | null;
  target_nights: number;
  bonus_nights: number;
  certificates: { name: string; expiry: string }[];
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfileRow {
  id: string;
  username: string | null;
  role: "admin" | "user";
  amap_key: string;
  created_at: string;
  updated_at: string;
}
